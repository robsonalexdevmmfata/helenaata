import { createFileRoute, Link, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, LogOut, Moon, RotateCcw, Search, Sun } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EntityAvatar } from "@/components/app/kit";
import { NAV_BOTTOM, NAV_MIDDLE, NAV_TOP, allNavFor, integrationNavFor, navGroupsFor, settingsNavFor, type NavItem } from "@/components/app/nav";
import { HelenaPanel } from "@/components/helena/HelenaPanel";
import { CommandPalette } from "@/components/helena/CommandPalette";
import { ApprovalBlock } from "@/components/helena/HelenaCards";
import { HelenaOrb } from "@/components/helena/HelenaOrb";
import { isAuthenticated, logout, syncSessionUser } from "@/lib/auth";
import { currentUser, getDB, resetDB, update, useDB } from "@/lib/store";
import { caktoCheckoutUrl, canUseDevTeam, dailyLimitFor, formatTrialLabel, isPlatformAdmin, mustSubscribe, prospectsUsedToday, syncPaidPlanFromCakto, workspaceDisplayName } from "@/lib/saas";
import { provisionEvolutionInstance } from "@/lib/evolution/provision";
import { helenaUi } from "@/lib/helena/orchestrator";
import { tickOperations, tickRpaJobs, tickSalesFlow } from "@/lib/helena/engine";
import { startEvolutionInboxPoller } from "@/lib/evolution/inboxPoller";
import { applyTheme, getTheme } from "@/lib/theme";
import { ROLE_LABEL } from "@/lib/helena/registry";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: ({ location }) => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
    syncSessionUser();
    const db = getDB();
    const user = currentUser(db);
    const onPlanos = location.pathname.startsWith("/planos");
    if (user && mustSubscribe(user) && !onPlanos) {
      throw redirect({ to: "/planos" });
    }
  },
  component: AppLayout,
});

function NavLinks({ items }: { items: NavItem[] }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map((i) => (
        <SidebarMenuItem key={i.to as string}>
          <SidebarMenuButton asChild isActive={path.startsWith(i.to as string)} tooltip={i.label}>
            <a href={i.to as string} onClick={(e) => {
              e.preventDefault();
              if (isMobile) setOpenMobile(false);
              router.history.push(i.to as string);
            }}>
              <i.icon /> <span>{i.label}</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function AppSidebar() {
  const db = useDB();
  const user = currentUser(db);
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <HelenaOrb className="size-6" />
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-xs font-semibold tracking-[0.18em]">HELENA AI</div>
            <div className="text-[11px] text-muted-foreground">{workspaceDisplayName(user, db.organization.name)}</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup><NavLinks items={NAV_TOP} /></SidebarGroup>
        {navGroupsFor(isPlatformAdmin(user), canUseDevTeam(user)).map((g) => (
          <SidebarGroup key={g.label}><SidebarGroupLabel>{g.label}</SidebarGroupLabel><NavLinks items={g.items} /></SidebarGroup>
        ))}
        <SidebarGroup><NavLinks items={NAV_MIDDLE} /></SidebarGroup>
        {integrationNavFor(isPlatformAdmin(user)).map((g) => (
          <SidebarGroup key={g.label}><SidebarGroupLabel>{g.label}</SidebarGroupLabel><NavLinks items={g.items} /></SidebarGroup>
        ))}
        <SidebarGroup><NavLinks items={NAV_BOTTOM} /></SidebarGroup>
        <SidebarGroup><SidebarGroupLabel>{settingsNavFor(isPlatformAdmin(user)).label}</SidebarGroupLabel><NavLinks items={settingsNavFor(isPlatformAdmin(user)).items} /></SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <EntityAvatar name={user.name} color={user.color} size="sm" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-xs font-medium">{user.name}</div>
            <div className="text-[11px] text-muted-foreground">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Topbar() {
  const db = useDB();
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const user = currentUser(db);
  const current = allNavFor(isPlatformAdmin(user), canUseDevTeam(user)).find((n) => path.startsWith(n.to as string));
  useEffect(() => {
    helenaUi.set({ screenPath: path, screenLabel: current?.label ?? path });
  }, [path, current?.label]);
  const pending = db.approvals.filter((a) => a.status === "pendente");
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-4">
      <SidebarTrigger />
      <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{current?.label ?? "HELENA AI"}</div>
      <button type="button" onClick={() => helenaUi.set({ paletteOpen: true, open: true })} className="inline-flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground lg:hidden" aria-label="Abrir Helena">
        <Search className="size-4" />
      </button>
      <button type="button" onClick={() => helenaUi.set({ paletteOpen: true })} className="ml-auto hidden w-72 max-w-[40vw] items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:border-foreground/20 lg:flex xl:w-80">
        <Search className="size-4" /> Pergunte à Helena ou pesquise…
        <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Aprovações">
            <Bell />
            {pending.length > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-helena" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] max-h-[70vh] space-y-3 overflow-y-auto">
          <div className="text-sm font-semibold">Aprovações pendentes ({pending.length})</div>
          {pending.length === 0 && <div className="text-xs text-muted-foreground">Nada aguardando você.</div>}
          {pending.map((a) => <div key={a.id} className="rounded-lg border p-3"><ApprovalBlock approvalId={a.id} /></div>)}
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" aria-label="Alternar tema" onClick={() => applyTheme(getTheme() === "dark" ? "light" : "dark")}>
        <Sun className="dark:hidden" /><Moon className="hidden dark:block" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-1 sm:px-2"><EntityAvatar name={user.name} color={user.color} size="sm" /><ChevronDown className="hidden size-3 sm:block" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5 text-xs"><div className="font-medium">{user.name}</div><div className="text-muted-foreground">{user.email}</div></div>
          <DropdownMenuSeparator />
          {isPlatformAdmin(user) && (
            <DropdownMenuItem onClick={() => { resetDB(); toast.success("Base local reiniciada (métricas zeradas)"); }}><RotateCcw /> Reiniciar base local</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => { logout(); router.history.push("/login"); }}><LogOut /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function TrialStrip() {
  const db = useDB();
  const user = currentUser(db);
  const router = useRouter();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (isPlatformAdmin(user) || mustSubscribe(user)) return null;
  const label = formatTrialLabel(user);
  if (!label) return null;
  const trial = user.planId === "trial" || !user.planId;
  const limit = dailyLimitFor(user);
  const used = prospectsUsedToday(user);
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={() => router.history.push("/planos")}
        className="text-left text-xs text-foreground"
      >
        {label}
        {` · ${used}/${limit} leads hoje`}
        {trial ? " (freemium 150/dia · 2 dias). Time Dev no Máquina após o Cakto." : " · Impulso 150/dia · Máquina 1000/dia"}
      </button>
      {trial && (
        <a
          href={caktoCheckoutUrl("maquina", { name: user.name, email: user.email, phone: user.phone })}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-helena px-3 text-xs font-medium text-helena-foreground"
        >
          Ativar plano Máquina
        </a>
      )}
    </div>
  );
}

function AppLayout() {
  const router = useRouter();
  useEffect(() => {
    const me = currentUser(getDB());
    void syncPaidPlanFromCakto(me);
    if (me) {
      if (mustSubscribe(me)) {
        update((d) => {
          d.connections.forEach((c) => {
            if (c.status === "online") c.status = "offline";
          });
        });
      } else if (me.evolutionInstance) {
        // Só reforça o nome local; create/QR fica em /comecar e Integrações → WhatsApp.
        void provisionEvolutionInstance(me, { remote: false });
      }
    }
    const paywall = window.setInterval(() => {
      const user = currentUser(getDB());
      if (user && mustSubscribe(user) && !window.location.pathname.startsWith("/planos")) {
        router.history.push("/planos");
      }
    }, 1000);
    const id = setInterval(() => { tickOperations(); tickSalesFlow(); tickRpaJobs(); }, 3000);
    const stopPoll = startEvolutionInboxPoller(10000);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        helenaUi.set({ paletteOpen: !helenaUi.get().paletteOpen });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(paywall);
      clearInterval(id);
      stopPoll();
      window.removeEventListener("keydown", onKey);
    };
  }, [router]);
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar />
        <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:px-8 lg:pb-8">
          <TrialStrip />
          <Outlet />
        </main>
      </SidebarInset>
      <HelenaPanel />
      <CommandPalette />
    </SidebarProvider>
  );
}

export { Link };
