-- ==========================================================
-- HELENA AI — FASE 3: BACKEND AUTÔNOMO & JOB QUEUE
-- Migration: 001_phase3_orchestration.sql
-- ==========================================================

-- Extensões necessárias (caso não tenham sido criadas)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. SISTEMA & GOVERNANÇA GLOBAL
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

-- 2. WORKERS 24/7 (Registro de Processos Autônomos)
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

-- 3. MISSÕES EMPRESARIAIS (Objetivos de Alto Nível)
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

-- 4. TAREFAS DA MISSÃO (Grafo de Dependências)
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

-- 5. JOB QUEUE PERSISTENTE (Fila 24/7 com Atomic Claim)
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

-- Índice ultra-otimizado para SELECT ... FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS idx_job_queue_claim ON job_queue (status, run_at, priority DESC)
WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_job_queue_org ON job_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_mission ON job_queue(mission_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_locked ON job_queue(locked_by, locked_at);

-- 6. EVENT LOG & AUDIT IMUTÁVEL (Outbox Pattern)
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

-- 7. EXPERIMENTOS A/B
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

-- Inserir configuração padrão para organização de teste caso exista
INSERT INTO system_settings (organization_id, kill_switch_active, autonomy_level)
VALUES ('org_novarota', false, 3)
ON CONFLICT (organization_id) DO NOTHING;

-- Inserir Missão Inicial de Exemplo na base PostgreSQL
INSERT INTO missions (
    id, organization_id, code, title, objective, status, priority,
    target_metric, target_value, current_value, deadline, budget, spent,
    strategy, supervisor_id, created_by
) VALUES (
    'mis_101', 'org_novarota', 'MIS-101',
    'Fechar 20 Sites Institucionais para Clínicas',
    'Conseguir 20 contratos de sites e presença no Google para clínicas médicas e odontológicas.',
    'running', 'alta', 'vendas', 20, 8,
    NOW() + INTERVAL '30 days', 900.00, 184.50,
    'Varredura Google Maps de clínicas sem site -> Abordagem WhatsApp A/B -> Qualificação BANT -> Reunião Google Meet -> Fechamento Closer',
    'a_supcom', 'Helena'
) ON CONFLICT (code) DO NOTHING;

-- Inserir Tarefas do Grafo para a MIS-101
INSERT INTO mission_tasks (
    id, mission_id, organization_id, title, description, agent_id, status, depends_on, retry_count
) VALUES 
('mt_1', 'mis_101', 'org_novarota', 'Varredura Google Maps: clínicas sem site', 'Coletar 500 clínicas sem site em SP', 'a_sdr1', 'completed', '[]'::jsonb, 0),
('mt_2', 'mis_101', 'org_novarota', 'Abordagem Consultiva WhatsApp (Teste A/B)', 'Disparo dividido entre SDR 01 e SDR 02', 'a_sdr2', 'running', '["mt_1"]'::jsonb, 0),
('mt_3', 'mis_101', 'org_novarota', 'Qualificação BANT e Filtro de Respostas', 'Filtrar respostas positivas e agendar', 'a_qual', 'pending', '["mt_2"]'::jsonb, 0),
('mt_4', 'mis_101', 'org_novarota', 'Agendamento de Reuniões no Google Calendar', 'Closer envia link e confirma horário', 'a_closer', 'pending', '["mt_3"]'::jsonb, 0),
('mt_5', 'mis_101', 'org_novarota', 'Apresentação de Proposta e Fechamento', 'Condução de calls e fechamento comercial', 'a_closer', 'pending', '["mt_4"]'::jsonb, 0)
ON CONFLICT (id) DO NOTHING;

-- Inserir Experimento A/B Ativo
INSERT INTO ab_experiments (
    id, organization_id, title, status, variant_a, variant_b
) VALUES (
    'ab_1', 'org_novarota', 'Abordagem Inicial Clínicas: Pergunta vs Elogio', 'running',
    '{"label":"Variante A (Diagnóstico)","text":"Notei que sua clínica ainda não aparece no Google Maps. Posso mostrar como resolver?","sent":85,"replies":18,"conversions":4}'::jsonb,
    '{"label":"Variante B (Case do Segmento)","text":"Ajudamos clínicas em SP a receberem 3x mais agendamentos com site institucional. Quer ver os cases?","sent":90,"replies":31,"conversions":9}'::jsonb
) ON CONFLICT (id) DO NOTHING;
