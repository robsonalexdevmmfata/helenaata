import { describe, expect, it } from "vitest";
import { runTool } from "@/lib/helena/engine";
import { getDB } from "@/lib/store";

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
      c.messages.some((m) => m.text.includes("não possuem um site institucional"))
    );
    expect(semSiteConversations.length).toBeGreaterThanOrEqual(3);
  });

  it("agenda reunião no Google Calendar / Cal.com e move lead para Reunião Agendada", () => {
    const db = getDB();
    const contact = db.contacts[0];
    const deal = db.deals.find((d) => d.contactId === contact.id) || db.deals[0];

    const res = runTool(
      "calendar.create_event",
      { contactId: contact.id, dealId: deal.id, title: "Apresentação de Site" },
      { actor: "Closer", actorType: "agent", requestedBy: "Helena" }
    );

    expect(res.ok).toBe(true);
    expect(res.data?.calLink).toBeDefined();

    const dbAfter = getDB();
    const updatedDeal = dbAfter.deals.find((d) => d.id === deal.id);
    expect(updatedDeal?.stageId).toBe("st_reun");
  });
});
