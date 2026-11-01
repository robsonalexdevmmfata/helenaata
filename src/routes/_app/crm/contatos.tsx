import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Tag,
  User,
  UserCheck,
} from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityAvatar, PageHeader, Status, StatusBadge } from "@/components/app/kit";
import { currentUser, getDB, ownerName, uid, update, useDB } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { fmtDate, fmtTime } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Contact, LeadSource } from "@/lib/types";

export const Route = createFileRoute("/_app/crm/contatos")({
  head: () => pageHead("Contatos & Leads", "Base de contatos, qualificação e histórico."),
  component: ContactsPage,
});

function ContactsPage() {
  const db = useDB();
  const user = currentUser(db);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // New Contact Form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [source, setSource] = useState<LeadSource>("Site");
  const [tags, setTags] = useState("");

  // Timeline note state
  const [noteText, setNoteText] = useState("");

  const contacts = db.contacts.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchEmail = c.email.toLowerCase().includes(q);
      const matchPhone = c.phone.includes(q);
      const company = db.companies.find((co) => co.id === c.companyId);
      const matchCompany = company?.name.toLowerCase().includes(q);
      const matchTag = c.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchEmail && !matchPhone && !matchCompany && !matchTag) {
        return false;
      }
    }
    return true;
  });

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome do contato é obrigatório.");
      return;
    }

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const res = runTool(
      "crm.create_contact",
      {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        title: title.trim() || undefined,
        companyId: companyId || undefined,
        source,
        tags: tagList,
        ownerId: user.id,
        consent: true,
      },
      { actor: user.name, actorType: "user", requestedBy: user.name },
    );

    if (res.ok) {
      toast.success(res.message);
      setCreateOpen(false);
      setName("");
      setEmail("");
      setPhone("");
      setTitle("");
      setCompanyId("");
      setTags("");
    } else {
      toast.error(res.message);
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !noteText.trim()) return;

    update((d) => {
      d.activities.unshift({
        id: uid("ac_"),
        organizationId: d.organization.id,
        contactId: selectedContact.id,
        type: "nota",
        text: noteText.trim(),
        actor: user.name,
        createdAt: new Date().toISOString(),
      });
    });

    toast.success("Nota adicionada ao histórico");
    setNoteText("");
  };

  const contactActivities = selectedContact
    ? db.activities.filter((a) => a.contactId === selectedContact.id)
    : [];

  const contactDeals = selectedContact
    ? db.deals.filter((d) => d.contactId === selectedContact.id)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contatos & Leads"
        description="Base de contatos unificada com timeline de interações, tags e qualificação."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" /> Novo Contato
          </Button>
        }
      />

      {/* Stats Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total de Contatos</div>
          <div className="mt-1 font-mono text-2xl font-bold">{db.contacts.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">na base da organização</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Leads em Qualificação</div>
          <div className="mt-1 font-mono text-2xl font-bold text-info">
            {db.contacts.filter((c) => c.status === "lead").length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">aguardando fechamento</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Clientes Ativos</div>
          <div className="mt-1 font-mono text-2xl font-bold text-success">
            {db.contacts.filter((c) => c.status === "cliente").length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">convertidos</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Leads com Score Alto</div>
          <div className="mt-1 font-mono text-2xl font-bold">
            {db.contacts.filter((c) => c.score >= 70).length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">score superior a 70%</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email, telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="lead">Leads</SelectItem>
              <SelectItem value="cliente">Clientes</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="Facebook Ads">Facebook Ads</SelectItem>
              <SelectItem value="Google Ads">Google Ads</SelectItem>
              <SelectItem value="Indicação">Indicação</SelectItem>
              <SelectItem value="Site">Site</SelectItem>
              <SelectItem value="Prospecção">Prospecção</SelectItem>
              <SelectItem value="Instagram">Instagram</SelectItem>
              <SelectItem value="Evento">Evento</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 font-medium">Empresa & Cargo</th>
                <th className="px-4 py-3 font-medium">Contatos</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Responsável</th>
                <th className="px-4 py-3 font-medium">Último contato</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((contact) => {
                const company = contact.companyId
                  ? db.companies.find((co) => co.id === contact.companyId)
                  : undefined;
                const owner = ownerName(db, contact.ownerId);

                return (
                  <tr
                    key={contact.id}
                    onClick={() => {
                      setSelectedContact(contact);
                      runTool("lgpd.log_access", { contactId: contact.id }, { actor: user.name, actorType: "user", requestedBy: user.name });
                    }}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <EntityAvatar name={contact.name} size="sm" />
                        <div>
                          <div className="font-medium text-foreground">{contact.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            Score: {contact.score}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-foreground">{company?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{contact.title || "—"}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-xs text-foreground font-mono">{contact.phone || "—"}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {contact.email || "—"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{contact.source}</span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <Status value={contact.status} />
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <EntityAvatar name={owner} size="sm" className="size-4 text-[9px]" />
                        <span>{owner}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {fmtDate(contact.lastContactAt)}
                    </td>
                  </tr>
                );
              })}

              {contacts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {db.contacts.length === 0 ? (
                      <div className="space-y-3">
                        <p>Ainda não há leads reais. A varredura no Maps importa empresas sem site com WhatsApp.</p>
                        <Button asChild>
                          <Link to="/prospeccao/buscar">Caçar leads</Link>
                        </Button>
                      </div>
                    ) : (
                      "Nenhum contato encontrado com os filtros atuais."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer Detalhes do Contato */}
      {selectedContact && (
        <Sheet open={Boolean(selectedContact)} onOpenChange={() => setSelectedContact(null)}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <div className="flex items-center gap-3">
                <EntityAvatar name={selectedContact.name} size="lg" />
                <div>
                  <SheetTitle className="text-lg">{selectedContact.name}</SheetTitle>
                  <SheetDescription>
                    {selectedContact.title || "Contato"} · Score {selectedContact.score}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Contact Information */}
              <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
                <div className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">
                  Informações Cadastrais
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" />
                  <span className="font-mono">{selectedContact.phone || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" />
                  <span>{selectedContact.email || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <span>
                    {db.companies.find((c) => c.id === selectedContact.companyId)?.name ??
                      "Sem empresa vinculada"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <span>Responsável: {ownerName(db, selectedContact.ownerId)}</span>
                </div>
              </div>

              {/* Opportunities */}
              <div className="space-y-3">
                <div className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">
                  Oportunidades Vinculadas ({contactDeals.length})
                </div>
                {contactDeals.map((d) => (
                  <div key={d.id} className="rounded-lg border bg-card p-3 text-sm">
                    <div className="font-medium">{d.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">
                        R$ {d.value.toLocaleString("pt-BR")}
                      </span>
                      <StatusBadge
                        tone={d.status === "ganho" ? "success" : d.status === "perdido" ? "danger" : "info"}
                      >
                        {d.status}
                      </StatusBadge>
                    </div>
                  </div>
                ))}
                {contactDeals.length === 0 && (
                  <div className="text-xs text-muted-foreground">Nenhuma oportunidade aberta.</div>
                )}
              </div>

              {/* Activity Timeline */}
              <div className="space-y-3">
                <div className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">
                  Linha do Tempo de Atividades
                </div>

                <form onSubmit={handleAddNote} className="space-y-2">
                  <Input
                    placeholder="Adicionar nota rápida ao histórico..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" type="submit" disabled={!noteText.trim()}>
                      Salvar nota
                    </Button>
                  </div>
                </form>

                <div className="space-y-2.5 pt-2">
                  {contactActivities.map((act) => (
                    <div key={act.id} className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between font-medium">
                        <span className="capitalize">{act.type} · {act.actor}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {fmtDate(act.createdAt)} às {fmtTime(act.createdAt)}
                        </span>
                      </div>
                      <div className="text-muted-foreground">{act.text}</div>
                    </div>
                  ))}
                  {contactActivities.length === 0 && (
                    <div className="text-xs text-muted-foreground">Nenhuma atividade registrada.</div>
                  )}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Modal Novo Contato */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreateContact}>
            <DialogHeader>
              <DialogTitle>Novo Contato ou Lead</DialogTitle>
              <DialogDescription>
                Cadastre um contato comercial para interações, follow-ups e prospecção.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Nome completo *</Label>
                <Input
                  id="contact-name"
                  placeholder="Ex: João da Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-phone">WhatsApp / Telefone</Label>
                  <Input
                    id="contact-phone"
                    placeholder="+55 11 98888-7777"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">E-mail</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    placeholder="joao@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-company">Empresa</Label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger id="contact-company">
                      <SelectValue placeholder="Selecione empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma empresa</SelectItem>
                      {db.companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-title">Cargo / Função</Label>
                  <Input
                    id="contact-title"
                    placeholder="Ex: Diretor Comercial"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-source">Origem do Lead</Label>
                  <Select value={source} onValueChange={(v: LeadSource) => setSource(v)}>
                    <SelectTrigger id="contact-source">
                      <SelectValue placeholder="Selecione origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Site">Site</SelectItem>
                      <SelectItem value="Facebook Ads">Facebook Ads</SelectItem>
                      <SelectItem value="Google Ads">Google Ads</SelectItem>
                      <SelectItem value="Indicação">Indicação</SelectItem>
                      <SelectItem value="Prospecção">Prospecção</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Evento">Evento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-tags">Tags (separadas por vírgula)</Label>
                  <Input
                    id="contact-tags"
                    placeholder="quente, clínica, B2B"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Cadastrar Contato</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
