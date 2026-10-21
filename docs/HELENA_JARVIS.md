# 🤖 HELENA - Sistema Operacional Empresarial com IA

## Visão Geral

HELENA é uma IA orquestradora inspirada no JARVIS do Homem de Ferro. Ela **não simula**, ela **EXECUTA**.

Quando você diz:
> "Helena, ative o time de marketing e prospecte clientes para nossa agência Info Tech Ltda"

Ela:
1. **Entende** a intenção (orquestração de prospecção)
2. **Planeja** as ações necessárias (ativar agentes, selecionar lista, validar WhatsApp)
3. **Verifica** riscos e permissões
4. **Pede aprovação** (se necessário)
5. **EXECUTA** de verdade (ativa agentes, inicia campanha, monitora)
6. **Reporta** resultados em tempo real

---

## 🎯 Diferencial: Execução Real vs Simulação

### ❌ Chatbot Comum (Simula)
```
Usuário: "Ative o SDR"
Bot: "Ok, ativei o SDR! ✓"
Realidade: Nada aconteceu. Apenas texto.
```

### ✅ HELENA (Executa)
```
Usuário: "Ative o SDR 01"
Helena: "Vou ativar o SDR 01..."

[Backend executa]
✓ UPDATE agents SET status='trabalhando' WHERE id='a_sdr1'
✓ INSERT INTO executions (actor, action, result)
✓ INSERT INTO activities (type='ia', text='SDR 01 ativado')

Helena: "SDR 01 está trabalhando agora. Orçamento: R$ 150,00 (R$ 52,40 consumidos)."
```

---

## 🏗️ Arquitetura do Motor

### 1. Fluxo Completo

```
┌─────────────────────────────────────────────────────────┐
│  USUÁRIO                                                │
│  "Helena, ative o time comercial e prospecte clientes" │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (orchestrator.ts)                         │
│  • Interpreta linguagem natural                         │
│  • Identifica intenção                                  │
│  • Carrega contexto (agentes, times, conexões)          │
│  • Monta plano de execução                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  RISK ASSESSMENT                                        │
│  • Classifica risco: baixo / médio / alto               │
│  • Verifica permissões do usuário                       │
│  • Verifica orçamento dos agentes                       │
│  • Valida pré-condições (WhatsApp online, etc)          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ├─── RISCO BAIXO ────────────────┐
                     │                                │
                     ├─── RISCO MÉDIO (configurável) ─┤
                     │                                │
                     └─── RISCO ALTO ────────────────┐
                                                      │
                     ┌────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  APPROVAL (engine.ts)                                   │
│  • Cria registro de aprovação                           │
│  • Exibe card com detalhes da ação                      │
│  • Aguarda decisão do usuário                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
              [Usuário aprova?]
                     │
        ┌────────────┴────────────┐
        │                         │
    SIM │                         │ NÃO
        ▼                         ▼
┌─────────────────┐      ┌──────────────┐
│   EXECUÇÃO      │      │  CANCELADO   │
└────────┬────────┘      └──────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  TOOL EXECUTION (engine.ts - runTool)                   │
│  1. Valida ferramenta existe                            │
│  2. Verifica se está habilitada                         │
│  3. Valida permissões                                   │
│  4. EXECUTA handler                                     │
│     • Altera banco de dados (via update())              │
│     • Registra na auditoria                             │
│     • Retorna resultado                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  MONITORING                                             │
│  • Registra em executions (auditoria)                   │
│  • Atualiza métricas dos agentes                        │
│  • Cria atividades no CRM                               │
│  • Se é operação: inicia tickOperations()               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  FEEDBACK                                               │
│  • Retorna resultado ao usuário                         │
│  • Exibe card de operação (se aplicável)                │
│  • Entra em modo monitoramento                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ Ferramentas (Tools)

Cada ação da Helena é uma "ferramenta". Atualmente implementadas:

### CRM
- `crm.search_contacts` - Buscar contatos
- `crm.create_contact` - Criar contato
- `crm.update_contact` - Atualizar contato
- `crm.create_lead` - Criar oportunidade
- `crm.move_lead` - Mover lead entre etapas
- `crm.assign_lead` - Atribuir responsável
- `crm.create_task` - Criar tarefa

### Mensagens
- `messages.send` - Enviar mensagem
- `messages.search` - Buscar conversas

### Agentes
- `agents.create` - Criar agente
- `agents.activate` - Ativar agente
- `agents.pause` - Pausar agente
- `agents.assign_task` - Distribuir tarefas

### Times
- `teams.activate` - Ativar time inteiro
- `teams.pause` - Pausar time inteiro

### Campanhas
- `campaigns.create` - Criar campanha
- `campaigns.start` - ⚠️ ALTO RISCO - Iniciar envio em massa
- `campaigns.pause` - Pausar campanha

### Operações
- `operations.start` - ⚠️ ALTO RISCO - Iniciar operação
- `operations.pause` - Pausar operação
- `operations.resume` - Retomar operação

### Outras
- `knowledge.search` - Buscar conhecimento
- `analytics.query` - Consultar métricas
- `calendar.create_event` - Agendar reunião
- `automation.create` - ⚠️ ALTO RISCO - Criar automação

---

## 🎯 Como Adicionar Novas Ferramentas

### 1. Registrar em `registry.ts`

```typescript
export const TOOL_REGISTRY: ToolDef[] = [
  // ...outras ferramentas
  {
    name: "crm.create_company",
    label: "Criar empresa",
    description: "Cria uma nova empresa no CRM.",
    category: "CRM",
    defaultRisk: "medio",
    permission: "crm.edit"
  },
];
```

### 2. Implementar handler em `engine.ts`

```typescript
const handlers: Record<string, Handler> = {
  // ...outros handlers
  "crm.create_company": (p, ctx) => {
    if (!p.name) return fail("nome da empresa é obrigatório");
    
    const id = uid("c_");
    update((db) => {
      db.companies.unshift({
        id,
        organizationId: db.organization.id,
        name: p.name,
        segment: p.segment ?? "",
        city: p.city ?? "",
        size: p.size ?? "1–10",
        website: p.website ?? "",
        ownerId: p.ownerId ?? db.currentUserId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      
      // Registrar atividade
      db.activities.unshift({
        id: uid("ac_"),
        organizationId: db.organization.id,
        contactId: p.contactId,
        type: "nota",
        text: `Empresa ${p.name} criada`,
        actor: ctx.actor,
        createdAt: nowISO(),
      });
    });
    
    return ok(`Empresa ${p.name} criada`, { id });
  },
};
```

### 3. Adicionar interpretação em `orchestrator.ts`

```typescript
export function interpret(text: string): Reply[] {
  // ...
  
  // Criar empresa
  if (/\b(crie|criar|cadastre|cadastrar)\b.*\b(empresa|company)\b/.test(n)) {
    const nameMatch = text.match(/empresa\s+([A-Z][\w\s]+)/i);
    const name = nameMatch ? nameMatch[1].trim() : "Nova Empresa";
    
    return [perform(
      "crm.create_company",
      { name, segment: "Não definido" },
      `Criar empresa ${name}`,
      [{ label: "Nome", value: name }],
      `Empresa ${name} criada no CRM.`
    )];
  }
  
  // ...
}
```

---

## 💬 Exemplos de Comandos

### Prospecção
```
"Helena, ative o time comercial e prospecte 100 clientes"
"Helena, comece a prospectar clínicas"
"Helena, quero 50 novos potenciais clientes"
```

### Gestão de Agentes
```
"Helena, crie um SDR especializado em imobiliárias"
"Helena, pause o SDR 02"
"Helena, ative o Follow-up"
"Helena, coloque mais dois agentes no comercial"
```

### Follow-up e Distribuição
```
"Helena, quem precisa de follow-up hoje?"
"Helena, redistribua as tarefas entre os SDRs"
"Helena, passe os leads interessados para o closer"
```

### Estratégia
```
"Helena, quero vender 20 sites este mês. Monte uma estratégia"
"Helena, preciso bater a meta de R$ 50 mil"
```

### Analytics
```
"Helena, como está o comercial?"
"Helena, por que as vendas caíram?"
"Helena, mostre os leads quentes"
"Helena, quantas vendas tivemos esta semana?"
```

### Operações
```
"Helena, pause a campanha"
"Helena, como está a prospecção?"
"Helena, retome a operação OP-2938"
```

---

## 🔐 Sistema de Riscos e Aprovações

### Risco Baixo (Executa imediatamente)
- Consultas (search, query)
- Visualizações
- Análises

### Risco Médio (Configurável)
- Criar/editar contatos
- Mover leads
- Criar tarefas
- Ativar/pausar agentes

### Risco Alto (SEMPRE pede aprovação)
- Enviar mensagens em massa
- Iniciar campanhas
- Criar automações externas
- Integrar com sistemas externos

---

## 🔄 Monitoramento de Operações

Quando uma operação é iniciada, o sistema:

1. **Cria registro** em `operations`
2. **Ativa agentes** envolvidos
3. **Inicia tickOperations()** (interval de 3 segundos)
4. A cada tick:
   - Incrementa `processed`
   - Atualiza métricas (responded, interested, qualified, meetings)
   - Avança etapas (steps)
   - Gera eventos
   - Consome orçamento dos agentes
5. **Quando completa**:
   - Marca como `completed`
   - Registra resultado
   - **Notifica o usuário via Helena**

---

## 🎨 Cards da Helena

A Helena usa diferentes tipos de cards para apresentar informações:

### 1. Plan Card
```typescript
{
  type: "plan",
  title: "Prospecção Clínicas SP",
  approvalId: "ap_123",
  steps: [
    { label: "Carregar ICP", done: true },
    { label: "Selecionar SDR", done: true },
    { label: "Iniciar prospecção", done: false },
  ]
}
```

### 2. Approval Card
```typescript
{
  type: "approval",
  approvalId: "ap_123"
}
```

### 3. Operation Card
```typescript
{
  type: "operation",
  operationId: "op_123"
}
```

### 4. Agent Proposal Card
```typescript
{
  type: "agent_proposal",
  proposal: {
    name: "SDR Clínicas",
    role: "SDR",
    objective: "Prospectar clínicas...",
    // ...
  },
  createdAgentId: "a_123" // Após criação
}
```

### 5. List Card
```typescript
{
  type: "list",
  title: "Leads quentes",
  items: [
    { label: "Site clínica", sub: "R$ 8.900", href: "/crm/..." },
    // ...
  ]
}
```

### 6. Stats Card
```typescript
{
  type: "stats",
  title: "Comercial",
  items: [
    { label: "Leads 7 dias", value: "183" },
    { label: "Pipeline aberto", value: "R$ 86.400" },
    // ...
  ]
}
```

### 7. Result Card
```typescript
{
  type: "result",
  ok: true,
  title: "SDR 01 ativado",
  detail: "Agente está trabalhando"
}
```

---

## 🔌 Conexão com Backend Real

Atualmente o sistema usa **mock store** (localStorage). Para conectar com PostgreSQL:

### 1. Criar API REST

```typescript
// backend/routes/tools.ts
app.post('/api/tools/:toolName', authenticate, async (req, res) => {
  const { toolName } = req.params;
  const params = req.body;
  const user = req.user;
  
  // Executar ferramenta
  const result = await executeToolReal(
    toolName,
    params,
    {
      actor: user.name,
      actorType: 'user',
      requestedBy: user.name,
    }
  );
  
  return res.json(result);
});
```

### 2. Substituir `runTool()` por chamada HTTP

```typescript
// Antes (mock)
const result = runTool("agents.activate", { agentId: "a_sdr1" }, ctx);

// Depois (real)
const result = await fetch('/api/tools/agents.activate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agentId: "a_sdr1" }),
});
```

### 3. Backend executa SQL real

```typescript
async function executeToolReal(name: string, params: any, ctx: ToolContext) {
  if (name === "agents.activate") {
    const { agentId } = params;
    
    // SQL real
    await db.query(`
      UPDATE agents 
      SET status = 'trabalhando', updated_at = NOW()
      WHERE id = $1
    `, [agentId]);
    
    // Auditoria
    await db.query(`
      INSERT INTO executions (actor, action, result, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [ctx.actor, name, 'sucesso']);
    
    return { ok: true, message: "Agente ativado" };
  }
}
```

---

## 🧠 Próximos Passos para IA Real

Atualmente a interpretação é **rule-based** (regex). Para tornar JARVIS-like de verdade:

### 1. Usar LLM com Function Calling

```typescript
// orchestrator.ts - versão com IA real
async function interpretWithAI(text: string, context: DB): Promise<Reply[]> {
  const tools = TOOL_REGISTRY.map(t => ({
    name: t.name,
    description: t.description,
    parameters: {
      // Esquema dos parâmetros
    }
  }));
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Você é Helena, uma IA executiva. Analise a solicitação e escolha as ferramentas necessárias. Contexto: ${JSON.stringify(summarizeContext(context))}`
      },
      { role: "user", content: text }
    ],
    tools,
    tool_choice: "auto",
  });
  
  // Processar tool_calls
  const toolCalls = response.choices[0].message.tool_calls || [];
  const results = [];
  
  for (const call of toolCalls) {
    const result = await runTool(
      call.function.name,
      JSON.parse(call.function.arguments),
      { actor: "Helena", actorType: "helena" }
    );
    results.push(result);
  }
  
  return results;
}
```

### 2. Adicionar Memória de Longo Prazo

```typescript
// Antes de cada interação, buscar memórias relevantes
const memories = await searchMemories(text, organizationId);

const systemPrompt = `
Você é Helena, IA executiva da ${org.name}.

MEMÓRIAS RELEVANTES:
${memories.map(m => `- ${m.title}: ${m.content}`).join('\n')}

SITUAÇÃO ATUAL:
- ${openDeals.length} oportunidades abertas
- ${workingAgents.length} agentes trabalhando
- ${runningOps.length} operações em execução
`;
```

### 3. RAG (Retrieval Augmented Generation)

```typescript
// Buscar documentos relevantes antes de responder
const relevantDocs = await vectorSearch(text, organizationId);

// Incluir no contexto da IA
const context = relevantDocs.map(doc => doc.content).join('\n\n');
```

---

## 📊 Exemplo Completo de Fluxo

```
USUÁRIO:
"Helena, ative o time comercial e prospecte 100 clientes para nossa agência"

↓

HELENA (orchestrator.ts - interpret):
1. Normaliza texto: "ative time comercial prospecte 100 clientes agencia"
2. Detecta intenção: PROSPECÇÃO + ATIVAR TIME
3. Carrega contexto:
   - Time Comercial: 4 agentes (SDR 01, SDR 02, Qualificador, Closer)
   - Lista: "Empresas SP" (412 contatos)
   - WhatsApp: "WhatsApp Comercial" (online)
4. Cria plano:
   - Total: 100 contatos
   - Agentes: a_sdr1, a_sdr2, a_qual, a_closer
   - Lista: l1
   - Conexão: wa1

↓

RISK ASSESSMENT:
- Ferramenta: operations.start
- Risco: ALTO (envia mensagens externas)
- Requer aprovação: SIM

↓

APPROVAL REQUEST:
- Cria registro em approvals
- Exibe card com detalhes
- Aguarda decisão do usuário

↓

USUÁRIO APROVA:
"[Autorizar execução]"

↓

EXECUTION (engine.ts - runTool):
1. Valida:
   ✓ Ferramenta existe
   ✓ Está habilitada
   ✓ Usuário tem permissão
   ✓ WhatsApp está online
   ✓ Agentes têm orçamento

2. Executa:
   update((db) => {
     // Cria operação
     const op = newOperation(...)
     db.operations.unshift(op);
     
     // Ativa agentes
     setAgentsStatus(db, agentIds, "trabalhando");
     
     // Cria campanha
     db.campaigns.unshift({...});
   });

3. Registra auditoria:
   logExecution({
     actor: "Helena",
     action: "operations.start",
     result: "sucesso",
   });

4. Retorna resultado:
   return ok("Operação iniciada", { operationId: "op_2941" });

↓

MONITORING (tickOperations):
[A cada 3 segundos]
- Processa +2 contatos
- Atualiza métricas
- Avança etapas
- Gera eventos
- Consome orçamento

↓

COMPLETION (após 100 contatos):
- Marca operação como completed
- Registra resultado final
- Notifica usuário:

HELENA:
"Atualização da operação Prospecção Empresas SP:

100 contatos processados.
23 responderam.
12 demonstraram interesse.
7 foram qualificados.
3 reuniões foram agendadas.

Quer que eu aumente a operação amanhã?"

[Card de Operação com métricas]
```

---

## 🎯 Checklist de Implementação

### ✅ Fase 1 - Foundation (FEITO)
- [x] Schema PostgreSQL completo
- [x] Sistema de tools (registry + engine)
- [x] Sistema de execução (runTool)
- [x] Sistema de aprovações
- [x] Auditoria (executions)
- [x] Interpretação básica (orchestrator)

### 🔲 Fase 2 - Backend Real
- [ ] API REST para ferramentas
- [ ] Autenticação JWT
- [ ] Conexão PostgreSQL
- [ ] Migrations
- [ ] Jobs/Queue (Bull/BullMQ)

### 🔲 Fase 3 - IA Real
- [ ] Integração OpenAI/Anthropic
- [ ] Function calling
- [ ] RAG (vector search)
- [ ] Memória de longo prazo
- [ ] Fine-tuning (opcional)

### 🔲 Fase 4 - Integrações
- [ ] WhatsApp Cloud API
- [ ] Webhooks reais
- [ ] E-mail (SMTP)
- [ ] Calendário (Google Calendar)

### 🔲 Fase 5 - Escalabilidade
- [ ] WebSockets (real-time)
- [ ] Redis (cache + queue)
- [ ] Docker
- [ ] CI/CD

---

## 🚀 Como Testar Agora

1. **Abra o sistema** no navegador
2. **Clique no botão Helena** (canto inferior direito)
3. **Digite um comando**:
   - "Helena, ative o time comercial e prospecte clientes"
   - "Helena, mostre os leads quentes"
   - "Helena, crie um SDR para clínicas"

4. **Observe**:
   - Interpretação da intenção
   - Planejamento (card com etapas)
   - Solicitação de aprovação (se alto risco)
   - Execução real (dados no localStorage mudam)
   - Registro na auditoria

5. **Verifique a execução**:
   - Vá em **IA → Execuções**
   - Veja o log de tudo que foi executado
   - Cada ação possui: ator, ferramenta, resultado, duração

---

**A HELENA está pronta para ser o JARVIS da sua empresa! 🚀**
