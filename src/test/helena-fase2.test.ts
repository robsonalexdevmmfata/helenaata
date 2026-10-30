import { describe, expect, it } from "vitest";
import { runTool } from "@/lib/helena/engine";
import { getDB } from "@/lib/store";
import { extractMeetingFromText } from "@/lib/helena/calendar";

describe("Helena FASE 2: Scraper Google Maps e Calendar", () => {
  it("executa varredura do Google Maps e cria empresas com tag #sem-site", () => {
    const dbBefore = getDB();
    const companiesBefore = dbBefore.companies.length;
    const contactsBefore = dbBefore.contacts.length;

    const res = runTool(
      "prospect.scan_maps",
      { segment: "Clínicas odontológicas", city: "São Paulo, SP", limit: 3 },
      { actor: "Helena", actorType: "helena", requestedBy: "admin" }
    );

    expect(res.ok).toBe(true);

    const dbAfter = getDB();
    expect(dbAfter.companies.length).toBe(companiesBefore + 3);
    expect(dbAfter.contacts.length).toBe(contactsBefore + 3);

    // Verifica se os novos contatos possuem a tag #sem-site
    const semSiteContacts = dbAfter.contacts.filter((c) => c.tags.includes("#sem-site"));
    expect(semSiteContacts.length).toBeGreaterThanOrEqual(3);

    // Verifica se a mensagem de abordagem do SDR foi disparada no WhatsApp
    const semSiteConversations = dbAfter.conversations.filter((c) =>
      c.messages.some((m) => m.text.includes("Robson Alex") && /proprietári/i.test(m.text))
    );
    expect(semSiteConversations.length).toBeGreaterThanOrEqual(3);
  });

  it("agenda reunião no Google Calendar / Cal.com e move lead para Reunião Agendada", () => {
    const db = getDB();
    const contact = db.contacts.find((c) => c.tags.includes("#sem-site")) || db.contacts[0];
    const deal = db.deals.find((d) => d.contactId === contact.id) || db.deals[0];
    expect(contact).toBeDefined();
    expect(deal).toBeDefined();

    const res = runTool(
      "calendar.create_event",
      { contactId: contact!.id, dealId: deal!.id, title: "Apresentação de Site" },
      { actor: "Closer", actorType: "agent", requestedBy: "Helena" }
    );

    expect(res.ok).toBe(true);
    expect(res.data?.calLink).toBeDefined();

    const dbAfter = getDB();
    const updatedDeal = dbAfter.deals.find((d) => d.id === deal.id);
    expect(updatedDeal?.stageId).toBe("st_reun");
  });

  it("grava agendarReuniao na Agenda compartilhada", () => {
    const contact = getDB().contacts[1] ?? getDB().contacts[0];
    const when = new Date(Date.now() + 36 * 3600_000).toISOString();
    const res = runTool(
      "calendar.agendar_reuniao",
      { leadId: contact.id, dataHora: when, resumo: "Reunião 10 min fechada no WhatsApp" },
      { actor: "SDR 01", actorType: "agent", requestedBy: "Helena" },
    );
    expect(res.ok).toBe(true);
    const ev = getDB().calendarEvents.find((e) => e.id === res.data?.id);
    expect(ev?.leadId).toBe(contact.id);
    expect(ev?.status).toBe("agendada");
    expect(ev?.resumo).toContain("10 min");
  });
});

describe("extractMeetingFromText", () => {
  it("interpreta amanhã às 10h", () => {
    const now = new Date("2026-10-27T12:00:00");
    const parsed = extractMeetingFromText("Pode ser amanhã às 10h", now);
    expect(parsed).not.toBeNull();
    expect(new Date(parsed!.dataHora).getHours()).toBe(10);
    expect(new Date(parsed!.dataHora).getDate()).toBe(28);
  });
});
