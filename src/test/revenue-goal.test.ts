import { describe, expect, it } from "vitest";
import { computeRevenuePlan, parseRevenueGoal } from "@/lib/helena/revenue-goal";

describe("Meta de faturamento da Helena", () => {
  it("R$ 15.000 com ticket de R$ 3.000 exige 5 vendas", () => {
    expect(computeRevenuePlan(15000).sales).toBe(5);
  });
  it("5 vendas com 25% de conversão do Closer exigem 20 reuniões", () => {
    expect(computeRevenuePlan(15000).meetings).toBe(20);
  });
  it("20 reuniões com 10% de agendamento dos SDRs exigem 200 leads", () => {
    expect(computeRevenuePlan(15000).leads).toBe(200);
  });
  it("entende o comando 'precisamos faturar R$ 15.000 esta semana'", () => {
    expect(parseRevenueGoal("Helena, precisamos faturar R$ 15.000 esta semana")).toBe(15000);
  });
  it("entende 'bater R$ 15 mil de faturamento até sexta'", () => {
    expect(parseRevenueGoal("Helena, precisamos bater R$ 15 mil de faturamento até sexta-feira")).toBe(15000);
  });
  it("ignora mensagens que não são meta de faturamento", () => {
    expect(parseRevenueGoal("Mostre os leads quentes")).toBeNull();
  });
});
