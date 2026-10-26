-- These agents have deterministic local implementations with automated tests.
-- They do not invoke a language model or external AI provider.
UPDATE public.agent_registry
SET status = 'rule_based', version = '1.0.0', updated_at = now()
WHERE agent_key IN ('keyword-cluster','search-intent','seo-planner');

NOTIFY pgrst, 'reload schema';
