import { generateCampaignPlan } from './agents/campaign-planner.js';
const $ = (id) => document.getElementById(id);
export function initializeCampaignPlanner({ message }) {
  let plan = null;
  $('campaign-planner-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form).entries());
      data.channels = new FormData(form).getAll('channels');
      plan = generateCampaignPlan(data);
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
      message('workspace-message', 'Rencana kampanye siap ditinjau; tidak ada provider AI eksternal yang dipanggil.', 'success');
    } catch (error) { message('workspace-message', error.message || 'Campaign planner gagal.', 'error'); }
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
