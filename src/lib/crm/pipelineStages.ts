import type { Deal, Pipeline, Stage } from "@/lib/types";

/** Etapa Qualificado (#sem-site / sem cardápio = lead já qualificado). */
export function qualifiedStage(pipeline?: Pipeline | null): Stage | undefined {
  if (!pipeline?.stages?.length) return undefined;
  return (
    pipeline.stages.find((s) => s.id === "st_qual")
    || pipeline.stages.find((s) => /qualific/i.test(s.name))
    || pipeline.stages[1]
  );
}

export function meetingStage(pipeline?: Pipeline | null): Stage | undefined {
  if (!pipeline?.stages?.length) return undefined;
  return (
    pipeline.stages.find((s) => s.id === "st_reun")
    || pipeline.stages.find((s) => /reuni/i.test(s.name))
  );
}

export function proposalStage(pipeline?: Pipeline | null): Stage | undefined {
  if (!pipeline?.stages?.length) return undefined;
  return (
    pipeline.stages.find((s) => s.id === "st_prop")
    || pipeline.stages.find((s) => /proposta/i.test(s.name))
  );
}

/** Sem site / sem cardápio → Qualificado. Caso contrário, Novo lead. */
export function stageForNewProspect(pipeline: Pipeline | undefined, tags: string[]): Stage | undefined {
  const novo = pipeline?.stages?.[0];
  const noSite = tags.some((t) => /#sem-site|#sem-cardapio|#dx-cardapio|#dx-sem_site/i.test(t));
  if (noSite) return qualifiedStage(pipeline) || novo;
  return novo;
}

/** Ordem comercial: Novo → Qualificado → Proposta → Reunião → Negociação → Ganho. */
export const COMMERCIAL_STAGE_ORDER = [
  { id: "st_novo", name: "Novo lead", probability: 10, color: "chart-3" },
  { id: "st_qual", name: "Qualificado", probability: 30, color: "chart-2" },
  { id: "st_prop", name: "Proposta enviada", probability: 50, color: "chart-5" },
  { id: "st_reun", name: "Reunião agendada", probability: 70, color: "chart-4" },
  { id: "st_neg", name: "Negociação", probability: 85, color: "chart-1" },
  { id: "st_ganho", name: "Ganho", probability: 100, color: "chart-2" },
] as const;

/** Corrige pipelines antigos onde Reunião vinha antes de Proposta. */
export function ensureCommercialStageOrder(pipeline?: Pipeline | null): boolean {
  if (!pipeline?.stages?.length) return false;
  const ids = pipeline.stages.map((s) => s.id).join(",");
  const wanted = COMMERCIAL_STAGE_ORDER.map((s) => s.id).join(",");
  if (ids === wanted) return false;
  const byId = new Map(pipeline.stages.map((s) => [s.id, s]));
  pipeline.stages = COMMERCIAL_STAGE_ORDER.map((def) => {
    const prev = byId.get(def.id);
    return prev
      ? { ...prev, name: def.name, probability: def.probability, color: def.color }
      : { id: def.id, name: def.name, probability: def.probability, color: def.color };
  });
  return true;
}

/** Migra deals antigos #sem-site que ainda estão em Novo lead. */
export function promoteNoSiteDealsToQualified(deals: Deal[], pipeline?: Pipeline | null): number {
  const qual = qualifiedStage(pipeline);
  const novoId = pipeline?.stages?.[0]?.id || "st_novo";
  if (!qual) return 0;
  let n = 0;
  for (const d of deals) {
    if (d.status !== "aberto") continue;
    if (d.stageId !== novoId && d.stageId !== "st_novo") continue;
    const tags = d.tags || [];
    if (!tags.some((t) => /#sem-site|#sem-cardapio/i.test(t))) continue;
    d.stageId = qual.id;
    d.probability = qual.probability;
    d.updatedAt = new Date().toISOString();
    n += 1;
  }
  return n;
}
