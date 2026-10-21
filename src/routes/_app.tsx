import { createFileRoute, Link, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Bell, ChevronDown, LogOut, Moon, RotateCcw, Search, Sun } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EntityAvatar } from "@/components/app/kit";
import { ALL_NAV, NAV_BOTTOM, NAV_GROUPS, NAV_GROUPS_2, NAV_MIDDLE, NAV_SETTINGS, NAV_TOP, type NavItem } from "@/components/app/nav";
import { HelenaFab, HelenaPanel } from "@/components/helena/HelenaPanel";
import { CommandPalette } from "@/components/helena/CommandPalette";
import { ApprovalBlock } from "@/components/helena/HelenaCards";
import { HelenaOrb } from "@/components/helena/HelenaOrb";
import { isAuthenticated, logout } from "@/lib/auth";
import { currentUser, resetDB, useDB } from "@/lib/store";
import { helenaUi } from "@/lib/helena/orchestrator";
import { tickOperations } from "@/lib/helena/engine";
import { applyTheme, getTheme } from "@/lib/theme";
import { ROLE_LABEL } from "@/lib/helena/registry";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function NavLinks({ items }: { items: NavItem[] }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <SidebarMenu>
      {items.map((i) => (
        <SidebarMenuItem key={i.to as string}>
          <SidebarMenuButton asChild isActive={path.startsWith(i.to as string)} tooltip={i.label}>
            <a href={i.to as string} onClick={(e) => { e.preventDefault(); window.history.pushState({}, "", i.to as string); window.dispatchEvent(new PopStateEvent("popstate")); }}>
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
            <div className="text-[11px] text-muted-foreground">{db.organization.name}</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup><NavLinks items={NAV_TOP} /></SidebarGroup>
        {NAV_GROUPS.map((g) => (
          <SidebarGroup key={g.label}><SidebarGroupLabel>{g.label}</SidebarGroupLabel><NavLinks items={g.items} /></SidebarGroup>
        ))}
        <SidebarGroup><NavLinks items={NAV_MIDDLE} /></SidebarGroup>
        {NAV_GROUPS_2.map((g) => (
          <SidebarGroup key={g.label}><SidebarGroupLabel>{g.label}</SidebarGroupLabel><NavLinks items={g.items} /></SidebarGroup>
        ))}
        <SidebarGroup><NavLinks items={NAV_BOTTOM} /></SidebarGroup>
        <SidebarGroup><SidebarGroupLabel>{NAV_SETTINGS.label}</SidebarGroupLabel><NavLinks items={NAV_SETTINGS.items} /></SidebarGroup>
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
  const current = ALL_NAV.find((n) => path.startsWith(n.to as string));
  const pending = db.approvals.filter((a) => a.status === "pendente");
  const user = currentUser(db);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger />
      <div className="text-sm text-muted-foreground">{current?.label ?? "HELENA AI"}</div>
      <button type="button" onClick={() => helenaUi.set({ paletteOpen: true })} className="ml-auto hidden w-80 items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:border-foreground/20 md:flex">
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
        <PopoverContent align="end" className="w-96 space-y-3">
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
          <Button variant="ghost" className="gap-2 px-2"><EntityAvatar name={user.name} color={user.color} size="sm" /><ChevronDown className="size-3" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5 text-xs"><div className="font-medium">{user.name}</div><div className="text-muted-foreground">{user.email}</div></div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { resetDB(); toast.success("Dados de demonstração restaurados"); }}><RotateCcw /> Restaurar dados de demonstração</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { logout(); router.history.push("/login"); }}><LogOut /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function AppLayout() {
  useEffect(() => {
    const id = setInterval(tickOperations, 3000);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        helenaUi.set({ paletteOpen: !helenaUi.get().paletteOpen });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(id); window.removeEventListener("keydown", onKey); };
  }, []);
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </SidebarInset>
      <HelenaFab />
      <HelenaPanel />
      <CommandPalette />
    </SidebarProvider>
  );
}

export { Link };
