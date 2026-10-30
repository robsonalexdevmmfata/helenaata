import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Moon, LogOut, Sparkles } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { allNavFor } from "@/components/app/nav";
import { currentUser } from "@/lib/store";
import { canUseDevTeam, isPlatformAdmin } from "@/lib/saas";
import { helenaUi, sendToHelena } from "@/lib/helena/orchestrator";
import { useDB } from "@/lib/store";
import { applyTheme, getTheme } from "@/lib/theme";
import { logout } from "@/lib/auth";

const EXAMPLES = [
  "Mostre os leads quentes.",
  "Quem precisa de follow-up hoje?",
  "Ative o comercial.",
  "Pause a campanha de ontem.",
  "Quantas vendas tivemos esta semana?",
  "Crie um SDR para clínicas.",
  "Passe os leads interessados para o closer.",
  "Me mostre conversas negativas.",
];

export function CommandPalette() {
  const ui = helenaUi.use();
  const db = useDB();
  const router = useRouter();
  const [q, setQ] = useState("");

  const close = () => {
    helenaUi.set({ paletteOpen: false });
    setQ("");
  };
  const ask = (text: string) => {
    close();
    helenaUi.set({ open: true });
    void sendToHelena(text);
  };
  const go = (to: string) => {
    close();
    router.history.push(to);
  };

  return (
    <CommandDialog open={ui.paletteOpen} onOpenChange={(o) => (o ? helenaUi.set({ paletteOpen: true }) : close())}>
      <CommandInput placeholder="Pergunte à Helena ou execute uma ação" value={q} onValueChange={setQ} />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        {q.trim() && (
          <CommandGroup heading="Helena">
            <CommandItem value={`__ask ${q}`} onSelect={() => ask(q)}>
              <Sparkles className="text-helena" />
              Perguntar à Helena: <span className="font-medium">“{q}”</span>
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Sugestões para a Helena">
          {EXAMPLES.map((e) => (
            <CommandItem key={e} value={e} onSelect={() => ask(e)}>
              <Sparkles className="text-helena" /> {e}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ir para">
          {allNavFor(isPlatformAdmin(currentUser(db)), canUseDevTeam(currentUser(db))).map((n) => (
            <CommandItem key={n.to as string} value={`ir ${n.label}`} onSelect={() => go(n.to as string)}>
              <n.icon /> {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Contatos">
          {db.contacts.slice(0, 40).map((c) => (
            <CommandItem key={c.id} value={`contato ${c.name} ${c.email}`} onSelect={() => go(`/crm/contatos/${c.id}`)}>
              <span className="size-5 rounded-full bg-muted text-center text-[10px] leading-5">{c.name[0]}</span> {c.name}
              <span className="ml-auto text-xs text-muted-foreground">{c.email}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Sistema">
          <CommandItem value="alternar tema escuro claro" onSelect={() => { applyTheme(getTheme() === "dark" ? "light" : "dark"); close(); }}>
            <Moon /> Alternar tema claro/escuro
          </CommandItem>
          <CommandItem value="sair logout" onSelect={() => { logout(); close(); router.history.push("/login"); }}>
            <LogOut /> Sair
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
