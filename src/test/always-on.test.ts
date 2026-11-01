import { describe, expect, it } from "vitest";
import { alwaysOnTruth, verifySendOutcome, watchdogScan } from "@/lib/helena/always-on";
import { getDB } from "@/lib/store";

describe("helena always-on", () => {
  it("não vende tick de navegador como operação 24h", () => {
    const t = alwaysOnTruth();
    expect(t.note.toLowerCase()).toMatch(/render|postgres/);
    expect(t.needsPanel.length).toBeGreaterThan(0);
  });

  it("verifySendOutcome exige execução real", () => {
    const v = verifySendOutcome(getDB(), "lead-inexistente-xyz");
    expect(v.verified).toBe(false);
  });

  it("watchdog lê o cadastro", () => {
    const a = watchdogScan(getDB());
    expect(Array.isArray(a)).toBe(true);
  });
});
