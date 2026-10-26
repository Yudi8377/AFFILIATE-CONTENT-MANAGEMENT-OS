import { generateCampaignPlan } from './agents/campaign-planner.js';
import { runAgentWorkflow } from './agents/orchestrator.js';
const $ = (id) => document.getElementById(id);
export function initializeCampaignPlanner({ message }) {
  let plan = null;
  $('campaign-planner-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.channels = new FormData(form).getAll('channels');
      const workflow = await runAgentWorkflow({
        workflowId: 'affiliate-campaign-planning',
        input: data,
        allowedCapabilities: ['campaign-planning', 'quality-review'],
        agents: [
          {
            id: 'campaign-strategist',
            capabilities: ['campaign-planning'],
            run: ({ input }) => generateCampaignPlan(input)
          },
          {
            id: 'campaign-quality-review',
            dependsOn: ['campaign-strategist'],
            capabilities: ['quality-review'],
            run: ({ dependencies }) => {
              const draft = dependencies['campaign-strategist'];
              if (!draft.channels.length || !draft.messageAngles.length || !draft.kpis.length) {
                throw Object.assign(new Error('Campaign quality gate: required planning sections are missing.'), { code: 'CAMPAIGN_OUTPUT_INCOMPLETE' });
              }
              if (draft.budget !== null) {
                const allocated = draft.allocation.reduce((sum, item) => sum + item.allocationAmount, 0);
                if (Math.abs(allocated - draft.budget) > 0.01) {
                  throw Object.assign(new Error('Campaign quality gate: budget allocation does not reconcile.'), { code: 'CAMPAIGN_BUDGET_MISMATCH' });
                }
              }
              if (draft.externalProviderUsed !== false || draft.humanReviewRequired !== true) {
                throw Object.assign(new Error('Campaign quality gate: provider or review state is invalid.'), { code: 'CAMPAIGN_GOVERNANCE_FAILED' });
              }
              return { channelsReviewed: draft.channels.length, budgetReconciled: true, externalProviderUsed: false, humanReviewRequired: true };
            }
          }
        ]
      });
      if (workflow.status !== 'completed') {
        const failed = Object.values(workflow.results).find((result) => result.status === 'failed');
        throw new Error(failed?.errorCode || 'Multi-agent campaign workflow did not complete.');
      }
      plan = workflow.results['campaign-strategist'].output;
      const review = workflow.results['campaign-quality-review'].output;
      const root = $('campaign-plan-summary'); root.replaceChildren();
      const heading = document.createElement('h3'); heading.textContent = 'Strategic brief'; root.append(heading);
      const intro = document.createElement('p'); intro.textContent = 'Audience: ' + plan.audience + ' · Goal: ' + plan.goal + ' · ' + (plan.budget === null ? 'Budget not set' : new Intl.NumberFormat('id-ID').format(plan.budget) + ' IDR'); root.append(intro);
      function list(title, items, mapper) {
        const h = document.createElement('h4'); h.textContent = title; root.append(h);
        const ul = document.createElement('ul');
        items.forEach((item) => { const li = document.createElement('li'); li.textContent = mapper ? mapper(item) : String(item); ul.append(li); });
        root.append(ul);
      }
      list('Message angles', plan.messageAngles, (item) => item.angle + ': ' + item.message);
      list('Slogan ideas', plan.slogans);
      list('Channel plan', plan.channels, (item) => item.label + ' — ' + item.format + ' · ' + item.cadence + ' · KPI: ' + item.kpi);
      list('KPIs to measure', plan.kpis);
      list('Activities', plan.activities);
      list('Compliance gate', plan.compliance);
      if (plan.allocation) list('Budget allocation', plan.allocation, (item) => item.channel + ': ' + item.allocationPercent + '% · ' + new Intl.NumberFormat('id-ID').format(item.allocationAmount) + ' IDR');
      const note = document.createElement('p'); note.className = 'form-note'; note.textContent = 'Generated with deterministic rules only. No reach, conversion, ROI, or sales results are promised. Verify all product claims and campaign terms.'; root.append(note);
      $('campaign-plan-results').hidden = false;
      message('workspace-message', 'Multi-agent kampanye selesai: strategist + quality reviewer memeriksa ' + review.channelsReviewed + ' channel. Hasil rule-based; tinjauan manusia tetap wajib.', 'success');
    } catch (error) { message('workspace-message', error.message || 'Campaign planner gagal.', 'error'); }
    finally { if (submitButton) submitButton.disabled = false; }
  });
  $('apply-campaign-plan').addEventListener('click', () => {
    if (!plan) return;
    const form = $('campaign-form');
    form.elements.namedItem('name').value = plan.productName + ' — ' + plan.goal;
    form.elements.namedItem('channel').value = plan.channels[0] ? plan.channels[0].channel : 'other';
    form.elements.namedItem('budget_amount').value = plan.budget === null ? '' : String(plan.budget);
    form.elements.namedItem('notes').value = [
      'CAMPAIGN PLAN — RULE-BASED DRAFT',
      'Audience: ' + plan.audience,
      'Goal: ' + plan.goal,
      'Benefit supplied by user: ' + plan.benefit,
      '',
      'Message angles:',
      ...plan.messageAngles.map((item) => '- ' + item.angle + ': ' + item.message),
      '',
      'Slogans:',
      ...plan.slogans.map((item) => '- ' + item),
      '',
      'Channels:',
      ...plan.channels.map((item) => '- ' + item.label + ': ' + item.format + '; cadence: ' + item.cadence + '; KPI: ' + item.kpi),
      '',
      'KPIs:',
      ...plan.kpis.map((item) => '- ' + item),
      '',
      'Activities:',
      ...plan.activities.map((item) => '- ' + item),
      '',
      'Compliance:',
      ...plan.compliance.map((item) => '- ' + item),
      'Human review required. No external model used.'
    ].join('\n');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    message('workspace-message', 'Rencana diisikan ke form kampanye. Periksa lalu simpan untuk membuat record.', 'success');
  });
}
