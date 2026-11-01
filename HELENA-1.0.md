# Helena 1.0 — Ciclo Comercial Persistente

Prompt técnico para o Cursor. **Não** adicionar agente novo, plano novo, nem tela de CRM extra. **Não** alterar preços Impulso R$ 70 / Máquina R$ 140. **Não** reescrever a Helena: ela continua orquestradora; times executam via `runTool()`.

Objetivo: um ciclo verificável e repetível — encontrar → diagnosticar com evidência → prévia personalizada → link público → WhatsApp → registrar resposta → próximo passo — **sem localStorage como fonte da verdade** e **sem depender de alguém deixar o Chrome aberto**.

---

## Não mexer (já funciona)

- Orquestração Helena + `runTool()` + Execuções
- WhatsApp Evolution / Hostless, QR, nome da Linha Helena, antiban, opt-out
- Paywall trial 2 dias, Impulso / Máquina, Time Dev só no Máquina
- Onboarding `/comecar`, landing, `/status`
- Publish Vercel (`server/dev-publish.mjs`) — token só em env, nunca no Git
- Schema já no Supabase: `database/supabase-helena-rpa.sql`
- Conta Info Tech (platform) pode continuar no mock local para demo interna

---

## Fonte da verdade

- Postgres Supabase (`DATABASE_URL` / service role **só no servidor**).
- Front nunca leva service key. Public key só se RLS estiver correta.
- Worker no Render consome `rpa_jobs` e retoma o ciclo com o browser fechado.
- Dual-write no começo (store + Supabase) só se necessário para não quebrar a UI; corte o localStorage do **cliente** quando o ciclo 1 passar no aceite.
- Toda mutação de negócio continua passando por `runTool()`.

---

## Etapa 1 — Persistência (fonte oficial)

**Fazer**

- Cliente HTTP no servidor (`server/helena-db.mjs`) com service role / `DATABASE_URL`.
- Mapear: organizations, profiles, companies, contacts, lead_diagnoses, commercial_memory, conversations, messages, rpa_jobs, executions, approvals, wa_connections, deals, proposals, dev_jobs.
- `rpa.run_shift`, `messages.send`, `prospect.scan_maps`, `calendar.*`, `dev.build_presence` gravam no Postgres além do mock.
- Job `queued` no Supabase; Render faz tick (já existe fila local — passar a ler `rpa_jobs`).

**Aceite**

- Fecha o navegador, abre outro, o lead e a execução ainda existem (conta customer).
- Dois tenants não se leem (RLS / `organization_id`).
- `npm test` SaaS atuais continuam verdes.

---

## Etapa 2 — Diagnóstico inteligente (não só `#sem-site`)

**Fazer**

- Tool `leads.diagnose` (Helena chama; não criar agente novo).
- Entrada: empresa OSM + sinais públicos (site/cardápio/fotos/nota/WhatsApp).
- Saída em `lead_diagnoses`: `score` 0–100, `opportunity`, `findings[]` com evidência, `recommend_offer`, `recommend_pitch`.
- UI: card no contato / operação. Sem isso, **não** dispara WhatsApp de venda (só pesquisa).

**Aceite**

- Uma pizzaria gera relatório do tipo: “cardápio desatualizado / pouco dado no Google / concorrente com pedido online → site + cardápio + WhatsApp”.
- Score e oferta gravados no Supabase, visíveis depois de F5.

---

## Etapa 3 — Prévia personalizada

**Fazer**

- `dev.build_presence` lê o diagnóstico (não só o nome).
- HTML usa paleta/copy/cardápio/serviços inferidos da evidência; o pitch do WhatsApp cita o problema do diagnóstico.
- Publish já existente: Vercel URL obrigatória; GitHub opcional.

**Aceite**

- Duas pizzarias diferentes **não** geram o mesmo texto com o nome trocado.
- Link `https://*.vercel.app` abre no celular.

---

## Etapa 4 — Ciclo comercial persistente

**Fazer**

- Estado explícito no deal/contact: `encontrado → diagnosticado → preview → link_enviado → respondeu|silencio → reuniao → resultado`.
- Cada transição = `runTool` + linha em `executions` + `rpa_jobs` se for assíncrono.
- Painel Operações / Visão geral lê **só** esses eventos (zero teatro).

**Aceite**

- Dá para contar, só com SQL: quantos leads, quantos diagnósticos, quantos links, quantas respostas, quantas reuniões.

---

## Etapa 5 — Memória e acompanhamento

**Fazer**

- Objeção “achei caro” → `commercial_memory.kind = preco_alto` + `due_at`.
- Silêncio → `sem_resposta` + retorno no horário comercial (regras antiban já existentes).
- Opt-out / sem consentimento: **nunca** reenfileira.
- Worker retoma `due_at <= now()` sem o dono abrir o app.

**Aceite**

- Diz “caro”, fecha o Chrome, no dia seguinte o job de retorno existe no Supabase (ainda **não** cobrou sozinha).

---

## Etapa 6 — Autonomia (só depois das 5)

**Fazer**

- Rotina diária: N pizzarias na cidade X, até a cota do plano.
- Sensível continua em `approvals` + `sensitive_actions`: proposta, Pix, publicar domínio próprio, apagar LGPD.

**Aceite**

- Pesquisa/diagnóstico/prévia podem ser autonomia 2–3. Cobrar e publicar domínio = aprovação humana.

---

## Teste de operação real (critério de produto)

Uma cidade, nicho pizzaria, **10 ciclos**. Cada ciclo:

1. Encontrar  
2. Diagnóstico com evidências no banco  
3. Prévia distinta  
4. Link público que abre  
5. WhatsApp com o link (chip já conectado — QR é setup, não conta como falha do ciclo)  
6. Registrar resposta ou silêncio  
7. Próximo passo + histórico intacto após fechar o browser  

Intervenção manual permitida só: conectar o chip uma vez, aprovar cobrança/publicação sensível, e a cidade/nicho inicial.

Dez ciclos verdes = funcionamento. **Não** é prova de lucro. Depois medir: custo/lead, custo/preview, conversão paga, churn, margem.

---

## Ordem no Cursor

Implementar **uma etapa por PR/chat**. Não misturar 2–6 antes da 1 passar no aceite. Se algo já existente quebrar (WhatsApp, trial, publish Vercel), reverter essa etapa e não “compensar” com feature nova.
