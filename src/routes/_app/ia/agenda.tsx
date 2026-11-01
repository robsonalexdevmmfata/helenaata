import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Search,
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
import { EntityAvatar, Status } from "@/components/app/kit";
import { currentUser, ownerName, useDB } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { fmtDate, fmtLocalDate, fmtLocalDateLong, fmtTime, toDatetimeLocalValue } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { CalendarEvent, CalendarEventStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/ia/agenda")({
  head: () => pageHead("Agenda compartilhada", "Compromissos fechados pelos agentes de IA com leads no WhatsApp."),
  component: AgendaPage,
});

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function eventSkin(status: CalendarEventStatus) {
  if (status === "confirmada") return "border-info/40 bg-info/12 text-foreground";
  if (status === "realizada") return "border-success/40 bg-success/12 text-foreground";
  if (status === "cancelada") return "border-border bg-muted/50 text-muted-foreground line-through";
  if (status === "no_show") return "border-warning/40 bg-warning/12";
  return "border-helena/45 bg-helena/12";
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function mondayOf(d: Date) {
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(d, offset));
}

function sameDay(iso: string, day: Date) {
  const a = new Date(iso);
  return a.getFullYear() === day.getFullYear() && a.getMonth() === day.getMonth() && a.getDate() === day.getDate();
}

function AgendaPage() {
  const db = useDB();
  const user = currentUser(db);
  const [mode, setMode] = useState<"dia" | "semana">("semana");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const followingTodayRef = useRef(true);

  useEffect(() => {
    const syncToday = () => {
      const today = startOfDay(new Date());
      if (followingTodayRef.current) setCursor(today);
    };
    syncToday();
    const id = window.setInterval(syncToday, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | CalendarEventStatus>("todos");
  const [createOpen, setCreateOpen] = useState(false);

  const [leadId, setLeadId] = useState(db.contacts[0]?.id ?? "");
  const [agenteId, setAgenteId] = useState(db.agents.find((a) => a.role === "Closer")?.id ?? "helena");
  const [dataHora, setDataHora] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 3600_000)));
  const [resumo, setResumo] = useState("Reunião 10 min · presença digital");

  const events = db.calendarEvents ?? [];
  const weekStart = mondayOf(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (statusFilter !== "todos" && e.status !== statusFilter) return false;
      if (!q) return true;
      const lead = db.contacts.find((c) => c.id === e.leadId);
      const agent = ownerName(db, e.agenteId);
      return `${e.titulo} ${e.resumo} ${lead?.name ?? ""} ${agent}`.toLowerCase().includes(q);
    });
  }, [events, search, statusFilter, db]);

  const visible = filtered.filter((e) => {
    if (mode === "dia") return sameDay(e.dataHora, cursor);
    const start = weekStart.getTime();
    const end = addDays(weekStart, 7).getTime();
    const t = new Date(e.dataHora).getTime();
    return t >= start && t < end;
  });

  const stats = {
    total: events.length,
    week: events.filter((e) => {
      const t = new Date(e.dataHora).getTime();
      return t >= weekStart.getTime() && t < addDays(weekStart, 7).getTime();
    }).length,
    confirmadas: events.filter((e) => e.status === "confirmada" || e.status === "agendada").length,
    realizadas: events.filter((e) => e.status === "realizada").length,
  };

  const createMeeting = () => {
    const res = runTool(
      "calendar.agendar_reuniao",
      { leadId, agenteId, dataHora: new Date(dataHora).toISOString(), resumo },
      { actor: user.name, actorType: "user", requestedBy: user.name },
    );
    if (res.ok) {
      toast.success(res.message);
      setCreateOpen(false);
    } else {
      toast.error(res.message);
    }
  };

  const setStatus = (ev: CalendarEvent, status: CalendarEventStatus) => {
    const res = runTool(
      "calendar.update_event",
      { id: ev.id, status },
      { actor: user.name, actorType: "user", requestedBy: user.name },
    );
    if (res.ok) toast.success("Status atualizado");
    else toast.error(res.message);
  };

  const eventsAt = (day: Date, hour: number) =>
    visible.filter((e) => {
      const d = new Date(e.dataHora);
      return sameDay(e.dataHora, day) && d.getHours() === hour;
    });

  const today = startOfDay(new Date());
  const now = new Date();
  const upcoming = filtered
    .filter((e) => new Date(e.dataHora).getTime() >= Date.now() && e.status !== "cancelada")
    .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())
    .slice(0, 6);
  const days = mode === "dia" ? [cursor] : weekDays;

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[1.75rem] border border-helena/25 bg-gradient-to-br from-helena/15 via-card to-card p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-helena">Agenda compartilhada</p>
            <h1 className="mt-1 font-serif text-3xl sm:text-4xl">
              {mode === "dia" ? fmtLocalDateLong(cursor) : "A semana do comercial"}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Helena, SDR e Closer gravam o horário aqui no momento em que o dono confirma no WhatsApp. Não é calendário de escritório — é a fila de reuniões da operação.
            </p>
          </div>
          <Button className="gap-2 rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Novo horário
          </Button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { k: "Na grade", v: stats.total },
            { k: "Esta semana", v: stats.week },
            { k: "Abertas", v: stats.confirmadas },
            { k: "Realizadas", v: stats.realizadas },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
              <div className="font-serif text-2xl">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border bg-card p-1">
          <Button size="sm" className="rounded-full" variant={mode === "dia" ? "secondary" : "ghost"} onClick={() => setMode("dia")}>Dia</Button>
          <Button size="sm" className="rounded-full" variant={mode === "semana" ? "secondary" : "ghost"} onClick={() => setMode("semana")}>Semana</Button>
        </div>
        <Button size="icon" variant="outline" className="rounded-full" onClick={() => { followingTodayRef.current = false; setCursor(addDays(cursor, mode === "dia" ? -1 : -7)); }}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full" onClick={() => { followingTodayRef.current = true; setCursor(startOfDay(new Date())); }}>Hoje</Button>
        <Button size="icon" variant="outline" className="rounded-full" onClick={() => { followingTodayRef.current = false; setCursor(addDays(cursor, mode === "dia" ? 1 : 7)); }}>
          <ChevronRight className="size-4" />
        </Button>
        <div className="font-serif text-lg">
          {mode === "dia" ? fmtLocalDate(cursor) : `${fmtLocalDate(weekStart)} — ${fmtLocalDate(addDays(weekStart, 6))}`}
        </div>
        <div className="relative ml-auto min-w-[180px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="rounded-full pl-8" placeholder="Lead, agente, título…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[160px] rounded-full"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="agendada">Agendada</SelectItem>
            <SelectItem value="confirmada">Confirmada</SelectItem>
            <SelectItem value="realizada">Realizada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="overflow-x-auto rounded-[1.5rem] border bg-card">
          <div className="min-w-[720px]">
            <div className={cn("grid border-b bg-muted/30", mode === "dia" ? "grid-cols-[4.5rem_1fr]" : "grid-cols-[4.5rem_repeat(7,1fr)]")}>
              <div className="p-3 text-[10px] uppercase tracking-wider text-muted-foreground">Hora</div>
              {days.map((day, i) => {
                const isToday = day.getTime() === today.getTime();
                return (
                  <div key={day.toISOString()} className={cn("border-l p-3 text-center", isToday && "bg-helena/10")}>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{mode === "semana" ? WEEKDAYS[i] : "Hoje"}</div>
                    <div className={cn("mt-1 font-serif text-2xl leading-none", isToday && "text-helena")}>{day.getDate()}</div>
                  </div>
                );
              })}
            </div>
            {HOURS.map((hour) => (
              <div key={hour} className={cn("grid border-b last:border-0", mode === "dia" ? "grid-cols-[4.5rem_1fr]" : "grid-cols-[4.5rem_repeat(7,1fr)]")}>
                <div className="p-2 font-mono text-[11px] text-muted-foreground">{String(hour).padStart(2, "0")}:00</div>
                {days.map((day) => {
                  const isToday = day.getTime() === today.getTime();
                  const isNowHour = isToday && now.getHours() === hour;
                  return (
                    <div
                      key={day.toISOString() + hour}
                      className={cn("relative min-h-[4.75rem] border-l p-1", isToday && "bg-helena/[0.04]", isNowHour && "bg-helena/8")}
                    >
                      {isNowHour && (
                        <div className="pointer-events-none absolute inset-x-1 top-[42%] h-px bg-helena">
                          <span className="absolute -left-1 -top-1 size-2 rounded-full bg-helena" />
                        </div>
                      )}
                      {eventsAt(day, hour).map((ev) => {
                        const lead = db.contacts.find((c) => c.id === ev.leadId);
                        const agent = ownerName(db, ev.agenteId);
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setStatus(ev, ev.status === "agendada" ? "confirmada" : ev.status === "confirmada" ? "realizada" : ev.status)}
                            className={cn("mb-1 w-full rounded-xl border p-2 text-left transition hover:brightness-110", eventSkin(ev.status))}
                          >
                            <div className="text-[11px] font-mono text-muted-foreground">{fmtTime(ev.dataHora)}</div>
                            <div className="truncate text-sm font-medium leading-tight">{lead?.name ?? "Lead"}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{agent}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-[1.5rem] border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-helena">
              <Clock className="size-3.5" /> A seguir
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nada marcado daqui pra frente. O Closer grava sozinho quando o horário fecha no WhatsApp.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {upcoming.map((ev) => {
                  const lead = db.contacts.find((c) => c.id === ev.leadId);
                  return (
                    <li key={ev.id} className="rounded-xl border border-helena/20 bg-helena/5 p-3">
                      <div className="font-mono text-[11px] text-helena">{fmtDate(ev.dataHora)} · {fmtTime(ev.dataHora)}</div>
                      <div className="mt-0.5 font-medium">{lead?.name ?? "Lead"}</div>
                      <div className="text-xs text-muted-foreground">{ev.resumo || ev.titulo}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <div className="space-y-2">
        <h2 className="font-serif text-xl">Lista da operação</h2>
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum compromisso nesta visão. Os agentes gravam automaticamente ao fechar horário no WhatsApp.</p>
        )}
        {filtered
          .slice()
          .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())
          .map((ev) => {
            const lead = db.contacts.find((c) => c.id === ev.leadId);
            const agent = ownerName(db, ev.agenteId);
            const agentRec = db.agents.find((a) => a.id === ev.agenteId);
            return (
              <div key={ev.id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl border p-3", eventSkin(ev.status))}>
                <EntityAvatar name={lead?.name ?? "Lead"} agent />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{ev.titulo}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(ev.dataHora)} {fmtTime(ev.dataHora)} · {lead?.name ?? ev.leadId} · {agent}
                    {agentRec?.role ? ` (${agentRec.role})` : ""}
                  </div>
                  {ev.resumo && <div className="mt-0.5 text-xs text-muted-foreground">{ev.resumo}</div>}
                </div>
                <Status value={ev.status} />
                <Select value={ev.status} onValueChange={(v) => setStatus(ev, v as CalendarEventStatus)}>
                  <SelectTrigger className="w-[140px] rounded-full bg-background/70"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendada">Agendada</SelectItem>
                    <SelectItem value="confirmada">Confirmada</SelectItem>
                    <SelectItem value="realizada">Realizada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                    <SelectItem value="no_show">No-show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo horário na Agenda</DialogTitle>
            <DialogDescription>Mesma tool que Helena, SDR e Closer chamam ao fechar horário no WhatsApp.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Lead</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {db.contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Agente</Label>
              <Select value={agenteId} onValueChange={setAgenteId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="helena">Helena</SelectItem>
                  {db.agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} · {a.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data e hora</Label>
              <Input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Resumo</Label>
              <Input value={resumo} onChange={(e) => setResumo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createMeeting}>Gravar na Agenda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
