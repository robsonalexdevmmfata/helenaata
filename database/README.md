# HELENA AI - Instalação do Banco de Dados PostgreSQL

## 📋 Pré-requisitos

- PostgreSQL 14+ instalado
- pgAdmin 4 ou psql (terminal)
- Usuário com privilégios para criar databases

## 🔧 Passo a Passo - pgAdmin

### 1. Abrir pgAdmin

1. Abra o **pgAdmin 4**
2. Conecte-se ao servidor PostgreSQL (provavelmente localhost)
3. Digite sua senha do PostgreSQL: **320809**

### 2. Criar o Database

**Opção A - Via Interface:**
1. Clique com botão direito em **Databases**
2. Selecione **Create > Database...**
3. Em **Database**, digite: `helenaia`
4. Em **Owner**, selecione seu usuário (geralmente `postgres`)
5. Clique em **Save**

**Opção B - Via Query Tool:**
1. Abra o **Query Tool** (Tools > Query Tool)
2. Execute:
```sql
CREATE DATABASE helenaia
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Portuguese_Brazil.1252'
    LC_CTYPE = 'Portuguese_Brazil.1252'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;
```

### 3. Executar o Schema

1. Conecte-se ao database **helenaia** (clique nele no painel esquerdo)
2. Abra o **Query Tool** (clique com botão direito no database > Query Tool)
3. Abra o arquivo `schema.sql`:
   - Clique no ícone de **pasta** (Open File)
   - Navegue até: `c:\Users\tecro\OneDrive\Documentos\sample-admin-harbor\database\schema.sql`
   - Clique em **Select**
4. Clique em **Execute/Run** (▶️) ou pressione **F5**
5. Aguarde a execução (pode levar 5-10 segundos)
6. Verifique se apareceu "Query returned successfully" no final

### 4. Carregar Dados de Exemplo (Opcional)

1. No mesmo Query Tool, limpe a área de texto (Ctrl+A, Delete)
2. Abra o arquivo `seed.sql`:
   - Clique no ícone de **pasta** (Open File)
   - Navegue até: `c:\Users\tecro\OneDrive\Documentos\sample-admin-harbor\database\seed.sql`
   - Clique em **Select**
3. Clique em **Execute/Run** (▶️) ou pressione **F5**
4. Aguarde a execução
5. Verifique as mensagens finais mostrando quantos registros foram inseridos

### 5. Verificar Instalação

Execute esta query no Query Tool:

```sql
-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verificar dados de exemplo
SELECT 
    'Organizations' as tabela, COUNT(*) as registros FROM organizations
UNION ALL
SELECT 'Users', COUNT(*) FROM users
UNION ALL
SELECT 'Contacts', COUNT(*) FROM contacts
UNION ALL
SELECT 'Companies', COUNT(*) FROM companies
UNION ALL
SELECT 'Deals', COUNT(*) FROM deals
UNION ALL
SELECT 'Agents', COUNT(*) FROM agents
UNION ALL
SELECT 'Teams', COUNT(*) FROM teams
UNION ALL
SELECT 'Pipelines', COUNT(*) FROM pipelines;
```

Você deve ver:
- Aproximadamente **60+ tabelas** criadas
- Se executou o seed: dados nas tabelas (1 org, 6 users, 10 contacts, etc.)

## 🖥️ Passo a Passo - Terminal (psql)

Se preferir usar a linha de comando:

```bash
# 1. Conectar ao PostgreSQL
psql -U postgres

# 2. Criar database
CREATE DATABASE helenaia;

# 3. Conectar ao database
\c helenaia

# 4. Executar schema
\i 'c:/Users/tecro/OneDrive/Documentos/sample-admin-harbor/database/schema.sql'

# 5. Executar seed (opcional)
\i 'c:/Users/tecro/OneDrive/Documentos/sample-admin-harbor/database/seed.sql'

# 6. Verificar tabelas
\dt

# 7. Sair
\q
```

## 📊 Estrutura do Banco

### Módulos Principais

#### 1. **Organizations & Users** (Multi-tenant)
- `organizations` - Empresas clientes do SaaS
- `users` - Usuários humanos
- `invites` - Convites pendentes
- `role_permissions` - Permissões por role

#### 2. **CRM**
- `companies` - Empresas dos contatos
- `contacts` - Leads e clientes
- `pipelines` - Funis de venda
- `deals` - Oportunidades
- `activities` - Timeline de atividades
- `tasks` - Tarefas

#### 3. **Messaging**
- `conversations` - Conversas omnichannel
- `messages` - Mensagens individuais
- `quick_replies` - Respostas rápidas

#### 4. **AI - Agentes**
- `agents` - Agentes de IA (SDR, Closer, etc)
- `teams` - Times de agentes
- `operations` - Operações orquestradas
- `executions` - Log de auditoria
- `approvals` - Aprovações pendentes
- `memories` - Memória da Helena
- `knowledge_docs` - Base de conhecimento

#### 5. **Prospecção**
- `prospect_lists` - Listas de prospects
- `campaigns` - Campanhas
- `cadences` - Cadências de contato

#### 6. **Automações**
- `automations` - Automações QUANDO/SE/ENTÃO

#### 7. **Integrações**
- `whatsapp_connections` - Conexões WhatsApp
- `wa_templates` - Templates WhatsApp
- `webhooks` - Webhooks entrada/saída
- `api_tokens` - Tokens de API

#### 8. **Helena**
- `helena_conversations` - Conversas com Helena
- `helena_messages` - Mensagens (incluindo cards)
- `helena_settings` - Configurações da Helena

#### 9. **AI Providers**
- `ai_providers` - Provedores de IA configurados
- `ai_usage` - Uso e custos de IA

#### 10. **LGPD & Security**
- `lgpd_requests` - Solicitações LGPD
- `user_sessions` - Sessões ativas
- `audit_logs` - Log de auditoria

#### 11. **Billing**
- `invoices` - Faturas
- `organization_settings` - Configurações da org

## 🔐 String de Conexão

Para conectar sua aplicação ao banco:

```env
DATABASE_URL=postgresql://postgres:320809@localhost:5432/helenaia
```

Ou separadamente:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=helenaia
DB_USER=postgres
DB_PASSWORD=320809
```

## 🧪 Dados de Teste

Se você executou o `seed.sql`, terá acesso a:

### Usuário de Teste
- **Email:** leticia@novarota.com.br
- **Username:** admin
- **Role:** owner
- **Senha:** (você precisará implementar hash de senha)

### Organização
- **Nome:** Nova Rota Digital
- **Slug:** nova-rota
- **Plan:** Scale

### Agentes de IA Disponíveis
- **Supervisor Comercial** - Coordenador
- **SDR 01** - Prospecção B2B
- **SDR 02** - Prospecção clínicas
- **Qualificador** - Qualificação BANT
- **Closer** - Fechamento
- **Supervisor Atendimento**
- **Atendimento Geral**
- **Follow-up**

### Times
- **Comercial** - 4 agentes
- **Atendimento** - 1 agente

## 🔄 Migrations Futuras

Para evoluir o schema no futuro, crie arquivos numerados:

```
database/
├── schema.sql (base)
├── seed.sql
├── migrations/
│   ├── 001_add_conversation_archives.sql
│   ├── 002_add_agent_skills.sql
│   └── ...
```

### Supabase: follow-up de proposta e cardápio online

No SQL Editor do projeto Supabase, execute `supabase-helena-rpa.sql`,
`002_helena10_app_ids.sql`, `003_rpa_center.sql`, `004_intelligence_3.sql` e, por último,
`migrations/005_menu_followup_approval.sql`. A migration é idempotente e cria
as configurações de espera/aprovação e o histórico do follow-up; também guarda
os estados de entrega/leitura das mensagens e cadastra o Cardápio Online por
R$ 100/mês para organizações da plataforma.

O fluxo do painel espera 24 horas sem resposta (lida ou não lida), apresenta o
texto para aprovação e só tenta enviar após a aprovação. Uma resposta,
assunção por atendente ou opt-out cancela o envio.

### Persistência do workspace

Depois das migrations base acima, execute também
`migrations/006_supabase_workspace_state.sql`. A aplicação usa `DATABASE_URL`
somente no servidor, autentica com cookie HttpOnly e grava o estado de cada
organização em `workspace_snapshots` (JSONB com controle de revisão). Contas e
hashes de senha ficam em `app_accounts`; senhas nunca são armazenadas no
snapshot. A mesma migration cria a persistência de prévias (`app_previews`),
eventos de cobrança (`app_billing_events`) e prepara as colunas da fila RPA para
o worker usar o banco, sem arquivos JSON nem filas em memória.

Dados que já existiam em arquivos locais de prévias/cobranças não são importados
automaticamente; faça backup antes de aplicar a migration se precisar preservá-los.

Configure `DATABASE_URL`, `SESSION_SECRET` e `ADMIN_PASSWORD` no ambiente do
servidor, nunca em variáveis `VITE_*`. O login e o cadastro falham explicitamente
se o Supabase não estiver disponível; a aplicação não cria nem carrega um
workspace de demonstração como fallback. `seed.sql` é apenas para desenvolvimento
isolado e não deve ser executado no projeto de produção.

## 🛠️ Comandos Úteis

### Backup
```bash
pg_dump -U postgres -d helenaia -F c -b -v -f helenaia_backup.dump
```

### Restore
```bash
pg_restore -U postgres -d helenaia -v helenaia_backup.dump
```

### Reset (⚠️ CUIDADO - apaga tudo)
```bash
psql -U postgres -d helenaia -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
# Depois execute schema.sql e seed.sql novamente
```

## 📝 Próximos Passos

1. ✅ Conectar o workspace ao Supabase via API server-side
2. 🔲 Normalizar gradualmente as entidades além do snapshot JSONB
3. 🔲 Migrar integrações legadas que ainda persistem tabelas específicas

## 🆘 Problemas Comuns

### Erro: "database helenaia already exists"
- O database já foi criado. Pule o passo 2.

### Erro: "permission denied"
- Verifique se está conectado com usuário que tem privilégios (postgres)

### Erro: "relation already exists"
- As tabelas já foram criadas. Para recriar, delete o database:
```sql
DROP DATABASE helenaia;
CREATE DATABASE helenaia;
```

### Erro: "encoding mismatch"
- Certifique-se de que o PostgreSQL está configurado para UTF8

## 📞 Suporte

Em caso de dúvidas:
1. Verifique os logs do PostgreSQL
2. Consulte a documentação: https://www.postgresql.org/docs/
3. Revise este README

---

**✨ Database HELENA AI instalado com sucesso!**
