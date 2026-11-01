-- Central RPA: tentativas, idempotência, radar programado, proposta versionada.
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 3;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS duration_ms int;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS contact_app_id text;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS app_id text;
CREATE UNIQUE INDEX IF NOT EXISTS rpa_jobs_idempotency
  ON public.rpa_jobs (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.rpa_jobs DROP CONSTRAINT IF EXISTS rpa_jobs_kind_check;
ALTER TABLE public.rpa_jobs ADD CONSTRAINT rpa_jobs_kind_check CHECK (kind IN (
  'scan_maps', 'diagnose', 'send_wa', 'book_meeting', 'build_preview',
  'send_proposal', 'charge', 'followup', 'daily_report'
));

CREATE TABLE IF NOT EXISTS public.radar_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id text,
  segment text NOT NULL,
  city text NOT NULL,
  hour int NOT NULL DEFAULT 9 CHECK (hour BETWEEN 0 AND 23),
  limit_leads int NOT NULL DEFAULT 8,
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, app_id)
);

ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS app_id text;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS offer text;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS benefits text;
CREATE UNIQUE INDEX IF NOT EXISTS proposals_org_app_id ON public.proposals (organization_id, app_id) WHERE app_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day date NOT NULL,
  body text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, day)
);

ALTER TABLE public.radar_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
