import { describe, expect, it } from "vitest";
import { agentCouncil, companyBriefing, crisisState, isCompanyStatusQuestion, isMissionPlanIntent } from "@/lib/helena/command";
import { calculateMissionStrategy, createMissionFromObjective, tickMissions } from "@/lib/helena/mission-engine";
import { getDB, update } from "@/lib/store";
import { interpret } from "@/lib/helena/orchestrator";
import { runTool } from "@/lib/helena/engine";

describe("helena command / mission control", () => {
  it("reconhece pergunta de status da empresa e plano de missão", () => {
    expect(isCompanyStatusQuestion("Como está minha empresa hoje?")).toBe(true);
    expect(isMissionPlanIntent("Helena, analise minha operação e organize as equipes")).toBe(true);
  });

  it("estratégia não inventa taxa de conversão", () => {
    const s = calculateMissionStrategy("conquistar 20 clientes", 20);
    expect(s.repliesNeeded).toBe(0);
    expect(s.budgetEstimated).toBe(0);
    expect(s.prospectsNeeded).toBeGreaterThan(0);
  });

  it("briefing e conselho usam cadastro, sem garantia", () => {
    const db = getDB();
    const b = companyBriefing(db);
    expect(b.text.toLowerCase()).toMatch(/cadastro/);
    const c = agentCouncil(db, "aumentar faturamento");
    expect(c.seats).toHaveLength(4);
    expect(c.note.toLowerCase()).toMatch(/não é consenso|nao e consenso|garantia/);
    expect(c.seats.some((s) => s.team === "Comercial")).toBe(true);
  });

  it("tick de missão não infla funil com aleatório", () => {
    const { mission } = createMissionFromObjective({ title: "Teste", objective: "prospectar barbearias", targetValue: 5 });
    update((d) => {
      const m = d.missions.find((x) => x.id === mission.id);
      if (m) {
        m.status = "running";
        m.startedAt = new Date().toISOString();
      }
    });
    tickMissions();
    const first = getDB().missions.find((m) => m.id === mission.id)!.funnel.prospects;
    tickMissions();
    const second = getDB().missions.find((m) => m.id === mission.id)!.funnel.prospects;
    expect(second).toBe(first);
  });

  it("missions.plan grava missão via runTool", () => {
    const r = runTool(
      "missions.plan",
      { objective: "conquistar 20 clientes em São Paulo", targetValue: 20 },
      { actor: "Helena", actorType: "helena", requestedBy: "teste" },
    );
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Hipótese|cota diária|objetivo/i);
    expect(getDB().missions.some((m) => m.id === r.data?.missionId)).toBe(true);
  });

  it("Helena responde status da empresa no interpret", () => {
    const replies = interpret("Como está minha empresa hoje?");
    expect(replies[0]?.text.toLowerCase()).toMatch(/cadastro|aconteceu|cota/);
  });

  it("crise só liga com sinais reais", () => {
    const c = crisisState(getDB());
    if (!getDB().killSwitchActive) {
      expect(c.plan.join(" ")).toMatch(/crise|expediente/i);
    }
  });
});
