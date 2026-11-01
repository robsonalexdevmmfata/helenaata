-- Follow-up do cardápio online: estado, leitura, aprovação e envio.
-- Requer database/supabase-helena-rpa.sql e database/004_intelligence_3.sql.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS closer_attempts smallint NOT NULL DEFAULT 0;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE TABLE IF NOT EXISTS public.sales_followup_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  no_reply_hours smallint NOT NULL DEFAULT 24 CHECK (no_reply_hours BETWEEN 1 AND 720),
  read_no_reply_hours smallint NOT NULL DEFAULT 24 CHECK (read_no_reply_hours BETWEEN 1 AND 720),
  approval_required boolean NOT NULL DEFAULT true,
  max_attempts smallint NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  approval_id uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  last_outbound_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN ('sem_resposta', 'visualizou_sem_responder')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'awaiting_approval', 'approved', 'sent', 'rejected', 'cancelled', 'failed'
  )),
  due_at timestamptz NOT NULL,
  message_text text NOT NULL,
  offer_app_id text NOT NULL DEFAULT 'svc_menu_online',
  offer_price numeric(10,2) NOT NULL DEFAULT 100 CHECK (offer_price >= 0),
  sent_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS sales_followups_due_idx
  ON public.sales_followups (organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS sales_followups_conversation_idx
  ON public.sales_followups (organization_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_delivery_read_idx
  ON public.messages (organization_id, conversation_id, delivery_status, read_at);

INSERT INTO public.sales_followup_settings (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.service_offers (
  organization_id, app_id, category, name, description, price, billing, active, pitch
)
SELECT
  id,
  'svc_menu_online',
  'Presença Digital & Web',
  'Cardápio Online',
  'Cardápio digital responsivo com link para compartilhar com os clientes do estabelecimento.',
  100,
  'mensal',
  true,
  'Um cardápio online simples de compartilhar com seus clientes por R$ 100/mês.'
FROM public.organizations
WHERE kind = 'platform'
ON CONFLICT (organization_id, app_id) WHERE app_id IS NOT NULL
DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  billing = EXCLUDED.billing,
  active = EXCLUDED.active,
  pitch = EXCLUDED.pitch,
  updated_at = now();

ALTER TABLE public.sales_followup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_followup_settings_tenant ON public.sales_followup_settings;
CREATE POLICY sales_followup_settings_tenant ON public.sales_followup_settings
  FOR ALL USING (organization_id = public.helena_current_org_id())
  WITH CHECK (organization_id = public.helena_current_org_id());

DROP POLICY IF EXISTS sales_followups_tenant ON public.sales_followups;
CREATE POLICY sales_followups_tenant ON public.sales_followups
  FOR ALL USING (organization_id = public.helena_current_org_id())
  WITH CHECK (organization_id = public.helena_current_org_id());
