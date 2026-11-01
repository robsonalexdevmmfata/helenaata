-- =============================================================================
-- HELENA AI — schema limpo para o SQL Editor do Supabase
-- Ordem: tabelas primeiro, função de org depois (senão quebra em public.profiles).
-- Pode rodar de novo: apaga a função quebrada e recria políticas.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

DROP FUNCTION IF EXISTS public.helena_current_org_id() CASCADE;

CREATE OR REPLACE FUNCTION public.helena_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Contas
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  kind text NOT NULL DEFAULT 'customer' CHECK (kind IN ('platform', 'customer')),
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'impulso', 'maquina', 'whitelabel')),
  trial_ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  document text,
  daily_prospect_limit int NOT NULL DEFAULT 30,
  hourly_wa_limit int NOT NULL DEFAULT 20,
  min_wa_gap_seconds int NOT NULL DEFAULT 35,
  autonomy_level int NOT NULL DEFAULT 2 CHECK (autonomy_level BETWEEN 1 AND 4),
  kill_switch boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer')),
  company_name text,
  phone text,
  evolution_instance text,
  onboarding_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS public.usage_daily (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT CURRENT_DATE,
  prospects int NOT NULL DEFAULT 0,
  wa_sends int NOT NULL DEFAULT 0,
  ai_tokens int NOT NULL DEFAULT 0,
  ai_cost_cents int NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, day)
);

-- Só agora a função pode ler profiles
CREATE OR REPLACE FUNCTION public.helena_current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. CRM + diagnóstico
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  segment text,
  city text,
  state text,
  website text,
  google_place_id text,
  rating numeric(2,1),
  reviews_count int,
  photos_count int,
  has_own_site boolean,
  site_looks_outdated boolean,
  has_digital_menu boolean,
  has_whatsapp_ai boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'cliente', 'inativo')),
  source text NOT NULL DEFAULT 'Prospecção',
  tags text[] NOT NULL DEFAULT '{}',
  consent boolean NOT NULL DEFAULT false,
  opted_out boolean NOT NULL DEFAULT false,
  score int NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  opportunity text NOT NULL DEFAULT 'media' CHECK (opportunity IN ('baixa', 'media', 'alta')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_contact_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  opportunity text NOT NULL CHECK (opportunity IN ('baixa', 'media', 'alta')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommend_offer text,
  recommend_pitch text,
  competitor_notes text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id)
);

CREATE TABLE IF NOT EXISTS public.commercial_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'pedido_retorno', 'preco_alto', 'interesse_site', 'pediu_proposta',
    'sem_resposta', 'contratou', 'opt_out', 'objecao', 'compromisso', 'nota'
  )),
  fact text NOT NULL,
  due_at timestamptz,
  source_message_id uuid,
  created_by text NOT NULL DEFAULT 'Helena',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. WhatsApp + RPA
CREATE TABLE IF NOT EXISTS public.wa_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  display_name text,
  phone text,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'conectando')),
  daily_limit int NOT NULL DEFAULT 30,
  sent_today int NOT NULL DEFAULT 0,
  last_sync_at timestamptz,
  UNIQUE (organization_id, instance_name)
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.wa_connections(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  remote_jid text,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'pendente', 'resolvida')),
  handler_type text NOT NULL DEFAULT 'helena' CHECK (handler_type IN ('human', 'agent', 'helena')),
  flow_state text,
  last_outbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  author text,
  body text NOT NULL,
  wa_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rpa_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'scan_maps', 'diagnose', 'send_wa', 'book_meeting', 'build_preview',
    'send_proposal', 'charge', 'followup'
  )),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'sent', 'failed', 'skipped', 'awaiting_approval'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  run_at timestamptz NOT NULL DEFAULT now(),
  helena_run_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dev_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'briefing' CHECK (status IN (
    'briefing', 'design', 'frontend', 'backend', 'qa', 'seo', 'preview', 'published', 'blocked'
  )),
  preview_url text,
  repo_url text,
  offer text,
  requires_maquina boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  title text NOT NULL,
  scope text,
  amount_cents int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'vista', 'aceita', 'recusada')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'novo' CHECK (stage IN (
    'novo', 'qualificado', 'abordado', 'preview', 'negociacao', 'proposta', 'cobranca', 'ganho', 'perdido'
  )),
  value_cents int NOT NULL DEFAULT 0,
  won_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  amount_cents int NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'atrasada', 'cancelada')),
  due_at date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('helena', 'agent', 'user', 'sistema')),
  action text NOT NULL,
  description text,
  result text NOT NULL CHECK (result IN ('sucesso', 'falha', 'pendente')),
  params jsonb,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  tool text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('baixo', 'medio', 'alto')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'negada')),
  requested_by text NOT NULL DEFAULT 'Helena',
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sensitive_actions (
  action text PRIMARY KEY,
  min_autonomy int NOT NULL DEFAULT 4,
  label text NOT NULL
);

INSERT INTO public.sensitive_actions (action, min_autonomy, label) VALUES
  ('sales.generate_checkout_pix', 4, 'Cobrar cliente'),
  ('proposals.send', 3, 'Enviar proposta'),
  ('dev.publish', 4, 'Publicar site'),
  ('lgpd.erase_contact', 4, 'Apagar dados de titular'),
  ('rpa.mass_send', 3, 'Disparo em massa')
ON CONFLICT (action) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lgpd_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('exportacao', 'anonimizacao', 'exclusao')),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.lgpd_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_name text NOT NULL,
  action text NOT NULL DEFAULT 'view',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON public.contacts (organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts (organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_memory_contact ON public.commercial_memory (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpa_run ON public.rpa_jobs (organization_id, status, run_at);
CREATE INDEX IF NOT EXISTS idx_exec_org ON public.executions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_companies_name ON public.companies USING gin (name gin_trgm_ops);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','profiles','companies','contacts','dev_jobs','deals']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE PROCEDURE public.helena_touch_updated_at()',
      t, t
    );
  END LOOP;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rpa_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_select_own ON public.organizations;
CREATE POLICY org_select_own ON public.organizations
  FOR SELECT USING (id = public.helena_current_org_id());

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (organization_id = public.helena_current_org_id());

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE USING (id = auth.uid());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usage_daily','companies','contacts','lead_diagnoses','commercial_memory',
    'wa_connections','conversations','messages','rpa_jobs','dev_jobs',
    'proposals','deals','invoices','executions','approvals',
    'lgpd_requests','lgpd_access_log'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant ON public.%I
         FOR ALL USING (organization_id = public.helena_current_org_id())
         WITH CHECK (organization_id = public.helena_current_org_id())',
      t, t
    );
  END LOOP;
END $$;
