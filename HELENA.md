# HELENA AI — Mapa Completo de Recursos e Arquitetura Atual

> **Documento gerado em:** 21 de Outubro de 2026  
> **Status:** FASE 1 & FASE 2 100% Funcionais e Operacionais  
> **Ambiente:** Frontend SPA reativo (TanStack Start / Vite / Nitro), sem backend externo obrigatório, compatível com migração futura para PostgreSQL via `database/schema.sql`.

---

## 1. Visão Geral da Helena
A **HELENA** é uma inteligência artificial executiva e orquestradora operacional para empresas. Ela não funciona como um simples chatbot isolado, mas sim como o cérebro central conectado a ferramentas reais de CRM, mensageria (WhatsApp), prospecção, agendamento de reuniões e supervisão de times de agentes de IA.

- **Organização Padrão:** Info Tech Ltda
- **Login Demo:** `admin` / `123456` (Perfil Owner / CEO)
- **Persistência de Estado:** Store reativo local (`src/lib/store.ts` via `localStorage`), espelhando o schema relacional PostgreSQL.

---

## 2. Motor de IA e Inferência

### 2.1 Conexão Groq Cloud
- **Integração Real:** Conexão direta com a API da [Groq Cloud](https://console.groq.com) através do arquivo `.env` (`VITE_GROQ_API_KEY`).
- **Modelo de Inferência:** `openai/gpt-oss-120b` (latência ultra-baixa com alta capacidade de raciocínio).
- **Tool Calling Nativo:** A Helena recebe comandos em linguagem natural e invoca chamadas de função com parâmetros estruturados em JSON.
- **Fallback Determinístico:** Se a API de IA estiver inacessível ou sem internet, o orquestrador aciona automaticamente um motor de regras local baseado em intenções, garantindo que o sistema nunca trave.

### 2.2 Interface de Voz (Modo Jarvis)
- **Speech-to-Text (Ouvir):** Reconhecimento de voz em tempo real através da `Web Speech API` nativa do navegador (`webkitSpeechRecognition`), permitindo comandos por voz contínuos em português (`pt-BR`).
- **Text-to-Speech (Falar):** Síntese de voz feminina natural brasileira via `SpeechSynthesis`, permitindo que a Helena responda falando diretamente com o usuário.

### 2.3 Presença e UX Executiva
- **Botão Flutuante (Helena Orb):** Indicador visual com animação e estados dinâmicos:
  - `Online` (Ocioso)
  - `Ouvindo` (Escutando o microfone)
  - `Pensando` (Processando no LLM)
  - `Planejando` (Montando plano de etapas)
  - `Executando` (Disparando ferramentas)
  - `Aguardando aprovação` (Pausa para decisão do gestor)
- **Painel Lateral (Helena Drawer):** Chat interativo com renderização de cards ricos (cards de planos, aprovações, operações e resultados).
- **Command Palette Global (`Ctrl + K`):** Barra de busca e comandos rápidos para navegar ou perguntar à Helena a partir de qualquer tela.

---

## 3. CRM Integrado e Operacional

O CRM da Helena é 100% reativo e totalmente conectado às ações da IA:

1. **Pipeline de Vendas (`/crm/pipeline`):**
   - Quadro Kanban drag-and-drop com probabilidades de fechamento automáticas.
   - Etapas:
     1. *Novo lead* (10%)
     2. *Qualificado* (30%)
     3. *Reunião agendada* (50%)
     4. *Proposta enviada* (70%)
     5. *Negociação* (85%)
     6. *Ganho* (100%)
   - Cálculo de valor total por etapa e estimativa de forecast.

2. **Gestão de Contatos (`/crm/contatos`):**
   - Base de contatos enriquecida com score de qualificação, origem (Google Ads, Facebook Ads, Prospecção, etc.), consentimento LGPD e tags.
   - Histórico de interações por linha do tempo (atividades, notas, ligações, mensagens de WhatsApp).

3. **Empresas (`/crm/empresas`):**
   - Cadastro corporativo com segmento, porte, localização e website.
   - Vinculação direta com múltiplos contatos e oportunidades no pipeline.

4. **Tarefas Comerciais (`/crm/tarefas`):**
   - Follow-ups, reuniões, ligações e elaboração de propostas.
   - Atribuição tanto para usuários humanos quanto para agentes de IA (SDR, Follow-up, Closer).

---

## 4. Agentes de IA Cadastrados no Sistema

O sistema já possui um ecossistema de agentes com funções, ferramentas e permissões delimitadas:

| ID | Nome | Função / Papel | Objetivo Principal | Ferramentas Habilitadas |
| :--- | :--- | :--- | :--- | :--- |
| `a_supcom` | **Supervisor Comercial** | Supervisor | Coordenar SDRs, Qualificador e Closer; balancear cargas e aprovar propostas. | `crm.*`, `agents.assign_task`, `analytics.query` |
| `a_sdr1` | **SDR 01** | Prospecção Outbound | Prospecção de agências e prestadores B2B em São Paulo. | `crm.*`, `messages.send`, `prospect.scan_maps` |
| `a_sdr2` | **SDR 02** | Prospecção Segmentada | Prospecção especializada em clínicas e consultórios de saúde. | `crm.*`, `messages.send`, `prospect.scan_maps` |
| `a_qual` | **Qualificador** | Qualificação BANT | Classificar respostas recebidas no WhatsApp e filtrar leads com perfil de compra. | `crm.move_lead`, `crm.search_contacts` |
| `a_closer` | **Closer** | Fechador de Vendas | Conduzir reuniões comerciais, apresentar propostas e negociar o fechamento. | `calendar.create_event`, `crm.move_lead`, `messages.send` |
| `a_supat` | **Supervisor Atendimento**| Supervisor | Garantir SLA de resposta e qualidade do atendimento aos clientes. | `analytics.query`, `inbox.*` |
| `a_at` | **Atendimento Geral** | Suporte N1 | Responder dúvidas de clientes em até 2 minutos via WhatsApp e Webchat. | `messages.send`, `messages.search` |
| `a_sup` | **Suporte Técnico** | Suporte N2 | Resolver chamados técnicos de clientes ativos. | `messages.send`, `crm.create_task` |
| `a_cs` | **Customer Success** | Retenção / Pós-venda| Acompanhar onboarding e identificar oportunidades de upsell. | `crm.move_lead`, `messages.send` |
| `a_fu` | **Follow-up** | Resgate de Oportunidades | Retomar propostas e leads parados no pipeline há mais de 48h. | `crm.create_task`, `messages.send` |

---

## 5. Ferramentas Reais da Helena (Tool Registry)

Toda ação executada pela Helena ou pelos agentes passa obrigatoriamente pelo motor `runTool()` em `src/lib/helena/engine.ts`, que verifica permissões, níveis de risco e gera registro de auditoria:

### 5.1 Prospecção & Varredura Google Maps
- **`prospect.scan_maps`:**
  - Varre empresas de um segmento específico (ex: clínicas odontológicas, agências) e cidade informada.
  - Detecta empresas sem site institucional.
  - Injeta a empresa e o contato correspondente no CRM com a tag `#sem-site`.
  - Cria automaticamente a oportunidade no pipeline em *Novo lead*.
  - Dispara a primeira abordagem consultiva via WhatsApp pelo SDR responsável.

### 5.2 Agendamento de Reuniões (Google Calendar / Cal.com)
- **`calendar.create_event`:**
  - Recebe o ID do contato e do lead comercial.
  - Gera link de videoconferência no Google Meet / Cal.com.
  - Move imediatamente a oportunidade no pipeline para a etapa **Reunião agendada**.
  - Cria a notificação de confirmação e adiciona a tarefa na agenda do Closer.

### 5.3 Operações de CRM
- `crm.search_contacts`: Localiza contatos por nome, tag ou status.
- `crm.create_contact`: Cadastra novos clientes/leads.
- `crm.update_contact`: Atualiza dados cadastrais e responsáveis.
- `crm.create_lead`: Inicia uma oportunidade no funil.
- `crm.move_lead`: Altera o estágio da negociação no pipeline.
- `crm.assign_lead`: Atribui a oportunidade a um agente de IA ou usuário humano.
- `crm.create_task`: Registra tarefas com data de vencimento.

### 5.4 Mensageria & Canais Conectados
- `messages.send`: Envia mensagem via WhatsApp ou canal conectado.
- `messages.search`: Consulta conversas anteriores e respostas de clientes.

### 5.5 Gestão de Agentes e Times
- `agents.create`: Cria novos agentes especialistas.
- `agents.activate` / `agents.pause`: Gerencia o ciclo de vida dos agentes.
- `agents.assign_task`: Distribui tarefas na fila dos agentes.
- `teams.activate` / `teams.pause`: Ativa ou desativa equipes inteiras.

### 5.6 Analytics e Base de Conhecimento
- `knowledge.search`: Consulta semântica de playbooks e tabelas de preços indexadas.
- `analytics.query`: Extrai métricas comerciais, taxas de conversão e custos operacionais de IA.

---

## 6. Governança, Políticas e Segurança

1. **Classificação de Risco:**
   - **Baixo:** Consultas de CRM, busca de conhecimento e métricas (execução instantânea).
   - **Médio:** Criação de contatos, tarefas e agendamento de reuniões.
   - **Alto:** Envio de mensagens em massa, ativação de campanhas e operações comerciais.
2. **Human-in-the-Loop (Aprovações Pendentes):**
   - Ferramentas de risco alto exigem aprovação explícita do gestor antes de disparar qualquer ação real no mundo exterior.
3. **Auditoria Geral (`executions`):**
   - Cada chamada de ferramenta é registrada com:
     - `actor` (ex: Helena, SDR 01, Letícia Andrade)
     - `actorType` (`helena`, `agent`, `user`, `sistema`)
     - `action` (nome da ferramenta invocada)
     - `durationMs` (tempo de resposta)
     - `result` (`sucesso`, `falha`, `pendente`)
     - `approvedBy` (identificação do aprovador humano quando aplicável)
4. **Controle de Acesso Baseado em Papéis (RBAC):**
   - Perfis configurados: `owner`, `admin`, `manager`, `agent`, `viewer`.

---

## 7. Camada de Orquestração Autônoma (Fase 2.5)

Já implementada no módulo `src/lib/helena/mission-engine.ts`:

- **Entidade Missão (`Mission`):** Representa objetivos estratégicos da empresa (ex: *"Conseguir 20 reuniões com clínicas"*).
- **Cálculo de Funil Reverso (`calculateMissionStrategy`):**
  - Dado o objetivo de vendas, calcula matematicamente:
    - Prospects necessários
    - Taxa de respostas estimadas
    - Qualificados necessários
    - Reuniões necessárias
    - Orçamento estimado e time sugerido
- **Grafo de Tarefas Não-Linear (`MissionTask`):**
  - Cadeia de dependências com o atributo `dependsOn` (Scraper Maps $\rightarrow$ Abordagem WhatsApp A/B $\rightarrow$ Qualificação BANT $\rightarrow$ Reunião Calendar $\rightarrow$ Fechamento).
- **Kill Switch Global (`toggleKillSwitch`):**
  - Botão de emergência que pausa imediatamente todas as missões, campanhas e despachos de mensagens de IA na organização.
- **Balanceamento de Carga do Supervisor (`rebalanceSupervisorWorkload`):**
  - Algoritmo que detecta disparidade na fila de trabalho dos SDRs e redistribui as tarefas pendentes automaticamente.
- **Experimentos A/B (`abExperiments`):**
  - Comparação contínua da taxa de conversão entre variantes de mensagens (Variante A vs. Variante B) com recomendação automática de substituição.

---

## 8. Banco de Dados e Compatibilidade PostgreSQL

- Todo o schema físico para produção já está escrito e disponível em `database/schema.sql` (PostgreSQL 16 com suporte a UUID, JSONB e índices trigram).
- Dados de inicialização estruturados em `database/seed.sql`.
- Migration da Fase 3 disponível em `database/migrations/001_phase3_orchestration.sql`.
- **Regra de Ouro:** Nenhuma dependência externa fechada (Supabase/Lovable Cloud) é obrigatória; o software roda 100% autônomo.

---

## 9. Painel "Caçar Leads" (Leads Hunter Brasil)

Localizado em `/prospeccao/buscar`:

- **Cobertura Nacional Completa:**
  - Varredura em todos os 27 estados do Brasil (SP, RJ, MG, PR, SC, RS, BA, GO, DF, ES, PE, CE, etc.) e opção "Brasil Inteiro".
  - Filtro por qualquer nicho (Advogados, Dentistas, Médicos, Imobiliárias, Academias, Restaurantes, etc.), palavras-chave e cidades específicas.
- **Detecção Inteligente de Oportunidades (#sem-site):**
  - Identifica empresas que possuem telefone e alta reputação no Google Maps, mas não têm website institucional responsivo.
  - Classifica como **Leads Quentes** para a venda de sites, SEO local e automação de WhatsApp.
- **Terminal Console Interativo (`leads-hunter -- console`):**
  - Logs de execução em tempo real com contagem de leads capturados, quentes, frios e status de conexão.
- **Filtros e Segmentação Avançada:**
  - Badges de porte: `TUBARÃO` (grandes operações com 400+ reviews), `PREMIUM`, `PADRÃO`.
  - Toggles de canal: `Apenas Celulares` e `WhatsApp Verificado`.
- **Ações Integradas com a Helena:**
  - `PROSPECÇÃO IA`: Injeta a empresa e contato no CRM com a tag `#sem-site`, cria o Deal no pipeline e despacha o SDR para abordagem.
  - `Prospecção IA em fila`: Envio em lote dos leads selecionados direto para o motor da Helena.
  - `Disparo WhatsApp Web`: Abre diretamente o chat com mensagem consultiva pronta.
  - `Exportar CSV`: Download imediato da lista enriquecida.

---

## 10. Arquitetura da Fase 3 (Backend Autônomo & Workers 24/7)

Estruturas já preparadas no PostgreSQL (`database/schema.sql` e migration `001_phase3_orchestration.sql`):

1. **`job_queue`:**
   - Fila persistente com atomic claim via `FOR UPDATE SKIP LOCKED`.
   - Suporte a retries com backoff exponencial, `idempotency_key` e Dead Letter Queue (`status = 'dead'`).
2. **`workers`:**
   - Registro de processos com ID único, hostname, contagem de jobs e batimento cardíaco (`heartbeat_at`).
   - Recuperação automática de jobs travados (*orphan lock release*).
3. **`missions` e `mission_tasks`:**
   - Grafo de tarefas não-linear persistido no banco de dados com resolução de dependências.
4. **`event_log`:**
   - Outbox pattern e log de eventos imutáveis para auditoria.
5. **`system_settings`:**
   - Kill switch global e governança de autonomia server-side.

