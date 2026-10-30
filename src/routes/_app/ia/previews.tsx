import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { ExternalLink, Globe, Search } from "lucide-react";
import { useState } from "react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { previewUrl } from "@/lib/dev/presence";
import { pageHead } from "@/lib/head";
import { currentUser, getDB, useDB } from "@/lib/store";
import { canUseDevTeam } from "@/lib/saas";

export const Route = createFileRoute("/_app/ia/previews")({
  ssr: false,
  beforeLoad: () => {
    if (!canUseDevTeam(currentUser(getDB()))) throw redirect({ to: "/ia/times" });
  },
  head: () => pageHead("Prévia de sites", "Sites e cardápios gerados pelo Time Desenvolvimento IA para o Time Comercial abordar o dono."),
  component: PreviewsPage,
});

function PreviewsPage() {
  const db = useDB();
  const router = useRouter();
  const [q, setQ] = useState("");
  const list = (db.sitePreviews ?? []).filter((p) =>
    `${p.name} ${p.segment} ${p.city}`.toLowerCase().includes(q.toLowerCase()),
  );
  const withMenu = list.filter((p) => p.menu?.length).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA"
        title="Prévia de sites"
        description="O Time Desenvolvimento IA monta o site e o cardápio. O Time Comercial envia ao cliente o link público https://helenaata.vercel.app/v/…"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Prévias" value={list.length} icon={<Globe />} tone="helena" />
        <StatCard label="Com cardápio" value={withMenu} icon={<Globe />} tone="info" />
        <StatCard label="Enviadas" value={list.filter((p) => p.status === "enviada").length} icon={<ExternalLink />} tone="success" />
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar prévia..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma prévia ainda. Peça à Helena: “procure 50 restaurantes que não tenham site nem cardápio online”.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="text-xs text-muted-foreground">{p.segment} · {p.city}</p>
                </div>
                <Badge variant="outline">{p.menu ? "Site + cardápio" : "Site"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{p.tagline}</p>
              <p className="break-all font-mono text-[11px] text-muted-foreground">{previewUrl(p.slug)}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => router.history.push(p.previewPath)}>
                  Abrir prévia <ExternalLink className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(previewUrl(p.slug))}
                >
                  Copiar link do cliente
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
