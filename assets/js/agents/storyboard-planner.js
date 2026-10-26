const DURATIONS = {
  30: [3,4,5,5,5,4,4],
  45: [4,6,7,7,7,7,7],
  60: [5,8,9,9,9,9,11]
};
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
export function generateStoryboard(input) {
  const data = input || {};
  const productName = clean(data.productName);
  const benefit = clean(data.benefit);
  const cta = clean(data.cta) || (data.locale === 'en' ? 'Check the details' : 'Periksa detail produk');
  const locale = data.locale === 'en' ? 'en' : 'id';
  const duration = Number(data.duration);
  if (!productName) throw new Error('Nama produk wajib diisi.');
  if (!benefit) throw new Error('Masukkan manfaat yang dapat diverifikasi.');
  if (![30,45,60].includes(duration)) throw new Error('Durasi harus 30, 45, atau 60 detik.');
  const durations = DURATIONS[duration];
  const labels = locale === 'en'
    ? ['Hook','Problem / context','Product introduction','User-provided benefit','Feature to verify','Decision checklist','CTA and disclosure']
    : ['Hook','Masalah / konteks','Pengenalan produk','Manfaat dari pengguna','Fitur yang perlu diverifikasi','Checklist keputusan','CTA dan disclosure'];
  const copy = locale === 'en'
    ? [
      productName + ': a closer look',
      'What are you trying to solve?',
      'Review the product details before deciding.',
      benefit,
      'Check features and evidence with the merchant.',
      'Compare alternatives, terms, and current pricing.',
      cta + ' · Affiliate link may earn a commission.'
    ]
    : [
      productName + ': kenali sebelum memilih',
      'Masalah apa yang ingin Anda selesaikan?',
      'Periksa detail produk sebelum mengambil keputusan.',
      benefit,
      'Cek fitur dan bukti melalui sumber merchant.',
      'Bandingkan alternatif, syarat, dan harga terkini.',
      cta + ' · Tautan affiliate dapat menghasilkan komisi.'
    ];
  const scenes = labels.map((label, index) => ({
    scene: index + 1,
    label,
    durationSeconds: durations[index],
    startSeconds: durations.slice(0, index).reduce((sum, value) => sum + value, 0),
    endSeconds: durations.slice(0, index + 1).reduce((sum, value) => sum + value, 0),
    onScreenText: copy[index],
    narrationPrompt: locale === 'en'
      ? 'Use only the supplied product facts. Do not invent a testimonial, feature, discount, or performance claim.'
      : 'Gunakan hanya fakta produk yang diberikan. Jangan mengarang testimoni, fitur, diskon, atau klaim performa.'
  }));
  return {
    productName, benefit, cta, locale, durationSeconds: duration, scenes,
    totalSeconds: scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    format: 'template-based local rendering',
    externalAiProviderUsed: false,
    humanReviewRequired: true
  };
}
