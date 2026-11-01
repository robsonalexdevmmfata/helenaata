-- Helena Intelligence 3.0 — dossiê, decisões, economia do catálogo.
-- Isolamento por organization_id. Rodar no Supabase da operação (não Lovable Cloud).

CREATE TABLE IF NOT EXISTS public.service_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id text,
  category text NOT NULL DEFAULT '',
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  price_note text NOT NULL DEFAULT '',
  setup_fee numeric NOT NULL DEFAULT 0,
  billing text NOT NULL DEFAULT 'unico',
  active boolean NOT NULL DEFAULT true,
  pitch text NOT NULL DEFAULT '',
  cost_amount numeric,
  hours_estimate numeric,
  desired_margin_pct numeric,
  monthly_capacity int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_offers_org_app ON public.service_offers (organization_id, app_id) WHERE app_id IS NOT NULL;

ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS cost_amount numeric;
ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS hours_estimate numeric;
ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS desired_margin_pct numeric;
ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS monthly_capacity int;

CREATE TABLE IF NOT EXISTS public.commercial_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id text,
  contact_app_id text,
  company_app_id text,
  niche_play text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  contradictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence jsonb,
  matched_offers jsonb NOT NULL DEFAULT '[]'::jsonb,
  temperature jsonb,
  risk jsonb,
  next_action jsonb,
  intent text,
  offer text,
  approach text,
  roi jsonb,
  preview_app_id text,
  proposal_app_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_dossiers_org_app ON public.commercial_dossiers (organization_id, app_id) WHERE app_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commercial_dossiers_org_contact ON public.commercial_dossiers (organization_id, contact_app_id);

CREATE TABLE IF NOT EXISTS public.commercial_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id text,
  contact_app_id text NOT NULL,
  action_id text NOT NULL,
  label text NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'recomendada',
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS commercial_decisions_org_contact ON public.commercial_decisions (organization_id, contact_app_id, created_at DESC);

ALTER TABLE public.commercial_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_offers ENABLE ROW LEVEL SECURITY;

-- Políticas: o backend da Info Tech injeta organization_id. Sem política aberta ao anon.
