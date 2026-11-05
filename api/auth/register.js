import { createAccount, dbReady, issueToken } from "../_lib/accounts.mjs";

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });

  try {
    if (!(await dbReady())) {
      return send(res, 503, { error: "Supabase indisponível. Configure DATABASE_URL na Vercel." });
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const name = String(input.name || "").trim();
    const company = String(input.company || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (name.length < 2 || company.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return send(res, 400, { error: "Informe nome, empresa e um e-mail válido." });
    }
    if (password.length < 8) {
      return send(res, 400, { error: "A senha precisa ter pelo menos 8 caracteres." });
    }
    const user = await createAccount({
      name,
      company,
      email,
      password,
      phone: String(input.phone || ""),
    });
    const token = issueToken({ userId: user.id, organizationId: user.organizationId });
    return send(res, 201, { token, user });
  } catch (error) {
    console.error("[api/auth/register]", error);
    return send(res, error?.status || 500, { error: error?.message || "Erro interno." });
  }
}
