import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "@/lib/format";

const HELENA = "oklch(0.62 0.13 52)";
const MUTED = "oklch(0.55 0.02 260)";

type WeekPoint = { label: string; msgs: number; diagnoses: number; meetings: number; value: number };

export function WeekActivityChart({ data }: { data: WeekPoint[] }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="helenaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HELENA} stopOpacity={0.35} />
              <stop offset="100%" stopColor={HELENA} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
            formatter={(v: number, name: string) => [v, name === "msgs" ? "WhatsApp" : name === "diagnoses" ? "Diagnósticos" : "Reuniões"]}
          />
          <Area type="monotone" dataKey="msgs" stroke={HELENA} fill="url(#helenaFill)" strokeWidth={2} name="msgs" />
          <Area type="monotone" dataKey="diagnoses" stroke="hsl(var(--chart-2))" fill="transparent" strokeWidth={2} name="diagnoses" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelBars({
  rows,
}: {
  rows: { name: string; count: number; value: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const colors = ["#e07a3d", "#c9a227", "#2dd4bf", "#3b82f6", "#8b5cf6", "#22c55e", "#64748b"];
  if (rows.every((r) => r.count === 0)) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
        Funil vazio — as barras aparecem quando existir oportunidade no CRM.
      </div>
    );
  }
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={92} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
            formatter={(v: number, _n, item) => {
              const row = item?.payload as { value: number; count: number };
              return [`${v} · ${brl(row.value)}`, "Oportunidades"];
            }}
          />
          <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={16}>
            {rows.map((r, i) => (
              <Cell key={r.name} fill={colors[i % colors.length]} fillOpacity={0.45 + (r.count / max) * 0.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE = ["#e07a3d", "#2dd4bf", "#3b82f6", "#c9a227", "#8b5cf6", "#64748b"];

export function GlowPie({
  data,
  empty,
}: {
  data: { name: string; value: number }[];
  empty?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
        {empty || "Sem dados reais neste recorte."}
      </div>
    );
  }
  const slices = data.filter((d) => d.value > 0);
  return (
    <div className="flex h-[220px] items-center gap-4">
      <div className="relative mx-auto aspect-square h-full max-w-[220px] flex-1">
        <div className="pointer-events-none absolute inset-[22%] rounded-full bg-helena/25 blur-2xl" />
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={4}
              stroke="transparent"
            >
              {slices.map((d, i) => (
                <Cell key={d.name} fill={PIE[i % PIE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "oklch(0.18 0.03 260)", border: "1px solid oklch(0.38 0.08 52)", borderRadius: 12, fontSize: 12, color: "white" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold tabular">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">total</span>
        </div>
      </div>
      <ul className="space-y-2 pr-1 text-[11px]">
        {slices.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 whitespace-nowrap">
            <span className="size-2.5 rounded-full" style={{ background: PIE[i % PIE.length], boxShadow: `0 0 10px ${PIE[i % PIE.length]}` }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-mono tabular">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CycleStrip({
  cycle,
}: {
  cycle: { encontrados: number; diagnosticados: number; preview: number; links: number; respostas: number; reunioes: number };
}) {
  const steps = [
    ["Encontrados", cycle.encontrados],
    ["Diagnosticados", cycle.diagnosticados],
    ["Prévias", cycle.preview],
    ["Links", cycle.links],
    ["Respostas", cycle.respostas],
    ["Reuniões", cycle.reunioes],
  ] as const;
  const max = Math.max(...steps.map((s) => s[1]), 1);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {steps.map(([label, n]) => (
        <div key={label} className="rounded-xl border border-border/80 bg-card p-3">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular">{n}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-helena" style={{ width: `${Math.round((n / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
