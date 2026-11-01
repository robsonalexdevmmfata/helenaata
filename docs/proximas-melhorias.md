# Próximas melhorias — Helena

## Mapa (nov/2026) — um cérebro, sem teatro

| Frente | Estado | Onde |
| --- | --- | --- |
| Dossiê + NBA + evidência | Implementado | `intelligence.ts`, CRM Dossiê |
| Adequação ao catálogo + simulador | Implementado | `decision.ts` — só `serviceOffers` ativos |
| Confiança / contradição / qualidade | Implementado | dossiê |
| Memória de decisão | Implementado | `commercialDecisions` + SQL `004` |
| Recuperação / saúde / consumo | Implementado | Command Center, `/configuracoes/consumo` |
| Sala de negociação (assinante) | Implementado | `/crm/sala/:id` — aceite no CRM, não e-sign |
| Copilot de cadastro | Implementado | paleta + `intelligence.ask` |
| Deal Room público, portal do cliente, e-sign, pagamentos, Learning Loop entre contas | Não | falta backend/consentimento; não fingir |
| Mission Control + briefing + conselho | Implementado | `/comando`, `command.ts`, `missions.*` — Helena orquestra times reais; sem taxa inventada |
| Voz, gêmeo digital, auditor de código, CS portal | Não | Helena não finge o que não orquestra |
| Autonomia no `needsApproval` + circuit breaker | Implementado | `reliability.ts` — kill switch e RPA falho param lote |
| Saúde de integrações | Implementado | `/integracoes/saude` — conexões + fila, sem segredo |
| Benchmark de agentes | Implementado | execuções reais em IA → Agentes |
| Replay de missão | Implementado | `helena.replay` + Mission Control |
| Command API HTTP / marketplace / eval lab / e-sign | Não | falta Postgres + auth de sistema; não fingir |
| Always-on (aba fechada) | Parcial | Worker Render 15s + `rpa_jobs` Postgres; missões ficam no snapshot Supabase |
| Watchdog | Implementado | `always-on.ts` — fila parada, missão sem evento, WA offline |

SQL: `database/004_intelligence_3.sql` e `database/migrations/006_supabase_workspace_state.sql` no Supabase da Info Tech. O workspace é carregado e persistido no Supabase; o ciclo também mantém sua sincronização às tabelas normalizadas. Impulso R$ 70 / Máquina R$ 140 / cota 30→150 inalterados.

---

Documento de evolução. A Central RPA, o radar, o follow-up, a proposta com aprovação, o relatório e a primeira missão já entram no painel — o expediente **ainda começa** quando alguém agenda ou dispara. Não vender como operação 24h sem intervenção.

Na live: mostrar o que já executa (encontrar → diagnosticar → prévia → WhatsApp). O resto entra como roadmap.

Não altera preços Impulso (R$ 70) / Máquina (R$ 140), limites comerciais nem times atuais.

---

## Já funciona (não misturar com o futuro)

- Painel: planos, equipes, CRM, agenda, operações, execuções
- Onboarding `/comecar`: Linha Helena, QR, mensagem de teste
- Varredura Maps, diagnóstico com score 0–100 e evidência
- Prévia personalizada e link público (Time Dev no plano Máquina)
- WhatsApp com antiban e opt-out
- Workspace persistente no Supabase via snapshot JSONB, sem armazenamento operacional no navegador
- Ciclo persistente no Supabase (`encontrado` → `diagnosticado` → `preview` → `link_enviado` → `respondeu` / `reuniao`)
- Fila `rpa_jobs` + worker no Render para disparo com o browser fechado (envio WhatsApp)
- Expediente RPA ainda **começa quando alguém dispara** (`rpa.run_shift`)

---

## 1. Central RPA

Fila persistente de tarefas comerciais no Postgres, por organização.

- Listar: pendente, em execução, concluída, falha
- Tipo, lead, horário, duração, tentativas, erro
- Reprocessar falha com limite
- Retry com intervalo progressivo
- Idempotência (não executar a mesma tarefa duas vezes)
- Monitoramento: estado do worker, última e próxima execução, tempo médio, alertas

Tela no painel, identidade visual atual. Sem sistema paralelo.

---

## 2. Radar de oportunidades (programado)

Varredura agendada por nicho e cidade — não confundir com o Radar de atendimento (SLA do inbox).

- Configurar nicho, cidade e cota do plano
- Rodar no horário, sem depender do Chrome aberto
- Evitar empresa/contato duplicado
- Encaminhar para o diagnóstico que já existe
- Abrir missão para o comercial

---

## 3. Follow-up inteligente

Hoje a objeção “achei caro” já vira tarefa e memória no persist. Falta o retorno sozinho.

- Sem resposta → próxima tentativa no horário comercial
- “Caro” / sem interesse / pediu retorno → memória comercial + abordagem diferente
- Respeitar opt-out e consentimento (nunca reenfileirar)
- Mensagem sensível continua com aprovação humana

---

## 4. Propostas comerciais automáticas

Tabela `proposals` já existe no Supabase. Falta o fluxo.

- Gerar a partir do diagnóstico e da oferta recomendada
- Escopo e benefício daquele negócio (não texto genérico)
- Versão, status, histórico
- Aprovação humana **antes** do envio
- Sem disparo em massa

---

## 5. Relatório diário

Resumo para o dono, números só do Supabase/Postgres.

- Leads encontrados, diagnósticos, prévias, mensagens, respostas, reuniões
- Falhas e tarefas pendentes
- Canal: WhatsApp da operação ou e-mail, uma vez por dia

---

## 6. Onboarding pós-assinatura (depois)

`/comecar` já liga o chip. Evolução: nicho, cidade, primeira missão e teste automático depois do Cakto — sem mudar o trial de 2 dias.

---

## Como falar na live

“Eu não criei apenas mais um chatbot. Estou desenvolvendo uma operação comercial com inteligência artificial, capaz de encontrar oportunidades, diagnosticar problemas, construir soluções e ajudar empresas a conquistar novos clientes. Essa é a Helena.”

O expediente ainda começa quando você manda. Central RPA, radar programado, follow-up com memória, propostas e relatório diário são a evolução — a fila e o ciclo já estão no banco.

---

## Ordem de implementação

1. Central RPA (sustenta o resto)
2. Follow-up com memória + `rpa_jobs.followup`
3. Radar programado
4. Propostas com aprovação
5. Relatório diário
6. Onboarding pós-assinatura

Uma etapa por vez. Testes SaaS atuais continuam verdes. Token e senha só em env, nunca no Git.
