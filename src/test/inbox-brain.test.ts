import { describe, expect, it } from "vitest";
import { liveServiceOffers } from "@/lib/catalog";
import { nextInboxReply } from "@/lib/helena/inbox-brain";

const offers = liveServiceOffers("org");

describe("inbox conversation brain", () => {
  it("na primeira resposta pergunta se é proprietário(a)", () => {
    const reply = nextInboxReply("Oi", [{ from: "agent", text: "Olá! Sou o Robson Alex..." }], "Maria");
    expect(reply).toMatch(/proprietári|responsável/i);
  });

  it("se não for dono, pede o WhatsApp certo e não insiste no site", () => {
    const history = [
      { from: "agent", text: "Você é o proprietário ou a proprietária do estabelecimento?" },
    ];
    const reply = nextInboxReply("Não, esse WhatsApp é só para vendas", history, "Loja");
    expect(reply).toMatch(/proprietári/i);
    expect(reply).not.toMatch(/landing|R\$/i);
  });

  it("não manda outro pitch depois de um obrigado", () => {
    const history = [
      { from: "agent", text: "Você é o proprietário ou a proprietária do estabelecimento?" },
      { from: "agent", text: "tem alguma inteligência artificial operando" },
      { from: "agent", text: "Topa 10 minutos para eu te mostrar o caminho" },
    ];
    expect(nextInboxReply("Obrigada", history, "Ana")).toBeNull();
  });

  it("dono de restaurante: pergunta se tem IA na operação", () => {
    const history = [{ from: "agent", text: "Você é o proprietário, a proprietária ou a pessoa responsável?" }];
    const reply = nextInboxReply("Sou proprietario sim", history, "João", offers, "Restaurantes", {
      url: "https://helenaata.vercel.app/v/cantina",
      withMenu: true,
      companyName: "Cantina",
    });
    expect(reply).toMatch(/intelig[eê]ncia artificial|IA operando/i);
    expect(reply).not.toMatch(/helenaata\.vercel\.app/);
  });

  it("advogado proprietário recebe o pitch padrão Robson (site + IA WhatsApp)", () => {
    const history = [{ from: "agent", text: "Você é a responsável pelo escritório?" }];
    const reply = nextInboxReply("Sou o proprietário sim", history, "Iverson", offers, "Advogados", {
      companyName: "Escritório Iverson",
    });
    expect(reply).toMatch(/Robson Alex/);
    expect(reply).toMatch(/Site profissional para advocacia/i);
    expect(reply).toMatch(/Agente de IA para atendimento pelo WhatsApp/i);
    expect(reply).toMatch(/demonstra[cç][aã]o/i);
    expect(reply).toMatch(/Doutor Iverson/i);
  });

  it("depois da resposta sobre IA, manda oferta com link público", () => {
    const history = [
      { from: "agent", text: "Você é o proprietário ou a proprietária?" },
      { from: "contact", text: "Sou o dono" },
      { from: "agent", text: "tem alguma inteligência artificial operando na empresa?" },
    ];
    const reply = nextInboxReply("Não, tudo manual", history, "João", offers, "Restaurantes", {
      url: "https://helenaata.vercel.app/v/cantina",
      withMenu: true,
      companyName: "Cantina",
    });
    expect(reply).toMatch(/helenaata\.vercel\.app\/v\/cantina/);
    expect(reply).toMatch(/cardápio|site|manual/i);
  });

  it("áudio confirmando responsável abre pergunta de IA", () => {
    const history = [{ from: "agent", text: "Você é o proprietário ou a proprietária?" }];
    const reply = nextInboxReply("[Áudio] sou o responsável sim", history, "Pedro", offers, "Barbearia");
    expect(reply).toMatch(/intelig[eê]ncia artificial|IA operando/i);
  });

  it("só fala valor quando o cliente pergunta", () => {
    const history = [{ from: "agent", text: "Você é o proprietário ou a proprietária do estabelecimento?" }];
    const silent = nextInboxReply("Sou a dona", history, "Ana", offers);
    expect(silent).not.toMatch(/R\$|297|547/);
    expect(silent).toMatch(/intelig[eê]ncia artificial|IA/i);
    const quoted = nextInboxReply("Quanto custa?", history, "Ana", offers);
    expect(quoted).toMatch(/R\$|100|site|cardápio/i);
  });

  it("quebra objeção de Instagram sem soltar preço", () => {
    const history = [{ from: "agent", text: "Você é o proprietário ou a proprietária?" }];
    const reply = nextInboxReply("Já tenho Instagram, não preciso de site", history, "Carlos", offers);
    expect(reply).toMatch(/Google|80%/i);
    expect(reply).not.toMatch(/R\$/);
  });
});
