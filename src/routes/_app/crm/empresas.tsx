import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Globe, MapPin, Plus, Search, Users } from "lucide-react";
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
import { PageHeader } from "@/components/app/kit";
import { currentUser, ownerName, uid, update, useDB } from "@/lib/store";
import { fmtDate } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Company } from "@/lib/types";

export const Route = createFileRoute("/_app/crm/empresas")({
  head: () => pageHead("Empresas", "Empresas e contas cadastradas no CRM."),
  component: CompaniesPage,
});

function CompaniesPage() {
  const db = useDB();
  const user = currentUser(db);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // New Company form
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [size, setSize] = useState("");
  const [website, setWebsite] = useState("");

  const companies = db.companies.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.segment.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome da empresa é obrigatório.");
      return;
    }

    const id = uid("c_");
    const newComp: Company = {
      id,
      organizationId: db.organization.id,
      name: name.trim(),
      segment: segment.trim() || "Geral",
      city: city.trim() || "São Paulo, SP",
      size: size.trim() || "1–10",
      website: website.trim() || "",
      ownerId: user.id,
      createdAt: new Date().toISOString(),
    };

    update((d) => {
      d.companies.unshift(newComp);
    });

    toast.success(`Empresa ${name} cadastrada com sucesso!`);
    setCreateOpen(false);
    setName("");
    setSegment("");
    setCity("");
    setSize("");
    setWebsite("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas & Contas"
        description="Gestão de empresas clientes, contas em prospecção e parceiros B2B."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" /> Nova Empresa
          </Button>
        }
      />

      {/* Filter and Search */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, segmento, cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Grid of Companies */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((comp) => {
          const contactCount = db.contacts.filter((ct) => ct.companyId === comp.id).length;
          const dealsCount = db.deals.filter((d) => d.companyId === comp.id).length;
          const owner = ownerName(db, comp.ownerId);

          return (
            <div
              key={comp.id}
              className="rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-helena/40 hover:shadow-md space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-base text-foreground line-clamp-1">{comp.name}</h3>
                  <div className="text-xs text-muted-foreground">{comp.segment}</div>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                  {comp.size} func.
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">{comp.city}</span>
                </div>
                {comp.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="size-3.5 shrink-0" />
                    <a
                      href={`https://${comp.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-primary hover:underline"
                    >
                      {comp.website}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="size-3.5 shrink-0" />
                  <span>
                    {contactCount} contato(s) · {dealsCount} oportunidade(s)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
                <span>Resp: {owner}</span>
                <span>Desde {fmtDate(comp.createdAt)}</span>
              </div>
            </div>
          );
        })}

        {companies.length === 0 && (
          <div className="col-span-full space-y-3 py-12 text-center text-sm text-muted-foreground">
            {db.companies.length === 0 ? (
              <>
                <p>Ainda não há empresas reais. Importe pelo Maps ou cadastre uma conta.</p>
                <Button asChild>
                  <Link to="/prospeccao/buscar">Caçar leads</Link>
                </Button>
              </>
            ) : (
              "Nenhuma empresa encontrada."
            )}
          </div>
        )}
      </div>

      {/* Modal Nova Empresa */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Nova Empresa / Conta</DialogTitle>
              <DialogDescription>
                Cadastre uma organização no CRM para vincular contatos e oportunidades.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="company-name">Nome da Empresa *</Label>
                <Input
                  id="company-name"
                  placeholder="Ex: Info Tech Soluções Digitais"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="company-segment">Segmento</Label>
                  <Input
                    id="company-segment"
                    placeholder="Ex: Tecnologia, Odontologia"
                    value={segment}
                    onChange={(e) => setSegment(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-city">Cidade / UF</Label>
                  <Input
                    id="company-city"
                    placeholder="Ex: São Paulo, SP"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="company-size">Porte (funcionários)</Label>
                  <Input
                    id="company-size"
                    placeholder="Ex: 11–50"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-website">Website</Label>
                  <Input
                    id="company-website"
                    placeholder="empresa.com.br"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Cadastrar Empresa</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
