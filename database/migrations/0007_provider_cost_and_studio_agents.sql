-- A provider cannot be marked available unless any external provider has verified free quota and commercial rights.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_registry_available_requires_verified_free_commercial'
      AND conrelid = 'public.provider_registry'::regclass
  ) THEN
    ALTER TABLE public.provider_registry
      ADD CONSTRAINT provider_registry_available_requires_verified_free_commercial
      CHECK (
        status <> 'available'
        OR provider_type <> 'external'
        OR (free_tier_verified = true AND commercial_rights_verified = true)
      );
  END IF;
END $$;

-- These agents are deterministic, local, and do not call an external AI service.
UPDATE public.agent_registry
SET status = 'rule_based', version = '1.0.0', updated_at = now()
WHERE agent_key IN ('campaign-planner','affiliate-compliance','storyboard-planner','provider-cost-gate');

NOTIFY pgrst, 'reload schema';
