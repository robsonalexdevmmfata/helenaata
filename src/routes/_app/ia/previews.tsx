import { createFileRoute, redirect } from "@tanstack/react-router";
import { ExternalLink, Globe, Search, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, StatCard } from "@/components/app/kit";
import { SitePreviewView } from "@/components/dev/SitePreviewView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { previewUrl } from "@/lib/dev/presence";
import { publishSitePreviews, stashPreviewHandoff } from "@/lib/dev/previewPublish";
import { pageHead } from "@/lib/head";
import { currentUser, getDB, useDB } from "@/lib/store";
import { canUseDevTeam } from "@/lib/saas";
import type { SitePreview } from "@/lib/types";

export const Route = createFileRoute("/_app/ia/previews")({
  ssr: false,
  beforeLoad: () => {
    if (!canUseDevTeam(currentUser(getDB()))) throw redirect({ to: "/ia/times" });
  },
  head: () => pageHead("Prévia de sites", "Sites e cardápios gerados pelo Time Desenvolvimento IA para o Time Comercial abordar o dono."),
  component: PreviewsPage,
});

async function ensurePublished(preview: SitePreview) {
  stashPreviewHandoff(preview);
  const result = await publishSitePreviews([preview]);
  const row = result[preview.slug];
  // Sempre POSTa o JSON da prévia (Supabase) — independente do deploy Vercel do repo.
  try {
    await fetch("/api/previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview }),
    });
  } catch {
    /* rede */
  }
  return row;
}

function PreviewsPage() {
  const db = useDB();
  const [q, setQ] = useState("");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [inline, setInline] = useState<SitePreview | null>(null);
  const list = (db.sitePreviews ?? []).filter((p) =>
    `${p.name} ${p.segment} ${p.city}`.toLowerCase().includes(q.toLowerCase()),
  );
  const withMenu = list.filter((p) => p.menu?.length).length;

  const openPreview = async (p: SitePreview) => {
    setBusySlug(p.slug);
    try {
      await ensurePublished(p);
      window.open(p.vercelUrl || previewUrl(p.slug), "_blank");
    } finally {
      setBusySlug(null);
    }
  };

  const publishAll = async () => {
    setBusySlug("*");
    try {
      await publishSitePreviews(list.slice(0, 50));
      await fetch("/api/previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previews: list.slice(0, 50) }),
      });
      toast.success(`${Math.min(list.length, 50)} prévias publicadas no link /v/…`);
    } catch {
      toast.error("Falha ao publicar. Tente de novo.");
    } finally {
      setBusySlug(null);
    }
  };

  if (inline) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-background">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-xs text-muted-foreground">Prévia interna · {inline.slug}</p>
            <p className="font-medium">{inline.name}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void openPreview(inline)}>
              Abrir link público <ExternalLink className="size-3.5" />
            </Button>
            <Button size="sm" onClick={() => setInline(null)}>Fechar</Button>
          </div>
        </div>
        <SitePreviewView preview={inline} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA"
        title="Prévia de sites"
        description="O Time Dev gera o site/cardápio e publica no link /v/slug (Supabase). O comercial manda esse link ao cliente."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Prévias" value={list.length} icon={<Globe />} tone="helena" />
        <StatCard label="Com cardápio" value={withMenu} icon={<Globe />} tone="info" />
        <StatCard label="Enviadas" value={list.filter((p) => p.status === "enviada").length} icon={<ExternalLink />} tone="success" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar prévia..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length > 0 && (
          <Button size="sm" variant="outline" disabled={busySlug === "*"} onClick={() => void publishAll()}>
            <Upload className="size-3.5" /> Publicar todas no /v/
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma prévia ainda. Peça à Helena: “procure 10 restaurantes que não tenham site nem cardápio online”.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <div key={p.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="text-xs text-muted-foreground">{p.segment} · {p.city}</p>
                </div>
                <Badge variant="outline">{p.menu?.length ? "Site + cardápio" : "Site"}</Badge>
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {p.vercelUrl || previewUrl(p.slug)}
              </p>
              {p.deployError && <p className="text-xs text-destructive">{p.deployError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busySlug === p.slug} onClick={() => setInline(p)}>
                  Ver aqui
                </Button>
                <Button size="sm" variant="secondary" disabled={busySlug === p.slug} onClick={() => void openPreview(p)}>
                  {busySlug === p.slug ? "Publicando…" : "Publicar & abrir"} <ExternalLink className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await ensurePublished(p);
                    await navigator.clipboard.writeText(p.vercelUrl || previewUrl(p.slug));
                    toast.success("Link copiado");
                  }}
                >
                  Copiar link do cliente
                </Button>
                {p.githubUrl && (
                  <Button size="sm" variant="ghost" onClick={() => window.open(p.githubUrl, "_blank")}>
                    GitHub
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
