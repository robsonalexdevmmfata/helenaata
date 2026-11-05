import { issueToken, loginAccount } from "../_lib/accounts.mjs";

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
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const user = await loginAccount(input.username, input.password);
    if (!user) return send(res, 401, { error: "Usuário ou senha inválidos." });
    const token = issueToken({ userId: user.id, organizationId: user.organizationId });
    return send(res, 200, { token, user });
  } catch (error) {
    console.error("[api/auth/login]", error);
    return send(res, error?.status || 500, { error: error?.message || "Erro interno." });
  }
}
