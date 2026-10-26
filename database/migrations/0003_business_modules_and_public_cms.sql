-- Core business modules and public publishing permissions.
-- Apply after 0001_core_schema.sql and 0002_rls_policies.sql.
-- Sensitive accounting, payroll, license, and platform-admin writes remain restricted.

ALTER TABLE public.workspace_memberships DROP CONSTRAINT IF EXISTS workspace_memberships_role_check;
ALTER TABLE public.workspace_memberships ADD CONSTRAINT workspace_memberships_role_check
  CHECK (role IN ('owner','admin','editor','analyst','member','crm_manager','finance_manager','hr_manager','inventory_manager','content_manager'));

ALTER TABLE public.affiliate_products
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_public_slug ON public.affiliate_products(public_slug) WHERE public_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  granted_by text,
  reason text NOT NULL DEFAULT '',
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_registry (
  provider_key text PRIMARY KEY,
  provider_type text NOT NULL CHECK (provider_type IN ('local','neon_native','external')),
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','available','unavailable','disabled')),
  free_tier_verified boolean NOT NULL DEFAULT false,
  commercial_rights_verified boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.provider_registry(provider_key,provider_type,status,free_tier_verified,commercial_rights_verified,notes,last_checked_at)
VALUES ('manual-template','local','available',true,true,'Local template-based workflow; no external model API and no provider usage charge.',now())
ON CONFLICT (provider_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agent_registry (
  agent_key text PRIMARY KEY,
  display_name text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','rule_based','tested','active','disabled')),
  version text NOT NULL DEFAULT '1.0.0',
  input_schema_version text NOT NULL DEFAULT '1',
  output_schema_version text NOT NULL DEFAULT '1',
  requires_external_model boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.agent_registry(agent_key,display_name,purpose,status,requires_external_model) VALUES
 ('intake-brief','Intake and Brief Agent','Normalize product and campaign briefs into structured fields.','planned',false),
 ('product-facts','Product Fact Agent','Track product claims and their source provenance.','planned',false),
 ('keyword-cluster','Keyword Cluster Agent','Group imported keywords by semantic/topic labels without inventing metrics.','rule_based',false),
 ('search-intent','Search Intent Agent','Classify search intent from supplied keyword and context.','rule_based',false),
 ('seo-planner','SEO Planner Agent','Generate structured page briefs, title and meta-description drafts from user inputs.','rule_based',false),
 ('editorial-qa','Editorial QA Agent','Check required metadata, disclosure, and unsupported metric fields.','planned',false),
 ('affiliate-compliance','Affiliate Compliance Agent','Flag missing affiliate disclosures and unsupported product claims.','planned',false),
 ('campaign-planner','Campaign Planner Agent','Draft campaign objectives, audience, channels and KPIs.','planned',false),
 ('storyboard-planner','Storyboard Planner Agent','Create scene-by-scene video plans from verified product facts.','planned',false),
 ('provider-cost-gate','Provider and Cost Gate','Block unverified providers and report known costs/quotas.','planned',false),
 ('analytics-summary','Analytics Summary Agent','Summarize observed/imported metrics without presenting estimates as facts.','planned',false),
 ('human-review','Human Review Coordinator','Route sensitive changes and public publication through explicit approval.','planned',false)
ON CONFLICT (agent_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_type text NOT NULL DEFAULT 'lead' CHECK (contact_type IN ('lead','customer','partner','publisher','merchant')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  email text,
  phone text,
  company text,
  source text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','active','inactive','archived')),
  assigned_user_id text REFERENCES public.user_profiles(user_id),
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id)
);

CREATE TABLE IF NOT EXISTS public.crm_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  interaction_type text NOT NULL CHECK (interaction_type IN ('call','email','meeting','message','note','follow_up')),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 200),
  summary text NOT NULL DEFAULT '',
  next_action_at timestamptz,
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,contact_id) REFERENCES public.crm_contacts(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_code text NOT NULL CHECK (length(trim(account_code)) BETWEEN 1 AND 30),
  account_name text NOT NULL CHECK (length(trim(account_name)) BETWEEN 1 AND 160),
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,account_code),
  UNIQUE (workspace_id,id)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entry_number text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','posted','void')),
  source_type text,
  source_id text,
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  posted_by text REFERENCES public.user_profiles(user_id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,entry_number),
  UNIQUE (workspace_id,id)
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  account_id uuid NOT NULL,
  description text NOT NULL DEFAULT '',
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  FOREIGN KEY (workspace_id,journal_entry_id) REFERENCES public.journal_entries(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,account_id) REFERENCES public.ledger_accounts(workspace_id,id)
);

CREATE OR REPLACE FUNCTION public.validate_journal_entry_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE total_debits numeric(14,2); total_credits numeric(14,2);
BEGIN
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
      INTO total_debits,total_credits
      FROM public.journal_lines
      WHERE workspace_id = NEW.workspace_id AND journal_entry_id = NEW.id;
    IF total_debits <= 0 OR total_debits <> total_credits THEN
      RAISE EXCEPTION 'Journal entry cannot be posted: debits and credits must be equal and greater than zero';
    END IF;
    NEW.posted_at := COALESCE(NEW.posted_at,now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_journal_entry_balance ON public.journal_entries;
CREATE TRIGGER trg_validate_journal_entry_balance
BEFORE INSERT OR UPDATE OF status ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_journal_entry_balance();

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  vendor_name text NOT NULL CHECK (length(trim(vendor_name)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  category text NOT NULL DEFAULT 'other',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  incurred_on date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','paid')),
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  approved_by text REFERENCES public.user_profiles(user_id),
  receipt_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  employee_code text NOT NULL,
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 200),
  email text,
  department text,
  employment_type text NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract','intern','freelance')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','terminated')),
  start_date date,
  end_date date,
  manager_id uuid,
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,employee_code),
  UNIQUE (workspace_id,id),
  FOREIGN KEY (workspace_id,manager_id) REFERENCES public.employees(workspace_id,id),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','paid','cancelled')),
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  approved_by text REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,period_start,period_end),
  UNIQUE (workspace_id,id),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  base_salary numeric(14,2) NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  allowances numeric(14,2) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  deductions numeric(14,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  net_pay numeric(14,2) GENERATED ALWAYS AS (base_salary + allowances - deductions - tax_amount) STORED,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,payroll_period_id,employee_id),
  FOREIGN KEY (workspace_id,payroll_period_id) REFERENCES public.payroll_periods(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,employee_id) REFERENCES public.employees(workspace_id,id),
  CHECK (base_salary + allowances >= deductions + tax_amount)
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  unit text NOT NULL DEFAULT 'unit',
  quantity_on_hand numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  unit_cost numeric(14,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,sku),
  UNIQUE (workspace_id,id)
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  vendor_name text NOT NULL CHECK (length(trim(vendor_name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','received','cancelled')),
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL REFERENCES public.user_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,order_number),
  UNIQUE (workspace_id,id),
  CHECK (expected_date IS NULL OR expected_date >= order_date)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(16,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  FOREIGN KEY (workspace_id,purchase_order_id) REFERENCES public.purchase_orders(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,inventory_item_id) REFERENCES public.inventory_items(workspace_id,id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_workspace_status ON public.crm_contacts(workspace_id,status);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_contact_created ON public.crm_interactions(workspace_id,contact_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace_date ON public.journal_entries(workspace_id,entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_workspace_status_date ON public.expenses(workspace_id,status,incurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_employees_workspace_status ON public.employees(workspace_id,status);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_workspace_dates ON public.payroll_periods(workspace_id,period_start DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_workspace_status ON public.inventory_items(workspace_id,status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_workspace_status ON public.purchase_orders(workspace_id,status);

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins p WHERE p.user_id = (SELECT auth.user_id()) AND p.status = 'active')
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.platform_admins, public.provider_registry, public.agent_registry,
  public.crm_contacts, public.crm_interactions, public.ledger_accounts,
  public.journal_entries, public.journal_lines, public.expenses,
  public.employees, public.payroll_periods, public.payroll_items,
  public.inventory_items, public.purchase_orders, public.purchase_order_items
TO authenticated;
GRANT SELECT ON TABLE public.content_items, public.affiliate_products TO anonymous;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_admins_select_self ON public.platform_admins FOR SELECT TO authenticated USING (user_id = (SELECT auth.user_id()));
CREATE POLICY provider_registry_select_authenticated ON public.provider_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY agent_registry_select_authenticated ON public.agent_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY platform_admin_license_select ON public.license_entitlements FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY platform_admin_license_insert ON public.license_entitlements FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY platform_admin_license_update ON public.license_entitlements FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY platform_admin_license_delete ON public.license_entitlements FOR DELETE TO authenticated USING (public.is_platform_admin());

CREATE POLICY public_products_read ON public.affiliate_products FOR SELECT TO anonymous USING (is_public = true AND status = 'active' AND public_slug IS NOT NULL);
CREATE POLICY public_content_read ON public.content_items FOR SELECT TO anonymous USING (status = 'published' AND published_at IS NOT NULL);

CREATE POLICY crm_contacts_select ON public.crm_contacts FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY crm_contacts_insert ON public.crm_contacts FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','crm_manager']::text[]));
CREATE POLICY crm_contacts_update ON public.crm_contacts FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','crm_manager']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','crm_manager']::text[]));
CREATE POLICY crm_contacts_delete ON public.crm_contacts FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','crm_manager']::text[]));
CREATE POLICY crm_interactions_select ON public.crm_interactions FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY crm_interactions_insert ON public.crm_interactions FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','crm_manager']::text[]));
CREATE POLICY crm_interactions_update ON public.crm_interactions FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','crm_manager']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','crm_manager']::text[]));
CREATE POLICY crm_interactions_delete ON public.crm_interactions FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','crm_manager']::text[]));

CREATE POLICY ledger_accounts_select_finance ON public.ledger_accounts FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY ledger_accounts_insert_finance ON public.ledger_accounts FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY ledger_accounts_update_finance ON public.ledger_accounts FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY ledger_accounts_delete_finance ON public.ledger_accounts FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY journal_entries_select_finance ON public.journal_entries FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY journal_entries_insert_draft ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND status = 'draft' AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY journal_entries_update_draft ON public.journal_entries FOR UPDATE TO authenticated USING (status IN ('draft','review') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[])) WITH CHECK (status IN ('draft','review') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY journal_entries_delete_draft ON public.journal_entries FOR DELETE TO authenticated USING (status = 'draft' AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));

CREATE POLICY journal_lines_select_finance ON public.journal_lines FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY journal_lines_insert_draft ON public.journal_lines FOR INSERT TO authenticated WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = journal_entry_id AND e.workspace_id = workspace_id AND e.status = 'draft')
);
CREATE POLICY journal_lines_update_draft ON public.journal_lines FOR UPDATE TO authenticated USING (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = journal_entry_id AND e.workspace_id = workspace_id AND e.status = 'draft')
) WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = journal_entry_id AND e.workspace_id = workspace_id AND e.status = 'draft')
);
CREATE POLICY journal_lines_delete_draft ON public.journal_lines FOR DELETE TO authenticated USING (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = journal_entry_id AND e.workspace_id = workspace_id AND e.status = 'draft')
);

CREATE POLICY expenses_select_finance ON public.expenses FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY expenses_insert_draft ON public.expenses FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND status IN ('draft','submitted') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY expenses_update_draft ON public.expenses FOR UPDATE TO authenticated USING (status IN ('draft','submitted') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[])) WITH CHECK (status IN ('draft','submitted') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));
CREATE POLICY expenses_delete_draft ON public.expenses FOR DELETE TO authenticated USING (status = 'draft' AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','finance_manager']::text[]));

CREATE POLICY employees_select_hr ON public.employees FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[]));
CREATE POLICY employees_insert_hr ON public.employees FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[]));
CREATE POLICY employees_update_hr ON public.employees FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[]));
CREATE POLICY employees_delete_hr ON public.employees FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY payroll_periods_select_hr ON public.payroll_periods FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[]));
CREATE POLICY payroll_periods_insert_draft ON public.payroll_periods FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND status = 'draft' AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[]));
CREATE POLICY payroll_periods_update_draft ON public.payroll_periods FOR UPDATE TO authenticated USING (status IN ('draft','review') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[])) WITH CHECK (status IN ('draft','review') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[]));
CREATE POLICY payroll_periods_delete_draft ON public.payroll_periods FOR DELETE TO authenticated USING (status = 'draft' AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[]));

CREATE POLICY payroll_items_select_hr ON public.payroll_items FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[]));
CREATE POLICY payroll_items_insert_draft ON public.payroll_items FOR INSERT TO authenticated WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.payroll_periods p WHERE p.id = payroll_period_id AND p.workspace_id = workspace_id AND p.status = 'draft')
);
CREATE POLICY payroll_items_update_draft ON public.payroll_items FOR UPDATE TO authenticated USING (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.payroll_periods p WHERE p.id = payroll_period_id AND p.workspace_id = workspace_id AND p.status = 'draft')
) WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.payroll_periods p WHERE p.id = payroll_period_id AND p.workspace_id = workspace_id AND p.status = 'draft')
);
CREATE POLICY payroll_items_delete_draft ON public.payroll_items FOR DELETE TO authenticated USING (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','hr_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.payroll_periods p WHERE p.id = payroll_period_id AND p.workspace_id = workspace_id AND p.status = 'draft')
);

CREATE POLICY inventory_select_member ON public.inventory_items FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY inventory_insert_manager ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','inventory_manager']::text[]));
CREATE POLICY inventory_update_manager ON public.inventory_items FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','inventory_manager']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','inventory_manager']::text[]));
CREATE POLICY inventory_delete_manager ON public.inventory_items FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','inventory_manager']::text[]));

CREATE POLICY purchase_orders_select_manager ON public.purchase_orders FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','inventory_manager']::text[]));
CREATE POLICY purchase_orders_insert_draft ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND status = 'draft' AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','inventory_manager']::text[]));
CREATE POLICY purchase_orders_update_draft ON public.purchase_orders FOR UPDATE TO authenticated USING (status IN ('draft','submitted') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','inventory_manager']::text[])) WITH CHECK (status IN ('draft','submitted') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','inventory_manager']::text[]));
CREATE POLICY purchase_orders_delete_draft ON public.purchase_orders FOR DELETE TO authenticated USING (status = 'draft' AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','inventory_manager']::text[]));

CREATE POLICY purchase_order_items_select_manager ON public.purchase_order_items FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','inventory_manager']::text[]));
CREATE POLICY purchase_order_items_insert_draft ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor','inventory_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_id AND p.workspace_id = workspace_id AND p.status = 'draft')
);
CREATE POLICY purchase_order_items_update_draft ON public.purchase_order_items FOR UPDATE TO authenticated USING (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','inventory_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_id AND p.workspace_id = workspace_id AND p.status = 'draft')
) WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','inventory_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_id AND p.workspace_id = workspace_id AND p.status = 'draft')
);
CREATE POLICY purchase_order_items_delete_draft ON public.purchase_order_items FOR DELETE TO authenticated USING (
  public.has_workspace_role(workspace_id, ARRAY['owner','admin','inventory_manager']::text[])
  AND EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_id AND p.workspace_id = workspace_id AND p.status = 'draft')
);

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE target_workspace uuid; target_id text; operation text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_workspace := OLD.workspace_id;
    target_id := OLD.id::text;
  ELSE
    target_workspace := NEW.workspace_id;
    target_id := NEW.id::text;
  END IF;
  operation := lower(TG_OP);
  INSERT INTO public.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,outcome,details)
  VALUES (target_workspace,(SELECT auth.user_id()),operation,TG_TABLE_NAME,target_id,'success',jsonb_build_object('source','database_trigger'));
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

REVOKE ALL ON FUNCTION public.validate_journal_entry_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_audit_products ON public.affiliate_products;
CREATE TRIGGER trg_audit_products AFTER INSERT OR UPDATE OR DELETE ON public.affiliate_products FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_keywords ON public.seo_keywords;
CREATE TRIGGER trg_audit_keywords AFTER INSERT OR UPDATE OR DELETE ON public.seo_keywords FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_content ON public.content_items;
CREATE TRIGGER trg_audit_content AFTER INSERT OR UPDATE OR DELETE ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_campaigns ON public.campaigns;
CREATE TRIGGER trg_audit_campaigns AFTER INSERT OR UPDATE OR DELETE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_tasks ON public.content_tasks;
CREATE TRIGGER trg_audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.content_tasks FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_crm_contacts ON public.crm_contacts;
CREATE TRIGGER trg_audit_crm_contacts AFTER INSERT OR UPDATE OR DELETE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_crm_interactions ON public.crm_interactions;
CREATE TRIGGER trg_audit_crm_interactions AFTER INSERT OR UPDATE OR DELETE ON public.crm_interactions FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_expenses ON public.expenses;
CREATE TRIGGER trg_audit_expenses AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_inventory ON public.inventory_items;
CREATE TRIGGER trg_audit_inventory AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_purchase_orders ON public.purchase_orders;
CREATE TRIGGER trg_audit_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
