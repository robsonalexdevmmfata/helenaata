import { describe, expect, it } from "vitest";
import { decideApproval, runTool } from "@/lib/helena/engine";
import { getDB, nowISO, uid, update } from "@/lib/store";
import type { Conversation } from "@/lib/types";

function createUnansweredProspect() {
  const contactId = uid("p_menu_");
  const conversationId = uid("conv_menu_");
  const lastOutboundAt = new Date(Date.now() - 25 * 3_600_000).toISOString();
  update((db) => {
    db.currentUserId = "u1";
    const closer = db.agents.find((agent) => agent.id === db.salesFlow.closerAgentId);
    if (closer) closer.status = "trabalhando";
    db.contacts.unshift({
      id: contactId,
      organizationId: db.organization.id,
      name: "Ana Souza",
      email: "",
      phone: "+55 11 99999-0011",
      title: "",
      tags: ["#sem-cardapio", "#sem-site"],
      source: "Prospecção",
      ownerId: "u1",
      status: "lead",
      score: 80,
      consent: true,
      createdAt: lastOutboundAt,
      lastContactAt: lastOutboundAt,
    });
    const conversation: Conversation = {
      id: conversationId,
      organizationId: db.organization.id,
      contactId,
      channel: "whatsapp",
      connectionId: db.salesFlow.sharedConnectionId,
      status: "aberta",
      handlerType: "agent",
      handlerId: "a_sdr1",
      unread: 0,
      sentiment: "neutro",
      lastMessageAt: lastOutboundAt,
      messages: [{
        id: uid("msg_menu_"),
        from: "agent",
        authorName: "SDR",
        text: "Segue a proposta.",
        at: lastOutboundAt,
        kind: "text",
      }],
      flow: {
        origin: "prospeccao",
        state: "abordado",
        lastOutboundAt,
        closerAttempts: 0,
      },
    };
    db.conversations.unshift(conversation);
  });
  return { contactId, conversationId };
}

describe("follow-up de cardápio com aprovação", () => {
  it("prepara a mensagem após 24h sem enviar antes da aprovação", () => {
    const { contactId, conversationId } = createUnansweredProspect();
    expect(getDB().contacts.find((contact) => contact.id === contactId)?.companyId).toBeUndefined();
    const before = getDB().conversations.find((conversation) => conversation.id === conversationId)!.messages.length;
    const result = runTool(
      "sales.closer_takeover",
      { conversationId, reason: "sem_resposta" },
      { actor: "Closer", actorType: "agent", requestedBy: "Automação do número comercial" },
    );

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/aguardando aprovação/i);
    const approval = getDB().approvals.find((entry) =>
      entry.tool === "sales.send_menu_followup" &&
      entry.status === "pendente" &&
      entry.params.conversationId === conversationId,
    );
    expect(approval?.details.map((detail) => detail.value).join(" ")).toContain("R$ 100,00/mês");
    const conversation = getDB().conversations.find((entry) => entry.id === conversationId)!;
    expect(conversation.flow?.state).toBe("aguardando_aprovacao");
    expect(conversation.messages).toHaveLength(before);
  });

  it("não envia se o contato responder enquanto a aprovação está pendente", () => {
    const { conversationId } = createUnansweredProspect();
    runTool(
      "sales.closer_takeover",
      { conversationId, reason: "sem_resposta" },
      { actor: "Closer", actorType: "agent", requestedBy: "Automação do número comercial" },
    );
    const approval = getDB().approvals.find((entry) =>
      entry.tool === "sales.send_menu_followup" &&
      entry.status === "pendente" &&
      entry.params.conversationId === conversationId,
    );
    expect(approval).toBeTruthy();

    update((db) => {
      const conversation = db.conversations.find((entry) => entry.id === conversationId)!;
      conversation.messages.push({
        id: uid("msg_reply_"),
        from: "contact",
        authorName: "Ana Souza",
        text: "Obrigado, vou avaliar.",
        at: nowISO(),
        kind: "text",
      });
      conversation.flow!.repliedAt = nowISO();
      conversation.flow!.state = "respondeu";
    });

    const result = decideApproval(approval!.id, true);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/respondeu/i);
    expect(getDB().conversations.find((entry) => entry.id === conversationId)!.messages).toHaveLength(2);
  });
});
