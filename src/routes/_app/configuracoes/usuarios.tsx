import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, Mail, Plus, Shield, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityAvatar, PageHeader, Status } from "@/components/app/kit";
import { currentUser, getDB, listAccounts, uid, update, useDB } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/helena/registry";
import { fmtDate } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Role, User as UserType } from "@/lib/types";
import { assignPlan, extendTrial, formatTrialLabel, isPlatformAdmin, setUserActive } from "@/lib/saas";

export const Route = createFileRoute("/_app/configuracoes/usuarios")({
  head: () => pageHead("Usuários & Equipe", "Membros da organização e controle de acesso."),
  beforeLoad: () => {
    const user = currentUser(getDB());
    if (!isPlatformAdmin(user)) throw redirect({ to: "/visao-geral" });
  },
  component: UsersPage,
});

function UsersPage() {
  const db = useDB();
  const activeUser = currentUser(db);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("agent");

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    update((d) => {
      d.invites.unshift({
        id: uid("iv_"),
        organizationId: d.organization.id,
        email: inviteEmail.trim(),
        role: inviteRole,
        sentAt: new Date().toISOString(),
      });
    });

    toast.success(`Convite enviado para ${inviteEmail}`);
    setInviteOpen(false);
    setInviteEmail("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários & Acessos"
        description="Controle de membros da equipe humana, permissões e convites da organização."
        actions={
          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <UserPlus className="size-4" /> Convidar Membro
          </Button>
        }
      />

      {/* Users Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nome & Cargo</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Papel (RBAC)</th>
                <th className="px-4 py-3 font-medium">Horário</th>
                <th className="px-4 py-3 font-medium">Meta Comercial</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Último acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {db.users.map((u: UserType) => (
                <tr key={u.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <EntityAvatar name={u.name} color={u.color} size="sm" />
                      <div>
                        <div className="font-medium text-foreground">
                          {u.name} {u.id === activeUser.id && "(Você)"}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.title || "Membro"}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{u.email}</td>

                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary/10 text-primary border border-primary/25 px-2.5 py-0.5 text-xs font-semibold">
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3" />
                      <span>{u.workHours || "Comercial"}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-xs font-mono">
                    {u.goal > 0 ? (
                      <div>
                        <span className="font-semibold text-foreground">
                          R$ {u.achieved.toLocaleString("pt-BR")}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          / R$ {u.goal.toLocaleString("pt-BR")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <Status value={u.status} />
                  </td>

                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {fmtDate(u.lastSeen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">Contas SaaS cadastradas</h3>
        <p className="text-xs text-muted-foreground">Trial, plano e bloqueio das contas que se inscreveram na landing. O Cakto confirma o pagamento depois — aqui você libera na mão.</p>
        <div className="divide-y">
          {listAccounts().filter((u) => u.kind === "customer").map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <div className="font-medium">{u.name} · {u.companyName || u.email}</div>
                <div className="text-xs text-muted-foreground font-mono">{u.username} · {u.email} · {formatTrialLabel(u)} · {u.dailyProspectUsed ?? 0} hoje</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => { assignPlan(u.id, "impulso"); toast.success("Impulso liberado"); }}>Impulso</Button>
                <Button size="sm" variant="outline" onClick={() => { assignPlan(u.id, "maquina"); toast.success("Máquina liberada"); }}>Máquina</Button>
                <Button size="sm" variant="outline" onClick={() => { assignPlan(u.id, "whitelabel"); toast.success("White-label liberado"); }}>WL</Button>
                <Button size="sm" variant="ghost" onClick={() => { extendTrial(u.id); toast.success("Trial renovado 2 dias"); }}>+2 dias</Button>
                <Button size="sm" variant="ghost" onClick={() => { setUserActive(u.id, u.status !== "ativo"); toast.success(u.status === "ativo" ? "Bloqueada" : "Ativada"); }}>
                  {u.status === "ativo" ? "Bloquear" : "Ativar"}
                </Button>
              </div>
            </div>
          ))}
          {listAccounts().filter((u) => u.kind === "customer").length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Nenhuma conta de cliente ainda. Use o cadastro da landing.</p>
          )}
        </div>
        {(db.quoteRequests ?? []).length > 0 && (
          <div className="pt-2">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Orçamentos white-label</h4>
            {(db.quoteRequests ?? []).map((q) => (
              <p key={q.id} className="mt-1 text-xs">{q.company} · {q.email} · {q.message}</p>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {db.invites.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Convites Pendentes ({db.invites.length})</h3>
          <div className="divide-y">
            {db.invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{inv.email}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase font-mono text-muted-foreground">
                    {ROLE_LABEL[inv.role]}
                  </span>
                </div>
                <span className="text-muted-foreground font-mono">
                  Enviado em {fmtDate(inv.sentAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Convidar Membro */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle>Convidar Membro para a Equipe</DialogTitle>
              <DialogDescription>
                Envie um convite de acesso para um colaborador da organização.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">E-mail do colaborador</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colaborador@infotech.com.br"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Papel de Acesso (RBAC)</Label>
                <Select value={inviteRole} onValueChange={(r: Role) => setInviteRole(r)}>
                  <SelectTrigger id="invite-role">
                    <SelectValue placeholder="Selecione o papel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Proprietário (Owner)</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="manager">Gerente / Gestor</SelectItem>
                    <SelectItem value="agent">Agente / Vendedor</SelectItem>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Enviar Convite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
