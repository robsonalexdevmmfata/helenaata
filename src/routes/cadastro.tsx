import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { HelenaAvatar } from "@/components/helena/HelenaAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startSession } from "@/lib/auth";
import { pageHead } from "@/lib/head";
import { registerCustomer } from "@/lib/saas";

export const Route = createFileRoute("/cadastro")({
  head: () => pageHead("Criar conta", "Trial de 2 dias. 30 abordagens por dia. Sem cartão agora."),
  component: CadastroPage,
});

function CadastroPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = registerCustomer({ name, email, password, company });
    if (!res.ok || !res.userId) {
      setError(res.message);
      setLoading(false);
      return;
    }
    startSession(res.userId);
    navigate({ to: "/visao-geral" });
  };

  return (
    <div className="grid min-h-screen bg-[#0b0a09] text-[#f4efe6] lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-2">
          <HelenaAvatar className="size-10" />
          <span className="text-[11px] tracking-[0.22em]">HELENA AI</span>
        </div>
        <div>
          <p className="font-serif text-5xl leading-tight">Dois dias para ver a máquina trabalhar.</p>
          <p className="mt-4 max-w-md text-sm text-[#f4efe6]/65">
            30 prospecções por dia. Site e cardápio gerados. Link no WhatsApp do dono.
            Quando o trial acabar, você escolhe Impulso, Máquina ou pede orçamento white-label.
          </p>
        </div>
        <p className="text-xs text-[#f4efe6]/40">Cakto entra na hora de assinar. O trial não pede cartão.</p>
      </div>
      <div className="flex items-center justify-center bg-[#f7f3ec] p-6 text-foreground">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Criar sua conta</h1>
            <p className="mt-1 text-sm text-muted-foreground">Trial de 2 dias. Depois, plano ou orçamento.</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Seu nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ana Souza" />
            </div>
            <div className="space-y-1.5">
              <Label>Instituição</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="Nome da sua empresa ou agência" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="ana@estudio.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" className="w-full bg-[#e07a3d] text-[#1c1410] hover:bg-[#c96a32]" disabled={loading}>
            {loading ? "Criando…" : "Começar trial"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Já tem conta? <Link to="/login" className="text-foreground underline">Entrar</Link>
            {" · "}conta de teste: <span className="font-mono">demo</span> / <span className="font-mono">123456</span>
          </p>
        </form>
      </div>
    </div>
  );
}
