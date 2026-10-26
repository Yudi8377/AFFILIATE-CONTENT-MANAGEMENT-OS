-- Platform administration policies. No user can bootstrap or promote themselves through the public API.
-- The first platform administrator must be provisioned by a trusted database administrator.

CREATE POLICY platform_admins_select_admins ON public.platform_admins
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY platform_admins_insert_admins ON public.platform_admins
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY platform_admins_update_admins ON public.platform_admins
  FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY platform_admins_delete_admins ON public.platform_admins
  FOR DELETE TO authenticated USING (public.is_platform_admin());

CREATE POLICY profiles_select_platform_admin ON public.user_profiles
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY workspaces_select_platform_admin ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY memberships_select_platform_admin ON public.workspace_memberships
  FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE POLICY provider_registry_insert_platform_admin ON public.provider_registry
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY provider_registry_update_platform_admin ON public.provider_registry
  FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY provider_registry_delete_platform_admin ON public.provider_registry
  FOR DELETE TO authenticated USING (public.is_platform_admin());

CREATE POLICY agent_registry_insert_platform_admin ON public.agent_registry
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY agent_registry_update_platform_admin ON public.agent_registry
  FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY agent_registry_delete_platform_admin ON public.agent_registry
  FOR DELETE TO authenticated USING (public.is_platform_admin());

CREATE POLICY audit_select_platform_admin ON public.audit_events
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY agent_runs_select_platform_admin ON public.agent_runs
  FOR SELECT TO authenticated USING (public.is_platform_admin());
