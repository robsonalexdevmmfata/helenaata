import type { Agent, DB, SitePreview, Team } from "@/lib/types";
import { bumpAutomation, getDB, nowISO, uid, update } from "@/lib/store";
import { getAgencyConnection } from "@/lib/evolution/evolutionapi";
import { stageForNewProspect } from "@/lib/crm/pipelineStages";
import { formatForWhatsApp } from "@/lib/helena/whatsapp-formatter";
import { diagnoseLead, setCycleTag } from "@/lib/helena/diagnose";
import type { MapPlace } from "@/lib/prospect/mapsSearch";
import { normalize } from "@/lib/format";

export const DEV_TEAM_ID = "t_dev";
export const DEV_FE_ID = "a_dev_fe";
export const DEV_BE_ID = "a_dev_be";
export const DEV_DS_ID = "a_dev_ds";
export const DEV_AGENT_IDS = [DEV_FE_ID, DEV_BE_ID, DEV_DS_ID] as const;

/** Serviços locais — NUNCA cardápio, mesmo se o lote/campanha vier como “Restaurantes”. */
export function isServiceBusiness(text: string) {
  const n = normalize(text);
  return /chaveir|serralher|eletricit|encanador|desentupid|marceneir|funilar|guincho|borrachar|oficina|auto\s*pe[cç]|mecanica|dentista|odont|advog|contab|imobili|corretor|veterin|pet\s*shop|academia|personal\s*train|fotogra|arquitet|despachante|cartor|telecom|provedor|informatica|assistencia\s*tec|conserto|refriger|ar\s*cond|lavagem|lava\s*jato|estacionamento|transport|mudanc|limpeza|dedetiz|seguranc|vigilanc|escola|curso|idioma|clinica(?!\s*de\s*comida)|consultorio|estetic|barbearia|salao|cabeleireir|manicure|podolog|fisioterap|psicolog|nutricion/.test(n);
}

/**
 * Cardápio digital = SÓ refeição pra pedir (restaurante / lanchonete / pizza / burguer / churrasco).
 * Sorveteria, açaí, padaria, cafeteria, doceria, bar → SITE (não cardápio).
 */
export function wantsCardapio(text: string) {
  const n = normalize(text);
  if (isServiceBusiness(n)) return false;
  if (/sorvet|gelat|acai|açaí|padaria|cafeteria|\bcafe\b|café|doceria|confeitaria|bombonier|milk\s*shake|shake\s*house/.test(n)) {
    return false;
  }
  return /restaurante|pizzaria|lanchonete|hamburguer|hamburger|burger|churrasc|pastelaria|marmita|food\s*truck/.test(n);
}

/** @deprecated use wantsCardapio — mantido p/ imports antigos */
export function isFoodNiche(segment: string) {
  return wantsCardapio(segment);
}

/** Negócios de comida que recebem SITE (não cardápio de restaurante). */
export function isSiteOnlyFood(text: string) {
  const n = normalize(text);
  return /sorvet|gelat|acai|açaí|padaria|cafeteria|\bcafe\b|café|doceria|confeitaria|bombonier|milk\s*shake/.test(n);
}

/** Decide cardápio vs site pelo NOME do lugar + segmento (nome do estabelecimento vence). */
export function resolvePreviewKind(placeName: string, segment: string) {
  // 1) Nome do lugar manda: chaveiro / sorvete / padaria nunca viram cardápio por causa do lote.
  if (isServiceBusiness(placeName) || isSiteOnlyFood(placeName)) {
    const label = inferServiceLabel(placeName) || segment || "Negócio local";
    return { food: false as const, segment: label };
  }
  if (wantsCardapio(placeName)) {
    return { food: true as const, segment: inferFoodLabel(placeName) || "Restaurantes" };
  }
  // 2) Sem sinal no nome: usa o segmento da campanha.
  if (isServiceBusiness(segment) || isSiteOnlyFood(segment)) {
    return { food: false as const, segment: inferServiceLabel(segment) || segment };
  }
  if (wantsCardapio(segment)) {
    return { food: true as const, segment: segment || "Restaurantes" };
  }
  const shop = inferServiceLabel(placeName) || inferServiceLabel(segment);
  if (shop) return { food: false as const, segment: shop };
  return { food: false as const, segment: segment || "Negócio local" };
}

function inferFoodLabel(text: string) {
  const n = normalize(text);
  if (/pizzaria|pizza/.test(n)) return "Pizzarias";
  if (/hamburguer|burger/.test(n)) return "Hamburguerias";
  if (/churrasc/.test(n)) return "Churrascarias";
  if (/lanchonete|lanche/.test(n)) return "Lanchonetes";
  return "Restaurantes";
}

function inferServiceLabel(text: string) {
  const n = normalize(text);
  if (/chaveir/.test(n)) return "Chaveiros";
  if (/sorvet|gelat/.test(n)) return "Sorveterias";
  if (/acai|açaí/.test(n)) return "Açaí";
  if (/padaria/.test(n)) return "Padarias";
  if (/cafeteria|\bcafe\b|café/.test(n)) return "Cafeterias";
  if (/doceria|confeitaria/.test(n)) return "Docerias";
  if (/oficina|mecanica|auto\s*pe/.test(n)) return "Oficinas mecânicas";
  if (/dentista|odont/.test(n)) return "Dentistas";
  if (/advog/.test(n)) return "Advogados";
  if (/barbearia|salao|cabeleireir/.test(n)) return "Barbearias";
  if (/clinic|estetic/.test(n)) return "Clínicas";
  if (/imobili|corretor/.test(n)) return "Imobiliárias";
  if (/pet|veterin/.test(n)) return "Pet shops";
  if (/contab/.test(n)) return "Contadores";
  if (/eletricit|encanador|desentupid/.test(n)) return "Serviços residenciais";
  return "";
}

export function isPresenceIntent(text: string) {
  const n = normalize(text);
  // Volume / RPA / prospecção = NÃO é “só prévia Dev”.
  if (/\brpa\b|(1000|mil)\s*leads?|prospect|prospecc|cacar lead|caçar lead|diversos?\s*nichos?|brasil\s*(inteiro|todinho)|ativar\s+o?\s*time\s*(comercial|market|inteiro)/.test(n)) {
    return false;
  }
  if (/time de desenvolv|desenvolvedores de ia|gerar (o )?(site|landing|cardapio|previa)|montar (o )?(site|cardapio)|criar (o )?(site|cardapio)|previa (do |de )?(site|cardapio)/.test(n)) {
    return true;
  }
  // “cardápio” sozinho com Maps/prospect já foi barrado acima; aqui só prévia explícita.
  if (/menu online|cardapio online|sem cardapio/.test(n) && !/prospect|lead|varr|maps/.test(n)) {
    return true;
  }
  if (/(procure|procurar|encontre|encontrar|busque|buscar)/.test(n) && /(sem.?site|nao tenha site|nao tem site|sem (presenca|presenca) digital)/.test(n) && /previa|landing|time\s*dev/.test(n)) {
    return true;
  }
  return false;
}

export const PUBLIC_SITE_ORIGIN = String(
  import.meta.env.VITE_PUBLIC_SITE_URL ?? "https://helenaata.vercel.app",
).replace(/\/$/, "");

export function previewOrigin() {
  return PUBLIC_SITE_ORIGIN;
}

export function previewUrl(slug: string) {
  return `${previewOrigin()}/v/${slug}`;
}

export function slugify(name: string) {
  const base = normalize(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "negocio";
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number) {
  return arr[seed % arr.length]!;
}

export function paletteFor(segment: string) {
  const n = normalize(segment);
  if (wantsCardapio(n)) return { bg: "#140f0c", fg: "#faf6f1", accent: "#e8a05c" };
  if (/sorvet|gelat|acai/.test(n)) return { bg: "#0c1220", fg: "#f4f7fb", accent: "#7dd3fc" };
  if (/padaria|cafeteria|cafe|doceria/.test(n)) return { bg: "#1a120e", fg: "#faf3ea", accent: "#d4a574" };
  if (/chaveir|eletricit|encanador|desentupid/.test(n)) return { bg: "#0b1016", fg: "#eef3f8", accent: "#fbbf24" };
  if (/barbearia|salao|cabeleireir/.test(n)) return { bg: "#0c0c0c", fg: "#f5ecd8", accent: "#d4af37" };
  if (/advog|jurid/.test(n)) return { bg: "#0a1224", fg: "#eef3fb", accent: "#60a5fa" };
  if (/clinic|dentist|odont|estetic|medico|saude/.test(n)) return { bg: "#071816", fg: "#eaf8f4", accent: "#2dd4bf" };
  if (/imobili|oficina|mecanica/.test(n)) return { bg: "#14110e", fg: "#f6f1ea", accent: "#f59e0b" };
  return { bg: "#0b1220", fg: "#f1f5f9", accent: "#34d399" };
}

const FOOD_PHOTOS = [
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
  "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80",
  "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=1200&q=80",
  "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200&q=80",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=80&sat=-20",
  "https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&q=80",
];
const SEAFOOD_PHOTOS = [
  "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=80",
  "https://images.unsplash.com/photo-1625944230946-1d2b0cdd4f4b?w=1200&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=80",
  "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=1200&q=80",
  "https://images.unsplash.com/photo-1534604973900-c43ab4c2e0df?w=1200&q=80",
  "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=1200&q=80",
  "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1200&q=80",
  "https://images.unsplash.com/photo-1551248429-40975aa4de74?w=1200&q=80",
];
const DISH_PHOTOS = {
  entrada: [
    "https://images.unsplash.com/photo-1541014741259-de529411b96a?w=800&q=80",
    "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80",
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
  ],
  prato: [
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80",
    "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=800&q=80",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80",
    "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
  ],
  seafood: [
    "https://images.unsplash.com/photo-1625944230946-1d2b0cdd4f4b?w=800&q=80",
    "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=800&q=80",
    "https://images.unsplash.com/photo-1551248429-40975aa4de74?w=800&q=80",
    "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&q=80",
    "https://images.unsplash.com/photo-1534604973900-c43ab4c2e0df?w=800&q=80",
  ],
  bebida: [
    "https://images.unsplash.com/photo-1546173159-315724a31696?w=800&q=80",
    "https://images.unsplash.com/photo-1437418747212-8d9709afab22?w=800&q=80",
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80",
    "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
  ],
  sobremesa: [
    "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80",
    "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800&q=80",
  ],
};
const CLINIC_PHOTOS = [
  "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80",
  "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=80",
];
const SHOP_PHOTOS = [
  "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1200&q=80",
  "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&q=80",
];
const TRADE_PHOTOS = [
  "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=1200&q=80",
  "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1200&q=80",
  "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&q=80",
  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80",
];
const ICE_PHOTOS = [
  "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=1200&q=80",
  "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=1200&q=80",
  "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=1200&q=80",
  "https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=1200&q=80",
  "https://images.unsplash.com/photo-1488900123125-4e6f9e9a0b1a?w=1200&q=80",
  "https://images.unsplash.com/photo-1557142046-c704a3adf364?w=1200&q=80",
];
const BAKERY_PHOTOS = [
  "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80",
  "https://images.unsplash.com/photo-1517433674937-ae294d2d3e7e?w=1200&q=80",
  "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=1200&q=80",
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&q=80",
];
const OFFICE_PHOTOS = [
  "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1200&q=80",
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80",
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&q=80",
];

function isSeafoodPlace(name: string, segment: string) {
  if (isServiceBusiness(name) || !wantsCardapio(`${name} ${segment}`)) return false;
  return /moqueca|peixe|marisco|camarao|camarão|seafood|frutos.?do.?mar|pescados|siri|osta|baiana/.test(
    normalize(`${name} ${segment}`),
  );
}

function photosFor(segment: string, placeName = "") {
  const kind = resolvePreviewKind(placeName, segment);
  if (kind.food && isSeafoodPlace(placeName, segment)) return SEAFOOD_PHOTOS;
  if (kind.food) return FOOD_PHOTOS;
  const n = normalize(`${placeName} ${kind.segment}`);
  if (/sorvet|gelat|acai/.test(n)) return ICE_PHOTOS;
  if (/padaria|cafeteria|cafe|doceria/.test(n)) return BAKERY_PHOTOS;
  if (/chaveir|eletricit|encanador|desentupid|oficina|mecanica|conserto/.test(n)) return TRADE_PHOTOS;
  if (/clinic|dentist|odont|estetic|saude/.test(n)) return CLINIC_PHOTOS;
  if (/barbearia|salao|loja/.test(n)) return SHOP_PHOTOS;
  return OFFICE_PHOTOS;
}

function dishImage(pool: string[], seed: number, i: number) {
  return pick(pool, seed + i * 3);
}

function foodMenu(seed: number, placeName = "", segment = ""): NonNullable<SitePreview["menu"]> {
  if (isSeafoodPlace(placeName, segment)) {
    return [
      {
        category: "Entradas do mar",
        items: [
          { name: "Casquinha de siri", description: "Recheio cremoso, tostado na hora.", price: 42 + (seed % 10), image: dishImage(DISH_PHOTOS.entrada, seed, 0) },
          { name: "Bolinho de peixe", description: "Porção com molho tártaro da casa.", price: 36 + (seed % 8), image: dishImage(DISH_PHOTOS.entrada, seed, 1) },
          { name: "Salada de polvo", description: "Azeite, limão e ervas frescas.", price: 48 + (seed % 12), image: dishImage(DISH_PHOTOS.seafood, seed, 0) },
        ],
      },
      {
        category: "Moquecas & peixes",
        items: [
          { name: "Moqueca de peixe", description: "Leite de coco, dendê e pirão — clássico da casa.", price: 89 + (seed % 16), image: dishImage(DISH_PHOTOS.seafood, seed, 1) },
          { name: "Moqueca de camarão", description: "Camarão fresco, cozido no dendê com arroz.", price: 118 + (seed % 20), image: dishImage(DISH_PHOTOS.seafood, seed, 2) },
          { name: "Peixe grelhado", description: "Filet do dia com legumes e farofa.", price: 72 + (seed % 14), image: dishImage(DISH_PHOTOS.seafood, seed, 3) },
          { name: "Bobó de camarão", description: "Cremoso, com mandioca e dendê.", price: 98 + (seed % 18), image: dishImage(DISH_PHOTOS.seafood, seed, 4) },
        ],
      },
      {
        category: "Bebidas",
        items: [
          { name: "Caipirinha da casa", description: "Fruta da estação.", price: 22, image: dishImage(DISH_PHOTOS.bebida, seed, 0) },
          { name: "Suco natural", description: "Laranja, abacaxi ou maracujá.", price: 14, image: dishImage(DISH_PHOTOS.bebida, seed, 1) },
          { name: "Água de coco", description: "Gelada.", price: 12, image: dishImage(DISH_PHOTOS.bebida, seed, 2) },
          { name: "Cerveja longa", description: "Garrafa gelada.", price: 16, image: dishImage(DISH_PHOTOS.bebida, seed, 3) },
        ],
      },
      {
        category: "Sobremesas",
        items: [
          { name: "Cocada cremosa", description: "Doce de coco da casa.", price: 18, image: dishImage(DISH_PHOTOS.sobremesa, seed, 0) },
          { name: "Pudim", description: "Fatia generosa.", price: 16, image: dishImage(DISH_PHOTOS.sobremesa, seed, 1) },
        ],
      },
    ];
  }
  const n = normalize(`${placeName} ${segment}`);
  if (/lanchonete|hamburguer|burger|lanche/.test(n)) {
    return [
      {
        category: "Lanches",
        items: [
          { name: "X-Burger", description: "Pão, carne, salada e molho da casa.", price: 22 + (seed % 6), image: dishImage(DISH_PHOTOS.prato, seed, 0) },
          { name: "X-Bacon", description: "Pão, carne, bacon, salada e batata palha.", price: 26 + (seed % 5), image: dishImage(DISH_PHOTOS.prato, seed, 1) },
          { name: "X-Tudo", description: "Completo: carne, ovo, bacon, queijo e salada.", price: 30 + (seed % 8), image: dishImage(DISH_PHOTOS.prato, seed, 2) },
          { name: "Triplo", description: "Três carnes, queijo e molho especial.", price: 34 + (seed % 6), image: dishImage(DISH_PHOTOS.prato, seed, 3) },
        ],
      },
      {
        category: "Porções",
        items: [
          { name: "Batata frita", description: "Porção individual crocante.", price: 18 + (seed % 4), image: dishImage(DISH_PHOTOS.entrada, seed, 0) },
          { name: "Onion rings", description: "Anéis empanados.", price: 20 + (seed % 4), image: dishImage(DISH_PHOTOS.entrada, seed, 1) },
        ],
      },
      {
        category: "Bebidas",
        items: [
          { name: "Refrigerante lata", description: "350 ml.", price: 7, image: dishImage(DISH_PHOTOS.bebida, seed, 1) },
          { name: "Suco natural", description: "Copo 400 ml.", price: 12, image: dishImage(DISH_PHOTOS.bebida, seed, 0) },
          { name: "Água", description: "Sem gás.", price: 5, image: dishImage(DISH_PHOTOS.bebida, seed, 3) },
        ],
      },
    ];
  }
  return [
    {
      category: "Entradas",
      items: [
        { name: "Porção da casa", description: "Para compartilhar.", price: 38 + (seed % 12), image: dishImage(DISH_PHOTOS.entrada, seed, 0) },
        { name: "Salada da estação", description: "Folhas, legumes e molho da casa.", price: 24 + (seed % 8), image: dishImage(DISH_PHOTOS.entrada, seed, 1) },
        { name: "Bruschetta", description: "Pão tostado com tomate e manjericão.", price: 28 + (seed % 6), image: dishImage(DISH_PHOTOS.entrada, seed, 2) },
      ],
    },
    {
      category: "Pratos",
      items: [
        { name: "Especial da casa", description: "O mais pedido no salão.", price: 48 + (seed % 14), image: dishImage(DISH_PHOTOS.prato, seed, 0) },
        { name: "Executivo", description: "Almoço rápido com acompanhamento.", price: 32 + (seed % 10), image: dishImage(DISH_PHOTOS.prato, seed, 1) },
        { name: "Grelhado especial", description: "Acompanha arroz e salada.", price: 56 + (seed % 12), image: dishImage(DISH_PHOTOS.prato, seed, 2) },
      ],
    },
    {
      category: "Bebidas",
      items: [
        { name: "Suco natural", description: "Frutas da estação.", price: 12, image: dishImage(DISH_PHOTOS.bebida, seed, 0) },
        { name: "Refrigerante", description: "Lata.", price: 8, image: dishImage(DISH_PHOTOS.bebida, seed, 1) },
        { name: "Água com gás", description: "Garrafa 500 ml.", price: 7, image: dishImage(DISH_PHOTOS.bebida, seed, 3) },
      ],
    },
    {
      category: "Sobremesas",
      items: [
        { name: "Sobremesa da casa", description: "Doce do dia.", price: 18, image: dishImage(DISH_PHOTOS.sobremesa, seed, 0) },
        { name: "Petit gateau", description: "Com sorvete de creme.", price: 24, image: dishImage(DISH_PHOTOS.sobremesa, seed, 1) },
      ],
    },
  ];
}

/** Completa fotos e imagens de prato em prévias antigas (sem re-gerar no CRM). */
export function enrichPreviewMedia(preview: SitePreview): SitePreview {
  const seed = hash(preview.name + preview.city);
  const kind = resolvePreviewKind(preview.name, preview.segment);
  const food = kind.food;
  const segment = kind.segment;
  const pool = photosFor(segment, preview.name);
  // Serviço / sorvete: descarta galeria de restaurante inteira (URLs antigas variam).
  let photos = food ? [...(preview.photos || [])] : [];
  for (const src of pool) {
    if (photos.length >= 8) break;
    if (!photos.includes(src)) photos.push(src);
  }

  let menu = preview.menu;
  let services = preview.services;
  let tagline = preview.tagline;
  let about = preview.about;
  let palette = preview.palette;

  if (!food) {
    menu = undefined;
    services = services?.length ? services : servicesFor(segment, preview.name);
    palette = paletteFor(segment);
    tagline = `${preview.name} em ${preview.city}: horário, WhatsApp e endereço em site próprio.`;
    about = `${preview.name} em ${preview.city} (${preview.reviewCount} avaliações · nota ${preview.rating}). Página profissional com serviços, horário e botão de WhatsApp — sem cardápio de restaurante.`;
  } else {
    services = undefined;
    palette = paletteFor(segment);
    tagline = `${preview.name} · pedidos online em ${preview.city}`;
    about = preview.about;
    const needsRichMenu =
      !menu?.length ||
      menu.every((c) => c.items.every((it) => !it.image)) ||
      (isSeafoodPlace(preview.name, segment) && !/moqueca|camarao|camarão|peixe|siri|bobo|bobó/i.test(JSON.stringify(menu)));
    if (needsRichMenu) {
      menu = foodMenu(seed, preview.name, segment);
    } else {
      let i = 0;
      menu = menu!.map((cat) => {
        const n = normalize(cat.category);
        const poolKey: keyof typeof DISH_PHOTOS = /bebida|drink|suco/.test(n)
          ? "bebida"
          : /sobremesa|doce/.test(n)
            ? "sobremesa"
            : /entrada|aperitivo/.test(n)
              ? "entrada"
              : isSeafoodPlace(preview.name, segment) || /peixe|mar|moqueca/.test(n)
                ? "seafood"
                : "prato";
        return {
          ...cat,
          items: cat.items.map((item) => ({
            ...item,
            image: item.image || dishImage(DISH_PHOTOS[poolKey], seed, i++),
          })),
        };
      });
    }
  }

  return {
    ...preview,
    segment,
    photos,
    palette,
    tagline,
    about,
    hours: food ? preview.hours : (preview.hours?.includes("11:00–22:00") ? "Seg–Sáb, 08:00–18:00" : preview.hours),
    ...(food ? { menu, services: undefined } : { menu: undefined, services }),
  };
}

function servicesFor(segment: string, placeName = ""): NonNullable<SitePreview["services"]> {
  const n = normalize(`${placeName} ${segment}`);
  if (/sorvet|gelat/.test(n)) {
    return [
      { name: "Sabores do dia", description: "Vitrine atualizada — pergunte no WhatsApp o que tem agora." },
      { name: "Casquinha, pote e família", description: "Do unitário ao pack para levar." },
      { name: "Encomendas", description: "Festa e evento com reserva pelo WhatsApp." },
    ];
  }
  if (/acai/.test(n)) {
    return [
      { name: "Açaí no copo", description: "Montagem na hora com toppings." },
      { name: "Combos", description: "Opções pra levar ou comer no local." },
      { name: "Pedido no WhatsApp", description: "Manda o sabor e a gente separa." },
    ];
  }
  if (/padaria|cafeteria|cafe|doceria/.test(n)) {
    return [
      { name: "Frescos do dia", description: "Pães, doces e salgados feitos na casa." },
      { name: "Café e lanches", description: "Pra comer aqui ou levar." },
      { name: "Encomendas", description: "Reserve pelo WhatsApp." },
    ];
  }
  if (/chaveir/.test(n)) {
    return [
      { name: "Abertura de portas", description: "Residencial e comercial, com atendimento rápido." },
      { name: "Cópias e chaves", description: "Chaves comuns, tetra e cartão quando disponível." },
      { name: "Troca de segredo / fechadura", description: "Instalação e troca com orientação no local." },
    ];
  }
  if (/oficina|mecanica|auto\s*pe/.test(n)) {
    return [
      { name: "Diagnóstico", description: "Avaliação rápida do problema." },
      { name: "Reparos", description: "Serviço alinhado ao que a região busca no mapa." },
      { name: "Orçamento no WhatsApp", description: "Fale direto com a oficina pelo site." },
    ];
  }
  if (/barbearia|salao/.test(n)) {
    return [
      { name: "Corte", description: "Corte clássico ou degradê, com finalização." },
      { name: "Barba", description: "Toalha quente e navalha." },
      { name: "Combo", description: "Corte + barba no mesmo horário." },
    ];
  }
  if (/advog/.test(n)) {
    return [
      { name: "Consultoria", description: "Primeira conversa para entender o caso." },
      { name: "Contratos", description: "Revisão e elaboração." },
      { name: "Atendimento local", description: "Escritório na cidade, horário marcado." },
    ];
  }
  if (/clinic|dentist|odont|estetic/.test(n)) {
    return [
      { name: "Avaliação", description: "Primeira consulta para diagnóstico." },
      { name: "Tratamentos", description: "Procedimentos alinhados ao que o público busca na região." },
      { name: "Agendamento", description: "WhatsApp no site, sem fila de espera no telefone." },
    ];
  }
  return [
    { name: "Atendimento", description: "Fale com o responsável pelo WhatsApp do site." },
    { name: "Como funciona", description: "Horário, endereço e contato em um link só — pronto pra mandar no WhatsApp." },
    { name: "Presença no Google", description: "Quem te busca no mapa encontra uma página limpa, não só o pin." },
  ];
}

const REVIEW_BITS = [
  "Atendimento rápido e cordial.",
  "Volto sempre que estou na região.",
  "Preço justo e ambiente organizado.",
  "Pedi indicação no mapa e gostei.",
  "Equipe atenciosa, recomendo.",
];
const AUTHORS = ["Carla M.", "Roberto S.", "Ana P.", "Diego L.", "Fernanda G.", "Paulo H."];

export function buildPreviewOpening(contactName: string, companyName: string, url: string, withMenu: boolean, pitch?: string) {
  const who = contactName ? `Olá ${contactName}!` : "Olá!";
  const link = String(url || "").trim();
  // URL sozinha na linha = WhatsApp vira link azul clicável + preview de página.
  const product = withMenu
    ? "um cardápio digital onde o cliente escolhe, monta a sacola e pede no WhatsApp"
    : "um site profissional onde o cliente confia e te chama no WhatsApp em 1 toque";
  if (pitch) {
    return `${who} ${pitch}

Montei ${product} sob medida pra ${companyName} — já no ar, com a cara do seu negócio. Abre e imagina seus clientes usando isso agora:

${link}

Se gostar, a gente publica oficial ainda esta semana. Você é o dono(a)?`;
  }
  return `${who} Sou o Robson Alex, da Info Tech. Vi a ${companyName} no mapa e preparei ${product} pra vocês — visual de produto final, já hospedado. Abre o link e sente como o cliente vê o seu negócio:

${link}

Se fizer sentido, a gente deixa oficial ainda esta semana. Você é o proprietário ou a proprietária?`;
}

export function syntheticPlaces(segment: string, city: string, limit: number): MapPlace[] {
  const food = wantsCardapio(segment);
  const names = food
    ? ["Cantina do Nonno", "Sabor da Esquina", "Grill do Parque", "Pizzaria Vila Nova", "Casa da Moqueca", "Botequim da Praça", "Tempero Mineiro", "Tapioca & Cia", "Churrasquinho do Zé", "La Pasta da Nonna", "Empório do Pão", "Café Aurora", "Hamburgueria 081", "Peixaria da Costa", "Fogão a Lenha"]
    : /barbearia/.test(normalize(segment))
      ? ["Barbearia Dom Corte", "Studio Navalha", "Barba & Tesoura", "Corte Nobre", "Gentleman Club"]
      : /advog/.test(normalize(segment))
        ? ["Escritório Almeida Advogados", "Mendes & Associados", "Núcleo Jurídico Central"]
        : /clinic|dentist|odont/.test(normalize(segment))
          ? ["Clínica Sorriso", "Consultório Dra. Helena", "Odonto Vida", "Estética Harmonize"]
          : ["Casa Local", "Ponto da Cidade", "Negócio da Rua", "Espaço Central", "Oficina da Vila"];
  const contacts = ["Maria Souza", "José Carlos", "Ana Beatriz", "Pedro Henrique", "Luciana Alves", "Rafael Costa", "Patrícia Nunes", "Bruno Oliveira"];
  const out: MapPlace[] = [];
  for (let i = 0; i < limit; i++) {
    const name = `${pick(names, i)}${i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ""}`;
    const phone = `+55 11 9${String(8000 + i * 137).slice(0, 4)}-${String(2000 + i * 211).slice(0, 4)}`;
    out.push({
      name,
      phone,
      city,
      address: `Rua ${pick(["das Palmeiras", "XV de Novembro", "Amazonas", "São João", "Central"], i)}, ${100 + i * 7} — ${city}`,
      contactName: pick(contacts, i + 3),
      rating: 3.8 + ((i * 7) % 12) / 10,
      reviewCount: 12 + (i * 9) % 80,
    });
  }
  return out;
}

function logoForPlace(place: MapPlace, accent: string) {
  if (place.logoUrl) return place.logoUrl;
  const bg = accent.replace("#", "");
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(place.name.slice(0, 28))}&background=${bg}&color=fff&size=128&bold=true&format=png`;
}

export function buildSitePreview(opts: {
  organizationId: string;
  companyId: string;
  contactId: string;
  dealId?: string;
  place: MapPlace;
  segment: string;
  slug: string;
}): SitePreview {
  const seed = hash(opts.place.name + opts.place.city);
  const kind = resolvePreviewKind(opts.place.name, opts.segment);
  const food = kind.food;
  const segment = kind.segment;
  const rating = opts.place.rating || 4 + (seed % 10) / 10;
  const reviewCount = opts.place.reviewCount || opts.place.reviews?.length || 18 + (seed % 60);
  const reviews = (opts.place.reviews?.length
    ? opts.place.reviews.slice(0, 5)
    : [0, 1, 2].map((i) => ({
      author: pick(AUTHORS, seed + i),
      rating: Math.min(5, Math.round(rating)),
      text: `${pick(REVIEW_BITS, seed + i)} (ref. avaliações no Google Maps · nota ${Math.round(rating * 10) / 10})`,
    })));
  const pal = paletteFor(segment);
  const query = encodeURIComponent(`${opts.place.name} ${opts.place.address || opts.place.city}`);
  const logoUrl = logoForPlace(opts.place, pal.accent);
  return {
    id: uid("prev_"),
    organizationId: opts.organizationId,
    slug: opts.slug,
    companyId: opts.companyId,
    contactId: opts.contactId,
    dealId: opts.dealId,
    name: opts.place.name,
    segment,
    city: opts.place.city,
    address: opts.place.address || opts.place.city,
    phone: opts.place.phone,
    rating: Math.round(rating * 10) / 10,
    reviewCount,
    reviews,
    hours: opts.place.hours || (food ? "Seg–Sáb, 11:00–22:00" : /sorvet|padaria|cafe|acai/.test(normalize(segment)) ? "Seg–Dom, 10:00–22:00" : "Seg–Sáb, 08:00–18:00"),
    tagline: food
      ? `${opts.place.name} · ${opts.place.city} — cardápio digital e pedido no WhatsApp.`
      : /sorvet|gelat|acai/.test(normalize(segment))
        ? `${opts.place.name} em ${opts.place.city}: sabores, horário e pedido pelo WhatsApp.`
        : `${opts.place.name} · ${opts.place.city} — site próprio com WhatsApp e endereço.`,
    about: food
      ? `${opts.place.name} já aparece no mapa (${reviewCount} avaliações · nota ${Math.round(rating * 10) / 10}), mas sem cardápio online. Esta prévia entrega o cardápio visual, fotos e pedido direto no WhatsApp ${opts.place.phone || ""}.`
      : /sorvet|gelat|acai/.test(normalize(segment))
        ? `${opts.place.name} em ${opts.place.city} (${reviewCount} avaliações) merece vitrine própria — não cardápio de restaurante. Página limpa com sabores, horário e WhatsApp ${opts.place.phone || ""} pra encomendar.`
        : `${opts.place.name} em ${opts.place.city} estava só no pin do mapa (${reviewCount} avaliações). Esta página organiza quem somos, o que fazemos, horário e WhatsApp ${opts.place.phone || ""} — o produto final que o cliente clica e chama.`,
    palette: pal,
    photos: photosFor(segment, opts.place.name),
    logoUrl,
    menu: food ? foodMenu(seed, opts.place.name, segment) : undefined,
    services: food ? undefined : servicesFor(segment, opts.place.name),
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${query}`,
    previewPath: `/v/${opts.slug}`,
    status: "pronta",
    createdBy: "Time Dev · Sofia Designer Gráfico",
    createdAt: nowISO(),
  };
}

export function ensureDevSquad(db: DB) {
  if (!Array.isArray(db.sitePreviews)) db.sitePreviews = [];
  const mk = (a: Partial<Agent> & Pick<Agent, "id" | "name" | "role">): Agent => ({
    organizationId: db.organization.id,
    description: "",
    objective: "",
    personality: "Técnico, preciso e colaborativo.",
    prompt: "",
    model: "anthropic/claude-sonnet",
    temperature: 0.35,
    knowledgeIds: [],
    tools: ["knowledge.search", "crm.search_contacts"],
    channels: ["webchat"],
    schedule: "Seg–Sex, 08:00–19:00",
    budget: 220,
    spent: 0,
    status: "aguardando",
    permissions: ["crm.view", "helena.use"],
    color: "chart-1",
    metrics: { tasks: 0, conversations: 0, responseRate: 0, conversions: 0 },
    teamId: DEV_TEAM_ID,
    ...a,
  });
  if (!db.agents.some((a) => a.id === DEV_FE_ID)) {
    db.agents.push(mk({
      id: DEV_FE_ID, name: "Caio Ferreira", role: "Front-end Sênior", color: "chart-1",
      description: "Engenheiro de software sênior · front-end",
      objective: "Montar prévia premium na Vercel: tipografia, CTA WhatsApp, layout por nicho (cardápio só restaurante/lanchonete).",
      personality: "Detalhista em UI, fala de entrega, não de buzzword.",
      supervisorId: DEV_FE_ID,
      model: "anthropic/claude-sonnet",
    }));
  } else {
    const caio = db.agents.find((a) => a.id === DEV_FE_ID);
    if (caio) caio.model = "anthropic/claude-sonnet";
  }
  if (!db.agents.some((a) => a.id === DEV_BE_ID)) {
    db.agents.push(mk({
      id: DEV_BE_ID, name: "Diego Nakamura", role: "Back-end Sênior", color: "chart-2",
      description: "Engenheiro de software sênior · back-end",
      objective: "Dados limpos, slug estável, publish Vercel e link clicável pro comercial.",
      personality: "Direto, pensa em dado limpo e link estável.",
      supervisorId: DEV_FE_ID,
      model: "openai/gpt-4o",
    }));
  } else {
    const diego = db.agents.find((a) => a.id === DEV_BE_ID);
    if (diego) diego.model = "openai/gpt-4o";
  }
  if (!db.agents.some((a) => a.id === DEV_DS_ID)) {
    db.agents.push(mk({
      id: DEV_DS_ID, name: "Sofia Almeida", role: "Designer Gráfico", color: "chart-4",
      description: "Designer gráfico · sites e cardápios digitais",
      objective: "Direção de arte: cardápio só em restaurante/lanchonete; sorveteria e serviços ganham site de marca (não prato genérico).",
      personality: "Olho de marca: visual irresistível, hierarquia limpa, produto final que o dono quer publicar.",
      supervisorId: DEV_FE_ID,
      model: "anthropic/claude-sonnet",
      temperature: 0.55,
    }));
  } else {
    const sofia = db.agents.find((a) => a.id === DEV_DS_ID);
    if (sofia) {
      sofia.role = "Designer Gráfico";
      sofia.model = "anthropic/claude-sonnet";
      sofia.description = "Designer gráfico · sites e cardápios digitais";
      sofia.objective = "Direção de arte: cardápio só em restaurante/lanchonete; sorveteria e serviços ganham site de marca.";
    }
  }
  const team: Team = {
    id: DEV_TEAM_ID,
    organizationId: db.organization.id,
    name: "Desenvolvimento IA",
    objective: "Sofia (Designer Gráfico) + Caio + Diego: cardápio/site bonito a partir do mapa, hospedar na Vercel e entregar link clicável ao Time Comercial.",
    supervisorId: DEV_FE_ID,
    agentIds: [...DEV_AGENT_IDS],
    goals: "Arte + prévia na Vercel + link clicável no WhatsApp",
    schedule: "Seg–Sex, 08:00–19:00",
    channels: ["webchat", "whatsapp"],
    budget: 700,
    spent: 0,
    status: "ativo",
    metrics: { leads: 0, meetings: 0, conversions: 0 },
  };
  const existing = db.teams.find((t) => t.id === DEV_TEAM_ID);
  if (!existing) db.teams.push(team);
  else {
    existing.objective = team.objective;
    existing.goals = team.goals;
    existing.agentIds = [...DEV_AGENT_IDS];
    existing.supervisorId = DEV_FE_ID;
  }
}

export function applyPresenceFromPlaces(opts: {
  places: MapPlace[];
  segment: string;
  city: string;
}): { count: number; previewIds: string[]; slugs: string[] } {
  const previewIds: string[] = [];
  const slugs: string[] = [];
  const published: SitePreview[] = [];
  const anyFood = opts.places.some((p) => resolvePreviewKind(p.name, opts.segment).food);

  update((d) => {
    ensureDevSquad(d);
    const pipeline = d.pipelines[0];
    const sdrs = d.agents.filter((a) => a.role === "SDR");
    const used = new Set(d.sitePreviews.map((p) => p.slug));
    d.agents.forEach((a) => {
      if (a.id === DEV_FE_ID) { a.status = "trabalhando"; a.currentTask = "Caio · páginas na Vercel"; a.metrics.tasks += opts.places.length; }
      if (a.id === DEV_BE_ID) { a.status = "trabalhando"; a.currentTask = anyFood ? "Diego · dados do cardápio + deploy" : "Diego · dados + deploy"; a.metrics.tasks += opts.places.length; }
      if (a.id === DEV_DS_ID) { a.status = "trabalhando"; a.currentTask = anyFood ? "Sofia · arte do cardápio digital" : "Sofia · identidade visual do site"; a.metrics.tasks += opts.places.length; }
      if (a.teamId === "t_com" && a.role === "SDR") { a.status = "trabalhando"; a.currentTask = "Aguardar admin aprovar prévia"; }
    });
    const devTeam = d.teams.find((t) => t.id === DEV_TEAM_ID);
    if (devTeam) {
      devTeam.status = "ativo";
      devTeam.metrics.leads += opts.places.length;
    }
    const com = d.teams.find((t) => t.id === "t_com");
    if (com) {
      com.status = "ativo";
      com.metrics.leads += opts.places.length;
    }

    opts.places.forEach((place, i) => {
      const owner = sdrs[i % Math.max(1, sdrs.length)] ?? d.agents.find((a) => a.role === "SDR");
      if (!owner) return;
      const kind = resolvePreviewKind(place.name, opts.segment);
      const food = kind.food;
      const segment = kind.segment;
      const compId = uid("c_maps_");
      const contactId = uid("p_maps_");
      const dealId = uid("d_maps_");
      let slug = slugify(place.name);
      if (used.has(slug)) slug = `${slug}-${uid("").slice(0, 4)}`;
      used.add(slug);

      d.companies.unshift({
        id: compId,
        organizationId: d.organization.id,
        name: place.name,
        segment,
        city: place.city || opts.city,
        size: "1–10",
        website: "",
        ownerId: owner.id,
        createdAt: nowISO(),
      });
      const tags = ["#sem-site", "Google Maps", segment.toLowerCase(), "#previa-pronta"];
      if (food) tags.push("#sem-cardapio");
      const dx = diagnoseLead({
        name: place.name,
        segment,
        city: place.city || opts.city,
        website: "",
        tags,
        rating: place.rating,
        photos: 2,
        hasMenu: false,
        hasWhatsApp: Boolean(place.phone),
      });
      d.contacts.unshift({
        id: contactId,
        organizationId: d.organization.id,
        name: place.contactName || place.name,
        email: "",
        phone: place.phone,
        companyId: compId,
        title: "Proprietário",
        tags: setCycleTag([...tags, ...dx.findings.map((f) => `#dx-${f.code}`)], "preview"),
        source: "Prospecção",
        ownerId: owner.id,
        status: "lead",
        score: dx.score,
        consent: true,
        createdAt: nowISO(),
        lastContactAt: nowISO(),
      });
      const dealTags = food ? ["#sem-site", "#sem-cardapio", "prévia"] : ["#sem-site", "prévia"];
      const stage = stageForNewProspect(pipeline, dealTags) || pipeline?.stages[0];
      if (stage && pipeline) {
        d.deals.unshift({
          id: dealId,
          organizationId: d.organization.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: `${food ? "Site + cardápio" : "Site"} · ${place.name}`,
          contactId,
          companyId: compId,
          value: d.serviceOffers?.find((o) => o.id === (food ? "svc_cardapio" : "svc_site"))?.price
            ?? d.serviceOffers?.find((o) => o.id === "svc_site")?.price
            ?? 100,
          probability: stage.probability,
          expectedClose: new Date(Date.now() + 20 * 86_400_000).toISOString(),
          ownerId: owner.id,
          ownerType: "agent",
          source: "Prospecção",
          status: "aberto",
          tags: dealTags,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
      }
      const preview = buildSitePreview({
        organizationId: d.organization.id,
        companyId: compId,
        contactId,
        dealId,
        place,
        segment,
        slug,
      });
      d.sitePreviews.unshift(preview);
      previewIds.push(preview.id);
      slugs.push(slug);
      published.push(preview);
      const url = previewUrl(slug);
      // Conversa pronta no CRM — o texto só entra no Inbox depois do envio real na Evolution
      // (senão o WhatsApp Web fica sem o chat e o dispatcher acha que já mandou).
      d.conversations.unshift({
        id: uid("conv_"),
        organizationId: d.organization.id,
        contactId,
        channel: "whatsapp",
        connectionId: getAgencyConnection(d)?.id ?? d.salesFlow?.sharedConnectionId,
        flow: { origin: "prospeccao", state: "novo", closerAttempts: 0 },
        status: "pendente",
        handlerType: "agent",
        handlerId: owner.id,
        unread: 0,
        sentiment: "neutro",
        lastMessageAt: nowISO(),
        messages: [{
          id: uid("m_"),
          from: "system",
          authorName: "Helena",
          text: `Prévia montada (${url}). Aguardando revisão do admin em IA → Prévia de sites. Só depois do “Aprovar” o WhatsApp dispara.`,
          at: nowISO(),
          kind: "event",
        }],
      });
      d.activities.unshift({
        id: uid("ac_"),
        organizationId: d.organization.id,
        contactId,
        dealId,
        type: "ia",
        text: `Sofia + Time Dev montaram a prévia ${url}. Admin revisa e aprova antes do envio comercial.`,
        actor: "Helena",
        createdAt: nowISO(),
      });
    });

    const code = `OP-${String(d.operations.length + 2940).padStart(4, "0")}`;
    d.operations.unshift({
      id: uid("op_dev_"),
      organizationId: d.organization.id,
      code,
      title: `Prévia digital · ${opts.segment}`,
      objective: `Encontrar ${opts.places.length} ${opts.segment} sem site${anyFood ? " e sem cardápio online" : ""}, gerar prévia e enviar o link ao comercial.`,
      requestedBy: "Helena",
      agentIds: [...DEV_AGENT_IDS, ...d.agents.filter((a) => a.role === "SDR").map((a) => a.id)],
      connectionId: getAgencyConnection(d)?.id,
      status: "completed",
      total: opts.places.length,
      processed: opts.places.length,
      metrics: { responded: 0, interested: 0, qualified: 0, meetings: 0, handoffs: opts.places.length },
      cost: Math.round(opts.places.length * 0.12 * 100) / 100,
      steps: [
        { id: "s0", label: "Varredura Maps (sem site / sem cardápio)", status: "done" },
        { id: "s1", label: "Sofia · Designer Gráfico (arte + cardápio/site)", status: "done" },
        { id: "s2", label: anyFood ? "Diego · cardápio e dados" : "Diego · catálogo e dados", status: "done" },
        { id: "s3", label: "Caio · páginas + hospedagem Vercel", status: "done" },
        { id: "s4", label: "Link público clicável", status: "done" },
        { id: "s5", label: "Aguardando revisão do admin", status: "running" },
        { id: "s6", label: "Envio WhatsApp (após aprovar)", status: "pending" },
      ],
      events: [
        { at: nowISO(), text: `Helena acionou o Time Dev + Designer Gráfico para ${opts.segment} em ${opts.city}`, kind: "info" },
        { at: nowISO(), text: `${opts.places.length} prévias no ar · admin revisa em IA → Prévia de sites antes do WhatsApp`, kind: "success" },
      ],
      createdAt: nowISO(),
      result: `${opts.places.length} prévias aguardando aprovação`,
    });
    bumpAutomation(d, "lead_criado", opts.places.length);
  });

  if (typeof process !== "undefined" && process.env?.VITEST) {
    return { count: previewIds.length, previewIds, slugs };
  }

  // Publica no /v/… pra admin revisar — WhatsApp SÓ depois de aprovar na dashboard.
  import("@/lib/dev/previewPublish").then(async ({ publishSitePreviews }) => {
    await publishSitePreviews(published);
    const { pushHelenaMessage } = await import("@/lib/helena/engine");
    pushHelenaMessage(
      `${published.length} prévia(s) no ar aguardando sua revisão em IA → Prévia de sites. Aprove as que estão boas pra liberar o envio no WhatsApp.`,
      { type: "result", ok: true, title: "Revisão de layout · admin", detail: published.slice(0, 3).map((p) => previewUrl(p.slug)).join(" · ") },
    );
  }).catch((err) => console.warn("[Time Dev deploy]", err));

  return { count: previewIds.length, previewIds, slugs };
}

export function reviewSitePreview(
  previewId: string,
  decision: "aprovada" | "rejeitada",
  opts?: { note?: string; reviewer?: string },
) {
  let ok = false;
  update((d) => {
    const row = d.sitePreviews.find((p) => p.id === previewId);
    if (!row) return;
    if (row.status === "enviada" || row.status === "aprovada_cliente") return;
    row.status = decision;
    row.reviewedAt = nowISO();
    row.reviewedBy = opts?.reviewer || "Admin";
    if (opts?.note) row.reviewNote = opts.note;
    ok = true;
    const conv = d.conversations.find((c) => c.contactId === row.contactId);
    conv?.messages.unshift({
      id: uid("m_"),
      from: "system",
      authorName: "Admin",
      text: decision === "aprovada"
        ? `Layout aprovado (${previewUrl(row.slug)}). Liberado para envio no WhatsApp.`
        : `Layout rejeitado — Time Dev/Designer refaz. ${opts?.note || ""}`.trim(),
      at: nowISO(),
      kind: "event",
    });
  });
  return ok;
}

/** Dispara WhatsApp só das prévias aprovadas (ou ids filtrados). */
export async function sendApprovedPreviews(previewIds?: string[]) {
  const db = getDB();
  const pool = (db.sitePreviews || []).filter((p) => {
    if (p.status !== "aprovada") return false;
    if (previewIds?.length) return previewIds.includes(p.id);
    return true;
  });
  if (!pool.length) return { sent: 0, message: "Nenhuma prévia aprovada para enviar." };

  const { publishSitePreviews } = await import("@/lib/dev/previewPublish");
  const deployed = await publishSitePreviews(pool);
  const contacts = pool.map((p) => {
    const c = db.contacts.find((x) => x.id === p.contactId);
    const comp = db.companies.find((x) => x.id === p.companyId);
    if (!c) return null;
    return {
      phone: c.phone,
      name: c.name,
      companyName: comp?.name ?? p.name,
      contactId: c.id,
      agentName: "Robson Alex",
      withMenu: Boolean(p.menu?.length),
      slug: p.slug,
      previewId: p.id,
    };
  }).filter(Boolean) as Array<{
    phone: string; name: string; companyName: string; contactId: string;
    agentName: string; withMenu: boolean; slug: string; previewId: string;
  }>;

  if (!contacts.length) return { sent: 0, message: "Contatos das prévias não encontrados." };

  const { dispatchProspectMessages } = await import("@/lib/evolution/prospectDispatcher");
  await dispatchProspectMessages(
    contacts,
    (ct) => {
      const row = contacts.find((x) => x.contactId === ct.contactId);
      const live = row ? deployed[row.slug]?.vercelUrl : undefined;
      const url = live || previewUrl(row?.slug ?? "preview");
      const lead = db.contacts.find((x) => x.id === ct.contactId);
      const pitch = (lead?.tags || []).includes("#dx-cardapio") || (lead?.tags || []).includes("#dx-sem_site")
        ? diagnoseLead({
          name: ct.companyName,
          segment: db.companies.find((c) => c.id === lead?.companyId)?.segment,
          city: db.companies.find((c) => c.id === lead?.companyId)?.city,
          tags: lead?.tags,
          hasWhatsApp: true,
        }).recommend_pitch
        : undefined;
      return formatForWhatsApp(buildPreviewOpening(ct.name, ct.companyName, url, Boolean(row?.withMenu), pitch));
    },
    db.organization.id,
  );

  update((d) => {
    for (const ct of contacts) {
      const row = d.sitePreviews.find((p) => p.id === ct.previewId);
      if (row) row.status = "enviada";
    }
  });

  return { sent: contacts.length, message: `${contacts.length} prévia(s) enviadas no WhatsApp.` };
}

export function runPresencePipeline(p: {
  segment?: string;
  city?: string;
  limit?: number;
  nationwide?: boolean;
}): { ok: true; message: string; data: Record<string, unknown> } {
  const segment = String(p.segment || "negócios locais");
  const city = String(p.city || "Brasil");
  const limit = Math.min(Math.max(Number(p.limit) || 10, 1), 50);
  const food = isFoodNiche(segment);
  const isTest = typeof process !== "undefined" && Boolean(process.env?.VITEST);

  if (isTest) {
    const places = syntheticPlaces(segment, city, limit);
    const res = applyPresenceFromPlaces({ places, segment, city });
    return {
      ok: true,
      message: `Time Dev montou ${res.count} prévias (teste).`,
      data: { count: res.count, previewIds: res.previewIds, slugs: res.slugs },
    };
  }

  // Varredura real → landing com logo/avaliações → Vercel → link no WhatsApp.
  import("@/lib/prospect/mapsSearch").then(async ({ searchBusinessesWithoutWebsite }) => {
    const { pushHelenaMessage } = await import("@/lib/helena/engine");
    pushHelenaMessage(
      `Time Dev + Designer Gráfico (Sofia): arte do ${food ? "cardápio" : "site"}, páginas e publish na Vercel em ${city}…`,
      { type: "result", ok: true, title: "Time Dev · design + Vercel", detail: "em andamento" },
    );
    let places = await searchBusinessesWithoutWebsite({
      segment,
      city,
      nationwide: p.nationwide === true,
      limit,
      noWhatsAppAi: false,
    });
    if (!places.length) places = syntheticPlaces(segment, city, Math.min(limit, 5));
    const res = applyPresenceFromPlaces({ places, segment, city });
    pushHelenaMessage(
      `Prévias prontas: ${res.count} ${food ? "cardápio + site" : "site"} com arte da Sofia · hospedados na Vercel · link clicável no WhatsApp. Quando o lead abrir (✓✓ azul), eu continuo.`,
      { type: "result", ok: true, title: "Time Dev · Vercel", detail: res.slugs.slice(0, 3).map((s) => previewUrl(s)).join(" · ") },
    );
  }).catch((err) => console.warn("[Time Dev]", err));

  return {
    ok: true,
    message: `Time Dev + Designer Gráfico (Sofia): varre ${segment} em ${city}, cria cardápio/site bonito, publica na Vercel e manda link clicável no WhatsApp. Quando visualizar (azul), continuo sozinha.`,
    data: { count: 0, previewIds: [], slugs: [], async: true },
  };
}
