import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
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
import { EntityAvatar, PageHeader, StatCard, Status } from "@/components/app/kit";
import { currentUser, ownerName, useDB } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { fmtDate, fmtLocalDate, fmtLocalDateLong, fmtTime, toDatetimeLocalValue } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { CalendarEvent, CalendarEventStatus } from "@/lib/types";

export const Route = createFileRoute("/_app/ia/agenda")({
  head: () => pageHead("Agenda compartilhada", "Compromissos fechados pelos agentes de IA com leads no WhatsApp."),
  component: AgendaPage,
});

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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

  return (
    <div>
      <PageHeader
        eyebrow="Helena AI"
        title="Agenda compartilhada"
        description="Helena e todos os agentes de IA leem e gravam compromissos aqui. Quando o SDR ou o Closer fecha um horário no WhatsApp, a reunião entra automaticamente."
        actions={
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Agendar reunião
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Compromissos" value={stats.total} icon={<CalendarClock />} />
        <StatCard label="Nesta semana" value={stats.week} tone="helena" icon={<Clock />} />
        <StatCard label="Abertas" value={stats.confirmadas} tone="info" />
        <StatCard label="Realizadas" value={stats.realizadas} tone="success" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          <Button size="sm" variant={mode === "dia" ? "secondary" : "ghost"} onClick={() => setMode("dia")}>Dia</Button>
          <Button size="sm" variant={mode === "semana" ? "secondary" : "ghost"} onClick={() => setMode("semana")}>Semana</Button>
        </div>
        <Button size="icon" variant="outline" onClick={() => { followingTodayRef.current = false; setCursor(addDays(cursor, mode === "dia" ? -1 : -7)); }}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { followingTodayRef.current = true; setCursor(startOfDay(new Date())); }}>Hoje</Button>
        <Button size="icon" variant="outline" onClick={() => { followingTodayRef.current = false; setCursor(addDays(cursor, mode === "dia" ? 1 : 7)); }}>
          <ChevronRight className="size-4" />
        </Button>
        <div className="text-sm font-medium">
          {mode === "dia"
            ? fmtLocalDateLong(cursor)
            : `${fmtLocalDate(weekStart)} — ${fmtLocalDate(addDays(weekStart, 6))}`}
        </div>
        <div className="relative ml-auto min-w-[180px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Lead, agente, título…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
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

      <div className="mb-6 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="w-16 p-2 font-medium">Hora</th>
              {(mode === "dia" ? [cursor] : weekDays).map((day, i) => (
                <th key={day.toISOString()} className="p-2 font-medium">
                  {mode === "semana" ? WEEKDAYS[i] : "Compromissos"}
                  <span className="ml-1 font-mono text-[11px]">{`${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}/${day.getFullYear()}`}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour} className="border-b last:border-0">
                <td className="p-2 align-top font-mono text-xs text-muted-foreground">{String(hour).padStart(2, "0")}:00</td>
                {(mode === "dia" ? [cursor] : weekDays).map((day) => (
                  <td key={day.toISOString() + hour} className="min-w-[120px] border-l p-1 align-top">
                    {eventsAt(day, hour).map((ev) => {
                      const lead = db.contacts.find((c) => c.id === ev.leadId);
                      const agent = ownerName(db, ev.agenteId);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setStatus(ev, ev.status === "agendada" ? "confirmada" : ev.status === "confirmada" ? "realizada" : ev.status)}
                          className="mb-1 w-full rounded-md border border-helena/30 bg-helena/8 p-1.5 text-left hover:border-helena/60"
                        >
                          <div className="font-medium leading-tight">{fmtTime(ev.dataHora)} · {lead?.name ?? "Lead"}</div>
                          <div className="text-[11px] text-muted-foreground">{agent} · {ev.status}</div>
                        </button>
                      );
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Todos os compromissos</h2>
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
              <div key={ev.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                <EntityAvatar name={lead?.name ?? "Lead"} agent />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{ev.titulo}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(ev.dataHora)} {fmtTime(ev.dataHora)} · Lead: {lead?.name ?? ev.leadId} · Agente: {agent}
                    {agentRec?.role ? ` (${agentRec.role})` : ""}
                  </div>
                  {ev.resumo && <div className="mt-0.5 text-xs text-muted-foreground">{ev.resumo}</div>}
                </div>
                <Status value={ev.status} />
                <Select value={ev.status} onValueChange={(v) => setStatus(ev, v as CalendarEventStatus)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
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
            <DialogTitle>agendarReuniao</DialogTitle>
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
