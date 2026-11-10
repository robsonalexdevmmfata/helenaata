import { describe, expect, it } from "vitest";
import { liveServiceOffers } from "@/lib/catalog";
import { nextInboxReply } from "@/lib/helena/inbox-brain";

const offers = liveServiceOffers("org");

describe("inbox conversation brain", () => {
  it("na primeira resposta pergunta se é proprietário(a)", () => {
    const reply = nextInboxReply("Oi", [{ from: "agent", text: "Olá! Sou o Robson Alex..." }], "Maria");
    expect(reply).toMatch(/proprietári/i);
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
      { from: "agent", text: "Topa 10 minutos para eu te mostrar o caminho" },
    ];
    expect(nextInboxReply("Obrigada", history, "Ana")).toBeNull();
  });

  it("só fala valor quando o cliente pergunta", () => {
    const history = [{ from: "agent", text: "Você é o proprietário ou a proprietária do estabelecimento?" }];
    const silent = nextInboxReply("Sou a dona", history, "Ana", offers);
    expect(silent).not.toMatch(/R\$|297|547/);
    expect(silent).toMatch(/site|10 minutos|link/i);
    const quoted = nextInboxReply("Quanto custa?", history, "Ana", offers);
    expect(quoted).toMatch(/R\$|100|site|cardápio/i);
  });

  it("depois que confirma dono, manda oferta com link público", () => {
    const history = [{ from: "agent", text: "Você é o proprietário, a proprietária ou a pessoa responsável?" }];
    const reply = nextInboxReply("Sim, sou o dono", history, "João", offers, "Restaurantes", {
      url: "https://helenaata.vercel.app/v/cantina",
      withMenu: true,
      companyName: "Cantina",
    });
    expect(reply).toMatch(/helenaata\.vercel\.app\/v\/cantina/);
    expect(reply).toMatch(/cardápio|site/i);
  });

  it("áudio após pergunta de dono também recebe o link", () => {
    const history = [{ from: "agent", text: "Você é o proprietário ou a proprietária?" }];
    const reply = nextInboxReply("[Áudio] sou o responsável sim", history, "Pedro", offers, "Barbearia", {
      url: "https://helenaata.vercel.app/v/barba",
      withMenu: false,
      companyName: "Studio Navalha",
    });
    expect(reply).toMatch(/\/v\/barba/);
  });

  it("quebra objeção de Instagram sem soltar preço", () => {
    const history = [{ from: "agent", text: "Você é o proprietário ou a proprietária?" }];
    const reply = nextInboxReply("Já tenho Instagram, não preciso de site", history, "Carlos", offers);
    expect(reply).toMatch(/Google|80%/i);
    expect(reply).not.toMatch(/R\$/);
  });
});
