import type { SaasPlanId } from "@/lib/types";

export type CaktoBillingEvent = {
  at: string;
  email: string;
  name: string;
  planId: SaasPlanId | "";
  status: string;
  event: string;
  amount?: number;
  sourceId?: string;
};

function fold(v: unknown) {
  return String(v ?? "").toLowerCase();
}

export function mapCaktoPlan(payload: unknown): SaasPlanId | "" {
  const blob = fold(JSON.stringify(payload ?? {}));
  if (/36nkrsw|maquina|m[áa]quina/.test(blob)) return "maquina";
  if (/kmb4vg8|impulso/.test(blob)) return "impulso";
  if (/\b140\b/.test(blob) && /cakto|product|offer|amount/.test(blob)) return "maquina";
  if (/\b70\b/.test(blob) && /cakto|product|offer|amount/.test(blob)) return "impulso";
  return "";
}

export function isCaktoPaidEvent(event: string, status: string) {
  const e = fold(`${event} ${status}`);
  if (/refus|fail|cancel|chargedback|expired|unpaid/.test(e)) return false;
  return /purchase_approved|paid|approved|subscription_renewed|subscription_created|pagamento.?aprov/.test(e);
}

function pickEmail(data: Record<string, unknown>) {
  const customer = (data.customer || data.buyer || {}) as Record<string, unknown>;
  return String(customer.email || data.email || data.customerEmail || "").trim().toLowerCase();
}

function pickName(data: Record<string, unknown>) {
  const customer = (data.customer || data.buyer || {}) as Record<string, unknown>;
  return String(customer.name || data.name || "").trim();
}

export function parseCaktoPayload(body: unknown): CaktoBillingEvent {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  const event = String(root.event || root.type || data.event || "");
  const status = String(data.status || root.status || event);
  const amountRaw = data.amount ?? data.value ?? root.amount;
  const amount = typeof amountRaw === "number" ? amountRaw : Number(amountRaw) || undefined;
  return {
    at: new Date().toISOString(),
    email: pickEmail(data) || pickEmail(root),
    name: pickName(data) || pickName(root),
    planId: mapCaktoPlan(body),
    status,
    event,
    amount,
    sourceId: String(data.id || root.id || ""),
  };
}
