function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
export function generateCampaignPlan(input) {
  const data = input || {};
  const productName = clean(data.productName);
  const audience = clean(data.audience);
  const benefit = clean(data.benefit);
  const goal = clean(data.goal) || 'qualified traffic';
  const locale = data.locale === 'en' ? 'en' : 'id';
  const channels = Array.isArray(data.channels) ? data.channels.map(clean).filter(Boolean) : [];
  const budgetRaw = data.budget;
  const budget = budgetRaw === '' || budgetRaw === null || budgetRaw === undefined ? null : Number(budgetRaw);
  if (!productName || !audience || !benefit) throw new Error('Nama produk, target audiens, dan manfaat wajib diisi.');
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new Error('Budget harus angka nol atau lebih.');
  const selectedChannels = channels.length ? channels : ['website','instagram','tiktok','youtube'];
  const channelNames = {
    website: locale === 'en' ? 'Website / SEO' : 'Website / SEO',
    instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
    facebook: 'Facebook', email: 'Email', whatsapp: 'WhatsApp', other: locale === 'en' ? 'Other channel' : 'Channel lain'
  };
  const angles = locale === 'en'
    ? [
      { angle: 'Problem → solution', message: 'Show the audience problem first, then explain how ' + productName + ' may help. Verify the claim against the source.' },
      { angle: 'Practical benefit', message: 'Explain the supplied benefit: ' + benefit + '. Include limitations and who may not need it.' },
      { angle: 'Decision checklist', message: 'Help ' + audience + ' compare price, terms, alternatives, and product fit before choosing.' },
      { angle: 'Evidence-led review', message: 'Use only source-backed details, current terms, and clearly labeled opinions. Do not invent testimonials.' }
    ]
    : [
      { angle: 'Masalah → solusi', message: 'Tampilkan masalah audiens terlebih dahulu, lalu jelaskan bagaimana ' + productName + ' mungkin membantu. Verifikasi klaim pada sumber.' },
      { angle: 'Manfaat praktis', message: 'Jelaskan manfaat yang diberikan: ' + benefit + '. Sertakan batasan dan siapa yang mungkin tidak membutuhkannya.' },
      { angle: 'Checklist keputusan', message: 'Bantu ' + audience + ' membandingkan harga, syarat, alternatif, dan kecocokan sebelum memilih.' },
      { angle: 'Review berbasis bukti', message: 'Gunakan detail yang didukung sumber, syarat terkini, dan opini yang diberi label. Jangan mengarang testimoni.' }
    ];
  const slogans = locale === 'en'
    ? ['Choose with clearer information','Compare first. Decide with confidence.','Know the details before you buy','A practical look at ' + productName,'Your checklist for a better-informed choice']
    : ['Pilih dengan informasi yang lebih jelas','Bandingkan dulu, putuskan dengan yakin','Kenali detail sebelum membeli','Ulas ' + productName + ' secara praktis','Checklist sebelum Anda memilih'];
  const kpis = locale === 'en'
    ? ['Qualified clicks and click-through rate','Conversion rate and earnings per click','Commission value and approved transactions','Refund/cancellation rate','Disclosure and landing-page quality checks']
    : ['Klik berkualitas dan click-through rate','Conversion rate dan earnings per click','Nilai komisi dan transaksi yang disetujui','Tingkat refund/pembatalan','Pemeriksaan disclosure dan kualitas landing page'];
  const activities = locale === 'en'
    ? ['Verify product facts, current price, terms, and affiliate URL','Publish a disclosure near the affiliate CTA','Use campaign-specific UTM tags for attribution','Create two message angles and compare results after sufficient traffic','Review performance weekly; do not assume causality from small samples']
    : ['Verifikasi fakta produk, harga terkini, syarat, dan URL affiliate','Tampilkan disclosure dekat CTA affiliate','Gunakan UTM khusus kampanye untuk atribusi','Buat dua angle pesan dan bandingkan setelah trafik memadai','Tinjau performa mingguan; jangan menyimpulkan sebab-akibat dari sampel kecil'];
  const channelPlan = selectedChannels.map((channel, index) => ({
    channel,
    label: channelNames[channel] || channel,
    format: channel === 'website' ? 'SEO landing page / comparison guide' : channel === 'email' ? 'Educational email sequence' : channel === 'whatsapp' ? 'Opt-in message with clear disclosure' : 'Short-form video / carousel / product explainer',
    cadence: index === 0 ? 'Launch asset + review weekly' : '1–3 assets per week; adjust after evidence',
    kpi: channel === 'website' ? 'Organic clicks, engaged visits, conversion rate' : channel === 'email' ? 'Delivery, click rate, unsubscribe rate' : 'Reach, qualified clicks, conversions'
  }));
  const totalCents = budget === null ? null : Math.round(budget * 100);
  const allocation = budget === null ? null : channelPlan.map((channel, index) => ({
    channel: channel.label,
    allocationPercent: Math.floor(100 / channelPlan.length) + (index < 100 % channelPlan.length ? 1 : 0),
    allocationAmount: (Math.floor(totalCents / channelPlan.length) + (index < totalCents % channelPlan.length ? 1 : 0)) / 100
  }));
  return {
    productName, audience, benefit, goal, locale, budget, channels: channelPlan,
    messageAngles: angles, slogans, kpis, activities, allocation,
    compliance: ['Disclose affiliate relationships clearly','Do not fabricate search volume, testimonials, product features, or performance metrics','Use only approved creative assets and confirm commercial usage rights','Treat campaign results as measured observations, not guaranteed outcomes'],
    humanReviewRequired: true,
    externalProviderUsed: false
  };
}
