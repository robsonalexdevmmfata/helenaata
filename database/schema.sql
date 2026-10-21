-- ==========================================================
-- HELENA AI - Schema PostgreSQL
-- Database: helenaia
-- ==========================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ==========================================================
-- ORGANIZATIONS & USERS
-- ==========================================================

CREATE TABLE organizations (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    industry VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    document VARCHAR(20),
    plan VARCHAR(50) DEFAULT 'Scale',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer')),
    title VARCHAR(100),
    color VARCHAR(20) DEFAULT 'chart-1',
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'convidado', 'inativo')),
    work_hours VARCHAR(50),
    goal DECIMAL(12, 2) DEFAULT 0,
    achieved DECIMAL(12, 2) DEFAULT 0,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, email),
    UNIQUE(organization_id, username)
);

CREATE TABLE invites (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer')),
    token VARCHAR(255) UNIQUE,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    UNIQUE(organization_id, email)
);

-- ==========================================================
-- CRM - COMPANIES & CONTACTS
-- ==========================================================

CREATE TABLE companies (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    segment VARCHAR(100),
    city VARCHAR(100),
    size VARCHAR(50),
    website VARCHAR(255),
    owner_id VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE contacts (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE SET NULL,
    title VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    source VARCHAR(50),
    owner_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'lead' CHECK (status IN ('lead', 'cliente', 'inativo')),
    score INTEGER DEFAULT 0,
    consent BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_contact_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- CRM - PIPELINES & DEALS
-- ==========================================================

CREATE TABLE pipelines (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    stages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deals (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pipeline_id VARCHAR(50) NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    stage_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    contact_id VARCHAR(50) REFERENCES contacts(id) ON DELETE SET NULL,
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE SET NULL,
    value DECIMAL(12, 2) DEFAULT 0,
    probability INTEGER DEFAULT 0,
    expected_close DATE,
    owner_id VARCHAR(50),
    owner_type VARCHAR(20) DEFAULT 'user' CHECK (owner_type IN ('user', 'agent')),
    source VARCHAR(50),
    status VARCHAR(20) DEFAULT 'aberto' CHECK (status IN ('aberto', 'ganho', 'perdido')),
    loss_reason TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- CRM - ACTIVITIES & TASKS
-- ==========================================================

CREATE TABLE activities (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id VARCHAR(50) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    deal_id VARCHAR(50) REFERENCES deals(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('nota', 'ligacao', 'email', 'whatsapp', 'reuniao', 'etapa', 'tarefa', 'handoff', 'ia')),
    text TEXT NOT NULL,
    actor VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    contact_id VARCHAR(50) REFERENCES contacts(id) ON DELETE SET NULL,
    deal_id VARCHAR(50) REFERENCES deals(id) ON DELETE SET NULL,
    assignee_id VARCHAR(50) NOT NULL,
    assignee_type VARCHAR(20) DEFAULT 'user' CHECK (assignee_type IN ('user', 'agent')),
    due_at TIMESTAMPTZ,
    done BOOLEAN DEFAULT false,
    priority VARCHAR(20) DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
    type VARCHAR(50) DEFAULT 'outro' CHECK (type IN ('follow-up', 'ligacao', 'reuniao', 'proposta', 'outro')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- MESSAGING - CONVERSATIONS
-- ==========================================================

CREATE TABLE conversations (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id VARCHAR(50) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat')),
    connection_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'aberta' CHECK (status IN ('aberta', 'pendente', 'resolvida')),
    handler_type VARCHAR(20) DEFAULT 'human' CHECK (handler_type IN ('human', 'agent', 'helena')),
    handler_id VARCHAR(50),
    unread INTEGER DEFAULT 0,
    sentiment VARCHAR(20) DEFAULT 'neutro' CHECK (sentiment IN ('positivo', 'neutro', 'negativo')),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id VARCHAR(50) PRIMARY KEY,
    conversation_id VARCHAR(50) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    from_type VARCHAR(20) NOT NULL CHECK (from_type IN ('contact', 'human', 'agent', 'helena', 'system')),
    author_name VARCHAR(255),
    text TEXT NOT NULL,
    kind VARCHAR(20) DEFAULT 'text' CHECK (kind IN ('text', 'image', 'audio', 'document', 'event')),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quick_replies (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    shortcut VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, shortcut)
);

-- ==========================================================
-- AI - AGENTS & TEAMS
-- ==========================================================

CREATE TABLE agents (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    description TEXT,
    objective TEXT,
    personality TEXT,
    prompt TEXT,
    model VARCHAR(100) DEFAULT 'openai/gpt-4o-mini',
    temperature DECIMAL(3, 2) DEFAULT 0.4,
    knowledge_ids TEXT[] DEFAULT '{}',
    tools TEXT[] DEFAULT '{}',
    channels TEXT[] DEFAULT '{}',
    schedule VARCHAR(100),
    supervisor_id VARCHAR(50),
    team_id VARCHAR(50),
    budget DECIMAL(10, 2) DEFAULT 0,
    spent DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'aguardando' CHECK (status IN ('trabalhando', 'aguardando', 'pausado', 'erro')),
    permissions TEXT[] DEFAULT '{}',
    color VARCHAR(20) DEFAULT 'chart-1',
    current_task TEXT,
    metrics JSONB DEFAULT '{"tasks": 0, "conversations": 0, "responseRate": 0, "conversions": 0}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teams (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    objective TEXT,
    supervisor_id VARCHAR(50),
    agent_ids TEXT[] DEFAULT '{}',
    goals TEXT,
    schedule VARCHAR(100),
    channels TEXT[] DEFAULT '{}',
    budget DECIMAL(10, 2) DEFAULT 0,
    spent DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado', 'aguardando', 'erro', 'requer_aprovacao')),
    metrics JSONB DEFAULT '{"leads": 0, "meetings": 0, "conversions": 0}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- AI - OPERATIONS & EXECUTIONS
-- ==========================================================

CREATE TABLE operations (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    objective TEXT,
    requested_by VARCHAR(255),
    agent_ids TEXT[] DEFAULT '{}',
    connection_id VARCHAR(50),
    status VARCHAR(30) DEFAULT 'running' CHECK (status IN ('running', 'awaiting_approval', 'completed', 'failed', 'paused')),
    total INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    metrics JSONB DEFAULT '{"responded": 0, "interested": 0, "qualified": 0, "meetings": 0, "handoffs": 0}',
    cost DECIMAL(10, 2) DEFAULT 0,
    steps JSONB DEFAULT '[]',
    events JSONB DEFAULT '[]',
    result TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE approvals (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    details JSONB DEFAULT '[]',
    tool VARCHAR(100),
    params JSONB,
    risk VARCHAR(20) CHECK (risk IN ('baixo', 'medio', 'alto')),
    requested_by VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'negada')),
    decided_by VARCHAR(255),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE executions (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor VARCHAR(255),
    actor_type VARCHAR(20) CHECK (actor_type IN ('helena', 'agent', 'user', 'sistema')),
    action VARCHAR(100) NOT NULL,
    description TEXT,
    params JSONB,
    result VARCHAR(20) CHECK (result IN ('sucesso', 'falha', 'pendente')),
    error TEXT,
    requested_by VARCHAR(255),
    approved_by VARCHAR(255),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- AI - KNOWLEDGE & MEMORY
-- ==========================================================

CREATE TABLE memories (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('permanente', 'conversa', 'operacional', 'documental')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    source VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE knowledge_docs (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(10) CHECK (type IN ('PDF', 'DOCX', 'TXT', 'CSV', 'URL')),
    size BIGINT,
    collection VARCHAR(100),
    status VARCHAR(20) DEFAULT 'indexando' CHECK (status IN ('indexado', 'indexando', 'erro')),
    chunks INTEGER DEFAULT 0,
    agent_ids TEXT[] DEFAULT '{}',
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tool_settings (
    id SERIAL PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    risk VARCHAR(20) DEFAULT 'baixo' CHECK (risk IN ('baixo', 'medio', 'alto')),
    UNIQUE(organization_id, name)
);

-- ==========================================================
-- PROSPECTING
-- ==========================================================

CREATE TABLE prospect_lists (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    segment VARCHAR(100),
    icp TEXT,
    count INTEGER DEFAULT 0,
    source VARCHAR(100),
    blacklisted INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE campaigns (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    list_id VARCHAR(50) REFERENCES prospect_lists(id) ON DELETE SET NULL,
    cadence_id VARCHAR(50),
    agent_ids TEXT[] DEFAULT '{}',
    channel VARCHAR(50) CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat')),
    connection_id VARCHAR(50),
    status VARCHAR(30) DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativa', 'pausada', 'concluida', 'aguardando_aprovacao')),
    total INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    interested INTEGER DEFAULT 0,
    meetings INTEGER DEFAULT 0,
    opt_outs INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cadences (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    steps JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- AUTOMATIONS
-- ==========================================================

CREATE TABLE automations (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    trigger VARCHAR(100) NOT NULL,
    conditions JSONB DEFAULT '[]',
    actions JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT true,
    runs INTEGER DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- INTEGRATIONS - WHATSAPP
-- ==========================================================

CREATE TABLE whatsapp_connections (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    type VARCHAR(20) CHECK (type IN ('qrcode', 'cloud_api')),
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'conectando')),
    queue INTEGER DEFAULT 0,
    sent_today INTEGER DEFAULT 0,
    daily_limit INTEGER DEFAULT 1000,
    credentials JSONB,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE wa_templates (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) CHECK (category IN ('Marketing', 'Utilidade', 'Autenticação')),
    language VARCHAR(10) DEFAULT 'pt_BR',
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('aprovado', 'pendente', 'rejeitado')),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- INTEGRATIONS - WEBHOOKS & API
-- ==========================================================

CREATE TABLE webhooks (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    direction VARCHAR(20) CHECK (direction IN ('entrada', 'saida')),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    secret VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_logs (
    id VARCHAR(50) PRIMARY KEY,
    webhook_id VARCHAR(50) NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event VARCHAR(100),
    status INTEGER,
    attempts INTEGER DEFAULT 1,
    request_body JSONB,
    response_body JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_tokens (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    prefix VARCHAR(20) NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- AI PROVIDERS & USAGE
-- ==========================================================

CREATE TABLE ai_providers (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id VARCHAR(50) NOT NULL CHECK (provider_id IN ('openai', 'anthropic', 'google', 'openrouter')),
    name VARCHAR(100) NOT NULL,
    connected BOOLEAN DEFAULT false,
    key_encrypted TEXT,
    key_masked VARCHAR(50),
    models TEXT[] DEFAULT '{}',
    monthly_limit DECIMAL(10, 2) DEFAULT 0,
    spent DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, provider_id)
);

CREATE TABLE ai_usage (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    agent_id VARCHAR(50),
    operation_id VARCHAR(50),
    input_tokens BIGINT DEFAULT 0,
    output_tokens BIGINT DEFAULT 0,
    cost DECIMAL(10, 4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- HELENA CHAT
-- ==========================================================

CREATE TABLE helena_conversations (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE helena_messages (
    id VARCHAR(50) PRIMARY KEY,
    conversation_id VARCHAR(50) NOT NULL REFERENCES helena_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'helena')),
    text TEXT NOT NULL,
    card JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE helena_settings (
    organization_id VARCHAR(50) PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    model VARCHAR(100) DEFAULT 'anthropic/claude-opus',
    agents_default_model VARCHAR(100) DEFAULT 'openai/gpt-4o-mini',
    classifier_model VARCHAR(100) DEFAULT 'google/gemini-flash',
    auto_approve_medium BOOLEAN DEFAULT true,
    tone TEXT DEFAULT 'Executiva, objetiva e cordial',
    monthly_budget DECIMAL(10, 2) DEFAULT 800,
    alert_at INTEGER DEFAULT 80,
    block_at_limit BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- LGPD & SECURITY
-- ==========================================================

CREATE TABLE lgpd_requests (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    type VARCHAR(20) CHECK (type IN ('exportacao', 'anonimizacao', 'exclusao')),
    status VARCHAR(20) DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida')),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE user_sessions (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device VARCHAR(255),
    ip VARCHAR(50),
    location VARCHAR(100),
    token_hash VARCHAR(255),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(50),
    details JSONB,
    ip VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- BILLING
-- ==========================================================

CREATE TABLE invoices (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    number VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'aberta' CHECK (status IN ('paga', 'aberta', 'vencida', 'cancelada')),
    due_date DATE,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organization_settings (
    organization_id VARCHAR(50) PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    retention_days INTEGER DEFAULT 730,
    mfa_enabled BOOLEAN DEFAULT false,
    ip_whitelist TEXT[] DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- INDEXES
-- ==========================================================

-- Organizations & Users
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_invites_org ON invites(organization_id);

-- CRM
CREATE INDEX idx_companies_org ON companies(organization_id);
CREATE INDEX idx_contacts_org ON contacts(organization_id);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_name_trgm ON contacts USING gin (name gin_trgm_ops);

CREATE INDEX idx_pipelines_org ON pipelines(organization_id);
CREATE INDEX idx_deals_org ON deals(organization_id);
CREATE INDEX idx_deals_pipeline ON deals(pipeline_id);
CREATE INDEX idx_deals_contact ON deals(contact_id);
CREATE INDEX idx_deals_status ON deals(status);

CREATE INDEX idx_activities_org ON activities(organization_id);
CREATE INDEX idx_activities_contact ON activities(contact_id);
CREATE INDEX idx_activities_deal ON activities(deal_id);
CREATE INDEX idx_activities_created ON activities(created_at DESC);

CREATE INDEX idx_tasks_org ON tasks(organization_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_due ON tasks(due_at);
CREATE INDEX idx_tasks_done ON tasks(done);

-- Messaging
CREATE INDEX idx_conversations_org ON conversations(organization_id);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- AI
CREATE INDEX idx_agents_org ON agents(organization_id);
CREATE INDEX idx_agents_team ON agents(team_id);
CREATE INDEX idx_agents_status ON agents(status);

CREATE INDEX idx_teams_org ON teams(organization_id);

CREATE INDEX idx_operations_org ON operations(organization_id);
CREATE INDEX idx_operations_status ON operations(status);
CREATE INDEX idx_operations_created ON operations(created_at DESC);

CREATE INDEX idx_approvals_org ON approvals(organization_id);
CREATE INDEX idx_approvals_status ON approvals(status);

CREATE INDEX idx_executions_org ON executions(organization_id);
CREATE INDEX idx_executions_created ON executions(created_at DESC);

CREATE INDEX idx_memories_org ON memories(organization_id);
CREATE INDEX idx_memories_type ON memories(type);

CREATE INDEX idx_knowledge_org ON knowledge_docs(organization_id);

-- Prospecting
CREATE INDEX idx_lists_org ON prospect_lists(organization_id);
CREATE INDEX idx_campaigns_org ON campaigns(organization_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_cadences_org ON cadences(organization_id);

-- Automations
CREATE INDEX idx_automations_org ON automations(organization_id);
CREATE INDEX idx_automations_active ON automations(active);

-- Integrations
CREATE INDEX idx_wa_connections_org ON whatsapp_connections(organization_id);
CREATE INDEX idx_webhooks_org ON webhooks(organization_id);
CREATE INDEX idx_webhook_logs_webhook ON webhook_logs(webhook_id);
CREATE INDEX idx_api_tokens_org ON api_tokens(organization_id);

-- AI Usage
CREATE INDEX idx_ai_usage_org ON ai_usage(organization_id);
CREATE INDEX idx_ai_usage_date ON ai_usage(date DESC);
CREATE INDEX idx_ai_usage_agent ON ai_usage(agent_id);

-- Helena
CREATE INDEX idx_helena_conv_org ON helena_conversations(organization_id);
CREATE INDEX idx_helena_conv_user ON helena_conversations(user_id);
CREATE INDEX idx_helena_msgs_conv ON helena_messages(conversation_id);

-- LGPD & Security
CREATE INDEX idx_lgpd_org ON lgpd_requests(organization_id);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- Billing
CREATE INDEX idx_invoices_org ON invoices(organization_id);

-- ==========================================================
-- TRIGGERS - Updated At
-- ==========================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operations_updated_at BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================
-- VIEWS - Analytics
-- ==========================================================

CREATE VIEW v_pipeline_summary AS
SELECT 
    d.organization_id,
    d.pipeline_id,
    d.stage_id,
    COUNT(*) as deal_count,
    SUM(d.value) as total_value,
    AVG(d.probability) as avg_probability
FROM deals d
WHERE d.status = 'aberto'
GROUP BY d.organization_id, d.pipeline_id, d.stage_id;

CREATE VIEW v_agent_performance AS
SELECT 
    a.id,
    a.organization_id,
    a.name,
    a.role,
    a.status,
    a.spent,
    a.metrics,
    COUNT(DISTINCT t.id) as assigned_tasks,
    COUNT(DISTINCT c.id) as active_conversations
FROM agents a
LEFT JOIN tasks t ON t.assignee_id = a.id AND t.assignee_type = 'agent' AND t.done = false
LEFT JOIN conversations c ON c.handler_id = a.id AND c.handler_type = 'agent' AND c.status = 'aberta'
GROUP BY a.id;

CREATE VIEW v_daily_ai_costs AS
SELECT 
    organization_id,
    date,
    SUM(cost) as total_cost,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    COUNT(DISTINCT agent_id) as agents_used
FROM ai_usage
GROUP BY organization_id, date
ORDER BY date DESC;

-- ==========================================================
-- FUNCTIONS - Utility
-- ==========================================================

-- Function to generate sequential operation codes
CREATE OR REPLACE FUNCTION generate_operation_code(org_id VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)), 0) + 1
    INTO next_num
    FROM operations
    WHERE organization_id = org_id;
    
    RETURN 'OP-' || next_num::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to check RBAC permissions
CREATE OR REPLACE FUNCTION user_has_permission(
    user_role VARCHAR,
    permission VARCHAR
) RETURNS BOOLEAN AS $$
BEGIN
    -- Owner has all permissions
    IF user_role = 'owner' THEN
        RETURN TRUE;
    END IF;
    
    -- Admin permissions
    IF user_role = 'admin' AND permission NOT IN ('organization.delete', 'billing.manage') THEN
        RETURN TRUE;
    END IF;
    
    -- Manager permissions
    IF user_role = 'manager' AND permission LIKE 'crm.%' OR permission LIKE 'contacts.%' 
       OR permission LIKE 'deals.%' OR permission LIKE 'agents.view' THEN
        RETURN TRUE;
    END IF;
    
    -- Agent permissions
    IF user_role = 'agent' AND permission IN ('crm.view', 'contacts.view', 'deals.view', 'tasks.manage') THEN
        RETURN TRUE;
    END IF;
    
    -- Viewer - read only
    IF user_role = 'viewer' AND permission LIKE '%.view' THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================
-- INITIAL DATA - Role Permissions
-- ==========================================================

CREATE TABLE role_permissions (
    role VARCHAR(20) NOT NULL,
    permission VARCHAR(100) NOT NULL,
    PRIMARY KEY (role, permission)
);

-- Owner permissions (all)
INSERT INTO role_permissions (role, permission) VALUES
('owner', '*'),
('owner', 'organization.manage'),
('owner', 'organization.delete'),
('owner', 'billing.manage'),
('owner', 'users.manage'),
('owner', 'agents.manage'),
('owner', 'helena.configure');

-- Admin permissions
INSERT INTO role_permissions (role, permission) VALUES
('admin', 'organization.manage'),
('admin', 'users.manage'),
('admin', 'agents.manage'),
('admin', 'crm.*'),
('admin', 'automations.manage'),
('admin', 'integrations.manage'),
('admin', 'helena.use');

-- Manager permissions
INSERT INTO role_permissions (role, permission) VALUES
('manager', 'crm.*'),
('manager', 'contacts.manage'),
('manager', 'deals.manage'),
('manager', 'tasks.manage'),
('manager', 'agents.view'),
('manager', 'helena.use');

-- Agent permissions
INSERT INTO role_permissions (role, permission) VALUES
('agent', 'crm.view'),
('agent', 'contacts.view'),
('agent', 'deals.view'),
('agent', 'tasks.manage'),
('agent', 'conversations.manage');

-- Viewer permissions
INSERT INTO role_permissions (role, permission) VALUES
('viewer', 'crm.view'),
('viewer', 'contacts.view'),
('viewer', 'deals.view'),
('viewer', 'analytics.view');

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE organizations IS 'Multi-tenant: cada empresa/cliente do SaaS';
COMMENT ON TABLE users IS 'Usuários humanos da plataforma';
COMMENT ON TABLE agents IS 'Agentes de IA (SDR, Closer, Atendimento, etc)';
COMMENT ON TABLE teams IS 'Times de agentes coordenados por supervisor';
COMMENT ON TABLE operations IS 'Operações orquestradas pela Helena (prospecções, campanhas, etc)';
COMMENT ON TABLE executions IS 'Log de auditoria de todas as ações executadas';
COMMENT ON TABLE approvals IS 'Aprovações pendentes para ações de risco alto';
COMMENT ON TABLE helena_conversations IS 'Conversas do usuário com a Helena';
COMMENT ON TABLE helena_messages IS 'Mensagens individuais com Helena (incluindo cards)';
COMMENT ON TABLE conversations IS 'Conversas omnichannel com contatos externos';
COMMENT ON TABLE messages IS 'Mensagens em conversas omnichannel';

-- ==========================================================
-- FASE 3: BACKEND AUTÔNOMO, JOB QUEUE & WORKERS
-- ==========================================================

CREATE TABLE IF NOT EXISTS system_settings (
    organization_id VARCHAR(50) PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    kill_switch_active BOOLEAN DEFAULT false,
    autonomy_level INTEGER DEFAULT 3 CHECK (autonomy_level BETWEEN 1 AND 4),
    daily_message_limit INTEGER DEFAULT 1000,
    daily_budget_limit DECIMAL(12, 2) DEFAULT 500.00,
    quiet_hours_start TIME DEFAULT '20:00:00',
    quiet_hours_end TIME DEFAULT '08:00:00',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workers (
    id VARCHAR(50) PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'online' CHECK (status IN ('online', 'busy', 'idle', 'dead', 'offline')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
    current_job_id VARCHAR(50),
    jobs_processed INTEGER DEFAULT 0,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_workers_heartbeat ON workers(heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);

CREATE TABLE IF NOT EXISTS missions (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    objective TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
        'draft', 'awaiting_approval', 'running', 'paused', 'blocked', 'completed', 'failed', 'cancelled'
    )),
    priority VARCHAR(20) DEFAULT 'alta' CHECK (priority IN ('baixa', 'media', 'alta', 'urgente')),
    target_metric VARCHAR(50) NOT NULL,
    target_value INTEGER NOT NULL DEFAULT 20,
    current_value INTEGER NOT NULL DEFAULT 0,
    deadline TIMESTAMPTZ,
    budget DECIMAL(12, 2) DEFAULT 0,
    spent DECIMAL(12, 2) DEFAULT 0,
    strategy TEXT,
    supervisor_id VARCHAR(50) REFERENCES agents(id) ON DELETE SET NULL,
    agent_ids JSONB DEFAULT '[]'::jsonb,
    funnel JSONB DEFAULT '{"prospects":0,"contacted":0,"replied":0,"qualified":0,"meetings":0,"won":0}'::jsonb,
    created_by VARCHAR(100) DEFAULT 'Helena',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_missions_org ON missions(organization_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);

CREATE TABLE IF NOT EXISTS mission_tasks (
    id VARCHAR(50) PRIMARY KEY,
    mission_id VARCHAR(50) NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    agent_id VARCHAR(50) REFERENCES agents(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
        'pending', 'waiting_dependency', 'ready', 'running', 'completed', 'failed', 'skipped'
    )),
    depends_on JSONB DEFAULT '[]'::jsonb,
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB DEFAULT '{}'::jsonb,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_tasks_mission ON mission_tasks(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_agent ON mission_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_status ON mission_tasks(status);

CREATE TABLE IF NOT EXISTS job_queue (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mission_id VARCHAR(50) REFERENCES missions(id) ON DELETE CASCADE,
    task_id VARCHAR(50) REFERENCES mission_tasks(id) ON DELETE CASCADE,
    agent_id VARCHAR(50) REFERENCES agents(id) ON DELETE SET NULL,
    type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INTEGER DEFAULT 10,
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'retrying', 'completed', 'failed', 'dead', 'cancelled'
    )),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    run_at TIMESTAMPTZ DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(50) REFERENCES workers(id) ON DELETE SET NULL,
    last_error TEXT,
    idempotency_key VARCHAR(150) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_queue_claim ON job_queue (status, run_at, priority DESC)
WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_job_queue_org ON job_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_mission ON job_queue(mission_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_locked ON job_queue(locked_by, locked_at);

CREATE TABLE IF NOT EXISTS event_log (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(50) NOT NULL,
    actor_type VARCHAR(50) DEFAULT 'sistema',
    actor_id VARCHAR(100),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_log_org ON event_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(type);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at DESC);

CREATE TABLE IF NOT EXISTS ab_experiments (
    id VARCHAR(50) PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'paused')),
    variant_a JSONB NOT NULL,
    variant_b JSONB NOT NULL,
    winner VARCHAR(10),
    recommendation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_experiments_org ON ab_experiments(organization_id);

COMMENT ON TABLE job_queue IS 'Fila de execução 24/7 de tarefas e jobs assíncronos da Helena';
COMMENT ON TABLE workers IS 'Processos autônomos em execução contínua com heartbeat';
COMMENT ON TABLE missions IS 'Missões estratégicas empresariais orquestradas';
COMMENT ON TABLE mission_tasks IS 'Grafo de tarefas dependentes que compõem uma missão';

-- ==========================================================
-- DATABASE READY
-- ==========================================================

-- Script concluído
-- Execute este arquivo no pgAdmin conectado ao banco "helenaia"
-- 
-- Comandos para criar o banco (execute antes deste script):
-- CREATE DATABASE helenaia;
-- \c helenaia
