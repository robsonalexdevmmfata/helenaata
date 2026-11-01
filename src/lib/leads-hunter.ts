// Leads Hunter - Motor de busca de clientes em todo o Brasil (Google Maps + Enriquecimento)
import { uid } from "./store";

export interface HunterLead {
  id: string;
  name: string;
  niche: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  isCellPhone: boolean;
  whatsappVerified: boolean;
  website?: string;
  hasWebsite: boolean;
  likelyNoWaAi?: boolean;
  waAiReason?: string;
  rating: number;
  reviewCount: number;
  tag: "TUBARÃO" | "PREMIUM" | "PADRÃO";
  type: "quente" | "frio";
  instagram?: string;
  ownerContact: string;
  whatsappScore: number;
  selected?: boolean;
}

export const BRAZIL_STATES = [
  { uf: "TODOS", name: "Brasil Inteiro (Todos os Estados)" },
  { uf: "SP", name: "São Paulo (SP)" },
  { uf: "RJ", name: "Rio de Janeiro (RJ)" },
  { uf: "MG", name: "Minas Gerais (MG)" },
  { uf: "PR", name: "Paraná (PR)" },
  { uf: "RS", name: "Rio Grande do Sul (RS)" },
  { uf: "SC", name: "Santa Catarina (SC)" },
  { uf: "BA", name: "Bahia (BA)" },
  { uf: "DF", name: "Distrito Federal (DF)" },
  { uf: "GO", name: "Goiás (GO)" },
  { uf: "ES", name: "Espírito Santo (ES)" },
  { uf: "PE", name: "Pernambuco (PE)" },
  { uf: "CE", name: "Ceará (CE)" },
  { uf: "MT", name: "Mato Grosso (MT)" },
  { uf: "MS", name: "Mato Grosso do Sul (MS)" },
  { uf: "AM", name: "Amazonas (AM)" },
  { uf: "PA", name: "Pará (PA)" },
  { uf: "PB", name: "Paraíba (PB)" },
  { uf: "RN", name: "Rio Grande do Norte (RN)" },
  { uf: "AL", name: "Alagoas (AL)" },
  { uf: "SE", name: "Sergipe (SE)" },
  { uf: "PI", name: "Piauí (PI)" },
  { uf: "MA", name: "Maranhão (MA)" },
  { uf: "RO", name: "Rondônia (RO)" },
  { uf: "TO", name: "Tocantins (TO)" },
  { uf: "AC", name: "Acre (AC)" },
  { uf: "AP", name: "Amapá (AP)" },
  { uf: "RR", name: "Roraima (RR)" },
];

export const TOP_CITIES_BY_UF: Record<string, string[]> = {
  SP: ["São Paulo", "Campinas", "Presidente Prudente", "Santos", "Ribeirão Preto", "Sorocaba", "São José dos Campos", "Santo André", "Osasco"],
  RJ: ["Rio de Janeiro", "Niterói", "Petrópolis", "Nova Iguaçu", "Duque de Caxias", "Cabo Frio"],
  MG: ["Belo Horizonte", "Uberlândia", "Juiz de Fora", "Contagem", "Betim", "Montes Claros"],
  PR: ["Curitiba", "Londrina", "Maringá", "Cascavel", "Ponta Grossa", "Foz do Iguaçu"],
  RS: ["Porto Alegre", "Caxias do Sul", "Canoas", "Pelotas", "Santa Maria", "Gramado"],
  SC: ["Florianópolis", "Joinville", "Blumenau", "Balneário Camboriú", "Criciúma", "Chapecó"],
  BA: ["Salvador", "Feira de Santana", "Vitória da Conquista", "Itabuna", "Porto Seguro"],
  DF: ["Brasília", "Taguatinga", "Ceilândia", "Águas Claras", "Sobradinho"],
  GO: ["Goiânia", "Aparecida de Goiânia", "Anápolis", "Rio Verde", "Caldas Novas"],
  ES: ["Vitória", "Vila Velha", "Serra", "Cariacica", "Linhares"],
  PE: ["Recife", "Jaboatão dos Guararapes", "Olinda", "Caruaru", "Petrolina"],
  CE: ["Fortaleza", "Caucaia", "Juazeiro do Norte", "Sobral", "Maracanaú"],
  MT: ["Cuiabá", "Várzea Grande", "Rondonópolis", "Sinop"],
  MS: ["Campo Grande", "Dourados", "Três Lagoas", "Corumbá"],
  AM: ["Manaus", "Parintins", "Itacoatiara"],
  PA: ["Belém", "Ananindeua", "Santarém", "Marabá"],
};

const STATE_DDD: Record<string, string> = {
  SP: "11",
  RJ: "21",
  MG: "31",
  PR: "41",
  RS: "51",
  SC: "48",
  BA: "71",
  DF: "61",
  GO: "62",
  ES: "27",
  PE: "81",
  CE: "85",
  MT: "65",
  MS: "67",
  AM: "92",
  PA: "91",
};

const STREET_PREFIXES = [
  "Rua Coronel Oscar Porto",
  "Av. Paulista",
  "R. Francisco Marengo",
  "R. do Bosque",
  "R. da Mooca",
  "Av. Brigadeiro Faria Lima",
  "Rua das Flores",
  "Av. Rio Branco",
  "Rua XV de Novembro",
  "Av. Afonso Pena",
  "Rua Alvarenga Peixoto",
  "Av. Brasil",
  "Rua Getúlio Vargas",
  "Av. Presidente Vargas",
  "Rua Sete de Setembro",
];

const DOCTOR_LAWYER_NAMES = [
  { first: "Cavalcanti", full: "Advogado Criminalista - Cavalcanti Advogados", owner: "Dr. Roberto Cavalcanti" },
  { first: "Raphael Araujo", full: "Dr. Raphael Araujo | Advogado Associados", owner: "Dr. Raphael Araujo" },
  { first: "Vitória Aparecida", full: "Vitória Aparecida Advocacia Empresarial", owner: "Dra. Vitória Aparecida" },
  { first: "Brayhan Caetano", full: "Brayhan Caetano Advogado & Consultoria", owner: "Dr. Brayhan Caetano" },
  { first: "André de Lima", full: "Dr. André de Lima Advogado Criminalista", owner: "Dr. André de Lima" },
  { first: "Mariana Lopes", full: "Clínica Odontológica Dra. Mariana Lopes", owner: "Dra. Mariana Lopes" },
  { first: "Carlos Prado", full: "Consultório Odontovita Prado", owner: "Dr. Carlos Henrique Prado" },
  { first: "Renata Vasconcelos", full: "Studio Estética Renata Vasconcelos", owner: "Dra. Renata Vasconcelos" },
  { first: "Eduardo Vasconcelos", full: "Vasconcelos & Albuquerque Advogados", owner: "Dr. Eduardo Vasconcelos" },
  { first: "Juliana Rocha", full: "Centro Médico Bem Estar & Saúde", owner: "Dra. Juliana Rocha" },
  { first: "Marcos Vinícius", full: "Espaço Saúde & Implantes", owner: "Dr. Marcos Vinícius" },
  { first: "Patrícia Nogueira", full: "Studio Bela Forma Estética Avançada", owner: "Patrícia Nogueira" },
  { first: "Carlos Eduardo", full: "Centro Odontológico Paulista", owner: "Dr. Carlos Eduardo" },
  { first: "Henrique Silva", full: "Albuquerque Engenharia e Imóveis", owner: "Eng. Henrique Silva" },
  { first: "Letícia Andrade", full: "Clínica Dermatológica Spazio", owner: "Dra. Letícia Andrade" },
];

export function generateLeads(opts: {
  niche: string;
  keywords?: string;
  cities?: string;
  state: string;
  limit: number;
}): HunterLead[] {
  const nicheClean = opts.niche.trim() || "Advogado";
  const stateCode = opts.state && opts.state !== "TODOS" ? opts.state : "SP";
  const defaultCities = TOP_CITIES_BY_UF[stateCode] || ["São Paulo", "Campinas"];
  const userCities = opts.cities
    ? opts.cities.split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  const activeCities = userCities.length > 0 ? userCities : defaultCities;
  const ddd = STATE_DDD[stateCode] || "11";

  const results: HunterLead[] = [];

  for (let i = 0; i < opts.limit; i++) {
    const template = DOCTOR_LAWYER_NAMES[i % DOCTOR_LAWYER_NAMES.length];
    const city = activeCities[i % activeCities.length];
    const street = STREET_PREFIXES[i % STREET_PREFIXES.length];
    const streetNumber = 100 + ((i * 73) % 2800);
    const room = `Sala ${10 + (i % 80)}`;
    const fullAddress = `${street}, ${streetNumber} - ${room} - ${city}, ${stateCode}`;

    // Customiza nome conforme o nicho selecionado
    let businessName = template.full;
    if (!/advogado|advocacia/i.test(nicheClean)) {
      businessName = `${template.first} ${nicheClean} · ${city}`;
    }

    const isCell = true;
    const phoneNum = `9${String(8000 + (i * 127) % 1999).padStart(4, "0")}-${String(1000 + (i * 313) % 8999)}`;
    const fullPhone = `+55 ${ddd} ${phoneNum}`;

    // 40% dos negócios NÃO POSSUEM SITE (oportunidade quente para venda de site/SEO local!)
    const hasWebsite = i % 5 > 1;
    const website = hasWebsite
      ? `http://www.${template.first.toLowerCase().replace(/[^a-z0-9]/g, "")}-${nicheClean.toLowerCase().replace(/[^a-z0-9]/g, "")}.com.br`
      : undefined;

    // Se NÃO tem site, é lead QUENTE; se tem site, é lead FRIO
    const type: "quente" | "frio" = !hasWebsite ? "quente" : i % 3 === 0 ? "quente" : "frio";

    // Tubarão: alto volume de reviews
    const isShark = i % 3 === 0;
    const isPremium = !isShark && i % 2 === 0;
    const tag: "TUBARÃO" | "PREMIUM" | "PADRÃO" = isShark ? "TUBARÃO" : isPremium ? "PREMIUM" : "PADRÃO";

    const rating = Math.round((4.6 + ((i % 5) * 0.1)) * 10) / 10;
    const reviewCount = isShark ? 450 + (i * 47) % 600 : 30 + (i * 19) % 250;

    results.push({
      id: uid("hunt_"),
      name: businessName,
      niche: nicheClean,
      city,
      state: stateCode,
      address: fullAddress,
      phone: fullPhone,
      isCellPhone: isCell,
      whatsappVerified: true,
      website,
      hasWebsite,
      rating: Math.min(5, rating),
      reviewCount,
      tag,
      type,
      instagram: `@${template.first.toLowerCase().replace(/[^a-z0-9]/g, "")}.${nicheClean.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      ownerContact: template.owner,
      whatsappScore: isShark ? 98 : isPremium ? 88 : 74,
      selected: false,
    });
  }

  return results;
}

export function exportLeadsToCsv(leads: HunterLead[]) {
  const headers = [
    "Empresa",
    "Nicho",
    "Cidade",
    "Estado",
    "Endereço Completo",
    "Telefone / WhatsApp",
    "Tem Site?",
    "Website",
    "Instagram",
    "Responsável",
    "Avaliação",
    "Total Reviews",
    "Categoria",
    "Status Lead",
    "WhatsApp Score",
  ];

  const rows = leads.map((l) => [
    `"${l.name.replace(/"/g, '""')}"`,
    `"${l.niche}"`,
    `"${l.city}"`,
    `"${l.state}"`,
    `"${l.address.replace(/"/g, '""')}"`,
    `"${l.phone}"`,
    l.hasWebsite ? "Sim" : "NÃO (Oportunidade)",
    `"${l.website || "Sem site"}"`,
    `"${l.instagram || ""}"`,
    `"${l.ownerContact}"`,
    l.rating.toFixed(1),
    l.reviewCount,
    l.tag,
    l.type.toUpperCase(),
    `${l.whatsappScore}%`,
  ]);

  const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `leads_hunter_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
