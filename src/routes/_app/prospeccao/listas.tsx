import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Ban, List, Plus, Sparkles, Upload, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/app/kit";
import { uid, update, useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { openHelena } from "@/lib/helena/orchestrator";
import { fmtDate, num } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/prospeccao/listas")({
  head: () => pageHead("Listas de prospecção", "Listas segmentadas por ICP usadas pelas campanhas e pelos SDRs de IA."),
  component: ListsPage,
});

function ListsPage() {
  const db = useDB();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", segment: "", icp: "", count: "100", source: "Importação CSV" });

  const total = db.lists.reduce((s, l) => s + l.count, 0);
  const inCampaign = (id: string) => db.campaigns.filter((c) => c.listId === id).length;

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Informe o nome da lista.");
    update((d) => {
      d.lists.unshift({
        id: uid("l_"), organizationId: d.organization.id, name: form.name.trim(), segment: form.segment || "Geral",
        icp: form.icp || "—", count: Math.max(1, Number(form.count) || 0), source: form.source, blacklisted: 0, createdAt: new Date().toISOString(),
      });
    });
    toast.success(`Lista ${form.name} criada`);
    setOpen(false);
    setForm({ name: "", segment: "", icp: "", count: "100", source: "Importação CSV" });
  };

  const newCampaign = (listId: string, name: string) => {
    const r = userAction("campaigns.create", { name: `Campanha ${name}`, listId, agentIds: ["a_sdr1", "a_sdr2"] });
    if (r.ok) {
      toast.success(r.message);
      router.history.push("/prospeccao/campanhas");
    } else toast.error(r.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prospecção"
        title="Listas"
        description="Bases segmentadas por perfil de cliente ideal. Contatos em opt-out ficam bloqueados automaticamente."
        actions={
          <>
            <Button variant="outline" onClick={() => openHelena("Helena, varra o Google Maps e busque 50 clínicas sem site em São Paulo.")}><Sparkles /> Gerar com a Helena</Button>
            <Button onClick={() => setOpen(true)}><Plus /> Nova lista</Button>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Listas" value={db.lists.length} icon={<List />} />
        <StatCard label="Contatos disponíveis" value={num(total)} icon={<Users />} tone="info" />
        <StatCard label="Bloqueados (opt-out)" value={db.lists.reduce((s, l) => s + l.blacklisted, 0)} icon={<Ban />} tone="danger" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lista</TableHead>
              <TableHead className="hidden md:table-cell">Perfil (ICP)</TableHead>
              <TableHead className="text-right">Contatos</TableHead>
              <TableHead className="hidden sm:table-cell">Origem</TableHead>
              <TableHead className="hidden lg:table-cell">Campanhas</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {db.lists.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.segment} · criada {fmtDate(l.createdAt)}</div>
                </TableCell>
                <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell">{l.icp}</TableCell>
                <TableCell className="text-right font-mono">
                  {num(l.count)}
                  {l.blacklisted > 0 && <div className="text-[10px] text-destructive">{l.blacklisted} bloqueados</div>}
                </TableCell>
                <TableCell className="hidden text-sm sm:table-cell">{l.source}</TableCell>
                <TableCell className="hidden lg:table-cell">{inCampaign(l.id)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => newCampaign(l.id, l.name)}><Zap /> Campanha</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={create} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Nova lista</DialogTitle>
              <DialogDescription>Simula uma importação. O arquivo CSV real será processado pelo seu servidor.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Restaurantes Zona Sul" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Segmento</Label><Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Quantidade</Label><Input type="number" min={1} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Perfil de cliente ideal</Label><Input value={form.icp} onChange={(e) => setForm({ ...form, icp: e.target.value })} placeholder="Ex: sem site, 5 a 50 funcionários" /></div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/40">
              <Upload className="size-4" /> Anexar CSV (opcional)
              <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setForm({ ...form, source: `CSV · ${f.name}`, name: form.name || f.name.replace(/\.csv$/i, "") }); }} />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Criar lista</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
