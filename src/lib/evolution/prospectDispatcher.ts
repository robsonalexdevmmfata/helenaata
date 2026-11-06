/**
 * prospectDispatcher.ts
 *
 * Responsável por disparar mensagens de prospecção em massa
 * via Evolution API com rate limiting (delay entre envios)
 * para evitar bloqueio do número.
 *
 * Usado pelo tool "prospect.scan_maps" e por campanhas de prospecção.
 */

import { evolutionSendText, getEvolutionConfigUI } from "./evolutionapi";
import { formatForWhatsApp } from "@/lib/helena/whatsapp-formatter";
import { buildCatalogOpening } from "@/lib/catalog";
import { getDB, update, uid, nowISO } from "@/lib/store";
import { unansweredAgentStreak } from "@/lib/helena/sales-flow";

// ── Configurações de disparo seguro ──────────────────────────────────────────

const DEFAULT_DELAY_MS = 8_000;
const MAX_BURST = 6;
const BURST_PAUSE_MS = 35_000;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ProspectContact {
  phone: string;
  name: string;
  companyName: string;
  contactId: string;
  dealId?: string;
  agentName: string;
}

export interface DispatchResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ── Fila de envio em background ───────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Dispara mensagens de prospecção em background com rate limiting.
 * Nunca bloqueia a UI — é chamado com fire-and-forget.
 *
 * @param contacts - Lista de contatos para prospectar
 * @param messageFactory - Função que gera o texto da mensagem para cada contato
 * @param organizationId - ID da organização (para auditoria)
 * @param operationId - ID da operação Helena (para atualizar progresso)
 */
export async function dispatchProspectMessages(
  contacts: ProspectContact[],
  messageFactory: (c: ProspectContact) => string,
  organizationId: string,
  operationId?: string,
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0, errors: [] };
  const cfg = getEvolutionConfigUI();
  if (typeof process !== "undefined" && process.env?.VITEST) {
    result.skipped = contacts.length;
    return result;
  }

  const browser = typeof window !== "undefined";
  if (!browser && !process.env.EVOLUTION_KEY) {
    result.skipped = contacts.length;
    return result;
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i]!;

    // Skip se o número for inválido
    const cleanPhone = contact.phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      result.skipped++;
      continue;
    }
    const dbNow = getDB();
    const already = dbNow.contacts.find((c) => c.phone.replace(/\D/g, "").slice(-10) === cleanPhone.slice(-10));
    const existingConv = already ? dbNow.conversations.find((cv) => cv.contactId === already.id) : undefined;
    // Já abordado sem resposta → não reenvia (corta mensagem repetida).
    if (existingConv && unansweredAgentStreak(existingConv) >= 1) {
      result.skipped++;
      continue;
    }
    const recentSend = dbNow.executions.some(
      (e) =>
        e.action.includes("evolution.sendText") &&
        e.result === "sucesso" &&
        e.description.includes(cleanPhone) &&
        Date.now() - new Date(e.at).getTime() < 6 * 60 * 60_000,
    );
    if (recentSend) {
      result.skipped++;
      continue;
    }

    const text = formatForWhatsApp(messageFactory(contact));

    const res = await evolutionSendText(cleanPhone, text, cfg);

    if (res.ok) {
      result.sent++;
      console.log(`[Dispatcher] ✅ ${i + 1}/${contacts.length} → ${contact.name} (${cleanPhone})`);

      update((d) => {
        d.executions.unshift({
          id: uid("ex_disp_"),
          organizationId,
          at: nowISO(),
          actor: contact.agentName,
          actorType: "agent",
          action: "evolution.sendText.prospect",
          description: `Prospecção enviada para ${contact.name} (${cleanPhone}) via Evolution helena (+55 18 98101-1186)`,
          result: "sucesso",
          requestedBy: "Helena",
          durationMs: 0,
        });
        // Grava a mensagem no Inbox só depois do envio real (evita duplicar com eco Evolution).
        const conv = already
          ? d.conversations.find((cv) => cv.contactId === already.id)
          : d.conversations.find((cv) => cv.contactId === contact.contactId);
        if (conv && !conv.messages.some((m) => m.from === "agent" && m.text === text)) {
          conv.messages.push({
            id: uid("m_"),
            from: "agent",
            authorName: contact.agentName,
            text,
            at: nowISO(),
            kind: "text",
          });
          conv.lastMessageAt = nowISO();
          conv.flow = {
            origin: conv.flow?.origin ?? "prospeccao",
            state: "abordado",
            lastOutboundAt: nowISO(),
            closerAttempts: conv.flow?.closerAttempts ?? 0,
          };
        }
        const wa = d.connections.find((c) => c.id === "wa_agency")
          ?? d.connections.find((c) => /info tech|helena/i.test(c.name))
          ?? d.connections.find((c) => c.status === "online");
        if (wa) wa.sentToday += 1;
        const agent = d.agents.find((a) => a.name === contact.agentName);
        if (agent) agent.metrics.conversations += 1;
        const camp = d.campaigns.find((c) => c.status === "ativa");
        if (camp) camp.sent += 1;
        if (operationId) {
          const op = d.operations.find((o) => o.id === operationId);
          if (op) {
            op.processed = result.sent;
            op.events.unshift({
              at: nowISO(),
              text: `Mensagem enviada para ${contact.name} (${contact.companyName})`,
              kind: "info",
            });
          }
        }
      });
    } else {
      result.failed++;
      result.errors.push(`${contact.name}: ${res.error}`);
      console.warn(`[Dispatcher] ❌ Falha → ${contact.name}: ${res.error}`);

      // Registra falha na auditoria
      update((d) => {
        d.executions.unshift({
          id: uid("ex_disp_"),
          organizationId,
          at: nowISO(),
          actor: contact.agentName,
          actorType: "agent",
          action: "evolution.sendText.prospect",
          description: `Falha ao prospectar ${contact.name} (${cleanPhone}): ${res.error}`,
          result: "falha",
          error: res.error,
          requestedBy: "Helena",
          durationMs: 0,
        });
      });
    }

    // Rate limiting: pausa entre envios
    if (i < contacts.length - 1) {
      // A cada MAX_BURST mensagens, pausa mais longa
      if ((i + 1) % MAX_BURST === 0) {
        await sleep(BURST_PAUSE_MS);
      } else {
        await sleep(DEFAULT_DELAY_MS);
      }
    }
  }

  // Atualiza operação como concluída
  if (operationId) {
    update((d) => {
      const op = d.operations.find((o) => o.id === operationId);
      if (op && result.sent + result.failed >= contacts.length) {
        op.status = "completed";
        op.result = `${result.sent} mensagens enviadas, ${result.failed} falhas, ${result.skipped} puladas.`;
        op.events.unshift({
          at: nowISO(),
          text: `Prospecção concluída: ${result.sent}/${contacts.length} enviadas`,
          kind: result.failed === 0 ? "success" : "warning",
        });
      }
    });
  }

  return result;
}

/**
 * Gera o texto padrão de abordagem para prospecção.
 * Pode ser customizado via Knowledge Base da Helena futuramente.
 */
export function buildProspectMessage(c: ProspectContact): string {
  return buildCatalogOpening(c.name, c.companyName, getDB().serviceOffers ?? []);
}

/**
 * Versão curta do texto de abordagem (para segundo contato / follow-up).
 */
export function buildFollowUpMessage(c: ProspectContact, daysSince: number): string {
  return `Olá ${c.name}! ${c.agentName} aqui da Info Tech novamente. Passando para ver se conseguiu dar uma olhada na nossa proposta de site para a ${c.companyName}. Ainda temos a condição especial disponível esta semana. Podemos conversar?`;
}
