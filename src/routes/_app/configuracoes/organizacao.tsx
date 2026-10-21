import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Check, Clock, Globe, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/kit";
import { update, useDB } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes/organizacao")({
  head: () => pageHead("Organização", "Configurações da empresa e dados cadastrais."),
  component: OrganizationPage,
});

function OrganizationPage() {
  const db = useDB();
  const org = db.organization;

  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [industry, setIndustry] = useState(org.industry);
  const [document, setDocument] = useState(org.document);
  const [timezone, setTimezone] = useState(org.timezone);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome da organização não pode ser vazio.");
      return;
    }

    update((d) => {
      d.organization.name = name.trim();
      d.organization.slug = slug.trim();
      d.organization.industry = industry.trim();
      d.organization.document = document.trim();
      d.organization.timezone = timezone.trim();
    });

    toast.success("Dados da organização atualizados com sucesso!");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Configurações da Organização"
        description="Gerencie os dados cadastrais da sua empresa, identificador multi-tenant e configurações gerais."
      />

      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border bg-card p-6 space-y-6">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="rounded-lg border bg-muted p-2.5">
              <Building2 className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Perfil da Empresa</h2>
              <p className="text-xs text-muted-foreground">
                Estes dados são compartilhados entre os agentes de IA e toda a equipe.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="org-name">Nome da Empresa / Agência</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Info Tech Ltda"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-slug">Identificador / Slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="info-tech"
              />
              <p className="text-[11px] text-muted-foreground">Usado em links e rotas multi-empresa.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-doc">CNPJ / Documento</Label>
              <Input
                id="org-doc"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-industry">Segmento de Atuação</Label>
              <Input
                id="org-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Ex: Agência de Marketing, Software B2B"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-tz">Fuso Horário Padrão</Label>
              <Input
                id="org-tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="America/Sao_Paulo"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" className="gap-2">
              <Check className="size-4" /> Salvar Alterações
            </Button>
          </div>
        </div>

        {/* Subscription & Database Info Card */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-5 text-success" />
              <div>
                <h3 className="text-sm font-semibold">Plano & Isolamento Multi-Tenant</h3>
                <p className="text-xs text-muted-foreground">
                  Identificador de Organização no Banco:{" "}
                  <code className="font-mono text-foreground font-semibold">{org.id}</code>
                </p>
              </div>
            </div>
            <span className="rounded-full bg-primary/10 text-primary border border-primary/25 px-3 py-1 text-xs font-semibold">
              Plano {org.plan}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Todos os registros do CRM, agentes e conversas são estritamente isolados pelo{" "}
            <code className="font-mono">organization_id</code> no PostgreSQL. Nenhum dado é compartilhado
            entre diferentes clientes.
          </p>
        </div>
      </form>
    </div>
  );
}
