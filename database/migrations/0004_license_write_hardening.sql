-- Security hardening: only platform administrators may mutate license entitlements.
-- Workspace owners/admins may read their own entitlements, but cannot grant themselves plans.

DROP POLICY IF EXISTS licenses_insert_admin ON public.license_entitlements;
DROP POLICY IF EXISTS licenses_update_admin ON public.license_entitlements;
DROP POLICY IF EXISTS licenses_delete_admin ON public.license_entitlements;

NOTIFY pgrst, 'reload schema';
