-- Affiliate Content Management OS authorization baseline.
-- Apply only after 0001_core_schema.sql. Uses Neon Data API auth.user_id() and fail-closed RLS.
-- This migration intentionally does not expose license writes, audit writes, or agent-run updates to browser clients.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.workspace_memberships m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = (SELECT auth.user_id())
    AND m.status = 'active'
) $$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.workspace_memberships m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = (SELECT auth.user_id())
    AND m.status = 'active'
    AND m.role = ANY(p_roles)
) $$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ SELECT
  EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = p_workspace_id AND w.owner_user_id = (SELECT auth.user_id()))
  OR public.has_workspace_role(p_workspace_id, ARRAY['owner','admin']::text[])
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_workspace_role(uuid,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace(uuid) TO authenticated;

CREATE POLICY profiles_select_self ON public.user_profiles FOR SELECT TO authenticated USING (user_id = (SELECT auth.user_id()));
CREATE POLICY profiles_insert_self ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.user_id()));
CREATE POLICY profiles_update_self ON public.user_profiles FOR UPDATE TO authenticated USING (user_id = (SELECT auth.user_id())) WITH CHECK (user_id = (SELECT auth.user_id()));

CREATE POLICY workspaces_select_member ON public.workspaces FOR SELECT TO authenticated USING (owner_user_id = (SELECT auth.user_id()) OR public.is_workspace_member(id));
CREATE POLICY workspaces_insert_owner ON public.workspaces FOR INSERT TO authenticated WITH CHECK (owner_user_id = (SELECT auth.user_id()));
CREATE POLICY workspaces_update_owner_admin ON public.workspaces FOR UPDATE TO authenticated USING (public.can_manage_workspace(id)) WITH CHECK (public.can_manage_workspace(id));
CREATE POLICY workspaces_delete_owner ON public.workspaces FOR DELETE TO authenticated USING (owner_user_id = (SELECT auth.user_id()));

CREATE POLICY memberships_select_scoped ON public.workspace_memberships FOR SELECT TO authenticated USING (user_id = (SELECT auth.user_id()) OR public.can_manage_workspace(workspace_id));
CREATE POLICY memberships_insert_admin ON public.workspace_memberships FOR INSERT TO authenticated WITH CHECK (public.can_manage_workspace(workspace_id));
CREATE POLICY memberships_update_admin ON public.workspace_memberships FOR UPDATE TO authenticated USING (public.can_manage_workspace(workspace_id)) WITH CHECK (public.can_manage_workspace(workspace_id));
CREATE POLICY memberships_delete_admin ON public.workspace_memberships FOR DELETE TO authenticated USING (public.can_manage_workspace(workspace_id));

CREATE POLICY products_select_member ON public.affiliate_products FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY products_insert_editor ON public.affiliate_products FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY products_update_editor ON public.affiliate_products FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY products_delete_admin ON public.affiliate_products FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY keywords_select_member ON public.seo_keywords FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY keywords_insert_editor ON public.seo_keywords FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY keywords_update_editor ON public.seo_keywords FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY keywords_delete_admin ON public.seo_keywords FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY content_select_member ON public.content_items FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY content_insert_editor ON public.content_items FOR INSERT TO authenticated WITH CHECK (author_user_id = (SELECT auth.user_id()) AND status IN ('idea','brief','draft') AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY content_update_editor ON public.content_items FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]) OR status IN ('idea','brief','draft','review'));
CREATE POLICY content_delete_admin ON public.content_items FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY campaigns_select_member ON public.campaigns FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY campaigns_insert_editor ON public.campaigns FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY campaigns_update_editor ON public.campaigns FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY campaigns_delete_admin ON public.campaigns FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY tasks_select_member ON public.content_tasks FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY tasks_insert_editor ON public.content_tasks FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY tasks_update_editor ON public.content_tasks FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY tasks_delete_admin ON public.content_tasks FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY media_select_member ON public.media_assets FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY media_insert_editor ON public.media_assets FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.user_id()) AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY media_update_editor ON public.media_assets FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
CREATE POLICY media_delete_admin ON public.media_assets FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY licenses_select_admin ON public.license_entitlements FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));
CREATE POLICY audit_select_admin ON public.audit_events FOR SELECT TO authenticated USING (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));

CREATE POLICY agent_runs_select_scoped ON public.agent_runs FOR SELECT TO authenticated USING (requested_by = (SELECT auth.user_id()) OR public.has_workspace_role(workspace_id, ARRAY['owner','admin']::text[]));
CREATE POLICY agent_runs_insert_editor ON public.agent_runs FOR INSERT TO authenticated WITH CHECK (requested_by = (SELECT auth.user_id()) AND status = 'queued' AND output IS NULL AND actual_cost IS NULL AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::text[]));
