import type { ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Download, Eye, FileText, Plus, Scale, Shield,
  Trash2, UserX,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes/lgpd")({
  head: () => pageHead("LGPD", "Privacidade, consentimento e direitos dos titulares de dados."),
  component: LgpdPage,
});

const REQUEST_TYPE_LABEL: Record<string, string> = {
  exportacao: "Exportação",
  anonimizacao: "Anonimização",
  exclusao: "Exclusão",
};

const REQUEST_TYPE_ICON: Record<string, ReactElement> = {
  exportacao: <Download className="size-3.5" />,
  anonimizacao: <Eye className="size-3.5" />,
  exclusao: <UserX className="size-3.5" />,
};

function LgpdPage() {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", type: "exportacao" });

  const requests = db.lgpdRequests ?? [];
  const open_ = requests.filter((r) => r.status === "aberta").length;
  const done = requests.filter((r) => r.status === "concluida").length;
  const retentionDays = db.organizationSettings?.retentionDays ?? 730;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!form.name || !form.email) { toast.error("Nome e e-mail são obrigatórios."); return; }
    update((d) => {
      if (!d.lgpdRequests) d.lgpdRequests = [];
      d.lgpdRequests.unshift({
        id: uid("lgpd_"),
        organizationId: d.organization.id,
        contactName: form.name,
        contactEmail: form.email,
        type: form.type as "exportacao" | "anonimizacao" | "exclusao",
        status: "aberta",
        requestedAt: nowISO(),
      });
    });
    toast.success("Solicitação LGPD registrada. Prazo de resposta: 15 dias.");
    setForm({ name: "", email: "", type: "exportacao" });
    setOpen(false);
  };

  const handleComplete = (id: string) => {
    update((d) => {
      const r = (d.lgpdRequests ?? []).find((x) => x.id === id);
      if (r) { r.status = "concluida"; r.completedAt = nowISO(); }
    });
    toast.success("Solicitação marcada como concluída.");
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        eyebrow="Configurações"
        title="LGPD — Privacidade"
        description="Gerencie consentimento, solicitações de titulares e políticas de retenção de dados."
        actions={
          <Button className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Nova Solicitação
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Abertas" value={open_} icon={<Clock />} tone="warning" />
        <StatCard label="Concluídas" value={done} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Retenção de Dados" value={`${retentionDays}d`} hint="Após este prazo dados são apagados automaticamente" icon={<Shield />} tone="info" />
      </div>

      {/* Princípios LGPD */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Conformidade LGPD (Lei 13.709/2018)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { title: "Finalidade", desc: "Dados coletados apenas para finalidades legítimas e informadas ao titular." },
            { title: "Adequação", desc: "O tratamento é compatível com a finalidade informada no consentimento." },
            { title: "Necessidade", desc: "Somente os dados estritamente necessários para a operação são tratados." },
            { title: "Transparência", desc: "Titulares podem solicitar exportação ou exclusão a qualquer momento." },
          ].map((p) => (
            <div key={p.title} className="rounded-xl border p-4 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success shrink-0" />
                <p className="text-sm font-semibold">{p.title}</p>
              </div>
              <p className="text-xs text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Solicitações */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Solicitações dos Titulares</h2>
        {requests.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            Nenhuma solicitação registrada.
          </div>
        ) : (
          <div className="rounded-xl border divide-y">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-4 py-3">
                <div className="text-muted-foreground">{REQUEST_TYPE_ICON[r.type]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.contactName}</p>
                  <p className="text-xs text-muted-foreground">{r.contactEmail} · {REQUEST_TYPE_LABEL[r.type]} · {new Date(r.requestedAt).toLocaleDateString("pt-BR")}</p>
                </div>
                <Badge variant={r.status === "concluida" ? "default" : "outline"} className="text-[10px] shrink-0">
                  {r.status === "concluida" ? "Concluída" : "Aberta"}
                </Badge>
                {r.status === "aberta" && (
                  <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" onClick={() => handleComplete(r.id)}>
                    Concluir
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Nova solicitação modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Solicitação LGPD</DialogTitle>
            <DialogDescription>
              Registre a solicitação de um titular. O prazo legal de resposta é de 15 dias úteis.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 py-1">
            <div className="space-y-1">
              <Label>Nome do titular</Label>
              <Input placeholder="Nome completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Tipo de solicitação</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exportacao">Exportação dos dados</SelectItem>
                  <SelectItem value="anonimizacao">Anonimização</SelectItem>
                  <SelectItem value="exclusao">Exclusão completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Registrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
