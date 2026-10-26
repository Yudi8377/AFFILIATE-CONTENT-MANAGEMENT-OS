-- Affiliate Content Management OS core schema
-- Target: Neon development branch only during initial validation.
-- Access is intentionally fail-closed: RLS is enabled and no API grants/policies are added here.
-- Add narrowly scoped policies only after validating the actual Neon Auth JWT claims and Data API role mapping.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id text PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  preferred_locale text NOT NULL DEFAULT 'id-ID',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  owner_user_id text NOT NULL REFERENCES public.user_profiles(user_id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','editor','analyst','member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.affiliate_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 240),
  source_url text,
  affiliate_url text,
  merchant_name text,
  category text,
  price_amount numeric(14,2) CHECK (price_amount IS NULL OR price_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  commission_rate numeric(7,4) CHECK (commission_rate IS NULL OR commission_rate BETWEEN 0 AND 100),
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_checked_at timestamptz,
  status text NOT NULL DEFAULT 'research' CHECK (status IN ('research','approved','active','paused','archived')),
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seo_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  keyword text NOT NULL CHECK (length(trim(keyword)) BETWEEN 1 AND 500),
  locale text NOT NULL DEFAULT 'id-ID',
  country_code char(2) NOT NULL DEFAULT 'ID',
  cluster_name text,
  parent_topic text,
  search_intent text NOT NULL DEFAULT 'informational' CHECK (search_intent IN ('informational','commercial','transactional','navigational')),
  target_page_type text,
  search_volume integer CHECK (search_volume IS NULL OR search_volume >= 0),
  keyword_difficulty numeric(5,2) CHECK (keyword_difficulty IS NULL OR keyword_difficulty BETWEEN 0 AND 100),
  metrics_source text,
  metrics_checked_at timestamptz,
  notes text,
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,keyword,locale)
);

CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  content_type text NOT NULL DEFAULT 'article' CHECK (content_type IN ('article','product_review','comparison','landing_page','social_post','video_script')),
  locale text NOT NULL DEFAULT 'id-ID',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('idea','brief','draft','review','approved','published','archived')),
  body text NOT NULL DEFAULT '',
  meta_title text,
  meta_description text,
  canonical_url text,
  disclosure_required boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  author_user_id text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,slug)
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  channel text NOT NULL DEFAULT 'other' CHECK (channel IN ('website','youtube','instagram','tiktok','facebook','email','other')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','completed','archived')),
  start_date date,
  end_date date,
  budget_amount numeric(14,2) CHECK (budget_amount IS NULL OR budget_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  notes text,
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.content_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at timestamptz,
  assignee_user_id text REFERENCES public.user_profiles(user_id),
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  asset_type text NOT NULL CHECK (asset_type IN ('image','video','audio','document','other')),
  storage_key text,
  source_url text,
  mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  rights_status text NOT NULL DEFAULT 'unverified' CHECK (rights_status IN ('unverified','owned','licensed','public_domain','restricted')),
  provider_name text,
  provider_status text NOT NULL DEFAULT 'unverified' CHECK (provider_status IN ('unverified','available','unavailable','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  license_code text NOT NULL UNIQUE,
  plan_code text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended','revoked')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_user_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','failure')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  requested_by text NOT NULL REFERENCES public.user_profiles(user_id),
  agent_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','needs_review','succeeded','failed','cancelled')),
  input_schema_version text NOT NULL DEFAULT '1',
  output_schema_version text NOT NULL DEFAULT '1',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  provider_name text,
  provider_status text NOT NULL DEFAULT 'unverified' CHECK (provider_status IN ('unverified','available','unavailable','failed')),
  estimated_cost numeric(12,6) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  actual_cost numeric(12,6) CHECK (actual_cost IS NULL OR actual_cost >= 0),
  failure_reason text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_workspace_status ON public.affiliate_products(workspace_id,status);
CREATE INDEX IF NOT EXISTS idx_keywords_workspace_cluster ON public.seo_keywords(workspace_id,cluster_name);
CREATE INDEX IF NOT EXISTS idx_content_workspace_status_updated ON public.content_items(workspace_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_status ON public.campaigns(workspace_id,status);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_due ON public.content_tasks(workspace_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_audit_workspace_created ON public.audit_events(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_created ON public.agent_runs(workspace_id,created_at DESC);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
