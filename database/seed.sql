-- ==========================================================
-- HELENA AI - Seed Data (Dados de Exemplo)
-- Execute APÓS o schema.sql
-- ==========================================================

-- Limpar dados existentes (cuidado em produção!)
TRUNCATE TABLE 
    invoices,
    organization_settings,
    audit_logs,
    user_sessions,
    lgpd_requests,
    helena_settings,
    helena_messages,
    helena_conversations,
    ai_usage,
    ai_providers,
    api_tokens,
    webhook_logs,
    webhooks,
    wa_templates,
    whatsapp_connections,
    automations,
    cadences,
    campaigns,
    prospect_lists,
    tool_settings,
    knowledge_docs,
    memories,
    executions,
    approvals,
    operations,
    teams,
    agents,
    quick_replies,
    messages,
    conversations,
    tasks,
    activities,
    deals,
    pipelines,
    contacts,
    companies,
    invites,
    users,
    organizations
CASCADE;

-- ==========================================================
-- 1. ORGANIZATION
-- ==========================================================

INSERT INTO organizations (id, name, slug, industry, timezone, document, plan, created_at) VALUES
('org_novarota', 'Nova Rota Digital', 'nova-rota', 'Agência de marketing e sites', 'America/Sao_Paulo', '12.345.678/0001-90', 'Scale', NOW() - INTERVAL '180 days');

-- ==========================================================
-- 2. USERS
-- ==========================================================

INSERT INTO users (id, organization_id, name, email, username, role, title, color, status, work_hours, goal, achieved, last_seen) VALUES
('u1', 'org_novarota', 'Letícia Andrade', 'leticia@novarota.com.br', 'admin', 'owner', 'CEO', 'chart-1', 'ativo', '08:00–19:00', 120000, 86400, NOW() - INTERVAL '1 minute'),
('u2', 'org_novarota', 'Rafael Monteiro', 'rafael@novarota.com.br', 'rafael', 'manager', 'Head Comercial', 'chart-2', 'ativo', '09:00–18:00', 80000, 61200, NOW() - INTERVAL '14 minutes'),
('u3', 'org_novarota', 'Camila Duarte', 'camila@novarota.com.br', 'camila', 'agent', 'Executiva de vendas', 'chart-3', 'ativo', '09:00–18:00', 40000, 32800, NOW() - INTERVAL '42 minutes'),
('u4', 'org_novarota', 'Bruno Teixeira', 'bruno@novarota.com.br', 'bruno', 'agent', 'Atendimento', 'chart-4', 'ativo', '08:00–17:00', 0, 0, NOW() - INTERVAL '3 hours'),
('u5', 'org_novarota', 'Juliana Rocha', 'juliana@novarota.com.br', 'juliana', 'viewer', 'Financeiro', 'chart-5', 'ativo', '09:00–18:00', 0, 0, NOW() - INTERVAL '2 days'),
('u6', 'org_novarota', 'Diego Martins', 'diego@novarota.com.br', 'diego', 'admin', 'Operações', 'chart-2', 'ativo', '08:00–18:00', 0, 0, NOW() - INTERVAL '5 hours');

-- ==========================================================
-- 3. INVITES
-- ==========================================================

INSERT INTO invites (id, organization_id, email, role, sent_at) VALUES
('iv1', 'org_novarota', 'marina@novarota.com.br', 'agent', NOW() - INTERVAL '1 day'),
('iv2', 'org_novarota', 'paulo@novarota.com.br', 'manager', NOW() - INTERVAL '3 days');

-- ==========================================================
-- 4. COMPANIES
-- ==========================================================

INSERT INTO companies (id, organization_id, name, segment, city, size, website, owner_id, created_at) VALUES
('c1', 'org_novarota', 'Clínica Sorriso Pleno', 'Odontologia', 'São Paulo, SP', '11–50', 'sorrisopleno.com.br', 'u2', NOW() - INTERVAL '60 days'),
('c2', 'org_novarota', 'Odonto Vita', 'Odontologia', 'Campinas, SP', '1–10', 'odontovita.com.br', 'u3', NOW() - INTERVAL '56 days'),
('c3', 'org_novarota', 'Studio Bela Forma', 'Estética', 'São Paulo, SP', '1–10', 'belaforma.com.br', 'a_sdr1', NOW() - INTERVAL '52 days'),
('c4', 'org_novarota', 'Agência Pulsar', 'Marketing', 'São Paulo, SP', '11–50', 'pulsar.ag', 'a_sdr2', NOW() - INTERVAL '48 days'),
('c5', 'org_novarota', 'Constrular Engenharia', 'Construção', 'Santo André, SP', '51–200', 'constrular.com.br', 'u2', NOW() - INTERVAL '44 days'),
('c6', 'org_novarota', 'Vértice Contabilidade', 'Contabilidade', 'São Paulo, SP', '11–50', 'verticecontabil.com.br', 'u3', NOW() - INTERVAL '40 days'),
('c7', 'org_novarota', 'Padaria Trigo de Ouro', 'Alimentação', 'Osasco, SP', '11–50', 'trigodeouro.com.br', 'a_sdr1', NOW() - INTERVAL '36 days'),
('c8', 'org_novarota', 'Instituto Movimento', 'Fisioterapia', 'Santos, SP', '11–50', 'institutomovimento.com.br', 'a_sdr2', NOW() - INTERVAL '32 days'),
('c9', 'org_novarota', 'Grupo Alfa Imóveis', 'Imobiliário', 'São Paulo, SP', '51–200', 'alfaimoveis.com.br', 'u2', NOW() - INTERVAL '28 days'),
('c10', 'org_novarota', 'TechNorte Sistemas', 'Tecnologia', 'Belo Horizonte, MG', '11–50', 'technorte.com.br', 'u3', NOW() - INTERVAL '24 days');

-- ==========================================================
-- 5. CONTACTS
-- ==========================================================

INSERT INTO contacts (id, organization_id, name, email, phone, company_id, title, tags, source, owner_id, status, score, consent, created_at, last_contact_at) VALUES
('p1', 'org_novarota', 'Dra. Mariana Lopes', 'mariana@sorrisopleno.com.br', '+55 11 98000-1000', 'c1', 'Diretora clínica', ARRAY['quente', 'clínica'], 'Facebook Ads', 'u2', 'lead', 85, true, NOW() - INTERVAL '40 days', NOW() - INTERVAL '5 hours'),
('p2', 'org_novarota', 'Carlos Henrique Prado', 'carlos@odontovita.com.br', '+55 11 98137-1271', 'c2', 'Sócio', ARRAY['clínica'], 'Google Ads', 'u3', 'lead', 72, true, NOW() - INTERVAL '37 days', NOW() - INTERVAL '2 days'),
('p3', 'org_novarota', 'Patrícia Nogueira', 'patricia@belaforma.com.br', '+55 11 98274-1542', 'c3', 'Proprietária', ARRAY['estética', 'quente'], 'Indicação', 'a_sdr1', 'lead', 91, true, NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 minutes'),
('p4', 'org_novarota', 'Thiago Albuquerque', 'thiago@pulsar.ag', '+55 11 98411-1813', 'c4', 'Diretor de criação', ARRAY['agência', 'parceiro'], 'Site', 'a_sdr2', 'lead', 68, true, NOW() - INTERVAL '33 days', NOW() - INTERVAL '10 hours'),
('p5', 'org_novarota', 'Fernanda Siqueira', 'fernanda@constrular.com.br', '+55 11 98548-2084', 'c5', 'Gerente de marketing', ARRAY['B2B'], 'Prospecção', 'u2', 'lead', 79, true, NOW() - INTERVAL '31 days', NOW() - INTERVAL '1 day'),
('p6', 'org_novarota', 'Eduardo Vasconcelos', 'eduardo@verticecontabil.com.br', '+55 11 98685-2355', 'c6', 'Sócio-diretor', ARRAY['B2B', 'quente'], 'Instagram', 'u3', 'lead', 88, true, NOW() - INTERVAL '29 days', NOW() - INTERVAL '25 hours'),
('p7', 'org_novarota', 'Renata Campos', 'renata@trigodeouro.com.br', '+55 11 98822-2626', 'c7', 'Proprietária', ARRAY['varejo'], 'Evento', 'a_sdr1', 'cliente', 55, true, NOW() - INTERVAL '27 days', NOW() - INTERVAL '3 days'),
('p8', 'org_novarota', 'Dr. André Figueiredo', 'andre@institutomovimento.com.br', '+55 11 98959-2897', 'c8', 'Fisioterapeuta', ARRAY['clínica', 'reunião'], 'Facebook Ads', 'a_sdr2', 'lead', 94, true, NOW() - INTERVAL '25 days', NOW() - INTERVAL '1 hour'),
('p9', 'org_novarota', 'Luciana Barros', 'luciana@alfaimoveis.com.br', '+55 11 99096-3168', 'c9', 'Diretora comercial', ARRAY['imobiliário', 'quente'], 'Google Ads', 'u2', 'lead', 87, true, NOW() - INTERVAL '23 days', NOW() - INTERVAL '20 minutes'),
('p10', 'org_novarota', 'Marcelo Tavares', 'marcelo@technorte.com.br', '+55 11 99233-3439', 'c10', 'CEO', ARRAY['B2B', 'tecnologia'], 'Indicação', 'u3', 'lead', 76, true, NOW() - INTERVAL '21 days', NOW() - INTERVAL '2 hours');

-- ==========================================================
-- 6. PIPELINES
-- ==========================================================

INSERT INTO pipelines (id, organization_id, name, stages) VALUES
('pl_com', 'org_novarota', 'Comercial', '[
  {"id": "st_novo", "name": "Novo lead", "probability": 10, "color": "chart-3"},
  {"id": "st_qual", "name": "Qualificado", "probability": 30, "color": "chart-2"},
  {"id": "st_reun", "name": "Reunião agendada", "probability": 50, "color": "chart-4"},
  {"id": "st_prop", "name": "Proposta enviada", "probability": 70, "color": "chart-5"},
  {"id": "st_neg", "name": "Negociação", "probability": 85, "color": "chart-1"},
  {"id": "st_ganho", "name": "Ganho", "probability": 100, "color": "chart-2"}
]'::jsonb),
('pl_pos', 'org_novarota', 'Pós-venda', '[
  {"id": "st_onb", "name": "Onboarding", "probability": 100, "color": "chart-3"},
  {"id": "st_ativo", "name": "Cliente ativo", "probability": 100, "color": "chart-2"},
  {"id": "st_renov", "name": "Renovação", "probability": 80, "color": "chart-1"}
]'::jsonb);

-- ==========================================================
-- 7. DEALS
-- ==========================================================

INSERT INTO deals (id, organization_id, pipeline_id, stage_id, title, contact_id, company_id, value, probability, expected_close, owner_id, owner_type, source, status, tags, created_at) VALUES
('d1', 'org_novarota', 'pl_com', 'st_prop', 'Site institucional + SEO', 'p1', 'c1', 8900.00, 70, NOW() + INTERVAL '5 days', 'a_sdr1', 'agent', 'Facebook Ads', 'aberto', ARRAY['quente'], NOW() - INTERVAL '30 days'),
('d2', 'org_novarota', 'pl_com', 'st_qual', 'Landing page implantes', 'p2', 'c2', 3200.00, 30, NOW() + INTERVAL '7 days', 'u3', 'user', 'Google Ads', 'aberto', ARRAY['clínica'], NOW() - INTERVAL '28 days'),
('d3', 'org_novarota', 'pl_com', 'st_neg', 'Gestão de tráfego 6 meses', 'p3', 'c3', 14400.00, 85, NOW() + INTERVAL '9 days', 'a_closer', 'agent', 'Indicação', 'aberto', ARRAY['estética', 'quente'], NOW() - INTERVAL '26 days'),
('d4', 'org_novarota', 'pl_com', 'st_reun', 'Parceria white-label', 'p4', 'c4', 6000.00, 50, NOW() + INTERVAL '11 days', 'u2', 'user', 'Site', 'aberto', ARRAY['agência'], NOW() - INTERVAL '24 days'),
('d5', 'org_novarota', 'pl_com', 'st_prop', 'Portal de obras', 'p5', 'c5', 18500.00, 70, NOW() + INTERVAL '13 days', 'a_sdr2', 'agent', 'Prospecção', 'aberto', ARRAY['B2B'], NOW() - INTERVAL '22 days');

-- Continua com mais deals...
INSERT INTO deals (id, organization_id, pipeline_id, stage_id, title, contact_id, company_id, value, probability, expected_close, owner_id, owner_type, source, status, loss_reason, tags, created_at) VALUES
('d21', 'org_novarota', 'pl_com', 'st_prop', 'Site restaurante', 'p7', 'c7', 4200.00, 0, NOW() - INTERVAL '3 days', 'u3', 'user', 'Site', 'perdido', 'Preço acima do orçamento', ARRAY[], NOW() - INTERVAL '25 days');

-- ==========================================================
-- 8. ACTIVITIES
-- ==========================================================

INSERT INTO activities (id, organization_id, contact_id, deal_id, type, text, actor, created_at) VALUES
('ac1a', 'org_novarota', 'p1', 'd1', 'ia', 'Lead criado via Facebook Ads', 'Sistema', NOW() - INTERVAL '40 days'),
('ac1b', 'org_novarota', 'p1', 'd1', 'whatsapp', 'Primeira abordagem enviada pelo SDR', 'SDR 01', NOW() - INTERVAL '39 days'),
('ac1c', 'org_novarota', 'p1', 'd1', 'etapa', 'Movido para Qualificado', 'Qualificador', NOW() - INTERVAL '30 days'),
('ac1d', 'org_novarota', 'p1', 'd1', 'nota', 'Tem interesse, mas quer ver cases do mesmo segmento antes da reunião.', 'Camila Duarte', NOW() - INTERVAL '20 days'),
('ac1e', 'org_novarota', 'p1', 'd1', 'handoff', 'Handoff: Qualificador → Closer', 'Supervisor Comercial', NOW() - INTERVAL '15 days'),
('ac2a', 'org_novarota', 'p3', 'd3', 'ia', 'Lead criado via Indicação', 'Sistema', NOW() - INTERVAL '35 days'),
('ac2b', 'org_novarota', 'p3', 'd3', 'whatsapp', 'Contato inicial sobre gestão de tráfego', 'SDR 02', NOW() - INTERVAL '34 days'),
('ac2c', 'org_novarota', 'p3', 'd3', 'reuniao', 'Reunião realizada - demonstrou muito interesse', 'Camila Duarte', NOW() - INTERVAL '10 days');

-- ==========================================================
-- 9. TASKS
-- ==========================================================

INSERT INTO tasks (id, organization_id, title, contact_id, deal_id, assignee_id, assignee_type, due_at, done, priority, type) VALUES
('tk1', 'org_novarota', 'Retomar proposta Site institucional', 'p1', 'd1', 'a_fu', 'agent', NOW() - INTERVAL '1 day', false, 'alta', 'follow-up'),
('tk2', 'org_novarota', 'Ligar para Patrícia sobre tráfego', 'p3', 'd3', 'u3', 'user', NOW(), false, 'alta', 'ligacao'),
('tk3', 'org_novarota', 'Enviar cases de clínicas', 'p8', NULL, 'a_closer', 'agent', NOW(), false, 'media', 'follow-up'),
('tk4', 'org_novarota', 'Confirmar reunião Portal imobiliário', 'p9', NULL, 'u2', 'user', NOW(), false, 'alta', 'reuniao'),
('tk5', 'org_novarota', 'Follow-up Landing implantes', 'p2', 'd2', 'a_sdr2', 'agent', NOW() - INTERVAL '2 days', false, 'media', 'follow-up');

-- ==========================================================
-- 10. AGENTS
-- ==========================================================

INSERT INTO agents (id, organization_id, name, role, description, objective, personality, prompt, model, temperature, knowledge_ids, tools, channels, schedule, supervisor_id, team_id, budget, spent, status, permissions, color, current_task, metrics) VALUES
('a_supcom', 'org_novarota', 'Supervisor Comercial', 'Supervisor', 'Coordenador do time comercial', 'Coordenar SDRs, Qualificador e Closer para gerar reuniões qualificadas', 'Profissional, cordial e objetiva', '', 'anthropic/claude-sonnet', 0.4, ARRAY[]::text[], ARRAY['crm.search_contacts', 'crm.assign_lead', 'agents.assign_task', 'analytics.query'], ARRAY['whatsapp'], 'Seg–Sex, 08:00–19:00', NULL, 't_com', 200.00, 38.20, 'trabalhando', ARRAY['crm.view'], 'chart-1', 'Distribuindo leads da Prospecção Outubro', '{"tasks": 64, "conversations": 0, "responseRate": 0, "conversions": 0}'::jsonb),

('a_sdr1', 'org_novarota', 'SDR 01', 'SDR', 'Prospecção B2B', 'Prospectar agências e prestadores B2B em São Paulo', 'Profissional, cordial e objetiva', '', 'openai/gpt-4o-mini', 0.4, ARRAY['k1', 'k2', 'k3'], ARRAY['crm.search_contacts', 'crm.create_lead', 'messages.send', 'crm.create_task'], ARRAY['whatsapp'], 'Seg–Sex, 08:00–18:00', 'a_supcom', 't_com', 150.00, 52.40, 'trabalhando', ARRAY['crm.view'], 'chart-2', 'Prospecção Outubro · 41 contatos', '{"tasks": 212, "conversations": 148, "responseRate": 24.1, "conversions": 9}'::jsonb),

('a_sdr2', 'org_novarota', 'SDR 02', 'SDR', 'Prospecção clínicas', 'Prospectar clínicas e consultórios sem presença digital', 'Profissional, cordial e objetiva', '', 'openai/gpt-4o-mini', 0.4, ARRAY['k1', 'k2', 'k3'], ARRAY['crm.search_contacts', 'crm.create_lead', 'messages.send', 'crm.create_task'], ARRAY['whatsapp'], 'Seg–Sex, 08:00–18:00', 'a_supcom', 't_com', 150.00, 61.90, 'trabalhando', ARRAY['crm.view'], 'chart-3', 'Prospecção Outubro · 37 contatos', '{"tasks": 198, "conversations": 131, "responseRate": 31.6, "conversions": 12}'::jsonb),

('a_qual', 'org_novarota', 'Qualificador', 'Qualificador', 'Qualificação BANT', 'Qualificar respostas (BANT) e encaminhar interessados ao Closer', 'Profissional, cordial e objetiva', '', 'google/gemini-flash', 0.4, ARRAY[]::text[], ARRAY['crm.search_contacts', 'messages.search'], ARRAY['whatsapp'], 'Seg–Sex, 08:00–18:00', 'a_supcom', 't_com', 150.00, 12.30, 'aguardando', ARRAY['crm.view'], 'chart-4', NULL, '{"tasks": 89, "conversations": 54, "responseRate": 0, "conversions": 21}'::jsonb),

('a_closer', 'org_novarota', 'Closer', 'Closer', 'Fechamento de vendas', 'Conduzir reuniões, propostas e negociação até o fechamento', 'Profissional, cordial e objetiva', '', 'anthropic/claude-sonnet', 0.4, ARRAY['k1', 'k4', 'k5'], ARRAY['crm.move_lead', 'calendar.create_event', 'messages.send'], ARRAY['whatsapp'], 'Seg–Sex, 09:00–18:00', 'a_supcom', 't_com', 250.00, 44.00, 'aguardando', ARRAY['crm.view'], 'chart-5', NULL, '{"tasks": 46, "conversations": 38, "responseRate": 0, "conversions": 7}'::jsonb),

('a_supat', 'org_novarota', 'Supervisor Atendimento', 'Supervisor', 'Coordenador de atendimento', 'Garantir SLA de resposta e qualidade do atendimento', 'Profissional, cordial e objetiva', '', 'anthropic/claude-sonnet', 0.4, ARRAY[]::text[], ARRAY['crm.search_contacts', 'crm.assign_lead', 'agents.assign_task'], ARRAY['whatsapp', 'instagram', 'webchat'], 'Todos os dias, 07:00–22:00', NULL, 't_at', 200.00, 21.00, 'trabalhando', ARRAY['crm.view'], 'chart-1', NULL, '{"tasks": 31, "conversations": 0, "responseRate": 0, "conversions": 0}'::jsonb),

('a_at', 'org_novarota', 'Atendimento Geral', 'Atendimento', 'Atendimento ao cliente', 'Responder dúvidas de clientes e leads em até 2 minutos', 'Profissional, cordial e objetiva', '', 'openai/gpt-4o-mini', 0.4, ARRAY['k6', 'k7'], ARRAY['crm.search_contacts', 'messages.search'], ARRAY['whatsapp', 'instagram', 'webchat'], 'Todos os dias, 07:00–22:00', 'a_supat', 't_at', 150.00, 33.70, 'trabalhando', ARRAY['crm.view'], 'chart-2', '4 conversas abertas', '{"tasks": 340, "conversations": 290, "responseRate": 98.2, "conversions": 4}'::jsonb),

('a_fu', 'org_novarota', 'Follow-up', 'Follow-up', 'Follow-up automático', 'Retomar propostas e leads parados há mais de 48 horas', 'Profissional, cordial e objetiva', '', 'openai/gpt-4o-mini', 0.4, ARRAY[]::text[], ARRAY['crm.search_contacts', 'messages.send', 'crm.create_task'], ARRAY['whatsapp'], 'Seg–Sex, 09:00–18:00', NULL, NULL, 150.00, 15.20, 'trabalhando', ARRAY['crm.view'], 'chart-5', '12 tarefas na fila', '{"tasks": 12, "conversations": 66, "responseRate": 28.4, "conversions": 5}'::jsonb);

-- ==========================================================
-- 11. TEAMS
-- ==========================================================

INSERT INTO teams (id, organization_id, name, objective, supervisor_id, agent_ids, goals, schedule, channels, budget, spent, status, metrics) VALUES
('t_com', 'org_novarota', 'Comercial', 'Gerar 40 reuniões qualificadas por mês para venda de sites e tráfego', 'a_supcom', ARRAY['a_sdr1', 'a_sdr2', 'a_qual', 'a_closer'], '40 reuniões · R$ 120 mil em propostas', 'Seg–Sex, 08:00–19:00', ARRAY['whatsapp', 'email'], 900.00, 208.80, 'ativo', '{"leads": 183, "meetings": 27, "conversions": 9}'::jsonb),

('t_at', 'org_novarota', 'Atendimento', 'Responder 100% dos contatos em até 2 minutos com resolução no primeiro contato', 'a_supat', ARRAY['a_at'], 'SLA 2 min · CSAT 4,7', 'Todos os dias, 07:00–22:00', ARRAY['whatsapp', 'instagram', 'webchat', 'email'], 400.00, 82.40, 'ativo', '{"leads": 64, "meetings": 3, "conversions": 4}'::jsonb);

-- ==========================================================
-- 12. HELENA SETTINGS
-- ==========================================================

INSERT INTO helena_settings (organization_id, model, agents_default_model, classifier_model, auto_approve_medium, tone, monthly_budget, alert_at, block_at_limit) VALUES
('org_novarota', 'anthropic/claude-opus', 'openai/gpt-4o-mini', 'google/gemini-flash', true, 'Executiva, objetiva e cordial', 800.00, 80, true);

-- ==========================================================
-- 13. AI PROVIDERS
-- ==========================================================

INSERT INTO ai_providers (id, organization_id, provider_id, name, connected, key_masked, models, monthly_limit, spent) VALUES
('prov_openai', 'org_novarota', 'openai', 'OpenAI', true, 'sk-••••••••3kF9', ARRAY['openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/o4-mini'], 300.00, 0),
('prov_anthropic', 'org_novarota', 'anthropic', 'Anthropic', true, 'sk-ant-••••••••Qp2', ARRAY['anthropic/claude-opus', 'anthropic/claude-sonnet', 'anthropic/claude-haiku'], 400.00, 0),
('prov_google', 'org_novarota', 'google', 'Google', true, 'AIza••••••••x81', ARRAY['google/gemini-pro', 'google/gemini-flash'], 100.00, 0),
('prov_openrouter', 'org_novarota', 'openrouter', 'OpenRouter', false, '', ARRAY['openrouter/auto'], 0, 0);

-- ==========================================================
-- 14. WHATSAPP CONNECTIONS
-- ==========================================================

INSERT INTO whatsapp_connections (id, organization_id, name, phone, type, status, queue, sent_today, daily_limit, last_sync_at) VALUES
('wa1', 'org_novarota', 'WhatsApp Comercial', '+55 11 94000-1200', 'cloud_api', 'online', 14, 86, 1000, NOW() - INTERVAL '1 minute'),
('wa2', 'org_novarota', 'WhatsApp Atendimento', '+55 11 94000-3400', 'qrcode', 'online', 2, 141, 500, NOW() - INTERVAL '2 minutes'),
('wa3', 'org_novarota', 'WhatsApp Suporte', '+55 11 94000-5600', 'qrcode', 'offline', 0, 0, 300, NOW() - INTERVAL '8 days');

-- ==========================================================
-- 15. QUICK REPLIES
-- ==========================================================

INSERT INTO quick_replies (id, organization_id, shortcut, title, text) VALUES
('q1', 'org_novarota', '/prazo', 'Prazo de entrega', 'Nosso prazo para site institucional é de 30 dias após aprovação do layout.'),
('q2', 'org_novarota', '/precos', 'Faixa de preços', 'Sites a partir de R$ 4.900, landing pages a partir de R$ 1.900 e gestão de tráfego a partir de R$ 1.800/mês.'),
('q3', 'org_novarota', '/reuniao', 'Convite para reunião', 'Que tal uma conversa de 20 minutos para eu entender o seu cenário? Tenho horários amanhã às 10h ou 15h.'),
('q4', 'org_novarota', '/cases', 'Enviar cases', 'Separei alguns cases do seu segmento: novarota.com.br/cases'),
('q5', 'org_novarota', '/obrigado', 'Agradecimento', 'Obrigado pelo contato! Qualquer dúvida, é só chamar por aqui.');

-- ==========================================================
-- 16. ORGANIZATION SETTINGS
-- ==========================================================

INSERT INTO organization_settings (organization_id, retention_days, mfa_enabled) VALUES
('org_novarota', 730, false);

-- ==========================================================
-- FIM DO SEED
-- ==========================================================

-- Verificar dados inseridos
SELECT 'Organizations: ' || COUNT(*) FROM organizations;
SELECT 'Users: ' || COUNT(*) FROM users;
SELECT 'Contacts: ' || COUNT(*) FROM contacts;
SELECT 'Companies: ' || COUNT(*) FROM companies;
SELECT 'Deals: ' || COUNT(*) FROM deals;
SELECT 'Agents: ' || COUNT(*) FROM agents;
SELECT 'Teams: ' || COUNT(*) FROM teams;

SELECT '✓ Seed data loaded successfully' AS status;
