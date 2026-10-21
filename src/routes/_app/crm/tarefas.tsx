import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Filter,
  ListChecks,
  Plus,
  Search,
  User,
} from "lucide-react";
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
import { EntityAvatar, PageHeader, StatusBadge } from "@/components/app/kit";
import { currentUser, ownerName, update, useDB } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { fmtDate, fmtTime } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Task } from "@/lib/types";

export const Route = createFileRoute("/_app/crm/tarefas")({
  head: () => pageHead("Tarefas & Follow-ups", "Gestão de tarefas, follow-ups e compromissos."),
  component: TasksPage,
});

function TasksPage() {
  const db = useDB();
  const user = currentUser(db);

  const [tab, setTab] = useState<"todas" | "hoje" | "atrasadas" | "concluidas">("todas");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // New Task Form
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Task["type"]>("follow-up");
  const [priority, setPriority] = useState<Task["priority"]>("media");
  const [contactId, setContactId] = useState("");
  const [dueAt, setDueAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [assigneeId, setAssigneeId] = useState(user.id);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 24 * 3600 * 1000;

  const tasks = db.tasks.filter((t) => {
    const dueTime = new Date(t.dueAt).getTime();
    if (tab === "concluidas" && !t.done) return false;
    if (tab !== "concluidas" && t.done) return false;

    if (tab === "hoje") {
      if (dueTime < startOfDay || dueTime > endOfDay) return false;
    } else if (tab === "atrasadas") {
      if (dueTime >= startOfDay) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const contact = t.contactId ? db.contacts.find((c) => c.id === t.contactId) : undefined;
      const matchContact = contact?.name.toLowerCase().includes(q);
      if (!matchTitle && !matchContact) return false;
    }

    return true;
  });

  const handleToggle = (task: Task) => {
    update((d) => {
      const target = d.tasks.find((x) => x.id === task.id);
      if (target) {
        target.done = !target.done;
        if (target.done && target.contactId) {
          d.activities.unshift({
            id: `ac_${Date.now()}`,
            organizationId: d.organization.id,
            contactId: target.contactId,
            type: "tarefa",
            text: `Tarefa concluída: ${target.title}`,
            actor: user.name,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });

    toast.success(task.done ? "Tarefa reaberta" : "Tarefa concluída!");
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("O título da tarefa é obrigatório.");
      return;
    }

    const res = runTool(
      "crm.create_task",
      {
        title: title.trim(),
        type,
        priority,
        contactId: contactId || undefined,
        dueAt: new Date(dueAt).toISOString(),
        assigneeId,
        assigneeType: db.agents.some((a) => a.id === assigneeId) ? "agent" : "user",
      },
      { actor: user.name, actorType: "user", requestedBy: user.name },
    );

    if (res.ok) {
      toast.success(res.message);
      setCreateOpen(false);
      setTitle("");
      setContactId("");
    } else {
      toast.error(res.message);
    }
  };

  const pendingCount = db.tasks.filter((t) => !t.done).length;
  const todayCount = db.tasks.filter((t) => {
    if (t.done) return false;
    const time = new Date(t.dueAt).getTime();
    return time >= startOfDay && time <= endOfDay;
  }).length;
  const overdueCount = db.tasks.filter((t) => {
    if (t.done) return false;
    return new Date(t.dueAt).getTime() < startOfDay;
  }).length;
  const doneCount = db.tasks.filter((t) => t.done).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas & Follow-ups"
        description="Gestão de atividades comerciais, compromissos e tarefas delegadas para agentes de IA."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" /> Nova Tarefa
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          onClick={() => setTab("todas")}
          className="cursor-pointer rounded-xl border bg-card p-4 transition-all hover:border-helena/40"
        >
          <div className="text-xs text-muted-foreground">Pendentes Totais</div>
          <div className="mt-1 font-mono text-2xl font-bold">{pendingCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">aguardando conclusão</div>
        </div>
        <div
          onClick={() => setTab("hoje")}
          className="cursor-pointer rounded-xl border bg-card p-4 transition-all hover:border-helena/40"
        >
          <div className="text-xs text-muted-foreground">Vencendo Hoje</div>
          <div className="mt-1 font-mono text-2xl font-bold text-warning">{todayCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">prioridade para o dia</div>
        </div>
        <div
          onClick={() => setTab("atrasadas")}
          className="cursor-pointer rounded-xl border bg-card p-4 transition-all hover:border-helena/40"
        >
          <div className="text-xs text-muted-foreground">Atrasadas</div>
          <div className="mt-1 font-mono text-2xl font-bold text-destructive">{overdueCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">precisam de atenção imediata</div>
        </div>
        <div
          onClick={() => setTab("concluidas")}
          className="cursor-pointer rounded-xl border bg-card p-4 transition-all hover:border-helena/40"
        >
          <div className="text-xs text-muted-foreground">Concluídas</div>
          <div className="mt-1 font-mono text-2xl font-bold text-success">{doneCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">finalizadas</div>
        </div>
      </div>

      {/* Filter and Tab Navigation */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={tab === "todas" ? "default" : "ghost"}
            onClick={() => setTab("todas")}
          >
            Todas ({pendingCount})
          </Button>
          <Button
            size="sm"
            variant={tab === "hoje" ? "default" : "ghost"}
            onClick={() => setTab("hoje")}
          >
            Hoje ({todayCount})
          </Button>
          <Button
            size="sm"
            variant={tab === "atrasadas" ? "default" : "ghost"}
            onClick={() => setTab("atrasadas")}
          >
            Atrasadas ({overdueCount})
          </Button>
          <Button
            size="sm"
            variant={tab === "concluidas" ? "default" : "ghost"}
            onClick={() => setTab("concluidas")}
          >
            Concluídas ({doneCount})
          </Button>
        </div>

        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar tarefa ou contato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tasks List */}
      <div className="rounded-xl border bg-card divide-y">
        {tasks.map((task) => {
          const contact = task.contactId ? db.contacts.find((c) => c.id === task.contactId) : undefined;
          const assignee = ownerName(db, task.assigneeId);
          const isOverdue = !task.done && new Date(task.dueAt).getTime() < startOfDay;

          return (
            <div
              key={task.id}
              className="flex items-center gap-3.5 p-4 transition-colors hover:bg-muted/30"
            >
              <button
                type="button"
                onClick={() => handleToggle(task)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
              >
                {task.done ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <Circle className="size-5" />
                )}
              </button>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      task.done ? "line-through text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </span>
                  <StatusBadge
                    tone={
                      task.priority === "alta"
                        ? "danger"
                        : task.priority === "media"
                          ? "warning"
                          : "neutral"
                    }
                    className="capitalize text-[10px]"
                  >
                    {task.priority}
                  </StatusBadge>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                    {task.type}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {contact && (
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {contact.name}
                    </span>
                  )}
                  <span
                    className={`flex items-center gap-1 font-mono ${
                      isOverdue ? "text-destructive font-semibold" : ""
                    }`}
                  >
                    <Clock className="size-3" />
                    Vence em {fmtDate(task.dueAt)} às {fmtTime(task.dueAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <EntityAvatar
                      name={assignee}
                      agent={task.assigneeType === "agent"}
                      size="sm"
                      className="size-3.5 text-[8px]"
                    />
                    {assignee}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma tarefa encontrada nesta aba.
          </div>
        )}
      </div>

      {/* Modal Nova Tarefa */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreateTask}>
            <DialogHeader>
              <DialogTitle>Nova Tarefa ou Follow-up</DialogTitle>
              <DialogDescription>
                Crie um lembrete ou delegue uma atividade para um membro ou agente de IA.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Título da atividade *</Label>
                <Input
                  id="task-title"
                  placeholder="Ex: Follow-up da proposta de site institucional"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-type">Tipo</Label>
                  <Select value={type} onValueChange={(v: Task["type"]) => setType(v)}>
                    <SelectTrigger id="task-type">
                      <SelectValue placeholder="Selecione tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="follow-up">Follow-up</SelectItem>
                      <SelectItem value="ligacao">Ligação</SelectItem>
                      <SelectItem value="reuniao">Reunião</SelectItem>
                      <SelectItem value="proposta">Proposta</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-priority">Prioridade</Label>
                  <Select value={priority} onValueChange={(v: Task["priority"]) => setPriority(v)}>
                    <SelectTrigger id="task-priority">
                      <SelectValue placeholder="Prioridade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="task-contact">Contato associado (opcional)</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger id="task-contact">
                    <SelectValue placeholder="Selecione um contato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum contato</SelectItem>
                    {db.contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-due">Data e Hora de Vencimento</Label>
                  <Input
                    id="task-due"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-assignee">Responsável</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger id="task-assignee">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {db.users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} (Humano)
                        </SelectItem>
                      ))}
                      {db.agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} (IA)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar Tarefa</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
