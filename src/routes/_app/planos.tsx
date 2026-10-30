import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/kit";
import { pageHead } from "@/lib/head";
import { currentUser, useDB } from "@/lib/store";
import {
  assignPlan, caktoCheckoutUrl, CAKTO_NOTE, formatTrialLabel, isPlatformAdmin, mustSubscribe, SAAS_PLANS, submitWhiteLabelQuote,
} from "@/lib/saas";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/planos")({
  head: () => pageHead("Planos", "Impulso, Máquina e White-label. Cakto na sequência."),
  component: PlanosPage,
});

function PlanosPage() {
  const db = useDB();
  const user = currentUser(db);
  const blocked = mustSubscribe(user);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [company, setCompany] = useState(user.companyName || "");
  const [message, setMessage] = useState("Quero a Helena white-label na minha operação.");

  const simulate = (planId: "impulso" | "maquina") => {
    assignPlan(user.id, planId);
    toast.success(`Homologação: plano ${planId} liberado. Cakto entra depois.`);
  };

  const sendQuote = () => {
    submitWhiteLabelQuote({ name: user.name, email: user.email, company, message });
    toast.success("Orçamento enviado. O time Info Tech responde por e-mail.");
    setQuoteOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SaaS"
        title={blocked ? "Seu trial acabou. Escolha como continuar." : "Planos"}
        description={blocked
          ? "A máquina parou de prospectar até haver um plano. Impulso tem 2 dias de freemium na Cakto; Máquina cobra na hora. White-label é orçamento."
          : `${formatTrialLabel(user)}. ${CAKTO_NOTE}`}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {SAAS_PLANS.map((p) => (
          <div key={p.id} className={`flex flex-col rounded-xl border p-5 ${p.highlight ? "border-primary bg-primary/5" : "bg-card"}`}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{p.name}</div>
            <div className="mt-1 font-serif text-3xl">{p.priceLabel}</div>
            <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
            <ul className="mt-4 flex-1 space-y-1.5 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{f}</li>
              ))}
            </ul>
            {p.quote ? (
              <Button className="mt-5" variant="outline" onClick={() => setQuoteOpen(true)}>Solicite um orçamento</Button>
            ) : (
              <div className="mt-5 space-y-2">
                <Button className="w-full" asChild>
                  <a href={caktoCheckoutUrl(p.id as "impulso" | "maquina", { name: user.name, email: user.email, phone: user.phone })}>
                    {p.id === "impulso" ? "Assinar Impulso (2 dias grátis)" : "Assinar no Cakto"}
                  </a>
                </Button>
                {isPlatformAdmin(user) && (
                  <Button className="w-full" variant="ghost" size="sm" onClick={() => simulate(p.id as "impulso" | "maquina")}>
                    Simular pagamento (homologação)
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {quoteOpen && (
        <div className="max-w-lg space-y-3 rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" /> Orçamento white-label</div>
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>O que você precisa</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
          </div>
          <div className="flex gap-2">
            <Button onClick={sendQuote}>Enviar pedido</Button>
            <Button variant="ghost" onClick={() => setQuoteOpen(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {isPlatformAdmin(user) && (
        <p className="text-xs text-muted-foreground">Você é admin da plataforma — estes planos valem para as contas em Configurações → Usuários.</p>
      )}
    </div>
  );
}
