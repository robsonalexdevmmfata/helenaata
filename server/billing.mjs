function fold(v) {
  return String(v ?? "").toLowerCase();
}

export function mapCaktoPlan(payload) {
  const blob = fold(JSON.stringify(payload ?? {}));
  if (/36nkrsw|maquina|máquina/.test(blob)) return "maquina";
  if (/kmb4vg8|impulso/.test(blob)) return "impulso";
  return "";
}

export function isCaktoPaidEvent(event, status) {
  const e = fold(`${event} ${status}`);
  if (/refus|fail|cancel|chargedback|expired|unpaid/.test(e)) return false;
  return /purchase_approved|paid|approved|subscription_renewed|subscription_created|pagamento.?aprov/.test(e);
}

function pickEmail(data) {
  const customer = data.customer || data.buyer || {};
  return String(customer.email || data.email || data.customerEmail || "").trim().toLowerCase();
}

function pickName(data) {
  const customer = data.customer || data.buyer || {};
  return String(customer.name || data.name || "").trim();
}

export function parseCaktoPayload(body) {
  const root = body && typeof body === "object" ? body : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;
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
    paid: isCaktoPaidEvent(event, status),
  };
}
