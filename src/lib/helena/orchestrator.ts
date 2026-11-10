// Helena Orchestrator (frontend mock).
// Flow: message -> intent -> context -> plan -> tool selection -> risk check ->
// approval when needed -> execution -> monitoring -> result.
// Intent detection is rule-based here; swap interpret() for an LLM call with
// tool calling when the real backend exists. The execution path stays the same.
import type { Agent, DB, HelenaCard } from "@/lib/types";
import { createUiStore, currentUser, getDB } from "@/lib/store";
import { brl, greeting, normalize } from "@/lib/format";
import { computeSummary, needsApproval, pushHelenaMessage, requestApproval, runTool, toolRisk, updateHelenaCard } from "./engine";
import { liveBoard } from "@/lib/analytics";
import { getToolDef } from "./registry";
import { callGroqOrchestrator } from "./groq";
import { computeDynamicCadence, getWhatsAppWorkerStatus, OBJECTION_MATRIX, FINANCIAL_GOAL } from "./sales-brain";
import { computeRevenuePlan, parseDeadline, parseRevenueGoal } from "./revenue-goal";
import { generateBriefingScript, getBriefingConfig, isHelenaArrivalGreeting } from "./briefing";
import { agentCouncil, companyBriefing, crisisState, isCompanyStatusQuestion, isCouncilQuestion, isCrisisQuestion, isMissionPlanIntent } from "./command";
import { recoverOpportunities } from "./decision";
import { integrationHealth, screenContextLine } from "./reliability";
import { pauseHappyNation, playFarewellMusic, playHappyNation } from "./music";
import { extractProspectIntent, resolveProspectScope } from "@/lib/prospect/mapsSearch";
import { isPresenceIntent } from "@/lib/dev/presence";
import { canUseDevTeam } from "@/lib/saas";

export type HelenaState = "ocioso" | "ouvindo" | "pensando" | "planejando" | "executando" | "aguardando" | "concluindo";

export const helenaUi = createUiStore<{ open: boolean; state: HelenaState; draft: string; paletteOpen: boolean; screenPath: string; screenLabel: string }>({
  open: false,
  state: "ocioso",
  draft: "",
  paletteOpen: false,
  screenPath: "",
  screenLabel: "",
});

export const HELENA_STATE_LABEL: Record<HelenaState, string> = {
  ocioso: "Online",
  ouvindo: "Ouvindo",
  pensando: "Pensando",
  planejando: "Planejando",
  executando: "Executando",
  aguardando: "Aguardando aprovação",
  concluindo: "Concluindo",
};

interface Reply {
  text: string;
  card?: HelenaCard;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function openHelena(prefill?: string) {
  helenaUi.set({ open: true, paletteOpen: false, ...(prefill !== undefined ? { draft: prefill } : {}) });
}

export async function sendToHelena(text: string) {
  const clean = text.trim();
  if (!clean) return;

  const nClean = normalize(clean);
  const briefingCfg = getBriefingConfig();
  const triggerNorm = normalize(briefingCfg.triggerPhrase || "olá helena, cheguei");
  const exitNorm = normalize(briefingCfg.exitTriggerPhrase || "helena, encerrando por hoje");

  try {
  // Intercept arrival: "olá helena cheguei", "bom dia", "boa tarde" — música de fundo + briefing falado
  if (isHelenaArrivalGreeting(clean, briefingCfg.triggerPhrase) || nClean === triggerNorm) {
    pushHelenaMessage(clean, undefined, "user");
    helenaUi.set({ state: "pensando", draft: "" });
    await sleep(250);

    // Automatically trigger Happy Nation background soundtrack
    if (briefingCfg.autoPlayMusic) {
      playHappyNation(briefingCfg.musicVolume, { linger: false });
    }

    const briefing = generateBriefingScript(getDB(), briefingCfg, "entrada");
    pushHelenaMessage(briefing.script, {
      type: "stats",
      title: "Briefing Executivo de Entrada · Info Tech Ltda",
      items: briefing.highlights.map((h) => ({ label: h.label, value: h.value })),
    });

    helenaUi.set({ state: "concluindo" });
    await sleep(400);
    helenaUi.set({ state: "ocioso" });
    return;
  }

  // Intercept exit triggers: "helena, encerrando por hoje", "encerrar expediente", etc.
  if (
    nClean === exitNorm ||
    nClean.includes("encerrando por hoje") ||
    nClean.includes("fim do expediente") ||
    nClean.includes("tchau helena")
  ) {
    pushHelenaMessage(clean, undefined, "user");
    helenaUi.set({ state: "pensando", draft: "" });
    pauseHappyNation();
    if (briefingCfg.autoPlayMusic) playFarewellMusic(briefingCfg.musicVolume);
    await sleep(250);

    const briefing = generateBriefingScript(getDB(), briefingCfg, "encerramento");
    pushHelenaMessage(briefing.script, {
      type: "stats",
      title: "Resumo Noturno de Encerramento",
      items: briefing.highlights.map((h) => ({ label: h.label, value: h.value })),
    });

    helenaUi.set({ state: "concluindo" });
    await sleep(400);
    helenaUi.set({ state: "ocioso" });
    return;
  }

  if (
    /\b(toca|toque|tocar|pode tocar|ponha|coloca)\b/.test(nClean) &&
    /\b(musica|música|trilha|happy nation|som)\b/.test(nClean)
  ) {
    pushHelenaMessage(clean, undefined, "user");
    playHappyNation(briefingCfg.musicVolume, { linger: true });
    pushHelenaMessage("Toquei a trilha a partir de 0:12. Digo para pausar quando quiser.");
    helenaUi.set({ draft: "", state: "ocioso" });
    return;
  }
  if (/\b(pausa|pause|para|parar|desliga)\b/.test(nClean) && /\b(musica|música|trilha|som|happy)\b/.test(nClean)) {
    pushHelenaMessage(clean, undefined, "user");
    pauseHappyNation();
    pushHelenaMessage("Pausado.");
    helenaUi.set({ draft: "", state: "ocioso" });
    return;
  }

  pushHelenaMessage(clean, undefined, "user");
  helenaUi.set({ state: "pensando", draft: "" });

  const history = getDB().helenaMessages.slice(-6).map((m) => ({
    role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: m.text,
  }));

  if (isCompanyStatusQuestion(clean) || isCouncilQuestion(clean) || isCrisisQuestion(clean) || isMissionPlanIntent(clean)) {
    helenaUi.set({ state: "planejando" });
    await sleep(200);
    interpret(clean).forEach((r) => pushHelenaMessage(r.text, r.card));
    helenaUi.set({ state: "ocioso" });
    return;
  }

  // Orquestração inteligente via Groq Cloud
  // Revenue goals always use the deterministic plan so the math and approval card are guaranteed.
  const groqRes = parseRevenueGoal(clean) ? null : await callGroqOrchestrator(clean, history);

  if (groqRes && groqRes.toolCalls && groqRes.toolCalls.length > 0) {
    helenaUi.set({ state: "planejando" });
    await sleep(350);

    const user = currentUser(getDB());
    const requestedBy = user?.name || "Gestor";
    const allowDev = canUseDevTeam(user);
    const scope = resolveProspectScope(clean);
    const wantsProspect =
      /(1000|mil)\s*leads?|\brpa\b|prospect|prospecc|cacar|caçar|procure|procurar|varr|diversos?\s*nichos?|brasil\s*(inteiro|todinho)|ativar?\s+o?\s*time\s*(comercial|market|inteiro|de\s*market|dev)/i.test(clean);
    // Prospecção SEMPRE antes do Time Dev — nunca troca Maps por prévia Vercel.
    const orderedCalls = [...groqRes.toolCalls].sort((a, b) => {
      const rank = (name: string) =>
        name === "prospect_scan_maps" ? 0
          : name === "dev_build_presence" ? 2
            : 1;
      return rank(a.name) - rank(b.name);
    });
    for (const tc of orderedCalls) {
      if (tc.name === "prospect_scan_maps") {
        // Cidade do prompt manda: NUNCA sobrescrever Andradina/BC com “Brasil”.
        const args = wantsProspect
          ? {
              ...tc.arguments,
              segment: scope.namedCity && !scope.wave
                ? (tc.arguments.segment || scope.segment)
                : (scope.wave ? scope.segment : (tc.arguments.segment || scope.segment)),
              city: scope.city,
              nationwide: scope.nationwide,
              wave: scope.wave,
              limit: Math.min(Number(tc.arguments.limit) || scope.limit, 1000),
              noWhatsAppAi: scope.noWhatsAppAi || tc.arguments.noWhatsAppAi,
              ...(scope.nationwide ? { state: "TODOS" } : { state: tc.arguments.state }),
            }
          : {
              ...tc.arguments,
              city: scope.namedCity ? scope.city : (tc.arguments.city || scope.city),
              nationwide: scope.namedCity ? false : Boolean(tc.arguments.nationwide),
            };
        const res = runTool("prospect.scan_maps", args, { actor: "Helena", actorType: "helena", requestedBy });
        pushHelenaMessage(
          groqRes.text || res.message || `Varredura Maps iniciada. Leads primeiro — Time Dev só depois.`,
          { type: "result", ok: res.ok, title: "Varredura Maps · prospecção", detail: res.message }
        );
      } else if (tc.name === "dev_build_presence") {
        if (wantsProspect) {
          // Não dispara Dev no mesmo turno da onda: primeiro acha lead, depois prévia.
          pushHelenaMessage(
            "Prospecção na frente. Quando os leads entrarem no Pipeline, o Time Dev (Sofia/Caio/Diego) monta as prévias Vercel pra mandar no WhatsApp.",
            { type: "result", ok: true, title: "Time Dev · aguardando leads", detail: "depois da varredura" },
          );
          continue;
        }
        if (!allowDev) {
          const res = runTool("prospect.scan_maps", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy });
          pushHelenaMessage(groqRes.text || res.message, { type: "result", ok: res.ok, title: "Varredura Maps", detail: res.message });
          continue;
        }
        const res = runTool("dev.build_presence", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy });
        pushHelenaMessage(
          groqRes.text || res.message,
          { type: "result", ok: res.ok, title: "Time Desenvolvimento IA · prévia", detail: res.message }
        );
      } else if (tc.name === "calendar_create_event" || tc.name === "calendar_agendar_reuniao") {
        const res = runTool("calendar.agendar_reuniao", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy });
        pushHelenaMessage(
          groqRes.text || "Reunião gravada na Agenda compartilhada e vinculada ao lead.",
          { type: "result", ok: res.ok, title: "Agenda compartilhada", detail: res.message }
        );
      } else if (tc.name === "leads_diagnose") {
        const res = runTool("leads.diagnose", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy });
        pushHelenaMessage(
          groqRes.text || res.message,
          { type: "result", ok: res.ok, title: "Diagnóstico do lead", detail: res.message }
        );
      } else if (tc.name === "sales_handle_objection") {
        const res = runTool("sales.handle_objection", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy });
        pushHelenaMessage(
          groqRes.text || res.message,
          { type: "result", ok: res.ok, title: "Matriz de Objeções (Sales Brain)", detail: res.message }
        );
      } else if (tc.name === "sales_generate_checkout_pix") {
        const res = runTool("sales.generate_checkout_pix", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy });
        pushHelenaMessage(
          groqRes.text || res.message,
          { type: "result", ok: res.ok, title: "Checkout Pix / Fechamento", detail: res.message }
        );
      } else if (tc.name === "sales_rescue_cold_leads") {
        const res = runTool("sales.rescue_cold_leads", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy });
        pushHelenaMessage(
          groqRes.text || res.message,
          { type: "result", ok: res.ok, title: "Resgate de Leads Frios (>48h)", detail: res.message }
        );
      } else if (tc.name === "helena_briefing" || tc.name === "helena_council" || tc.name === "helena_crisis" || tc.name === "helena_coach" || tc.name === "helena_run_followups") {
        const tool = tc.name.replace("_", ".") as "helena.briefing" | "helena.council" | "helena.crisis" | "helena.coach" | "helena.run_followups";
        const res = runTool(tool, tc.arguments, { actor: "Helena", actorType: "helena", requestedBy });
        pushHelenaMessage(groqRes.text || res.message, { type: "result", ok: res.ok, title: "Comando Helena", detail: res.message });
      } else if (tc.name === "missions_plan") {
        interpret(clean).forEach((r) => pushHelenaMessage(r.text, r.card));
      } else {
        const replies = interpret(clean);
        replies.forEach((r) => pushHelenaMessage(r.text, r.card));
      }
    }
    helenaUi.set({ state: "concluindo" });
    await sleep(600);
    helenaUi.set({ state: "ocioso" });
    return;
  } else if (groqRes && groqRes.text && groqRes.text.length > 10) {
    helenaUi.set({ state: "planejando" });
    await sleep(350);
    pushHelenaMessage(groqRes.text);
    helenaUi.set({ state: "concluindo" });
    await sleep(600);
    helenaUi.set({ state: "ocioso" });
    return;
  }

  // Fallback determinístico
  await sleep(400);
  helenaUi.set({ state: "planejando" });
  await sleep(350);
  const replies = interpret(clean);
  replies.forEach((r) => pushHelenaMessage(r.text, r.card));
  const waiting = replies.some((r) => r.card?.type === "plan" || r.card?.type === "approval" || r.card?.type === "agent_proposal");
  helenaUi.set({ state: waiting ? "aguardando" : "concluindo" });
  if (!waiting) {
    await sleep(800);
    helenaUi.set({ state: "ocioso" });
  }
  } catch (err) {
    console.warn("[Helena]", err);
    pushHelenaMessage(
      err instanceof Error
        ? `Travou no meio do plano: ${err.message}. Tenta de novo em uma frase (ex.: “gere 30 leads de clínicas no Brasil”).`
        : "Não consegui concluir esse pedido. Tenta de novo com nicho e quantidade.",
    );
    helenaUi.set({ state: "ocioso" });
  }
}

function prepSdr(n: string) {
  return n.replace(/sdr\s*-?\s*0?(\d)/g, "sdr 0$1");
}

function findAgents(db: DB, n: string): Agent[] {
  const exact = db.agents.filter((a) => n.includes(normalize(a.name)));
  if (exact.length) return exact.sort((a, b) => b.name.length - a.name.length).slice(0, 1);
  return db.agents.filter((a) => n.includes(normalize(a.role)));
}

/** Run a tool now, or create an approval request when its risk level requires it. */
function perform(tool: string, params: Record<string, unknown>, title: string, details: { label: string; value: string }[], okText: string): Reply {
  const db = getDB();
  const risk = toolRisk(db, tool);
  if (needsApproval(db, tool)) {
    const approvalId = requestApproval({ title, description: getToolDef(tool)?.description ?? "", details, tool, params, risk, requestedBy: "Helena" });
    return { text: `Posso fazer isso. Como é uma ação de risco ${risk === "alto" ? "alto" : "médio"}, preciso da sua aprovação antes de executar.`, card: { type: "approval", approvalId } };
  }
  const user = currentUser(db);
  const res = runTool(tool, params, { actor: "Helena", actorType: "helena", requestedBy: user?.name || "Gestor" });
  return res.ok
    ? { text: okText, card: { type: "result", ok: true, title, detail: res.message } }
    : { text: `Não consegui concluir porque ${res.message}. Nada foi alterado.`, card: { type: "result", ok: false, title, detail: res.message } };
}

function planOperation(opts: { intro: string; title: string; objective: string; total: number; listId: string; agentIds: string[]; suggestions: string[] }): Reply[] {
  const db = getDB();
  const conn = db.connections.find((c) => c.status === "online") ?? db.connections[0] ?? {
    id: "wa1",
    name: "WhatsApp Local",
    status: "online",
  };

  const list = db.lists.find((l) => l.id === opts.listId) ?? db.lists[0];
  const listName = list?.name || "Lista nova (Maps / WhatsApp)";
  const listId = list?.id || opts.listId || "l_new";
  const names = db.agents.filter((a) => opts.agentIds.includes(a.id)).map((a) => a.name);
  const approvalId = requestApproval({
    title: opts.title,
    description: opts.objective,
    details: [
      { label: "Contatos", value: String(opts.total) },
      { label: "Lista", value: listName },
      { label: "Canal", value: conn.name || "WhatsApp" },
      { label: "Agentes", value: names.join(", ") || "Time Comercial" },
      { label: "Limite", value: `${opts.total} mensagens` },
    ],
    tool: "operations.start",
    params: { title: opts.title, objective: opts.objective, total: opts.total, agentIds: opts.agentIds, listId, connectionId: conn.id },
    risk: "alto",
    requestedBy: "Helena",
  });
  return [
    {
      text: `${opts.intro}\n\nMinha sugestão:\n${opts.suggestions.map((s) => `• ${s}`).join("\n")}\n\nEstimativa inicial: ${opts.total} contatos.\n\nDeseja que eu execute?`,
      card: {
        type: "plan",
        title: opts.title,
        approvalId,
        steps: [
          { label: "Carregar ICP", done: true },
          { label: `Selecionar ${names.filter((n) => n.startsWith("SDR")).join(" e ") || "agentes"}`, done: true },
          { label: `Preparar lista ${listName}`, done: true },
          { label: "Iniciar prospecção", done: false },
          { label: "Monitorar respostas", done: false },
          { label: "Qualificar oportunidades", done: false },
        ],
      },
    },
  ];
}

export function interpret(text: string): Reply[] {
  const db = getDB();
  const user = currentUser(db);
  const actorName = user?.name || "Gestor";
  const first = actorName.split(" ")[0] || "Gestor";
  const n = prepSdr(normalize(text));
  const summary = computeSummary(db);
  const comercial = db.teams.find((t) => t.name === "Comercial")!;
  const sdrs = db.agents.filter((a) => a.role === "SDR" && a.status !== "erro");

  if (user && !db.rolePermissions[user.role]?.includes("helena.use")) {
    return [{ text: "Seu perfil não tem permissão para usar a Helena. Fale com um administrador." }];
  }

  if (isCompanyStatusQuestion(n) || /como esta minha empresa|como esta a empresa/.test(n)) {
    const b = companyBriefing(db);
    return [{
      text: b.text,
      card: { type: "stats", title: "Como está a empresa hoje", items: b.highlights.map((h) => ({ label: h.label, value: h.value })) },
    }];
  }
  if (isCouncilQuestion(n)) {
    const c = agentCouncil(db, text);
    return [{
      text: `${c.recommendation}\n\n${c.seats.map((s) => `• ${s.team} (${s.agent}): ${s.stance}. ${s.evidence}`).join("\n")}\n\n${c.note}`,
      card: { type: "stats", title: "Conselho de agentes", items: c.seats.map((s) => ({ label: s.team, value: s.stance, hint: s.evidence })) },
    }];
  }
  if (isCrisisQuestion(n)) {
    const c = crisisState(db);
    return [{
      text: c.active ? `Modo crise.\n${c.reasons.join("\n")}\n\n${c.plan.join("\n")}` : c.plan.join("\n"),
      card: { type: "stats", title: "Modo crise", items: (c.active ? c.reasons : c.plan).slice(0, 6).map((r, i) => ({ label: c.active ? `Sinal ${i + 1}` : "Plano", value: r })) },
    }];
  }
  if (/replay da missao|reproduzir missao/.test(n)) {
    const code = text.match(/MIS-\d+/i)?.[0];
    const mission = code
      ? db.missions.find((m) => m.code.toLowerCase() === code.toLowerCase())
      : db.missions[0];
    if (!mission) return [{ text: "Nenhuma missão no cadastro para reproduzir." }];
    return [perform("helena.replay", { missionId: mission.id }, `Replay ${mission.code}`, [{ label: "Missão", value: mission.code }], "Replay montado a partir de eventos e execuções gravados.")];
  }
  // Helena ensina e administra o sistema
  if (
    /como (usar|funciona)|me ensina|ensin[ae]|tutorial|o que (eu )?fa[cç]o|por onde (eu )?come[cç]|onboarding|guia do sistema|administra(r)? (tudo|o sistema)|assume o (comercial|sistema)|cuida de tudo/.test(n)
  ) {
    const res = runTool("helena.coach", { topic: text }, { actor: "Helena", actorType: "helena", requestedBy: actorName });
    const steps = Array.isArray((res.data as { steps?: { title: string; done: boolean; href: string }[] })?.steps)
      ? (res.data as { steps: { title: string; done: boolean; href: string }[] }).steps
      : [];
    return [{
      text: res.message,
      card: {
        type: "list",
        title: "Helena · ensino e comando",
        items: steps.map((s) => ({ label: `${s.done ? "✓ " : ""}${s.title}`, href: s.href })),
      },
    }];
  }
  if (/cuida (dos? )?follow|faz(er)? (os? )?follow|assume (os? )?follow|resgatar? leads? frios?|reativ/.test(n)) {
    const res = runTool("helena.run_followups", {}, { actor: "Helena", actorType: "helena", requestedBy: actorName });
    return [{
      text: res.message,
      card: { type: "result", ok: res.ok, title: "Helena · follow-up", detail: res.message },
    }];
  }

  if (/esta tela|nesta tela|o que estou vendo|neste modulo/.test(n)) {
    const ui = helenaUi.get();
    const ctx = screenContextLine(ui.screenPath, ui.screenLabel);
    return [{
      text: ctx
        ? `${ctx}\nEu administro este módulo com os dados do seu perfil. Peça um dossiê, follow-up, missão ou “me ensina a usar”.`
        : "Ainda não identifiquei a tela. Navegue no painel e pergunte de novo — ou diga “me ensina a usar o sistema”.",
    }];
  }
  if (/saude das integr|circuit breaker|whatsapp (esta|ta) (on|off)|fila rpa/.test(n)) {
    const h = integrationHealth(db);
    return [{
      text: `Kill switch: ${h.killSwitch ? "ligado" : "desligado"}. Circuito: ${h.circuitOpen ? "aberto (Helena não dispara lote)" : "fechado"}. RPA: ${h.rpa.failed} falha(s), ${h.rpa.queued} na fila. ${h.note}`,
      card: { type: "stats", title: "Integrações", items: [
        { label: "Circuito", value: h.circuitOpen ? "aberto" : "ok" },
        { label: "RPA falhas", value: String(h.rpa.failed) },
        { label: "Aprovações", value: String(h.pendingApprovals) },
      ] },
    }];
  }
  if (/leads? parados?|analise os motivos|prepare uma acao para recuperar|recuperar os melhores/.test(n) && /analis|prepare|encontre|recuper/.test(n)) {
    const rec = recoverOpportunities(db);
    const replies: Reply[] = [{
      text: rec.length
        ? `Cadastro: ${rec.length} oportunidade(s) para recuperar.\n${rec.slice(0, 6).map((r) => `• ${r.name}: ${r.why} → ${r.action}`).join("\n")}\nIsso não é disparo. Posso planejar uma missão de recuperação com aprovação.`
        : "Nenhuma oportunidade marcada para recuperar neste cadastro. Sem teatro de fila.",
      card: { type: "list", title: "Recuperação", items: rec.slice(0, 8).map((r) => ({ label: r.name, sub: r.action, href: `/crm/dossie/${r.contactId}` })) },
    }];
    if (rec.length) {
      replies.push(perform(
        "missions.plan",
        { title: "Recuperar oportunidades do cadastro", objective: `Recuperar ${rec.length} leads com evidência no dossiê. ${text}`, targetValue: rec.length },
        "Missão de recuperação",
        [{ label: "Leads", value: String(rec.length) }, { label: "Origem", value: "recoverOpportunities" }],
        "Missão de recuperação planejada. Início só com aprovação.",
      ));
    }
    return replies;
  }
  if (isMissionPlanIntent(n) || /conquistar \d+|missao para/.test(n)) {
    const target = Number(n.match(/(\d{1,3})/)?.[1] ?? 20);
    return [
      perform(
        "missions.plan",
        { title: `Missão · ${target} no objetivo`, objective: text, targetValue: Math.min(target, 150) },
        `Planejar missão (${target})`,
        [{ label: "Objetivo", value: text.slice(0, 180) }, { label: "Meta", value: String(Math.min(target, 150)) }, { label: "Time", value: "Comercial (Helena orquestra)" }],
        "Missão planejada no Mission Control. Início só com aprovação — a Helena não dispara sozinha.",
      ),
    ];
  }

  // Create agent
  if (/\b(crie|criar|cria|monte|montar|preciso de)\b.*\b(sdr|agente|closer|atendente|qualificador|follow.?up)\b/.test(n) && !/estrategia/.test(n)) {
    const role = /closer/.test(n) ? "Closer" : /atendente|atendimento/.test(n) ? "Atendimento" : /qualificador/.test(n) ? "Qualificador" : /follow/.test(n) ? "Follow-up" : "SDR";
    const segMatch = text.match(/para\s+(.+?)[.?!]*$/i);
    const segment = segMatch ? segMatch[1].replace(/^(as|os|a|o)\s+/i, "") : "novos clientes";
    const segTitle = segment.split(" ").slice(-1)[0].replace(/^\w/, (c) => c.toUpperCase());
    const isAt = role === "Atendimento";
    return [{
      text: `Montei uma proposta de agente. Revise e, se estiver de acordo, eu crio.`,
      card: {
        type: "agent_proposal",
        proposal: {
          name: `${role} ${segTitle}`,
          role,
          objective: role === "SDR" ? `Prospectar ${segment} sem presença digital adequada.` : `Atuar como ${role.toLowerCase()} para ${segment}.`,
          tools: ["crm.search_contacts", "crm.create_contact", "messages.send", "knowledge.search", "crm.create_lead", "crm.move_lead", "calendar.agendar_reuniao"],
          channels: ["whatsapp"],
          model: db.helenaSettings.agentsDefaultModel,
          supervisorId: isAt ? "a_supat" : "a_supcom",
          teamId: isAt ? "t_at" : "t_com",
        },
      },
    }];
  }

  // RPA multi-nicho / 1000 leads — cidade do prompt manda (nunca força Brasil se citou Andradina/BC/etc).
  if (
    /\brpa\b/.test(n)
    || /expediente\s*(rpa|automat|multi)/.test(n)
    || /onda\s*(rpa|comercial|multi)/.test(n)
    || /diversos?\s*nichos?|varios\s*nichos?|multi[\s-]?nicho|todos?\s*os\s*nichos|time\s*inteiro|nao\s*somente|nao\s*so\s*(em\s*)?(sao|campinas|restaurante)/.test(n)
    || /(1000|mil)\s*leads?/.test(n)
    || /brasil\s*(inteiro|todinho|todo)/.test(n)
  ) {
    const scope = resolveProspectScope(text);
    const limit = scope.limit;
    const multi = true;
    if (multi) {
      const goalMatch = n.match(/(?:fechar|meta|faturar|bater)\s*(?:de\s*)?(?:r\$\s*)?(\d{3,5})/);
      const where = scope.nationwide ? "Brasil inteiro" : scope.city;
      const actions = [
        perform(
          "prospect.scan_maps",
          {
            segment: scope.segment,
            city: scope.city,
            nationwide: scope.nationwide,
            state: scope.nationwide ? "TODOS" : undefined,
            limit,
            wave: scope.wave,
            noWhatsAppAi: scope.noWhatsAppAi,
          },
          `RPA ${scope.wave ? "multi-nicho" : scope.segment} · até ${limit} leads · ${where}`,
          [
            { label: "Modo", value: scope.wave ? "RPA · diversos nichos e profissões" : `Varredura · ${scope.segment}` },
            { label: "Nichos", value: scope.wave ? "Dentistas, clínicas, estética, advogados, restaurantes, barbearias, pet, imobiliárias…" : scope.segment },
            { label: "Escopo", value: scope.nationwide ? "Brasil inteiro (capitais + hubs)" : scope.city },
            { label: "Meta", value: `Até ${limit} WhatsApp válidos sem site` },
            { label: "Times", value: "Comercial + Closer ativos · Dev quando Máquina" },
            { label: "Disparo", value: "Evolution · só com WhatsApp online" },
          ],
          `RPA ${scope.wave ? "multi-nicho" : scope.segment} em ${where}: até ${limit} leads. Pipeline + Inbox + WhatsApp. Te aviso quando a onda terminar.`,
        ),
      ];
      if (goalMatch) {
        const goal = Number(goalMatch[1]);
        actions.push(
          perform(
            "missions.plan",
            {
              title: `Meta R$ ${goal.toLocaleString("pt-BR")}`,
              objective: `Fechar R$ ${goal.toLocaleString("pt-BR")} em projetos (site/cardápio) com Comercial + Closer + Dev`,
              targetValue: Math.min(40, Math.max(8, Math.ceil(goal / 250))),
            },
            `Missão · meta R$ ${goal.toLocaleString("pt-BR")}`,
            [{ label: "Meta", value: `R$ ${goal.toLocaleString("pt-BR")} em projetos fechados` }],
            `Missão criada: meta de R$ ${goal.toLocaleString("pt-BR")} em projetos fechados. Comercial + Closer + Dev alinhados.`,
          ),
        );
      }
      actions.push(
        perform(
          "teams.activate",
          { teamId: "t_com" },
          "Ativar Time Comercial + Closer",
          [{ label: "Time", value: "Comercial (SDR + Closer + Market)" }],
          "Time Comercial e Closer ativos pra abordar e fechar.",
        ),
      );
      // Time Dev NÃO sobe agora — só depois que a varredura achar leads (senão “ativa time” sem prospecção).
      if (canUseDevTeam(currentUser(getDB())) && (/time\s*dev|designer|cardapio|previa|site|time\s*inteiro/.test(n))) {
        actions.push({
          text: "Ordem: 1) prospecção Maps → Pipeline 2) Comercial no WhatsApp 3) Time Dev monta prévia Vercel só nos leads achados. Não disparo Dev antes da varredura.",
          card: {
            type: "result" as const,
            ok: true,
            title: "Time Dev · depois dos leads",
            detail: "aguarda RPA",
          },
        });
      }
      return actions;
    }
  }

  // Time Dev IA: só prévia pura. Se pediu leads/RPA/prospecção, NÃO entra aqui.
  if (
    isPresenceIntent(text)
    && canUseDevTeam(currentUser(getDB()))
    && !/\brpa\b|1000\s*leads?|mil\s*leads?|onda\s*multi|prospect|prospecc|cacar|caçar|varr|diversos?\s*nichos?|brasil\s*(inteiro|todinho)|ativar\s+o?\s*time\s*(comercial|market)/.test(n)
  ) {
    const intent = extractProspectIntent(text);
    const segment = intent.segment;
    const nationwide = intent.nationwide;
    const city = intent.city;
    const limit = Math.min(Number(n.match(/(\d{1,4})/)?.[1] ?? 10), 50);
    return [
      perform(
        "dev.build_presence",
        { segment, city, nationwide, limit },
        `Prévia digital: ${segment} · ${nationwide ? "Brasil inteiro" : city}`,
        [
          { label: "Nicho", value: segment },
          { label: "Escopo", value: nationwide ? "Brasil inteiro" : city },
          { label: "Critério", value: /restaurante|comida|cardapio|pizzaria|lanchonete/.test(n) ? "Sem site e sem cardápio online" : "Sem site" },
          { label: "Time Dev", value: "Sofia (Designer Gráfico) · Caio (front) · Diego (back)" },
          { label: "Entrega", value: "Prévia bonita hospedada na Vercel · link clicável no WhatsApp" },
          { label: "Depois", value: "Time Comercial manda o link e pergunta se é o dono" },
        ],
        `Orquestrei o Time Dev com a Sofia (Designer Gráfico) para ${limit} ${segment} (${nationwide ? "Brasil inteiro" : city}). Quem não tem site${/cardapio|restaurante|pizzaria/.test(n) ? " nem cardápio" : ""} ganha prévia visual na Vercel. O comercial manda o link clicável. Veja em IA → Prévia de sites.`,
      ),
    ];
  }

  // Prospecção autônoma: qualquer nicho que o gestor pedir (não só dentista)
  if (/sem.?site|google maps|maps|varr\w*|prospect|prospecc|ptrospec|cacar lead|caçar lead|buscar cliente|buscar lead|procure|procurar|gerar?\s+\d*\s*leads?|gere\s+\d*\s*leads?|ativar o time|ativ\w*\s+time|sem ia|sem inteligencia|chatbot|atendente virtual|ia no whatsapp/.test(n)) {
    const scope = resolveProspectScope(text);
    const weak = /negocios locais|sem site|empresas|clientes|^leads?$|diversos/.test(
      scope.segment.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    );
    const segment = scope.wave ? scope.segment : (weak ? "Dentistas" : scope.segment);
    const { city, nationwide, wave, limit, noWhatsAppAi } = scope;
    const where = nationwide ? "Brasil inteiro" : city;

    return [
      perform(
        "prospect.scan_maps",
        {
          segment: wave ? "diversos nichos locais" : segment,
          city,
          nationwide,
          state: nationwide ? "TODOS" : undefined,
          limit,
          wave,
          noWhatsAppAi,
        },
        `Varredura Maps: ${wave ? "onda multi-nicho" : segment} · ${where}`,
        [
          { label: "Nicho", value: wave ? "RPA diversos nichos (dentistas, clínicas, estética, advogados, restaurantes, barbearias, pet, imobiliárias…)" : segment },
          { label: "Escopo", value: where },
          { label: "Critério", value: noWhatsAppAi ? "WhatsApp válido · sem rastros públicos de IA/chatbot no atendimento (heurística)" : "Sem site + WhatsApp celular válido · sem inventar número" },
          { label: "CRM", value: "Pipeline → Qualificado · Inbox · Contatos" },
          { label: "WhatsApp", value: "Evolution (chip conectado)" },
        ],
        wave
          ? `RPA multi-nicho em ${where} (até ${limit} WhatsApp válidos). Pipeline + Inbox + disparo. Te aviso ao terminar.`
          : `Varredura de ${segment} em ${where} iniciada. Leads → Pipeline + Inbox + WhatsApp. Te aviso ao terminar.`,
      ),
    ];
  }

  // Agendamento no Google Calendar / Cal.com
  if (/agend\w*|marcar.*reuni[aã]o|cal\.com|calendar/.test(n) && !/consiga/.test(n)) {
    const contact = db.contacts.find((c) => n.includes(normalize(c.name))) || db.contacts[0];
    const deal = db.deals.find((d) => d.contactId === contact?.id);
    return [
      perform(
        "calendar.create_event",
        {
          contactId: contact?.id,
          dealId: deal?.id,
          title: `Apresentação de Site Institucional · ${contact?.name || "Cliente"}`,
        },
        `Agendar reunião: ${contact?.name}`,
        [
          { label: "Cliente", value: contact?.name || "Cliente" },
          { label: "Canal", value: "Agenda compartilhada" },
          { label: "Responsável", value: "Closer (IA)" },
        ],
        `Reunião gravada na Agenda compartilhada para ${contact?.name}. O lead foi para Reunião Agendada no pipeline.`
      ),
    ];
  }

  // Campanha food: lanche, sorvete, sushi, restaurantes + follow-up dono
  if (
    /campanha\s*food|abord(ar|e|em)?\s*(lanchonete|sorveter|sushi|restaurante)|enviar.*(lanchonete|sorveter|sushi|restaurante)|lanchonetes?\s*(e|,).*(sorveter|sushi|restaurante)|sorveterias?\s*(e|,).*(lanchonete|sushi|restaurante)/.test(n)
    || (/lanchonete|sorveter|sushi/.test(n) && /restaurante|abord|campanha|dispar/.test(n))
  ) {
    return [
      perform(
        "campaigns.activate_food",
        { city: "Brasil", nationwide: true, limit: 60, goal: 3000 },
        "Campanha Food · lanche, sorvete, sushi e restaurantes",
        [
          { label: "Nichos", value: "Lanchonetes, sorveterias, açaí, sushi, pizza, hambúrguer, churrasco, restaurantes…" },
          { label: "Ação", value: "Maps → Pipeline → WhatsApp (Time Comercial aborda todos)" },
          { label: "Inbox", value: "Se disser que vai passar pro responsável/dono → follow-up automático" },
          { label: "Escopo", value: "Brasil inteiro · cardápio/site R$ 100/mês" },
        ],
        "Campanha Food ligada. Vou caçar lanchonetes, sorveterias, sushi e outros restaurantes, o time aborda no WhatsApp e o Inbox fica de olho: se alguém falar que vai passar pro responsável ou proprietário, a gente responde e agenda follow-up.",
      ),
    ];
  }

  // Meta mensal / campanha 24/7: "quero fazer 3 mil no mês"
  const revenueGoal = parseRevenueGoal(text);
  if (revenueGoal || /campanha\s*24|operar\s*24|24\s*\/\s*7|sorveter|acai|açaí|lanchonete.*noite|pizzaria.*noite/.test(n) && /meta|faturar|fazer|mil|3000|3\s*mil/.test(n)) {
    const goal = revenueGoal || 3000;
    const deadline = parseDeadline(text);
    return [
      perform(
        "campaigns.activate_month",
        { goal, city: "Brasil", nationwide: true },
        `Campanha 24/7 · meta ${brl(goal)} ${deadline.includes("mês") ? deadline : "este mês"}`,
        [
          { label: "Meta", value: `${brl(goal)} / mês` },
          { label: "Ticket", value: "R$ 100/mês (site/cardápio)" },
          { label: "Noite (18h–00h)", value: "Sorveterias, açaí, lanchonetes, pizzarias, hambúrguer…" },
          { label: "Dia (8h–18h)", value: "Dentistas, clínicas, advogados, barbearias, imobiliárias…" },
          { label: "Times", value: "Comercial + Closer ativos · Pipeline automático · follow-up ✓✓" },
        ],
        `Campanha ligada: meta ${brl(goal)} este mês. De noite o radar pega food noturno (sorvete, açaí, lanche, pizza). De dia, outros nichos. Helena e os agentes operam 24/7 — Pipeline e follow-up sem você precisar clicar.`,
      ),
    ];
  }

  // 1. Gestão Dinâmica da Meta mensal (Dynamic Cadence)
  if (/15\s*k|15000|15\.000|3\s*mil|3000|cadencia dinamica|ritmo de vendas|meta financeira|meta do mes/.test(n)) {
    const cad = computeDynamicCadence(db);
    return [{
      text: `Gestão da meta ${brl(cad.goal)}/mês:\n• Faturado: ${brl(cad.achieved)} (${cad.percent}%)\n• Pipeline aberto: ${brl(cad.openPipelineValue)}\n• Ritmo: ${cad.pacingStatus === "turbo" ? "TURBO" : cad.pacingStatus === "meta_batida" ? "META BATIDA" : "NORMAL"} · ${cad.dailyTargetCadence} abordagens/dia\n• Parados >48h: ${cad.staleDealsCount}\n\nNoite = food (sorvete, açaí, lanche, pizza). Dia = outros nichos. Pipeline e follow-up 24/7.`,
      card: {
        type: "stats",
        title: `Cadência · Meta ${brl(cad.goal)}`,
        items: [
          { label: "Meta Mensal", value: brl(cad.goal) },
          { label: "Faturado Ganho", value: brl(cad.achieved), hint: `${cad.percent}% alcançado` },
          { label: "Ritmo Operacional", value: cad.pacingStatus.toUpperCase(), hint: `${cad.dailyTargetCadence} abordagens/dia` },
          { label: "Leads Parados (>48h)", value: String(cad.staleDealsCount), hint: "Elegíveis para resgate" },
        ],
      },
    }];
  }

  // 2. Resgate de Leads Frios (> 48h)
  if (/resgat\w*|leads? parados?|leads? frios?|destravar oportunidade/.test(n)) {
    const cad = computeDynamicCadence(db);
    return [
      perform(
        "sales.rescue_cold_leads",
        {},
        "Resgate de Leads Frios (>48h parados)",
        [
          { label: "Critério", value: "Leads sem interação há mais de 48h no Kanban" },
          { label: "Oferta", value: "Condição especial de parcelamento + liberação de domínio" },
          { label: "Total elegível", value: `${cad.staleDealsCount} oportunidades` },
        ],
        `⚡ HELENA ativou o motor de resgate comercial! As oportunidades paradas há mais de 48h receberam mensagens personalizadas com a condição especial de parcelamento da Info Tech Ltda.`
      ),
    ];
  }

  // 3. Matriz de Objeções (Sales Brain)
  if (/obje[cç][aã]o|matriz de obje|contornar obje/.test(n)) {
    return [{
      text: `🧠 Matriz de Objeções Ativa (Sales Brain da Helena):\n\n1. "Já tenho Instagram, não preciso de site" → Envia print demonstrativo e alerta que 80% das buscas com urgência ocorrem no Google Maps.\n2. "Quanto custa?" → Não dá preço solto: oferece prévia demonstrativa e propõe 2 opções de horário (hoje às 16h ou amanhã às 10h).\n3. "Agora não posso conversar" → Compreende a rotina e agenda follow-up automático para as 10h ou 17h do dia seguinte.\n4. "Achei caro" → Demonstra que apenas 1 novo cliente por mês já paga todo o investimento do site.\n5. "Não tenho interesse" → Finaliza com cortesia e agenda reaquecimento em 45 dias.`,
      card: {
        type: "list",
        title: "Matriz de Objeções Comerciais · Info Tech Ltda",
        items: OBJECTION_MATRIX.map((obj) => ({
          label: obj.title,
          sub: `Ação autônoma: ${obj.actionDescription}`,
        })),
      },
    }];
  }

  // 4. Arquitetura WhatsApp & 24/7 (Sem abas / Baileys / Oracle Cloud)
  if (/aba[s]?|sem reload|baileys|socket|onde deixar rodando|oracle cloud|nuvem gratis/.test(n)) {
    const ws = getWhatsAppWorkerStatus(db);
    return [{
      text: `🔌 Arquitetura WhatsApp da Helena (Socket Invisível em Segundo Plano):\n\n• Zero Abas de Navegador: Não usamos Chrome nem interface visual pesada. Usamos a biblioteca de Socket/API em segundo plano (@whiskeysockets/baileys).\n• Consumo de Recursos: Apenas ~${ws.ramUsageMb}MB de RAM (contra mais de 1GB de abas Chrome).\n• Pareamento Simples: Você lê o QR Code apenas uma vez no celular do chip de prospecção. Depois de conectado, o celular pode ficar no carregador com Wi-Fi/4G enquanto o motor invisível opera.\n• Onde deixar rodando 24/7 sem travar seu PC de trabalho?\n  1. Opção Grátis (PC/Notebook parado em casa no carregador rodando Node.js);\n  2. Opção Nuvem Grátis (Oracle Cloud Free Tier - VM Linux 100% gratuita para sempre com PM2).`,
      card: {
        type: "stats",
        title: "Status do Worker WhatsApp (Socket Baileys)",
        items: [
          { label: "Arquitetura", value: "Socket / Background" },
          { label: "Consumo RAM", value: `${ws.ramUsageMb} MB`, hint: "Leve e sem abas Chrome" },
          { label: "Status Conexão", value: ws.status },
          { label: "Hospedagem Recomendada", value: "Oracle Cloud Free Tier" },
        ],
      },
    }];
  }

  // Strategy
  if (/estrategia|quero vender|bater a meta/.test(n)) {
    const target = Number(n.match(/(\d{1,4})/)?.[1] ?? 10);
    const won = db.deals.filter((d) => d.status === "ganho");
    const ticket = won.length ? won.reduce((s, d) => s + d.value, 0) / won.length : 5000;
    const closeRate = 0.3;
    const meetingRate = 0.05;
    const meetings = Math.ceil(target / closeRate);
    const contacts = Math.min(500, Math.ceil(meetings / meetingRate));
    return planOperation({
      intro: `Para vender ${target} sites este mês, com ticket médio de ${brl(ticket)} (receita estimada de ${brl(ticket * target)}), considerando 30% de fechamento por reunião e 5% de reunião por contato, precisamos de cerca de ${meetings} reuniões e ${contacts} contatos.`,
      title: `Meta ${target} sites`,
      objective: `Gerar ${meetings} reuniões para fechar ${target} sites.`,
      total: contacts,
      listId: "l2",
      agentIds: [...sdrs.map((a) => a.id), "a_qual", "a_closer"],
      suggestions: [
        `dividir ${contacts} contatos entre ${sdrs.map((a) => a.name).join(" e ")}`,
        "começar pelas listas Clínicas SP e Empresas SP",
        "usar a cadência B2B padrão (5 toques)",
        "encaminhar interessados para o Qualificador e depois para o Closer",
        `acompanhar diariamente a meta de ${Math.ceil(meetings / 20)} reuniões por dia útil`,
      ],
    });
  }

  // Prospecting / activate commercial or marketing team
  if (/prospect|ptrospec|leads?|potenciais clientes|novos clientes|consiga reunioes|conseguir reunioes|ativ\w*.*(comercial|marketing|time|sdr|agentes)/.test(n)) {
    const listId = /clinic|consultori|dentist/.test(n) ? "l2" : /imobili/.test(n) ? "l4" : "l1";
    const list = db.lists.find((l) => l.id === listId) ?? db.lists[0];
    const total = Math.min(Number(n.match(/(\d{1,4})/)?.[1] ?? 50), 1000);
    const listName = list?.name || "Prospecção WhatsApp";
    const segment = list?.segment || "negócios locais sem site";
    // Conta nova sem lista: onda multi-nicho → Pipeline + Inbox + WhatsApp.
    if (!list) {
      return [
        perform(
          "prospect.scan_maps",
          { segment: "vários nichos locais", city: "São Paulo, Campinas, Araçatuba, Andradina", nationwide: false, state: "SP", limit: total, wave: true },
          `Gerar ${total} leads · Time Comercial`,
          [
            { label: "Meta", value: `${total} leads` },
            { label: "Nicho", value: "Dentistas, clínicas, estética, advogados, restaurantes, barbearias" },
            { label: "Escopo", value: "SP + interior (Maps + WhatsApp válido)" },
            { label: "CRM", value: "Pipeline → Novo lead · Inbox" },
            { label: "Time", value: /marketing/.test(n) ? "Comercial (marketing = execução comercial)" : "Comercial" },
          ],
          `Varredura multi-nicho iniciada (até ${total}). Quando achar WhatsApp válido, entra no Pipeline, Inbox e dispara. Te aviso ao terminar.`,
        ),
      ];
    }
    const teamMention = /marketing/.test(n) ? "Comercial e Marketing" : "Comercial";
    const agentCount = comercial?.agentIds?.length ?? 3;
    const orgName = /info\s*tech/i.test(text) ? "Info Tech Ltda" : db.organization.name;
    return planOperation({
      intro: `${greeting()}. Eu orquestro; o Time Comercial executa as abordagens.\n\nTime ${teamMention}: ${agentCount} agentes prontos para a ${orgName}. Script inicial: Robson Alex, reunião de 10 minutos. Objeções de preço/tempo ficam com SDR/Closer (Groq). Horário fechado entra na Agenda compartilhada.`,
      title: `Prospecção ${listName}`,
      objective: `Helena delega ${total} abordagens da lista ${listName} aos SDRs da ${orgName} e gera reuniões na Agenda.`,
      total,
      listId: list.id,
      agentIds: [...sdrs.map((a) => a.id), "a_qual", "a_closer"],
      suggestions: [
        `Helena ativa o Supervisor Comercial e delega a ${sdrs.map((a) => a.name).join(" e ") || "os SDRs"}`,
        `utilizar a lista ${listName} e o disparo Evolution API /message/sendText`,
        `priorizar ${segment.toLowerCase()}`,
        `iniciar com ${total} contatos no script Robson Alex`,
        "contornar objeções de preço/tempo com Groq",
        "gravar reunião na Agenda com agendarReuniao ao fechar horário",
        "encaminhar interessados para o Closer",
      ],
    });
  }

  // Pause
  if (/\b(pause|pausar|pare|parar|desative|desativar|interrompa|suspenda)\b/.test(n)) {
    if (/campanha/.test(n)) {
      const camp = db.campaigns.find((c) => c.status === "ativa");
      if (!camp) return [{ text: "Não encontrei nenhuma campanha ativa para pausar." }];
      return [perform("campaigns.pause", { campaignId: camp.id }, `Pausar campanha ${camp.name}`, [{ label: "Campanha", value: camp.name }], `Pausei a campanha ${camp.name}. Os envios pendentes foram interrompidos.`)];
    }
    if (/operac/.test(n)) {
      const op = db.operations.find((o) => o.status === "running");
      if (!op) return [{ text: "Não há operações em execução no momento." }];
      return [perform("operations.pause", { operationId: op.id }, `Pausar ${op.code}`, [{ label: "Operação", value: op.title }], `Pausei a operação ${op.code} · ${op.title}.`)];
    }
    const team = db.teams.find((t) => n.includes(`time ${normalize(t.name)}`) || n.includes(`o ${normalize(t.name)}`));
    if (team && !findAgents(db, n).length) {
      return [perform("teams.pause", { teamId: team.id }, `Pausar time ${team.name}`, [{ label: "Agentes", value: String(team.agentIds.length + 1) }], `Pausei o time ${team.name} e todos os seus agentes.`)];
    }
    const found = findAgents(db, n);
    if (found.length === 1) {
      const a = found[0];
      return [perform("agents.pause", { agentId: a.id }, `Pausar ${a.name}`, [{ label: "Agente", value: a.name }, { label: "Tarefa atual", value: a.currentTask || "—" }], `${a.name} foi pausado. Ele não iniciará novos contatos até ser reativado.`)];
    }
    if (found.length > 1) {
      return [{ text: `Encontrei ${found.length} agentes com essa função: ${found.map((a) => a.name).join(", ")}. Qual deles devo pausar? Ex.: "pause o ${found[0].name}".` }];
    }
    return [{ text: "Não identifiquei qual agente, time, campanha ou operação devo pausar. Nada foi alterado." }];
  }

  // Activate
  if (/\b(ative|ativar|reative|reativar|retome|retomar|ligue|coloque para trabalhar)\b/.test(n)) {
    if (/operac/.test(n)) {
      const op = db.operations.find((o) => o.status === "paused");
      if (!op) return [{ text: "Não há operações pausadas para retomar." }];
      return [perform("operations.resume", { operationId: op.id }, `Retomar ${op.code}`, [{ label: "Operação", value: op.title }], `Retomei a operação ${op.code}.`)];
    }
    const found = findAgents(db, n);
    if (found.length === 1) {
      const a = found[0];
      return [perform("agents.activate", { agentId: a.id }, `Ativar ${a.name}`, [{ label: "Agente", value: a.name }], `${a.name} está ativo e trabalhando.`)];
    }
    const team = db.teams.find((t) => n.includes(normalize(t.name)));
    if (team) return [perform("teams.activate", { teamId: team.id }, `Ativar time ${team.name}`, [{ label: "Agentes", value: String(team.agentIds.length + 1) }], `O time ${team.name} está ativo.`)];
    if (found.length > 1) return [{ text: `Encontrei ${found.map((a) => a.name).join(", ")}. Qual deles devo ativar?` }];
  }

  // Hand interested leads to closer
  if (/closer/.test(n) && /(passe|passar|encaminhe|encaminhar|transfira|mande)/.test(n)) {
    const deals = db.deals.filter((d) => d.status === "aberto" && ["st_qual", "st_reun"].includes(d.stageId) && d.ownerId !== "a_closer");
    if (!deals.length) return [{ text: "Não há leads interessados pendentes de encaminhamento ao Closer." }];
    return [perform("crm.assign_lead", { dealIds: deals.map((d) => d.id), ownerId: "a_closer", ownerType: "agent" }, `Encaminhar ${deals.length} leads ao Closer`, [{ label: "Leads", value: deals.map((d) => d.title).slice(0, 4).join(", ") + (deals.length > 4 ? "…" : "") }], `Encaminhei ${deals.length} leads qualificados para o Closer. O handoff foi registrado na timeline de cada cliente.`)];
  }

  // Follow-up — Helena executa (não só lista)
  if (/follow.?up|redistribu/.test(n)) {
    const res = runTool("helena.run_followups", {}, { actor: "Helena", actorType: "helena", requestedBy: actorName });
    return [{
      text: res.message,
      card: { type: "result", ok: res.ok, title: "Helena · follow-up", detail: res.message },
    }];
  }

  // Hot leads
  if (/quente|melhores oportunidades|leads? bons/.test(n)) {
    const hot = db.deals.filter((d) => d.status === "aberto" && d.probability >= 50).sort((a, b) => b.value - a.value);
    runTool("crm.search_contacts", { query: "quente" }, { actor: "Helena", actorType: "helena", requestedBy: actorName });
    return [{
      text: `Encontrei ${hot.length} leads quentes (probabilidade ≥ 50%), somando ${brl(hot.reduce((s, d) => s + d.value, 0))} em oportunidades.`,
      card: { type: "list", title: "Leads quentes", items: hot.slice(0, 8).map((d) => ({ label: d.title, sub: `${brl(d.value)} · ${d.probability}% · ${db.contacts.find((c) => c.id === d.contactId)?.name}`, href: `/crm/contatos/${d.contactId}` })) },
    }];
  }

  // Negative conversations
  if (/negativ|reclama|insatisfeit/.test(n)) {
    const neg = db.conversations.filter((c) => c.sentiment === "negativo");
    runTool("messages.search", { query: "" }, { actor: "Helena", actorType: "helena", requestedBy: actorName });
    return [{ text: `Encontrei ${neg.length} conversas com sentimento negativo.`, card: { type: "list", title: "Conversas negativas", items: neg.map((c) => ({ label: db.contacts.find((x) => x.id === c.contactId)?.name ?? "", sub: c.messages[c.messages.length - 1]?.text, href: `/atendimento/inbox?c=${c.id}` })) } }];
  }

  // Waiting for reply
  if (/esperando|aguardando resposta|sem resposta|precisa de resposta/.test(n)) {
    const waiting = db.conversations.filter((c) => c.unread > 0 && c.status !== "resolvida").sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt));
    return [{ text: `${waiting.length} clientes estão esperando resposta. O mais antigo está aguardando desde ${new Date(waiting[0]?.lastMessageAt ?? Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`, card: { type: "list", title: "Aguardando resposta", items: waiting.map((c) => ({ label: db.contacts.find((x) => x.id === c.contactId)?.name ?? "", sub: `${c.unread} nova(s) · ${c.channel}`, href: `/atendimento/inbox?c=${c.id}` })) } }];
  }

  // Approvals
  if (/aprova/.test(n)) {
    const pend = db.approvals.filter((a) => a.status === "pendente");
    if (!pend.length) return [{ text: "Não há aprovações pendentes." }];
    return [{ text: `Há ${pend.length} aprovações aguardando você.` }, ...pend.slice(0, 3).map((a) => ({ text: a.title, card: { type: "approval", approvalId: a.id } as HelenaCard }))];
  }

  // Operations status
  if (/operac|andamento|como esta a prospec/.test(n)) {
    const running = db.operations.filter((o) => o.status === "running");
    if (!running.length) return [{ text: "Nenhuma operação em execução no momento." }];
    return [{ text: `Há ${running.length} operações em execução.` }, ...running.map((o) => ({ text: `${o.code} · ${o.title}`, card: { type: "operation", operationId: o.id } as HelenaCard }))];
  }

  // Analytics
  if (/como esta|vendas|desempenho|resultado|relatorio|quantas|quantos|metricas|faturamento|caira?m|comercial/.test(n)) {
    runTool("analytics.query", {}, { actor: "Helena", actorType: "helena", requestedBy: actorName });
    const s = summary;
    const b = liveBoard(db);
    const why = /cair|caira|queda/.test(n) ? `\n\nPrincipais causas: ${s.staleDeals} oportunidades sem follow-up há mais de 48h.` : "";
    return [{
      text: `Espelho ao vivo (mesmo número da Visão geral e do Pipeline):\n${b.abordados} abordagens, ${b.responderam} respostas, ${b.meetings.length} reuniões na Agenda, pipeline ${brl(b.pipelineValue)} em ${b.openDealsCount} deals.\nLeads 7 dias: ${b.leads7d}. Ganhos: ${b.wonCount} (${brl(b.totalRevenue)}).${why}`,
      card: { type: "stats", title: "Comercial ao vivo", items: [
        { label: "Abordagens", value: String(b.abordados) },
        { label: "Responderam", value: String(b.responderam) },
        { label: "Pipeline aberto", value: brl(b.pipelineValue) },
        { label: "Reuniões", value: String(b.meetings.length) },
        { label: "Leads 7 dias", value: String(b.leads7d) },
        { label: "Sem follow-up 48h", value: String(s.staleDeals) },
      ] },
    }];
  }

  // Greeting
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey|helena)\b/.test(n) && n.split(" ").length <= 4) {
    const items = [
      { label: `${s1(summary.followupsToday)} leads aguardando follow-up`, href: "/crm/tarefas" },
      { label: `${summary.pendingApprovals} aprovações aguardando você`, href: "/operacoes" },
      { label: `${db.conversations.filter((c) => c.unread > 0).length} clientes esperando resposta`, href: "/atendimento/inbox" },
    ];
    return [{ text: `${greeting()}, ${first}. Encontrei ${items.length} situações que merecem sua atenção.`, card: { type: "list", title: "Atenção", items } }];
  }

  return [{
    text: "Diz de outro jeito ou escolhe uma ação pronta:",
    card: { type: "list", title: "Eu cuido de", items: [
      { label: "RPA 1000 leads diversos nichos no Brasil inteiro" },
      { label: "Ativa Time Dev + Comercial + Closer" },
      { label: "Me ensina a usar o sistema" },
      { label: "Cuida dos follow-ups" },
      { label: "Monte prévia de negócios sem site" },
      { label: "Como está o comercial?" },
      { label: "Quem está esperando resposta?" },
      { label: "Assume o comercial e cuida de tudo" },
    ] },
  }];
}

const s1 = (n: number) => String(n);

export function createAgentFromProposal(messageId: string, card: Extract<HelenaCard, { type: "agent_proposal" }>) {
  const user = currentUser(getDB());
  const actorName = user?.name || "Gestor";
  const res = runTool("agents.create", { ...card.proposal, description: card.proposal.objective }, { actor: "Helena", actorType: "helena", requestedBy: actorName, approvedBy: actorName });
  if (res.ok) {
    updateHelenaCard(messageId, { ...card, createdAgentId: String(res.data?.id) });
    pushHelenaMessage(`Criei o agente ${card.proposal.name}. Ele está aguardando e já pode ser ativado em IA → Agentes ou pedindo para mim.`);
  } else {
    pushHelenaMessage(`Não consegui criar o agente porque ${res.message}.`);
  }
  helenaUi.set({ state: "ocioso" });
}
