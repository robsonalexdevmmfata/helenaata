import { describe, expect, it } from "vitest";
import { coachGuideText, coachSteps, nextCoachStep } from "@/lib/helena/coach";
import { createCustomerSeed } from "@/lib/seed";
import type { User } from "@/lib/types";

const owner: User = {
  id: "u_test",
  organizationId: "org_test",
  name: "Manu Teste",
  email: "manu@test.com",
  role: "owner",
  title: "Owner",
  kind: "customer",
  status: "ativo",
  planId: "trial",
  createdAt: new Date().toISOString(),
};

describe("Helena coach", () => {
  it("ensina o próximo passo em conta nova", () => {
    const db = createCustomerSeed(owner);
    const next = nextCoachStep(db);
    expect(next?.id).toBe("whatsapp");
    const guide = coachGuideText(db);
    expect(guide.text).toMatch(/ensino|administro|follow-up/i);
    expect(guide.next?.sayToHelena).toMatch(/WhatsApp/i);
    expect(coachSteps(db).length).toBeGreaterThanOrEqual(6);
  });

  it("responde tópico de follow-up", () => {
    const db = createCustomerSeed(owner);
    const guide = coachGuideText(db, "como funciona o follow-up");
    expect(guide.text).toMatch(/follow-up/i);
    expect(guide.steps[0]?.id).toBe("followup");
  });
});
