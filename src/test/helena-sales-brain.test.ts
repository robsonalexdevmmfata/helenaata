import { describe, expect, it } from "vitest";
import { runTool } from "@/lib/helena/engine";
import { getDB, resetDB } from "@/lib/store";
import {
  checkDuplicateContact,
  deduplicateProspectList,
  isLeadHandledByAnotherSdr,
  OBJECTION_MATRIX,
  matchObjection,
  evaluateBant,
  computeDynamicCadence,
  FINANCIAL_GOAL,
} from "@/lib/helena/sales-brain";

describe("Helena Sales Brain & Autonomous SDR Engine", () => {
  it("Trava 1: Impede duplicidade de telefone no CRM", () => {
    const db = getDB();
    const existingContact = db.contacts[0];

    // Checa duplicação com o telefone existente
    const check = checkDuplicateContact(existingContact.phone, db);
    expect(check.isDuplicate).toBe(true);
    expect(check.reason).toBeDefined();

    // Checa com número novo que não existe
    const freshCheck = checkDuplicateContact("+55 11 99999-0000", db);
    expect(freshCheck.isDuplicate).toBe(false);
  });

  it("Trava 2: Deduplica listas de prospecção antes de cadastrar", () => {
    const db = getDB();
    const existingContact = db.contacts[0];

    const rawList = [
      { name: "Empresa Nova 1", phone: "+55 11 99999-1111" },
      { name: "Empresa Nova 1 Repetida", phone: "+55 11 99999-1111" }, // Telefone repetido no lote
      { name: "Empresa Já Existente", phone: existingContact.phone }, // Telefone já no banco
      { name: "Empresa Nova 2", phone: "+55 11 99999-2222" },
    ];

    const deduplicated = deduplicateProspectList(rawList, db);
    expect(deduplicated.unique.length).toBe(2);
    expect(deduplicated.duplicatesSkipped).toBe(2);
  });

  it("Trava 3: Trava de Handoff entre SDRs impede colisão de atendimento", () => {
    const db = getDB();
    const contact = db.contacts.find((c) => c.ownerId === "a_sdr1") || db.contacts[0];

    // Se o SDR 02 tentar abordar o lead do SDR 01
    const lockCheck = isLeadHandledByAnotherSdr(contact.id, "a_sdr2", db);
    if (contact.ownerId && contact.ownerId !== "a_sdr2") {
      expect(lockCheck.blocked).toBe(true);
      expect(lockCheck.reason).toContain("Trava 3");
    }
  });

  it("Pilar 1: Matriz de Objeções contorna 'Já tenho Instagram' e envia demonstração", () => {
    const db = getDB();
    const contact = db.contacts[0];

    const matched = matchObjection("já tenho instagram, não preciso de site");
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe("obj_instagram");

    const res = runTool(
      "sales.handle_objection",
      { contactId: contact.id, objectionId: "obj_instagram" },
      { actor: "Helena", actorType: "helena", requestedBy: "admin" }
    );

    expect(res.ok).toBe(true);
    const dbAfter = getDB();
    const conv = dbAfter.conversations.find((c) => c.contactId === contact.id);
    expect(conv?.messages.some((m) => m.text.includes("80% dos clientes"))).toBe(true);
  });

  it("Pilar 2: BANT e Fechamento com Pix gera cobrança instantânea", () => {
    const db = getDB();
    const contact = db.contacts[0];

    const resPix = runTool(
      "sales.generate_checkout_pix",
      { contactId: contact.id, amount: 4900 },
      { actor: "Helena Closer", actorType: "helena", requestedBy: "admin" }
    );

    expect(resPix.ok).toBe(true);
    const dbAfter = getDB();
    const conv = dbAfter.conversations.find((c) => c.contactId === contact.id);
    expect(conv?.messages.some((m) => m.text.includes("Chave Pix Copia e Cola"))).toBe(true);
  });

  it("Pilar 3: Monitora Meta de R$ 15.000,00 e calcula cadência dinâmica", () => {
    const db = getDB();
    const cadence = computeDynamicCadence(db);

    expect(cadence.goal).toBe(FINANCIAL_GOAL);
    expect(cadence.goal).toBe(15000);
    expect(cadence.dailyTargetCadence).toBeGreaterThanOrEqual(30);

    const resRescue = runTool(
      "sales.rescue_cold_leads",
      {},
      { actor: "Helena", actorType: "helena", requestedBy: "admin" }
    );
    expect(resRescue.ok).toBe(true);
  });
});
