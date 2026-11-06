import { describe, expect, it } from "vitest";
import { matchObjection } from "@/lib/helena/sales-brain";
import { nextInboxReply } from "@/lib/helena/inbox-brain";
import { diagnoseLead } from "@/lib/helena/diagnose";
import { hasWaAudio } from "@/lib/evolution/evolutionapi";

describe("áudio + objeção amiga/site + advocacia", () => {
  it("detecta áudio no payload Evolution", () => {
    expect(hasWaAudio({ message: { audioMessage: { mimetype: "audio/ogg" } } })).toBe(true);
    expect(hasWaAudio({ conversation: "oi" })).toBe(false);
  });

  it("casa objeção quando amiga vai fazer o site (também em áudio)", () => {
    const obj = matchObjection("[Áudio] minha amiga vai fazer o site dela, mas você ofereceu");
    expect(obj?.id).toBe("obj_sobrinho");
    const reply = obj!.getAutonomousResponse({ clientName: "Tânia", companyName: "escritório", niche: "Advogados" });
    expect(reply.toLowerCase()).toMatch(/amiga|google|10 minutos|fórum|forum/);
  });

  it("inbox responde persuasivo para advocacia", () => {
    const text = nextInboxReply(
      "[Áudio] minha amiga ia fazer o site",
      [{ from: "agent", text: "Você é a responsável pelo escritório?" }],
      "Tânia Santucci",
      [],
      "Advogados",
    );
    expect(text).toBeTruthy();
    expect(text!.toLowerCase()).toMatch(/google|10 minutos|amiga|fórum|forum/);
  });

  it("diagnóstico de advocacia recomenda site + WhatsApp do fórum", () => {
    const dx = diagnoseLead({ name: "Tânia Santucci", segment: "Advogados", city: "Campinas", tags: ["#sem-site"] });
    expect(dx.recommend_offer.toLowerCase()).toMatch(/escritório|whatsapp|fórum|forum/);
    expect(dx.recommend_pitch.toLowerCase()).toMatch(/advogado|google/);
  });
});
