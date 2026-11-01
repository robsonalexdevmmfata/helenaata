import { describe, expect, it } from "vitest";
import { getDB, listAccounts, update } from "@/lib/store";
import { canUseDevTeam, caktoCheckoutUrl, CAKTO_CHECKOUT, dailyLimitFor, isPlatformAdmin, mustSubscribe, registerCustomer, reserveProspects, SAAS_PLANS, trialEndsAtFrom, workspaceDisplayName } from "@/lib/saas";
import { instanceNameForUser } from "@/lib/evolution/provision";
import { isCaktoPaidEvent, mapCaktoPlan, parseCaktoPayload } from "@/lib/billing/cakto";
import { applyDevTeamGate, planAllowsDevTeam } from "@/lib/seed";
import { findLocalUser } from "@/lib/auth";
import { isPresenceIntent } from "@/lib/dev/presence";
import { runTool } from "@/lib/helena/engine";

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
    expect(u?.organizationId).not.toBe("org_novarota");
    expect(u?.evolutionInstance).toBe(instanceNameForUser(u!.id));
    expect(res.evolutionInstance).toBe(u?.evolutionInstance);
  });

  it("mapeia webhook Cakto para plano pago", () => {
    expect(mapCaktoPlan({ product: { id: "kmb4vg8_1261686" } })).toBe("impulso");
    expect(mapCaktoPlan({ offer: { id: "36nkrsw_1261705" } })).toBe("maquina");
    expect(isCaktoPaidEvent("purchase_approved", "paid")).toBe(true);
    expect(isCaktoPaidEvent("purchase_refused", "refused")).toBe(false);
    const ev = parseCaktoPayload({
      event: "purchase_approved",
      data: { customer: { email: "bia@loja.com", name: "Bia" }, product: { id: "kmb4vg8_1261686" } },
    });
    expect(ev.email).toBe("bia@loja.com");
    expect(ev.planId).toBe("impulso");
  });

  it("cliente novo não herda CRM mock da Info Tech", () => {
    const email = `vazio${Date.now()}@loja.com`;
    const res = registerCustomer({ name: "Carla", email, password: "1234", company: "Barbearia Carla" });
    expect(res.ok).toBe(true);
    const key = `helena-ws-${listAccounts().find((x) => x.email === email)?.organizationId}`;
    const raw = window.localStorage.getItem(key);
    expect(raw).toBeTruthy();
    const ws = JSON.parse(raw!) as { contacts: unknown[]; deals: unknown[]; conversations: unknown[]; campaigns: unknown[]; organization: { name: string } };
    expect(ws.organization.name).toBe("Barbearia Carla");
    expect(ws.contacts).toEqual([]);
    expect(ws.deals).toEqual([]);
    expect(ws.conversations).toEqual([]);
    expect(ws.campaigns).toEqual([]);
  });

  it("Time Dev libera no admin e no plano Máquina", () => {
    expect(planAllowsDevTeam("trial", "customer")).toBe(false);
    expect(planAllowsDevTeam("impulso", "customer")).toBe(false);
    expect(planAllowsDevTeam("maquina", "customer")).toBe(true);
    expect(canUseDevTeam(getDB().users.find((u) => u.id === "u1"))).toBe(true);
    expect(canUseDevTeam(getDB().users.find((u) => u.id === "u_demo"))).toBe(false);
    const email = `devgate${Date.now()}@loja.com`;
    const res = registerCustomer({ name: "Leo", email, password: "1234", company: "Oficina Leo" });
    expect(res.ok).toBe(true);
    const key = `helena-ws-${listAccounts().find((x) => x.email === email)?.organizationId}`;
    const ws = JSON.parse(window.localStorage.getItem(key)!) as { teams: { id: string; status: string }[]; agents: { teamId?: string; status: string }[] };
    expect(ws.teams.find((t) => t.id === "t_dev")?.status).toBe("pausado");
    expect(ws.agents.filter((a) => a.teamId === "t_dev").every((a) => a.status === "pausado")).toBe(true);
    const db = getDB();
    applyDevTeamGate(db, "maquina", "customer");
    expect(db.teams.find((t) => t.id === "t_dev")?.status).toBe("ativo");
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

  it("trial não dispara o Time Dev; Máquina dispara", () => {
    update((d) => { d.currentUserId = "u_demo"; });
    const blocked = runTool(
      "dev.build_presence",
      { segment: "Restaurantes", city: "Campinas, SP", limit: 1 },
      { actor: "Helena", actorType: "helena", requestedBy: "demo" },
    );
    expect(blocked.ok).toBe(false);
    update((d) => {
      const u = d.users.find((x) => x.id === "u_demo");
      if (u) u.planId = "maquina";
    });
    expect(canUseDevTeam(getDB().users.find((u) => u.id === "u_demo"))).toBe(true);
    const allowed = runTool(
      "dev.build_presence",
      { segment: "Restaurantes", city: "Campinas, SP", limit: 1 },
      { actor: "Helena", actorType: "helena", requestedBy: "demo" },
    );
    expect(allowed.ok).toBe(true);
    update((d) => {
      const u = d.users.find((x) => x.id === "u_demo");
      if (u) u.planId = "trial";
      d.currentUserId = "u1";
    });
  });
});
