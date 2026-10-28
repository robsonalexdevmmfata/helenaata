/**
 * webhookHandler.ts
 *
 * Handler que processa os payloads recebidos da Evolution API
 * e os integra ao fluxo da Helena AI (store, conversas, agentes).
 *
 * COMO FUNCIONA:
 *
 *   Evolution API (WhatsApp)
 *         │
 *         │ POST {webhook_url}
 *         ▼
 *   n8n (recebe e repassa)  ──── ou ────  endpoint direto
 *         │
 *         │ POST /api/whatsapp/webhook  (com header: x-helena-key)
 *         ▼
 *   Este handler (processEvolutionWebhook)
 *         │
 *         ├── Cria/atualiza conversa no store
 *         ├── Chama Helena Orchestrator para gerar resposta
 *         └── Dispara resposta via evolutionSendText
 *
 * Para usar no n8n:
 *   1. Trigger: Webhook (POST)
 *   2. Function node: chama este módulo (ou replica a lógica)
 *   3. HTTP Request: POST para a URL interna da Helena
 *
 * Para usar sem n8n (endpoint direto no Vite dev):
 *   Configure VITE_EVOLUTION_WEBHOOK_URL=http://seu-backend/api/whatsapp/webhook
 *   e chame registerEvolutionWebhook() uma vez após conectar.
 */

import { parseEvolutionWebhook, evolutionSendText, getEvolutionConfigUI } from "./evolutionapi";
import { formatForWhatsApp } from "@/lib/helena/whatsapp-formatter";
import { bumpAutomation, getDB, update, uid, nowISO } from "@/lib/store";
import { evaluateHandoff } from "@/lib/helena/whatsapp-formatter";
import type { HandoffStage } from "@/lib/helena/whatsapp-formatter";
import { extractMeetingFromText, ROBSON_OPENING_SCRIPT, CALENDAR_TOOL_PROMPT } from "@/lib/helena/calendar";
import { runTool } from "@/lib/helena/engine";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface WebhookProcessResult {
  handled: boolean;
  action: "new_message" | "handoff" | "skipped" | "error";
  reply?: string;
  error?: string;
}

// ── Processador principal ────────────────────────────────────────────────────

/**
 * Processa um payload recebido da Evolution API.
 * Retorna o que foi feito para log/debug.
 *
 * @param rawPayload - Corpo do POST recebido da Evolution API
 */
export async function processEvolutionWebhook(
  rawPayload: unknown
): Promise<WebhookProcessResult> {
  // 1. Parseia o payload
  const incoming = parseEvolutionWebhook(rawPayload);
  if (!incoming) {
    return { handled: false, action: "skipped" };
  }

  // 2. Ignora grupos por padrão
  if (incoming.isGroup) {
    return { handled: false, action: "skipped" };
  }

  const db = getDB();

  // 3. Encontra ou cria contato pelo número
  const cleanPhone = incoming.from.replace(/\D/g, "");
  let contact = db.contacts.find((c) => c.phone.replace(/\D/g, "") === cleanPhone);

  if (!contact) {
    // Cria contato novo automaticamente
    const newContactId = uid("p_evo_");
    update((d) => {
      d.contacts.unshift({
        id: newContactId,
        organizationId: d.organization.id,
        name: incoming.fromName ?? `Contato ${cleanPhone}`,
        email: "",
        phone: `+${cleanPhone}`,
        title: "",
        tags: ["whatsapp"],
        source: "Prospecção",
        ownerId: d.agents.find((a) => a.role === "SDR")?.id ?? d.currentUserId,
        status: "lead",
        score: 50,
        consent: true,
        createdAt: nowISO(),
        lastContactAt: nowISO(),
      });
    });
    contact = getDB().contacts.find((c) => c.id === newContactId)!;
  }

  // 4. Encontra ou cria conversa para este contato
  let conv = db.conversations.find(
    (c) => c.contactId === contact!.id && c.channel === "whatsapp" && c.status !== "resolvida"
  );

  if (!conv) {
    // Cria conversa nova
    const newConvId = uid("conv_evo_");
    const conn = db.connections.find((c) => /info tech/i.test(c.name)) ?? db.connections.find((c) => c.status === "online");
    update((d) => {
      d.conversations.unshift({
        id: newConvId,
        organizationId: d.organization.id,
        contactId: contact!.id,
        channel: "whatsapp",
        connectionId: conn?.id,
        status: "aberta",
        handlerType: "agent",
        handlerId: d.agents.find((a) => a.role === "SDR")?.id ?? d.currentUserId,
        unread: 1,
        sentiment: "neutro",
        lastMessageAt: nowISO(),
        messages: [],
      });
    });
    conv = getDB().conversations.find((c) => c.id === newConvId)!;
  }

  // 5. Registra mensagem do contato na conversa
  update((d) => {
    const c = d.conversations.find((x) => x.id === conv!.id);
    if (!c) return;
    c.messages.push({
      id: uid("m_evo_"),
      from: "contact",
      authorName: incoming.fromName ?? contact!.name,
      text: incoming.text,
      at: nowISO(),
      kind: "text",
    });
    c.lastMessageAt = nowISO();
    c.unread = (c.unread ?? 0) + 1;
    // Atualiza último contato
    const ct = d.contacts.find((x) => x.id === contact!.id);
    if (ct) ct.lastContactAt = nowISO();
    bumpAutomation(d, "mensagem_recebida");
  });

  // 6. Avalia se precisa de handoff entre agentes
  const currentDb = getDB();
  const currentConv = currentDb.conversations.find((c) => c.id === conv!.id)!;
  const currentAgent = currentDb.agents.find((a) => a.id === currentConv.handlerId);
  const stageMap: Record<string, HandoffStage> = {
    SDR: "sdr", Qualificador: "qualificador", Closer: "closer",
  };
  const currentStage: HandoffStage = currentAgent
    ? (stageMap[currentAgent.role] ?? "sdr")
    : "sdr";

  const handoff = evaluateHandoff(incoming.text, currentStage, currentDb);

  if (handoff?.nextStage === "humano") {
    // Notifica no sistema mas não responde automaticamente
    update((d) => {
      const c = d.conversations.find((x) => x.id === conv!.id);
      if (c) {
        c.handlerType = "human";
        c.handlerId = d.users.find((u) => u.role === "owner" || u.role === "manager")?.id ?? d.currentUserId;
      }
      d.activities.unshift({
        id: uid("ac_evo_"),
        organizationId: d.organization.id,
        contactId: contact!.id,
        type: "handoff",
        text: `Handoff para humano solicitado por ${contact!.name} via WhatsApp`,
        actor: "Sistema HELENA",
        createdAt: nowISO(),
      });
    });
    return { handled: true, action: "handoff" };
  }

  if (handoff) {
    // Troca agente silenciosamente
    update((d) => {
      const c = d.conversations.find((x) => x.id === conv!.id);
      if (c) {
        c.handlerId = handoff.nextAgentId;
      }
    });
  }

  // 7. Gera resposta automática com o agente atual (ou pós-handoff)
  const responderAgent = getDB().agents.find(
    (a) => a.id === (handoff?.nextAgentId ?? currentConv.handlerId)
  );

  // Verifica se o agente está pausado — neste caso não responde
  if (responderAgent?.status === "pausado" || responderAgent?.status === "erro") {
    return { handled: true, action: "new_message" };
  }

  maybeScheduleFromWhatsApp(incoming.text, contact!.id, responderAgent, conv!.id);

  const reply = await generateAgentReply(
    incoming.text,
    contact!.name,
    contact!.phone,
    responderAgent,
    currentStage
  );

  if (!reply) {
    return { handled: true, action: "new_message" };
  }

  // 8. Registra a resposta no store
  update((d) => {
    const c = d.conversations.find((x) => x.id === conv!.id);
    if (!c) return;
    c.messages.push({
      id: uid("m_evo_reply_"),
      from: "agent",
      authorName: responderAgent?.name ?? "Helena",
      text: reply,
      at: nowISO(),
      kind: "text",
    });
    c.lastMessageAt = nowISO();
    c.unread = 0;
    // Incrementa métricas do agente
    const ag = d.agents.find((a) => a.id === responderAgent?.id);
    if (ag) {
      ag.metrics.conversations += 1;
      ag.spent += 0.002; // ~R$0,002 por resposta (FreeLLMAPI grátis, mas registra)
    }
  });

  // 9. Envia resposta via Evolution API
  const cfg = getEvolutionConfigUI();
  if (cfg.apiKey) {
    const sendRes = await evolutionSendText(cleanPhone, reply, cfg);
    if (sendRes.ok) {
      update((d) => {
        const wa = d.connections.find((c) => c.id === "wa_agency") ?? d.connections.find((c) => c.status === "online");
        if (wa) wa.sentToday += 1;
      });
    } else {
      console.warn("[Webhook Handler] Falha ao enviar resposta:", sendRes.error);
    }
  }

  return { handled: true, action: "new_message", reply };
}

// ── Gerador de resposta do agente ────────────────────────────────────────────

import type { Agent } from "@/lib/types";
import { callGroqOrchestrator } from "@/lib/helena/groq";

function maybeScheduleFromWhatsApp(
  clientMessage: string,
  leadId: string,
  agent: Agent | undefined,
  conversationId: string,
) {
  const parsed = extractMeetingFromText(clientMessage);
  if (!parsed) return;
  runTool(
    "calendar.agendar_reuniao",
    {
      leadId,
      dataHora: parsed.dataHora,
      resumo: parsed.resumo,
      agenteId: agent?.id,
      conversationId,
    },
    { actor: agent?.name ?? "Helena", actorType: agent ? "agent" : "helena", requestedBy: "WhatsApp" },
  );
}

/**
 * Gera a resposta automática do agente para a mensagem recebida.
 * Usa Groq para objeções e condução ao agendamento.
 */
async function generateAgentReply(
  clientMessage: string,
  clientName: string,
  clientPhone: string,
  agent: Agent | undefined,
  currentStage: HandoffStage
): Promise<string | null> {
  const db = getDB();
  const conv = db.conversations.find(
    (c) => c.contactId === db.contacts.find((x) => x.phone.replace(/\D/g, "") === clientPhone.replace(/\D/g, ""))?.id
  );
  const history = (conv?.messages ?? [])
    .slice(-6)
    .filter((m) => m.from === "contact" || m.from === "agent")
    .map((m) => ({
      role: (m.from === "contact" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    }));

  const roleHint = agent?.role === "Closer" ? "Closer" : "SDR";
  const groqRes = await callGroqOrchestrator(
    `Papel: ${roleHint} da Info Tech. Lead: ${clientName}. ${CALENDAR_TOOL_PROMPT}\nScript de abertura: ${ROBSON_OPENING_SCRIPT}\nMensagem do cliente: ${clientMessage}`,
    history,
  );

  if (groqRes?.toolCalls) {
    for (const tc of groqRes.toolCalls) {
      if (tc.name === "calendar_create_event" || tc.name === "calendar_agendar_reuniao") {
        const lead = db.contacts.find((x) => x.phone.replace(/\D/g, "") === clientPhone.replace(/\D/g, ""));
        runTool("calendar.agendar_reuniao", {
          ...tc.arguments,
          leadId: tc.arguments.leadId || tc.arguments.contactId || lead?.id,
          agenteId: agent?.id,
          conversationId: conv?.id,
        }, { actor: agent?.name ?? "Helena", actorType: agent ? "agent" : "helena", requestedBy: "WhatsApp" });
      } else if (tc.name === "sales_handle_objection") {
        const lead = db.contacts.find((x) => x.phone.replace(/\D/g, "") === clientPhone.replace(/\D/g, ""));
        runTool("sales.handle_objection", {
          ...tc.arguments,
          contactId: tc.arguments.contactId || lead?.id,
        }, { actor: agent?.name ?? "Helena", actorType: agent ? "agent" : "helena" });
      }
    }
  }

  if (groqRes?.text && groqRes.text.length > 5) {
    return formatForWhatsApp(groqRes.text);
  }

  // Fallback: resposta baseada no estágio do agente
  const stageReplies: Record<HandoffStage, string> = {
    sdr: `Olá ${clientName}! Obrigado pelo retorno. Você tem interesse em saber como um site profissional pode trazer mais clientes para o seu negócio? Posso te mostrar uma prévia sem compromisso.`,
    qualificador: `Ótimo ${clientName}! Para entender melhor sua necessidade, me conta: qual o principal objetivo com o site — atrair novos clientes, mostrar seus serviços ou facilitar o contato?`,
    closer: `Perfeito ${clientName}! Temos uma condição especial disponível esta semana. Posso te passar as opções de investimento. Quando você teria 20 minutos para uma apresentação rápida?`,
    humano: null as unknown as string,
  };

  const fallback = stageReplies[currentStage];
  return fallback ? formatForWhatsApp(fallback) : null;
}

// ── Utilitários de configuração de webhook ───────────────────────────────────

/**
 * Instrução completa para configurar o webhook da Evolution API apontando para o n8n.
 * Retorna o objeto de configuração que deve ser enviado à Evolution API.
 */
export function buildWebhookConfig(n8nWebhookUrl: string) {
  return {
    endpoint: `POST ${getEvolutionConfigUI().baseUrl}/webhook/set/${getEvolutionConfigUI().instance}`,
    headers: { apikey: getEvolutionConfigUI().apiKey },
    body: {
      url: n8nWebhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE"],
    },
    description: "Configure este webhook na Evolution API para receber mensagens no n8n",
  };
}

/**
 * Fluxo n8n recomendado para processar mensagens recebidas:
 *
 * [Webhook Trigger]
 *     │ recebe POST da Evolution API
 *     ▼
 * [Function Node] — filtra apenas MESSAGES_UPSERT com fromMe=false
 *     │
 *     ▼
 * [HTTP Request] — POST para Helena AI Backend
 *     URL: http://localhost:3000/api/whatsapp/incoming
 *     Body: { "from": "{{$json.data.key.remoteJid}}", "text": "{{$json.data.message.conversation}}", ... }
 *     Headers: { "x-helena-key": "sua-chave-secreta" }
 *     │
 *     ▼
 * [IF Node] — se resposta não vazia
 *     │
 *     ▼
 * [HTTP Request] — POST para Evolution API /message/sendText
 *     URL: http://localhost:8080/message/sendText/helena
 *     Body: { "number": "{{$json.from}}", "text": "{{$json.reply}}" }
 *     Headers: { "apikey": "sua-global-api-key" }
 */
export const N8N_FLOW_DESCRIPTION = `
N8N FLOW — Integração Evolution API ↔ Helena AI
================================================

NODE 1 — Webhook Trigger
  • Method: POST
  • Path: /evolution-webhook
  • Responds: Immediately

NODE 2 — Code (Filtro)
  const event = $input.first().json.event;
  const msg = $input.first().json.data?.message;
  if (event !== 'messages.upsert' || msg?.key?.fromMe) return [];
  return $input.all();

NODE 3 — HTTP Request (Helena AI Backend)
  • Method: POST
  • URL: http://SEU_IP:3000/api/whatsapp/incoming
  • Body: {{ $json }}
  • Headers: x-helena-key: SUA_CHAVE

NODE 4 — HTTP Request (Evolution API — responde ao cliente)
  • Method: POST
  • URL: http://localhost:8080/message/sendText/helena
  • Body: { "number": "{{ $json.from }}", "text": "{{ $json.reply }}" }
  • Headers: apikey: SUA_GLOBAL_API_KEY
  • Condição: apenas se $json.reply não for vazio
`;
