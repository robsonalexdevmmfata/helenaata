-- Persist application workspaces in Supabase instead of browser localStorage.
-- Run after supabase-helena-rpa.sql, database/002_helena10_app_ids.sql,
-- and database/003_rpa_center.sql.

ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS org_slug text;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 3;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS duration_ms int;

CREATE TABLE IF NOT EXISTS public.app_accounts (
  app_user_id text PRIMARY KEY,
  app_organization_id text NOT NULL UNIQUE,
  username text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  profile jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_accounts_username_ci
  ON public.app_accounts (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS app_accounts_email_ci
  ON public.app_accounts (lower(email));

CREATE TABLE IF NOT EXISTS public.workspace_snapshots (
  app_organization_id text PRIMARY KEY,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_snapshots_updated_at_idx
  ON public.workspace_snapshots (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.app_previews (
  slug text PRIMARY KEY,
  app_organization_id text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_previews_organization_idx
  ON public.app_previews (app_organization_id);

CREATE TABLE IF NOT EXISTS public.app_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  plan_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  event text NOT NULL DEFAULT '',
  amount numeric,
  paid boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_billing_events_source_id_idx
  ON public.app_billing_events (source_id)
  WHERE source_id <> '';

CREATE INDEX IF NOT EXISTS app_billing_events_email_paid_at_idx
  ON public.app_billing_events (lower(email), paid, occurred_at DESC);

ALTER TABLE public.app_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_billing_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_accounts FROM anon, authenticated;
REVOKE ALL ON public.workspace_snapshots FROM anon, authenticated;
REVOKE ALL ON public.app_previews FROM anon, authenticated;
REVOKE ALL ON public.app_billing_events FROM anon, authenticated;
GRANT ALL ON public.app_accounts TO service_role;
GRANT ALL ON public.workspace_snapshots TO service_role;
GRANT ALL ON public.app_previews TO service_role;
GRANT ALL ON public.app_billing_events TO service_role;
