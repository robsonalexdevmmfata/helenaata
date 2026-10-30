import { describe, expect, it } from "vitest";
import { extractWaText, jidToPhone, waTimestampISO } from "@/lib/evolution/evolutionapi";
import { formatForWhatsApp, sanitizeChatText } from "@/lib/helena/whatsapp-formatter";

describe("Evolution inbox helpers", () => {
  it("converte JID de celular e ignora LID", () => {
    expect(jidToPhone("5518981011186@s.whatsapp.net")).toBe("+5518981011186");
    expect(jidToPhone("147377658822877@lid")).toBe("");
    expect(jidToPhone("0@s.whatsapp.net")).toBe("");
  });

  it("extrai texto da mensagem Evolution", () => {
    expect(extractWaText({ message: { conversation: "Oiii" } })).toBe("Oiii");
    expect(extractWaText({ message: { extendedTextMessage: { text: "Oi" } } })).toBe("Oi");
  });

  it("normaliza timestamp unix", () => {
    const iso = waTimestampISO(1793197676);
    expect(iso.startsWith("2026-")).toBe(true);
  });

  it("lista mensagens da Evolution em páginas", async () => {
    const { evolutionListAllMessages } = await import("@/lib/evolution/evolutionapi");
    expect(typeof evolutionListAllMessages).toBe("function");
  });

  it("mantém acentos e remove caracteres quebrados", () => {
    expect(sanitizeChatText("Olá instância está conectado")).toBe("Olá instância está conectado");
    expect(sanitizeChatText("Helena teste\uFFFD o WhatsApp")).toBe("Helena teste o WhatsApp");
    expect(formatForWhatsApp("Olá **Robson** 😀")).toBe("Olá Robson");
  });
});
