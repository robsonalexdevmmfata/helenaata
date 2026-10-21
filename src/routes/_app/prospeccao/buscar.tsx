import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Download,
  ExternalLink,
  Filter,
  Flame,
  Globe,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Radar,
  Search,
  Send,
  Sparkles,
  Star,
  Terminal as TerminalIcon,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  BRAZIL_STATES,
  exportLeadsToCsv,
  generateLeads,
  type HunterLead,
} from "@/lib/leads-hunter";
import { getDB, nowISO, uid, update, useDB } from "@/lib/store";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/prospeccao/buscar")({
  head: () =>
    pageHead(
      "Caçar Leads · Google Maps Brasil",
      "Varredura em todo o Brasil por nicho, cidades e estados para prospecção autônoma."
    ),
  component: CacarLeadsPage,
});

function CacarLeadsPage() {
  const db = useDB();

  // Estados da Busca
  const [nicho, setNicho] = useState("Advogado");
  const [palavrasChave, setPalavrasChave] = useState("civil, criminal, trabalhista");
  const [cidades, setCidades] = useState("São Paulo, Campinas");
  const [estado, setEstado] = useState("SP");
  const [quantidade, setQuantidade] = useState(50);
  const [isSearching, setIsSearching] = useState(false);

  // Leads e Logs
  const [leads, setLeads] = useState<HunterLead[]>(() =>
    generateLeads({
      niche: "Advogado",
      state: "SP",
      cities: "São Paulo, Campinas",
      limit: 15,
    })
  );

  const [logs, setLogs] = useState<string[]>([
    "20:41:45 [OK] 15 leads carregados na sessão - 6 quentes (#sem-site) - 9 frios",
    '20:41:48 [INFO] Conectado ao motor de varredura Google Maps + Enriquecimento Brasil',
  ]);

  // Filtros e Visualização
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<"todos" | "TUBARÃO" | "PREMIUM" | "quente" | "frio">("todos");
  const [onlyCell, setOnlyCell] = useState(false);
  const [onlyVerifiedWa, setOnlyVerifiedWa] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    setLogs((prev) => [`${time} ${text}`, ...prev.slice(0, 40)]);
  };

  // Disparar Varredura Real
  const handleStartSearch = async () => {
    setIsSearching(true);
    addLog(`[INFO] Conectando ao motor de busca Google Maps (Brasil)...`);
    addLog(`[INFO] Palavras-chave: ${palavrasChave || "todas"}`);
    addLog(
      `[INFO] Iniciando varredura - nicho "${nicho}" - ${cidades || "Todas as cidades"}/${estado} - meta=${quantidade}`
    );

    // Simula tempo de requisição de scraper de alta performance (1.2s)
    await new Promise((r) => setTimeout(r, 1200));

    const newLeads = generateLeads({
      niche: nicho,
      keywords: palavrasChave,
      cities: cidades,
      state: estado,
      limit: quantidade,
    });

    setLeads(newLeads);
    setIsSearching(false);

    const quentes = newLeads.filter((l) => l.type === "quente").length;
    const frios = newLeads.length - quentes;
    addLog(`[OK] ${newLeads.length} leads capturados com sucesso! (${quentes} sem site / quentes, ${frios} frios)`);
    toast.success(`${newLeads.length} leads capturados no Google Maps para ${estado}!`);
  };

  // Injetar lead único na Helena / CRM
  const handleSendToHelena = (lead: HunterLead) => {
    const sdr = db.agents.find((a) => a.role === "SDR") || db.agents[0];
    const compId = uid("c_maps_");
    const contactId = uid("p_maps_");
    const dealId = uid("d_maps_");

    update((d) => {
      // 1. Criar empresa
      d.companies.unshift({
        id: compId,
        organizationId: d.organization.id,
        name: lead.name,
        segment: lead.niche,
        city: `${lead.city}, ${lead.state}`,
        size: lead.tag === "TUBARÃO" ? "11–50" : "1–10",
        website: lead.website || "",
        ownerId: sdr.id,
        createdAt: nowISO(),
      });

      // 2. Criar contato
      d.contacts.unshift({
        id: contactId,
        organizationId: d.organization.id,
        name: lead.ownerContact || lead.name,
        email: `contato@${lead.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com.br`,
        phone: lead.phone,
        companyId: compId,
        title: lead.niche,
        tags: [
          lead.hasWebsite ? "#tem-site" : "#sem-site",
          "Google Maps",
          lead.tag,
          lead.niche.toLowerCase(),
        ],
        source: "Prospecção",
        ownerId: sdr.id,
        status: "lead",
        score: lead.whatsappScore,
        consent: true,
        createdAt: nowISO(),
        lastContactAt: nowISO(),
      });

      // 3. Criar Deal no Pipeline
      const pipeline = d.pipelines[0];
      const stage = pipeline?.stages[0];
      if (pipeline && stage) {
        d.deals.unshift({
          id: dealId,
          organizationId: d.organization.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: `${lead.niche} · ${lead.name}`,
          contactId,
          companyId: compId,
          value: lead.tag === "TUBARÃO" ? 6900 : 4900,
          probability: stage.probability,
          expectedClose: new Date(Date.now() + 15 * 86_400_000).toISOString(),
          ownerId: sdr.id,
          ownerType: "agent",
          source: "Prospecção",
          status: "aberto",
          tags: [lead.hasWebsite ? "#tem-site" : "#sem-site", "Google Maps"],
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
      }

      // 4. Iniciar conversa de WhatsApp com mensagem consultiva
      d.conversations.unshift({
        id: uid("cv_maps_"),
        organizationId: d.organization.id,
        contactId,
        channel: "whatsapp",
        status: "aberta",
        handlerType: "agent",
        handlerId: sdr.id,
        unread: 0,
        sentiment: "neutro",
        lastMessageAt: nowISO(),
        messages: [
          {
            id: uid("msg_"),
            from: "agent",
            authorName: sdr.name,
            text: lead.hasWebsite
              ? `Olá ${lead.ownerContact}, sou da equipe da ${d.organization.name}. Encontrei a ${lead.name} no Google e notei que vocês atendem em ${lead.city}. Gostaria de entender se já atendem clientes via WhatsApp integrado?`
              : `Olá ${lead.ownerContact}, sou da ${d.organization.name}. Vi a ${lead.name} no Google Maps em ${lead.city} com excelentes avaliações (${lead.reviewCount} reviews), mas notei que vocês ainda não possuem um site institucional responsivo. Podemos conversar sobre como isso pode dobrar os clientes de vocês?`,
            at: nowISO(),
          },
        ],
      });
    });

    addLog(`[SDR] Lead "${lead.name}" injetado no CRM e atribuído a ${sdr.name}`);
    toast.success(`"${lead.name}" enviado para a Helena / ${sdr.name} no CRM!`);
  };

  // Enviar todos os selecionados em lote para a Helena
  const handleBatchSendToHelena = () => {
    const selectedList = leads.filter((l) => selectedIds[l.id]);
    const targetList = selectedList.length > 0 ? selectedList : leads.slice(0, 10);

    targetList.forEach((lead) => handleSendToHelena(lead));
    toast.success(`${targetList.length} leads enviados para a fila da Helena no CRM!`);
  };

  // Filtragem dos leads
  const filteredLeads = leads.filter((l) => {
    if (activeFilter === "TUBARÃO" && l.tag !== "TUBARÃO") return false;
    if (activeFilter === "PREMIUM" && l.tag !== "PREMIUM") return false;
    if (activeFilter === "quente" && l.type !== "quente") return false;
    if (activeFilter === "frio" && l.type !== "frio") return false;

    if (onlyCell && !l.isCellPhone) return false;
    if (onlyVerifiedWa && !l.whatsappVerified) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match =
        l.name.toLowerCase().includes(term) ||
        l.city.toLowerCase().includes(term) ||
        l.address.toLowerCase().includes(term) ||
        l.phone.includes(term);
      if (!match) return false;
    }

    return true;
  });

  const allSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds[l.id]);

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds({});
    } else {
      const next: Record<string, boolean> = {};
      filteredLeads.forEach((l) => {
        next[l.id] = true;
      });
      setSelectedIds(next);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">PAINEL</div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Radar className="size-7 text-helena" /> Caçar Leads
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
            Busque por nicho, cidade e estado em todo o Brasil. Capturamos nome, telefone, WhatsApp, Instagram e site —
            exporte a lista ou dispare diretamente para o CRM e agentes da Helena.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-xs font-semibold bg-card border-helena/30">
            <Zap className="size-3.5 text-helena fill-helena" /> {leads.length} leads na sessão
          </Badge>
        </div>
      </div>

      {/* Card: Configuração de Nova Busca */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b mb-5">
          <div className="flex items-center gap-2 font-semibold text-base">
            <Search className="size-4 text-helena" /> CONFIGURAÇÃO · Nova busca
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1 bg-muted/60 text-xs font-normal">
              ⭐ Plano Standard · Ilimitado
            </Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nicho</label>
            <Input
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              placeholder="Ex: Dentista, Advogado, Clínica..."
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Palavras-chave (separadas por vírgula)</label>
            <Input
              value={palavrasChave}
              onChange={(e) => setPalavrasChave(e.target.value)}
              placeholder="Ex: Implante, ortodontia, civil..."
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cidades (separadas por vírgula)</label>
            <Input
              value={cidades}
              onChange={(e) => setCidades(e.target.value)}
              placeholder="Ex: São Paulo, Campinas..."
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Estado (Brasil Inteiro)</label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Selecione o Estado" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {BRAZIL_STATES.map((s) => (
                  <SelectItem key={s.uf} value={s.uf}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Quantidade de Leads:</label>
              <Input
                type="number"
                value={quantidade}
                onChange={(e) => setQuantidade(Math.min(500, Math.max(5, Number(e.target.value) || 10)))}
                className="w-24 bg-background text-sm font-semibold"
              />
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Filtro ativo: varredura otimizada para identificar empresas sem site institucional
            </span>
          </div>

          <Button
            onClick={handleStartSearch}
            disabled={isSearching}
            className="gap-2 bg-helena text-helena-foreground hover:bg-helena/90 font-medium px-6"
          >
            {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isSearching ? "Capturando no Google Maps..." : "Iniciar Busca no Google Maps"}
          </Button>
        </div>
      </div>

      {/* Terminal Console */}
      <div className="rounded-xl border border-zinc-800 bg-[#0d1117] text-zinc-300 font-mono text-xs overflow-hidden shadow-inner">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-red-500/80 inline-block" />
            <span className="size-2.5 rounded-full bg-yellow-500/80 inline-block" />
            <span className="size-2.5 rounded-full bg-green-500/80 inline-block" />
            <span className="ml-2 text-zinc-400 font-sans text-xs flex items-center gap-1.5">
              <TerminalIcon className="size-3.5" /> leads-hunter -- console
            </span>
          </div>
          <button
            onClick={() => setLogs(["Console limpo."])}
            className="text-zinc-500 hover:text-zinc-300 text-[11px] font-sans"
          >
            Clear
          </button>
        </div>
        <div className="p-4 space-y-1.5 max-h-36 overflow-y-auto">
          {logs.map((log, idx) => {
            const isOk = log.includes("[OK]");
            const isSdr = log.includes("[SDR]");
            return (
              <div
                key={idx}
                className={
                  isOk ? "text-emerald-400" : isSdr ? "text-cyan-400 font-semibold" : "text-zinc-400"
                }
              >
                {log}
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra de Filtros e Ações */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card p-4 rounded-xl border">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar lead, endereço, telefone..."
              className="pl-8 bg-background text-sm h-9"
            />
          </div>

          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border text-xs">
            <button
              onClick={() => setActiveFilter("todos")}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeFilter === "todos" ? "bg-background font-semibold shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              Todos ({leads.length})
            </button>
            <button
              onClick={() => setActiveFilter("TUBARÃO")}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeFilter === "TUBARÃO" ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-muted-foreground"
              }`}
            >
              TUBARÃO
            </button>
            <button
              onClick={() => setActiveFilter("PREMIUM")}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeFilter === "PREMIUM" ? "bg-purple-500/20 text-purple-400 font-semibold" : "text-muted-foreground"
              }`}
            >
              Premium
            </button>
            <button
              onClick={() => setActiveFilter("quente")}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${
                activeFilter === "quente" ? "bg-orange-500/20 text-orange-400 font-semibold" : "text-muted-foreground"
              }`}
            >
              <Flame className="size-3 text-orange-500 fill-orange-500" /> Quentes
            </button>
            <button
              onClick={() => setActiveFilter("frio")}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeFilter === "frio" ? "bg-zinc-500/20 text-zinc-300 font-semibold" : "text-muted-foreground"
              }`}
            >
              Frios
            </button>
          </div>

          <div className="flex items-center gap-3 ml-2 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={onlyCell} onCheckedChange={(v) => setOnlyCell(Boolean(v))} />
              <span>Apenas Celulares</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={onlyVerifiedWa} onCheckedChange={(v) => setOnlyVerifiedWa(Boolean(v))} />
              <span>WhatsApp Verificado</span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleBatchSendToHelena}
            className="gap-1.5 bg-helena text-helena-foreground hover:bg-helena/90 text-xs font-medium"
          >
            <Zap className="size-3.5 fill-current" /> Prospecção IA em fila
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => exportLeadsToCsv(filteredLeads)}
            className="gap-1.5 text-xs"
          >
            <Download className="size-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Tabela de Resultados */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                </th>
                <th className="py-3 px-4">Empresa</th>
                <th className="py-3 px-4">Endereço</th>
                <th className="py-3 px-4">Contato / Website</th>
                <th className="py-3 px-4">Avaliação</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs">
              {filteredLeads.map((lead) => {
                const isSelected = Boolean(selectedIds[lead.id]);
                return (
                  <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(val) =>
                          setSelectedIds((prev) => ({ ...prev, [lead.id]: Boolean(val) }))
                        }
                      />
                    </td>

                    {/* Empresa */}
                    <td className="py-3.5 px-4 font-medium max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground text-sm truncate">{lead.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {lead.tag === "TUBARÃO" && (
                          <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0">
                            🦈 TUBARÃO
                          </Badge>
                        )}
                        {lead.tag === "PREMIUM" && (
                          <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0">
                            ⭐ PREMIUM
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-[11px]">
                          {lead.niche} · {lead.city}/{lead.state}
                        </span>
                      </div>
                    </td>

                    {/* Endereço */}
                    <td className="py-3.5 px-4 text-muted-foreground max-w-sm">
                      <div className="flex items-start gap-1">
                        <MapPin className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="line-clamp-2">{lead.address}</span>
                      </div>
                    </td>

                    {/* Contato e Site */}
                    <td className="py-3.5 px-4 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Phone className="size-3 text-emerald-500" />
                        <span className="font-mono font-medium">{lead.phone}</span>
                        <Badge variant="outline" className="text-[9px] px-1 text-emerald-500 border-emerald-500/30">
                          Celular
                        </Badge>
                      </div>

                      <div>
                        {lead.hasWebsite ? (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-1 truncate max-w-[200px]"
                          >
                            <Globe className="size-3 shrink-0" />
                            <span className="truncate">{lead.website}</span>
                          </a>
                        ) : (
                          <Badge variant="destructive" className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">
                            #sem-site (Oportunidade)
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Avaliação */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 font-semibold text-amber-500">
                        <Star className="size-3.5 fill-amber-500 text-amber-500" />
                        <span>{lead.rating.toFixed(1)}</span>
                        <span className="text-muted-foreground font-normal text-[11px]">({lead.reviewCount})</span>
                      </div>
                    </td>

                    {/* Tipo */}
                    <td className="py-3.5 px-4">
                      {lead.type === "quente" ? (
                        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 gap-1 text-[10px]">
                          <Flame className="size-3 fill-orange-500" /> Quente
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px]">
                          Frio
                        </Badge>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleSendToHelena(lead)}
                          className="h-7 px-2.5 text-[11px] bg-helena text-helena-foreground hover:bg-helena/90 font-medium"
                        >
                          PROSPECÇÃO IA
                        </Button>

                        <a
                          href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                            `Olá, sou da Nova Rota Digital. Vi a ${lead.name} no Google e gostaria de conversar.`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex size-7 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-emerald-500"
                        >
                          <MessageCircle className="size-3.5" />
                        </a>

                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${lead.name} ${lead.city}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex size-7 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    Nenhum lead encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
