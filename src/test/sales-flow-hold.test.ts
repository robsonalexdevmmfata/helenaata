import { describe, expect, it } from "vitest";
import { evaluateFollowup, formatSlotMenu, menuProposalFollowupText, pickProposedSlot, shouldHoldOutbound, suggestSlots, unansweredAgentStreak } from "@/lib/helena/sales-flow";
import { parseEvolutionMessageStatuses } from "@/lib/evolution/evolutionapi";
import type { Conversation, SalesFlowSettings } from "@/lib/types";

const settings: SalesFlowSettings = {
  enabled: true,
  sharedConnectionId: "wa_agency",
  teamUserIds: ["u1"],
  onlyAfterProspecting: true,
  noReplyHours: 24,
  readNoReplyHours: 24,
  maxCloserAttempts: 1,
  closerAgentId: "a_valentina",
  respectBusinessHours: false,
  businessStart: 9,
  businessEnd: 18,
  meetingDurationMin: 30,
  autoBookMeetings: true,
};

function conv(messages: Conversation["messages"], hoursAgo = 1): Conversation {
  const lastAt = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  return {
    id: "cv1",
    organizationId: "org",
    contactId: "p1",
    channel: "whatsapp",
    status: "aberta",
    handlerType: "agent",
    handlerId: "a_sdr1",
    unread: 0,
    sentiment: "neutro",
    lastMessageAt: lastAt,
    messages: messages.map((m) => ({ ...m, at: m.at || lastAt })),
    flow: { origin: "prospeccao", state: "abordado", lastOutboundAt: lastAt, closerAttempts: 0 },
  };
}

describe("não insistir no mesmo número", () => {
  it("sem visualização não dispara follow-up (mesmo após 24h)", () => {
    const c = conv([{ id: "m1", from: "agent", authorName: "SDR", text: "proposta", at: "", kind: "text" }], 25);
    const sentAt = new Date(c.flow!.lastOutboundAt).getTime();
    expect(evaluateFollowup(c, settings, new Date(sentAt + 23 * 3600_000)).action).toBe("none");
    expect(evaluateFollowup(c, settings, new Date(sentAt + 48 * 3600_000)).action).toBe("none");
  });

  it("follow-up só depois da visualização (✓✓ azul) + janela de leitura", () => {
    const c = conv([{ id: "m1", from: "agent", authorName: "SDR", text: "proposta", at: "", kind: "text" }], 30);
    const sentAt = new Date(c.flow!.lastOutboundAt).getTime();
    c.flow!.readAt = new Date(sentAt + 2 * 3600_000).toISOString();
    expect(evaluateFollowup(c, settings, new Date(sentAt + 25 * 3600_000)).action).toBe("none");
    expect(evaluateFollowup(c, settings, new Date(sentAt + 26 * 3600_000)).action).toBe("closer");
  });

  it("redige a pergunta sobre a proposta e explicita o preço mensal do cardápio", () => {
    const text = menuProposalFollowupText("Ana Souza", "Cardápio Online", 100);
    expect(text).toContain("conseguiu dar uma olhada na proposta");
    expect(text).toContain("Cardápio Online por R$ 100,00/mês");
    expect(text).toContain("não receber novos contatos");
  });

  it("reconhece evento de leitura enviado pela Evolution", () => {
    const statuses = parseEvolutionMessageStatuses({
      event: "MESSAGES_UPDATE",
      data: [{ key: { remoteJid: "5511999999999@s.whatsapp.net", id: "wa-msg-1", fromMe: true }, update: { status: 4 } }],
    });
    expect(statuses).toEqual([{
      remoteJid: "5511999999999@s.whatsapp.net",
      messageId: "wa-msg-1",
      fromMe: true,
      status: "read",
      at: expect.any(String),
    }]);
  });

  it("segura follow-up se a última mensagem ainda é do agente", () => {
    const c = conv([{ id: "m1", from: "agent", authorName: "SDR", text: "Oi, é o dono?", at: "", kind: "text" }], 2);
    expect(unansweredAgentStreak(c)).toBe(1);
    expect(shouldHoldOutbound(c)).toBe(true);
    expect(evaluateFollowup(c, settings).action).toBe("none");
  });

  it("esfria se o time já mandou duas sem resposta", () => {
    const c = conv([
      { id: "m1", from: "agent", authorName: "SDR", text: "abertura", at: "", kind: "text" },
      { id: "m2", from: "agent", authorName: "Closer", text: "follow", at: "", kind: "text" },
    ], 50);
    c.flow!.closerAttempts = 1;
    expect(evaluateFollowup(c, settings).action).toBe("esfriou");
  });

  it("oferece vários horários e aceita a opção 3", () => {
    const from = new Date("2026-10-28T08:00:00");
    const slots = suggestSlots([], "a_closer", from, { ...settings, respectBusinessHours: true }, 6);
    expect(slots.length).toBe(6);
    expect(formatSlotMenu(slots, from)).toMatch(/1\)/);
    expect(formatSlotMenu(slots, from)).toMatch(/6\)/);
    const iso = slots.map((s) => s.toISOString());
    expect(pickProposedSlot("pode ser o 3", iso)).toBe(iso[2]);
  });
});
