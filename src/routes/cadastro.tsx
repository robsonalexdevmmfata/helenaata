import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { HelenaAvatar } from "@/components/helena/HelenaAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startSession } from "@/lib/auth";
import { pageHead } from "@/lib/head";
import { caktoCheckoutUrl, registerCustomerWithServer } from "@/lib/saas";
import { provisionEvolutionInstance } from "@/lib/evolution/provision";
import {
  ActivateImpulsoButton,
  ActivateMaquinaButton,
} from "@/components/saas/ActivateMaquinaButton";
import type { User } from "@/lib/types";

export const Route = createFileRoute("/cadastro")({
  head: () =>
    pageHead(
      "Criar conta",
      "Trial de 2 dias. 30 leads/dia no freemium. 150 após assinar. Sem cartão agora.",
    ),
  validateSearch: (s: Record<string, unknown>): { plano?: "maquina" | "impulso" } =>
    s.plano === "maquina" || s.plano === "impulso" ? { plano: s.plano } : {},
  component: CadastroPage,
});

function CadastroPage() {
  const navigate = useNavigate();
  const { plano } = Route.useSearch();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<User | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await registerCustomerWithServer({ name, email, password, company });
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      await startSession(result.user);
      void provisionEvolutionInstance(result.user, { remote: false });
      if (plano === "impulso" || plano === "maquina") {
        window.location.assign(caktoCheckoutUrl(plano, { name, email }));
        return;
      }
      setCreated(result.user);
    } catch (registrationError) {
      setError(
        registrationError instanceof Error
          ? registrationError.message
          : "Não foi possível iniciar a sessão.",
      );
    }
    setLoading(false);
  };

  if (created) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#0b0a09] px-4 text-[#f4efe6]">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#141210] p-8">
          <HelenaAvatar className="size-12" />
          <div>
            <p className="text-[11px] tracking-[0.22em] text-[#f4efe6]/50">CONTA CRIADA</p>
            <h1 className="mt-2 font-serif text-3xl">
              Trial de 2 dias ligado, {created.name.split(" ")[0]}.
            </h1>
            <p className="mt-3 text-sm text-[#f4efe6]/65">
              O Time Comercial já funciona. O Time Dev (site + cardápio com link público) só entra
              no <strong>plano Máquina</strong>. Quando o trial acabar, a conta trava até assinar
              Impulso ou Máquina.
            </p>
          </div>
          <ActivateMaquinaButton
            user={created}
            className="w-full bg-[#e07a3d] text-[#1c1410] hover:bg-[#c96a32]"
          />
          <ActivateImpulsoButton
            user={created}
            className="w-full border-white/20 bg-transparent text-[#f4efe6] hover:bg-white/10"
          />
          <Button
            variant="ghost"
            className="w-full text-[#f4efe6]/70"
            onClick={() => navigate({ to: "/comecar" })}
          >
            Ligar WhatsApp agora (5 min)
          </Button>
          <Button
            variant="ghost"
            className="w-full text-[#f4efe6]/50"
            onClick={() => navigate({ to: "/visao-geral" })}
          >
            Continuar no trial (sem chip)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[100dvh] bg-[#0b0a09] text-[#f4efe6] lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-2">
          <HelenaAvatar className="size-10" />
          <span className="text-[11px] tracking-[0.22em]">HELENA AI</span>
        </div>
        <div>
          <p className="font-serif text-5xl leading-tight">
            Dois dias para ver a máquina trabalhar.
          </p>
          <p className="mt-4 max-w-md text-sm text-[#f4efe6]/65">
            Freemium: 30 leads/dia. Depois de assinar Impulso ou Máquina: até 150/dia. Time Dev não
            aumenta cota até o Cakto confirmar. O timer começa na hora do cadastro. Depois de 2
            dias, a conta só segue com um plano.
          </p>
        </div>
        <p className="text-xs text-[#f4efe6]/40">
          {plano
            ? "Conta primeiro. Em seguida o checkout Cakto, com nome e e-mail já preenchidos."
            : "Cakto entra na hora de assinar. O trial não pede cartão."}
        </p>
      </div>
      <div className="flex items-center justify-center bg-[#f7f3ec] p-4 py-8 text-foreground sm:p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Criar sua conta</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {plano === "maquina"
                ? "Cadastro e, em seguida, checkout do plano Máquina."
                : plano === "impulso"
                  ? "Cadastro e, em seguida, checkout do Impulso (2 dias grátis na Cakto)."
                  : "Trial de 2 dias a partir de agora. Depois, plano ou orçamento."}
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Seu nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ana Souza"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instituição</Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
                placeholder="Nome da sua empresa ou agência"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="ana@estudio.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button
            type="submit"
            className="w-full bg-[#e07a3d] text-[#1c1410] hover:bg-[#c96a32]"
            disabled={loading}
          >
            {loading ? "Criando…" : plano ? "Criar conta e ir ao checkout" : "Começar trial"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="text-foreground underline">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
