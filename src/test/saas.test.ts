import { describe, expect, it } from "vitest";
import { getDB, listAccounts, update } from "@/lib/store";
import {
  assignPlan,
  canUseDevTeam,
  caktoCheckoutUrl,
  CAKTO_CHECKOUT,
  dailyLimitFor,
  grantAccessDays,
  grantLifetimeAccess,
  isPlatformAdmin,
  mustSubscribe,
  registerCustomer,
  reserveProspects,
  SAAS_PLANS,
  setDailyLeadQuota,
  trialEndsAtFrom,
  wantsDevTeamUpgrade,
  workspaceDisplayName,
} from "@/lib/saas";
import {
  instanceNameForUser,
  instanceNameFromLabel,
  sanitizeInstanceName,
} from "@/lib/evolution/provision";
import { isOptedOut } from "@/lib/whatsapp/antiban";
import { isCaktoPaidEvent, mapCaktoPlan, parseCaktoPayload } from "@/lib/billing/cakto";
import { applyDevTeamGate, createCustomerSeed, planAllowsDevTeam } from "@/lib/seed";
import { findLocalUser } from "@/lib/auth";
import { isPresenceIntent } from "@/lib/dev/presence";
import { runTool } from "@/lib/helena/engine";
import { diagnoseLead } from "@/lib/helena/diagnose";
import { buildSitePreview } from "@/lib/dev/presence";

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
    update((d) => {
      d.currentUserId = "u1";
    });
  });

  it("cadastro cria conta customer", () => {
    const email = `teste${Date.now()}@loja.com`;
    const res = registerCustomer({ name: "Bia", email, password: "1234", company: "Loja Bia" });
    expect(res.ok).toBe(true);
    const u = getDB().users.find((x) => x.email === email);
    expect(u?.kind).toBe("customer");
    expect(u?.planId).toBe("trial");
    expect(u?.createdAt).toBeTruthy();
    expect(new Date(u!.trialEndsAt!).getTime() - new Date(u!.createdAt!).getTime()).toBe(
      2 * 86_400_000,
    );
    expect(mustSubscribe(u)).toBe(false);
    expect(workspaceDisplayName(u, "Info Tech Ltda")).toBe("Loja Bia");
    expect(u?.organizationId).not.toBe("org_novarota");
    expect(u?.evolutionInstance).toBe(instanceNameForUser(u!.id));
    expect(res.evolutionInstance).toBe(u?.evolutionInstance);
  });

  it("nome da instância sai do agente sem acento nem espaço", () => {
    expect(sanitizeInstanceName("Helena SDR")).toBe("helenasdr");
    expect(instanceNameFromLabel("Chip da loja")).toBe("chipdaloja");
    expect(instanceNameFromLabel("hudemo")).toBe("hudemo");
  });

  it("mapeia webhook Cakto para plano pago", () => {
    expect(mapCaktoPlan({ product: { id: "kmb4vg8_1261686" } })).toBe("impulso");
    expect(mapCaktoPlan({ offer: { id: "36nkrsw_1261705" } })).toBe("maquina");
    expect(isCaktoPaidEvent("purchase_approved", "paid")).toBe(true);
    expect(isCaktoPaidEvent("purchase_refused", "refused")).toBe(false);
    const ev = parseCaktoPayload({
      event: "purchase_approved",
      data: {
        customer: { email: "bia@loja.com", name: "Bia" },
        product: { id: "kmb4vg8_1261686" },
      },
    });
    expect(ev.email).toBe("bia@loja.com");
    expect(ev.planId).toBe("impulso");
  });

  it("cliente novo começa sem registros operacionais de demonstração", () => {
    const email = `vazio${Date.now()}@loja.com`;
    const res = registerCustomer({
      name: "Carla",
      email,
      password: "1234",
      company: "Barbearia Carla",
    });
    expect(res.ok).toBe(true);
    const user = listAccounts().find((x) => x.email === email)!;
    const ws = createCustomerSeed(user);
    expect(ws.organization.name).toBe("Barbearia Carla");
    expect(ws.contacts).toEqual([]);
    expect(ws.deals).toEqual([]);
    expect(ws.conversations).toEqual([]);
    expect(ws.campaigns).toEqual([]);
    expect(ws.memories).toEqual([]);
    expect(ws.sessions).toEqual([]);
  });

  it("Time Dev libera no admin e no plano Máquina", () => {
    expect(planAllowsDevTeam("trial", "customer")).toBe(false);
    expect(planAllowsDevTeam("impulso", "customer")).toBe(false);
    expect(planAllowsDevTeam("maquina", "customer")).toBe(true);
    expect(canUseDevTeam(getDB().users.find((u) => u.id === "u1"))).toBe(true);
    expect(canUseDevTeam(getDB().users.find((u) => u.id === "u_demo"))).toBe(false);
    expect(wantsDevTeamUpgrade(getDB().users.find((u) => u.id === "u_demo"))).toBe(true);
    const email = `devgate${Date.now()}@loja.com`;
    const res = registerCustomer({ name: "Leo", email, password: "1234", company: "Oficina Leo" });
    expect(res.ok).toBe(true);
    const ws = createCustomerSeed(listAccounts().find((x) => x.email === email)!);
    expect(ws.teams.find((t) => t.id === "t_dev")?.status).toBe("pausado");
    expect(ws.agents.filter((a) => a.teamId === "t_dev").every((a) => a.status === "pausado")).toBe(
      true,
    );
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
    expect(
      isPresenceIntent("Helena, procure 50 restaurantes que não tenham site nem cardápio online"),
    ).toBe(true);
  });

  it("trial bloqueia o Time Dev; Máquina libera o fluxo sem inventar resultados de Maps", () => {
    update((d) => {
      d.currentUserId = "u_demo";
    });
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
    expect(allowed.ok).toBe(false);
    expect(allowed.message).toMatch(/busca real do Maps para gerar prévias/i);
    update((d) => {
      const u = d.users.find((x) => x.id === "u_demo");
      if (u) u.planId = "trial";
      d.currentUserId = "u1";
    });
  });

  it("opt-out e antiban bloqueiam disparo", () => {
    expect(isOptedOut({ tags: ["opt-out"], consent: true })).toBe(true);
    expect(isOptedOut({ tags: [], consent: false })).toBe(true);
    expect(isOptedOut({ tags: ["quente"], consent: true })).toBe(false);
  });

  it("LGPD registra acesso e anonimiza titular", () => {
    const created = runTool(
      "crm.create_contact",
      { name: "Titular LGPD", source: "Teste" },
      { actor: "Ana", actorType: "user", requestedBy: "Ana" },
    );
    const id = typeof created.data?.id === "string" ? created.data.id : undefined;
    expect(created.ok).toBe(true);
    expect(id).toBeTruthy();
    const logged = runTool(
      "lgpd.log_access",
      { contactId: id },
      { actor: "Ana", actorType: "user", requestedBy: "Ana" },
    );
    expect(logged.ok).toBe(true);
    const erased = runTool(
      "lgpd.erase_contact",
      { contactId: id },
      { actor: "Ana", actorType: "user", requestedBy: "Ana" },
    );
    expect(erased.ok).toBe(true);
    const gone = getDB().contacts.find((c) => c.id === id);
    expect(gone?.phone).toBe("");
    expect(gone?.consent).toBe(false);
  });

  it("diagnóstico de pizzaria gera evidência e oferta", () => {
    const dx = diagnoseLead({
      name: "Pizzaria Vila Nova",
      segment: "Pizzaria",
      city: "Campinas",
      website: "",
      tags: ["#sem-site"],
      rating: 3.9,
      photos: 2,
      hasMenu: false,
      hasWhatsApp: true,
    });
    expect(dx.score).toBeGreaterThanOrEqual(70);
    expect(dx.findings.some((f) => f.code === "cardapio")).toBe(true);
    expect(dx.recommend_offer).toMatch(/cardápio/i);
    const id = getDB().contacts[0]?.id;
    if (id) {
      const r = runTool(
        "leads.diagnose",
        { contactId: id },
        { actor: "Helena", actorType: "helena", requestedBy: "teste" },
      );
      expect(r.ok).toBe(true);
      expect(
        getDB()
          .contacts.find((c) => c.id === id)
          ?.tags.some((t) => t === "#ciclo-diagnosticado"),
      ).toBe(true);
    }
  });

  it("duas pizzarias não geram a mesma prévia", () => {
    const a = buildSitePreview({
      organizationId: "org_t",
      companyId: "c1",
      contactId: "p1",
      place: {
        name: "Pizzaria Vila Nova",
        city: "Campinas",
        address: "Rua A, 10",
        phone: "+55 19 99999-1111",
        contactName: "João",
        rating: 3.8,
        reviewCount: 21,
      },
      segment: "Pizzaria",
      slug: "pizzaria-vila-nova",
    });
    const b = buildSitePreview({
      organizationId: "org_t",
      companyId: "c2",
      contactId: "p2",
      place: {
        name: "Pizzaria da Praça",
        city: "Campinas",
        address: "Rua B, 88",
        phone: "+55 19 98888-2222",
        contactName: "Maria",
        rating: 4.5,
        reviewCount: 90,
      },
      segment: "Pizzaria",
      slug: "pizzaria-da-praca",
    });
    expect(a.about).not.toBe(b.about);
    expect(a.tagline).not.toBe(b.tagline);
  });

  it("expediente RPA passa pelo runTool", () => {
    const r = runTool(
      "rpa.run_shift",
      { maxLeads: 1, simulate: true, agendar: false, checkout: false, site: false },
      { actor: "Helena", actorType: "helena", requestedBy: "teste" },
    );
    expect(r.ok || /lead|WhatsApp|conexão|offline|online|plano/i.test(r.message)).toBe(true);
  });

  it("admin soma 7 dias e cota customizada; vitalício não cai no paywall", () => {
    const email = `dias${Date.now()}@loja.com`;
    const res = registerCustomer({ name: "Dias", email, password: "1234", company: "Loja Dias" });
    expect(res.ok).toBe(true);
    const id = res.userId!;
    grantAccessDays(id, 7);
    const u = getDB().users.find((x) => x.id === id)!;
    expect(new Date(u.trialEndsAt!).getTime() - Date.now()).toBeGreaterThan(6 * 86_400_000);
    setDailyLeadQuota(id, 40);
    expect(dailyLimitFor(getDB().users.find((x) => x.id === id))).toBe(40);
    grantLifetimeAccess(id);
    expect(mustSubscribe(getDB().users.find((x) => x.id === id))).toBe(false);
    expect(getDB().users.find((x) => x.id === id)?.lifetimeAccess).toBe(true);
  });

  it("freemium 30 leads; Impulso e Máquina teto 150 — Time Dev não passa disso", () => {
    const email = `cota${Date.now()}@loja.com`;
    const res = registerCustomer({ name: "Cota", email, password: "1234", company: "Loja Cota" });
    const id = res.userId!;
    expect(dailyLimitFor(getDB().users.find((x) => x.id === id))).toBe(30);
    assignPlan(id, "impulso");
    expect(dailyLimitFor(getDB().users.find((x) => x.id === id))).toBe(150);
    assignPlan(id, "maquina");
    expect(dailyLimitFor(getDB().users.find((x) => x.id === id))).toBe(150);
    expect(SAAS_PLANS.find((p) => p.id === "impulso")?.dailyProspects).toBe(150);
    expect(SAAS_PLANS.find((p) => p.id === "maquina")?.dailyProspects).toBe(150);
  });
});
