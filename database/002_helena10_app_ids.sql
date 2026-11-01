-- Helena 1.0: contas do app (u_xxx) sem obrigar auth.users do Supabase.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS app_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_app_user_id_key ON public.profiles (app_user_id) WHERE app_user_id IS NOT NULL;

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS app_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_app_slug_key ON public.organizations (app_slug) WHERE app_slug IS NOT NULL;

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS app_id text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS cycle_state text NOT NULL DEFAULT 'novo';
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_app_id ON public.contacts (organization_id, app_id) WHERE app_id IS NOT NULL;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS app_id text;
CREATE UNIQUE INDEX IF NOT EXISTS companies_org_app_id ON public.companies (organization_id, app_id) WHERE app_id IS NOT NULL;

ALTER TABLE public.executions ADD COLUMN IF NOT EXISTS app_id text;
CREATE UNIQUE INDEX IF NOT EXISTS executions_org_app_id ON public.executions (organization_id, app_id) WHERE app_id IS NOT NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS app_id text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS app_id text;
ALTER TABLE public.rpa_jobs ADD COLUMN IF NOT EXISTS org_slug text;
