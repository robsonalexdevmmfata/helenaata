import { describe, expect, it } from "vitest";
import { getGroqApiKey } from "@/lib/helena/groq";
import { getEvolutionConfig } from "@/lib/evolution/evolutionapi";
import { hashPw, redactValue, sanitizeDb, sanitizeUser } from "@/lib/security/secrets";
import { getDB } from "@/lib/store";
import { registerCustomer } from "@/lib/saas";
import { login } from "@/lib/auth";

describe("blindagem", () => {
  it("não expõe chave Groq no navegador", () => {
    expect(getGroqApiKey()).toBe("");
  });

  it("não coloca API key da Evolution no cliente", () => {
    expect(getEvolutionConfig().apiKey).toBe("");
  });

  it("snapshot sanitizado não guarda senha em claro", () => {
    const u = sanitizeUser({
      id: "u_x",
      organizationId: "o",
      name: "X",
      email: "x@x.com",
      username: "x",
      password: "segredo123",
      role: "owner",
      title: "t",
      color: "chart-1",
      status: "ativo",
      workHours: "",
      goal: 0,
      achieved: 0,
      lastSeen: new Date().toISOString(),
    });
    expect(u.password).toBeUndefined();
    expect(u.passwordHash).toBe(hashPw("segredo123", "u_x"));
    const db = sanitizeDb(getDB());
    expect(db.users.every((x) => !x.password)).toBe(true);
  });

  it("redige token em objeto de log", () => {
    const out = redactValue({ authorization: "Bearer abcdefghijklmnop", phone: "ok" }) as Record<
      string,
      string
    >;
    expect(out.authorization).toBe("[redacted]");
    expect(out.phone).toBe("ok");
  });

  it("cadastro autentica pelo hash, não pela senha persistida", () => {
    const email = `sec${Date.now()}@t.com`;
    const res = registerCustomer({ name: "Sec", email, password: "abc123", company: "Loja" });
    expect(res.ok).toBe(true);
    const stored = getDB().users.find((u) => u.id === res.userId);
    expect(stored?.password).toBeUndefined();
    expect(login(email, "abc123")).toBe(true);
  });
});
