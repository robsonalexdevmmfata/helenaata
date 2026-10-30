import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginWithServer } from "@/lib/auth";
import { pageHead } from "@/lib/head";
import { HelenaAvatar } from "@/components/helena/HelenaAvatar";

export const Route = createFileRoute("/login")({
  head: () => pageHead("Entrar", "Acesse o HELENA AI, o sistema operacional empresarial com IA."),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (await loginWithServer(username, password)) {
      navigate({ to: "/visao-geral" });
    } else {
      setError("Usuário ou senha inválidos.");
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r bg-surface p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <HelenaAvatar className="size-9" />
          <span className="text-sm font-semibold tracking-[0.18em]">HELENA AI</span>
        </div>
        <div className="max-w-lg">
          <p className="font-serif text-5xl leading-[1.05] text-foreground">
            “Boa noite. Encontrei o time Comercial com 3 agentes disponíveis. Deseja que eu execute?”
          </p>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
            O sistema operacional da sua empresa. CRM, atendimento, prospecção e agentes de IA
            coordenados por uma assistente executiva que planeja, pede autorização e executa.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 text-xs text-muted-foreground">
          <div>
            <div className="font-mono text-lg text-foreground">10</div>agentes especialistas
          </div>
          <div>
            <div className="font-mono text-lg text-foreground">24</div>ferramentas auditadas
          </div>
          <div>
            <div className="font-mono text-lg text-foreground">100%</div>ações registradas
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <HelenaAvatar className="size-9 lg:hidden" />
            <h1 className="text-2xl font-semibold tracking-tight">Entrar na sua organização</h1>
            <p className="text-sm text-muted-foreground">Use suas credenciais para acessar o HELENA AI.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuário</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="username" className="pl-9" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type="password" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••" />
              </div>
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"} <ArrowRight />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Não tem conta? <Link to="/cadastro" className="text-foreground underline">Criar conta</Link>
            {" · "}
            <Link to="/" className="text-foreground underline">Landing</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
