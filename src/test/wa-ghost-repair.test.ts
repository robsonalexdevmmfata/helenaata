import { describe, expect, it } from "vitest";
import { getDB, update } from "@/lib/store";
import { repairGhostWhatsAppDrafts } from "@/lib/evolution/prospectDispatcher";
import { unansweredAgentStreak, wasDeliveredOutbound } from "@/lib/helena/sales-flow";

describe("fantasmas Inbox × WhatsApp Web", () => {
  it("rascunho sem Evolution não conta como enviado", () => {
    expect(wasDeliveredOutbound({ from: "agent", deliveryStatus: "failed" })).toBe(false);
    expect(wasDeliveredOutbound({ from: "agent", deliveryStatus: "queued" })).toBe(false);
    expect(wasDeliveredOutbound({ from: "agent", deliveryStatus: "sent" })).toBe(true);
  });

  it("repair marca rascunho sem execution como failed e libera reenvio", () => {
    update((d) => {
      d.conversations.unshift({
        id: "cv_ghost",
        organizationId: d.organization.id,
        contactId: d.contacts[0]?.id || "p1",
        channel: "whatsapp",
        status: "aberta",
        handlerType: "agent",
        handlerId: "a_sdr1",
        unread: 0,
        sentiment: "neutro",
        lastMessageAt: new Date().toISOString(),
        messages: [
          {
            id: "m_ghost",
            from: "agent",
            authorName: "Marina",
            text: "Olá! Sou o Robson Alex…",
            at: new Date().toISOString(),
            kind: "text",
          },
        ],
        flow: { origin: "prospeccao", state: "abordado", lastOutboundAt: new Date().toISOString(), closerAttempts: 0 },
      });
    });
    repairGhostWhatsAppDrafts();
    const conv = getDB().conversations.find((c) => c.id === "cv_ghost");
    expect(conv?.messages[0]?.deliveryStatus).toBe("failed");
    expect(unansweredAgentStreak(conv!)).toBe(0);
  });
});
