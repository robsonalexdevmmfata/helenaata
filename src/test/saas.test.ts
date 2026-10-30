import { describe, expect, it } from "vitest";
import { getDB, update } from "@/lib/store";
import { caktoCheckoutUrl, CAKTO_CHECKOUT, dailyLimitFor, isPlatformAdmin, mustSubscribe, registerCustomer, reserveProspects, SAAS_PLANS, trialEndsAtFrom, workspaceDisplayName } from "@/lib/saas";
import { findLocalUser } from "@/lib/auth";
import { isPresenceIntent } from "@/lib/dev/presence";

describe("SaaS trial e planos", () => {
  it("admin da plataforma não entra no paywall", () => {
    const admin = getDB().users.find((u) => u.id === "u1");
    expect(isPlatformAdmin(admin)).toBe(true);
    expect(mustSubscribe(admin)).toBe(false);
  });

  it("conta demo está em trial com 30/dia", () => {
    const demo = getDB().users.find((u) => u.id === "u_demo");
    expect(demo?.username).toBe("demo");
    expect(demo?.planId).toBe("trial");
    expect(dailyLimitFor(demo)).toBe(30);
    expect(mustSubscribe(demo)).toBe(false);
    expect(findLocalUser("demo", "123456")?.id).toBe("u_demo");
  });

  it("trial estourado força assinatura", () => {
    const created = new Date(Date.now() - 3 * 86_400_000).toISOString();
    update((d) => {
      const u = d.users.find((x) => x.id === "u_demo");
      if (u) {
        u.planId = "trial";
        u.createdAt = created;
        u.trialEndsAt = trialEndsAtFrom(new Date(created));
      }
    });
    expect(mustSubscribe(getDB().users.find((u) => u.id === "u_demo"))).toBe(true);
    update((d) => {
      const u = d.users.find((x) => x.id === "u_demo");
      if (u) {
        u.createdAt = new Date().toISOString();
        u.trialEndsAt = trialEndsAtFrom();
      }
    });
  });

  it("limita prospecção diária no trial", () => {
    update((d) => {
      d.currentUserId = "u_demo";
      const u = d.users.find((x) => x.id === "u_demo")!;
      u.planId = "trial";
      u.trialEndsAt = trialEndsAtFrom();
      u.dailyProspectUsed = 0;
      u.dailyProspectDate = "";
      u.status = "ativo";
    });
    const first = reserveProspects(50);
    expect(first.ok).toBe(true);
    expect(first.allowed).toBe(30);
    const second = reserveProspects(1);
    expect(second.ok).toBe(false);
    update((d) => { d.currentUserId = "u1"; });
  });

  it("cadastro cria conta customer", () => {
    const email = `teste${Date.now()}@loja.com`;
    const res = registerCustomer({ name: "Bia", email, password: "1234", company: "Loja Bia" });
    expect(res.ok).toBe(true);
    const u = getDB().users.find((x) => x.email === email);
    expect(u?.kind).toBe("customer");
    expect(u?.planId).toBe("trial");
    expect(u?.createdAt).toBeTruthy();
    expect(new Date(u!.trialEndsAt!).getTime() - new Date(u!.createdAt!).getTime()).toBe(2 * 86_400_000);
    expect(mustSubscribe(u)).toBe(false);
    expect(workspaceDisplayName(u, "Info Tech Ltda")).toBe("Loja Bia");
  });

  it("planos Impulso e Máquina custam 70 e 140", () => {
    expect(SAAS_PLANS[0]?.price).toBe(70);
    expect(SAAS_PLANS[1]?.price).toBe(140);
    expect(SAAS_PLANS[2]?.quote).toBe(true);
  });

  it("monta checkout Cakto pré-preenchido", () => {
    expect(SAAS_PLANS[0]?.checkoutUrl).toBe(CAKTO_CHECKOUT.impulso);
    expect(SAAS_PLANS[1]?.checkoutUrl).toBe(CAKTO_CHECKOUT.maquina);
    const href = caktoCheckoutUrl("impulso", { name: "Ana Souza", email: "ana@estudio.com" });
    expect(href).toContain("kmb4vg8_1261686");
    expect(href).toContain("email=ana%40estudio.com");
    expect(caktoCheckoutUrl("maquina")).toContain("36nkrsw_1261705");
  });

  it("pedido de restaurante continua no time Dev", () => {
    expect(isPresenceIntent("Helena, procure 50 restaurantes que não tenham site nem cardápio online")).toBe(true);
  });
});
