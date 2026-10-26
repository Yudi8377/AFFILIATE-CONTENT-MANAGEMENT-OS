-- Permit a workflow owner to finalize only their own queued run.
-- Column-level UPDATE privileges prevent clients from rewriting identity, input,
-- workspace, agent key, cost, or requester fields after the initial insert.
REVOKE UPDATE ON TABLE public.agent_runs FROM authenticated;
GRANT UPDATE (status, output, provider_status, failure_reason, started_at, finished_at)
  ON TABLE public.agent_runs TO authenticated;

DROP POLICY IF EXISTS agent_runs_finalize_own ON public.agent_runs;
CREATE POLICY agent_runs_finalize_own ON public.agent_runs
  FOR UPDATE TO authenticated
  USING (
    requested_by = (SELECT auth.user_id())
    AND status = 'queued'
  )
  WITH CHECK (
    requested_by = (SELECT auth.user_id())
    AND status IN ('needs_review', 'failed')
    AND provider_status = 'unverified'
  );

NOTIFY pgrst, 'reload schema';
