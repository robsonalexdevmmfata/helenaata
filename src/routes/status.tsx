import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pageHead } from "@/lib/head";
import { getHealth, type BackendHealth } from "@/lib/backend";

export const Route = createFileRoute("/status")({
  head: () => pageHead("Status", "Helena, WhatsApp e Evolution no ar."),
  component: StatusPage,
});

function StatusPage() {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((e) => setErr(e instanceof Error ? e.message : "Servidor silencioso"));
  }, []);

  const chip =
    health?.whatsapp === "connected" || health?.whatsapp === "open"
      ? "Chip no ar"
      : health
        ? `WhatsApp: ${health.whatsapp}`
        : "Checando…";

  return (
    <div className="min-h-[100dvh] bg-[#0b0a09] px-4 py-16 text-[#f4efe6]">
      <div className="mx-auto max-w-lg space-y-6">
        <p className="text-[11px] tracking-[0.22em] text-[#f4efe6]/50">STATUS · HELENA AI</p>
        <h1 className="font-serif text-4xl">O chip está no ar?</h1>
        <p className="text-sm text-[#f4efe6]/65">
          Render de graça + Evolution Hostless. Sem Cloudflare pago. Se isto responder, a VPS da operação está viva.
        </p>
        <div className="rounded-2xl border border-white/10 bg-[#141210] p-5 space-y-2 text-sm">
          <p>{health ? `API: ${health.status} · ${health.system}` : err || "Ligando…"}</p>
          <p>{chip}</p>
          {health?.evolution && <p>Evolution: {health.evolution}</p>}
          {health?.ai && <p>IA: {health.ai}</p>}
          {health && <p>Uptime: {Math.round(health.uptime / 60)} min</p>}
        </div>
        <div className="flex gap-3 text-sm">
          <Link to="/" className="underline">Landing</Link>
          <Link to="/login" className="underline">Entrar</Link>
          <Link to="/cadastro" className="underline">Trial</Link>
        </div>
      </div>
    </div>
  );
}
