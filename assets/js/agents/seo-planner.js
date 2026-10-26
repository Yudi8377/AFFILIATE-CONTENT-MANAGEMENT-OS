const CATEGORY_TEMPLATES = {
  id: [
    ['Topik inti dan definisi','informational',['pengertian','arti dan fungsi','panduan lengkap','cara kerja','fitur utama','contoh penggunaan','hal yang perlu diketahui']],
    ['Manfaat dan penggunaan','informational',['manfaat utama','kelebihan dan kekurangan','contoh penggunaan nyata','untuk pemula','untuk bisnis kecil','kapan perlu digunakan','batasan penggunaan']],
    ['Tutorial dan langkah praktis','informational',['cara menggunakan','panduan langkah demi langkah','cara memulai','tips penggunaan','praktik terbaik','alur kerja','kesalahan yang harus dihindari']],
    ['Perbandingan dan alternatif','commercial',['perbandingan','vs alternatif lain','alternatif terbaik','review dan evaluasi','kelebihan dibanding pesaing','pro dan kontra','cara memilih opsi terbaik']],
    ['Harga dan biaya','commercial',['harga','biaya penggunaan','paket gratis','biaya tersembunyi','perbandingan biaya','anggaran pemula','nilai dibanding biaya']],
    ['Pembelian dan konversi','transactional',['tempat membeli','daftar sekarang','mulai menggunakan','promo terbaru','kode diskon','penawaran resmi','cara mendapatkan akses']],
    ['Audiens dan industri','commercial',['untuk kreator baru','untuk affiliate marketer','untuk content creator','untuk UMKM','untuk ecommerce','untuk publisher','untuk agensi pemasaran']],
    ['Masalah dan solusi','informational',['masalah umum','cara mengatasi error','solusi kendala','cara memperbaiki','risiko penggunaan','troubleshooting','cara menghindari kesalahan']],
    ['Kepercayaan dan kepatuhan','informational',['aturan disclosure affiliate','privasi dan keamanan','hak penggunaan komersial','kebijakan ulasan','syarat dan ketentuan','risiko kepatuhan','daftar periksa sebelum publikasi']],
    ['Strategi dan kinerja','commercial',['strategi pemasaran','optimasi konversi','cara mengukur ROI','rencana kampanye','metrik performa','strategi pertumbuhan','contoh studi kasus']]
  ],
  en: [
    ['Core topic and definition','informational',['meaning and definition','how it works','complete guide','key features','use examples','what to know','main purpose']],
    ['Benefits and use cases','informational',['key benefits','key advantages','use cases','for beginners','for small businesses','when to use it','limitations to consider']],
    ['Tutorials and practical steps','informational',['how to use','step by step guide','how to get started','practical tips','best practices','workflow examples','mistakes to avoid']],
    ['Comparisons and alternatives','commercial',['comparison','vs alternatives','best alternatives','review and evaluation','advantages over competitors','pros and cons','how to choose']],
    ['Pricing and cost','commercial',['pricing','cost to use','free plan','hidden costs','cost comparison','starter budget','value for money']],
    ['Purchase and conversion','transactional',['where to buy','sign up now','get started','latest promotion','discount code','official offer','how to access']],
    ['Audience and industry','commercial',['for new creators','for affiliate marketers','for content creators','for small businesses','for ecommerce','for publishers','for marketing agencies']],
    ['Problems and solutions','informational',['common problems','how to fix errors','solutions to common issues','troubleshooting guide','usage risks','common mistakes','how to prevent issues']],
    ['Trust and compliance','informational',['affiliate disclosure rules','privacy and security','commercial usage rights','review policy','terms and conditions','compliance risks','pre-publication checklist']],
    ['Strategy and performance','commercial',['marketing strategy','conversion optimization','how to measure ROI','campaign plan','performance metrics','growth strategy','case study']]
  ]
};

const TITLE_TEMPLATES = {
  id: [
    'Panduan {keyword}: Cara Memilih dengan Tepat',
    '{keyword}: Manfaat, Risiko, dan Hal Penting',
    'Cara Menggunakan {keyword} secara Lebih Efektif',
    'Perbandingan {keyword}: Apa yang Perlu Dicek?',
    '{keyword} untuk {audience}: Checklist Praktis'
  ],
  en: [
    '{keyword}: A Practical Guide to Choosing Well',
    '{keyword}: Benefits, Risks, and Key Considerations',
    'How to Use {keyword} More Effectively',
    '{keyword} Comparison: What Should You Check?',
    '{keyword} for {audience}: A Practical Checklist'
  ]
};

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function terms(value) {
  return clean(value).toLocaleLowerCase().split(/[^a-z0-9À-ÿ]+/i).filter((token) => token.length > 1);
}
export function slugify(value) {
  return clean(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}
export function classifySearchIntent(keyword) {
  const k = clean(keyword).toLocaleLowerCase();
  if (/\b(beli|buy|order|checkout|daftar|sign up|download|voucher|promo|diskon|discount|coupon|where to buy|harga termurah)\b/.test(k)) {
    return { intent: 'transactional', rationale: 'Contains purchase, access, or offer modifiers.' };
  }
  if (/\b(review|ulasan|terbaik|best|vs|versus|perbandingan|comparison|alternatif|alternative|rekomendasi|recommendation|pricing|harga|biaya|cost)\b/.test(k)) {
    return { intent: 'commercial', rationale: 'Suggests evaluation, comparison, or price research.' };
  }
  return { intent: 'informational', rationale: 'No clear purchase or comparison modifier was detected.' };
}
function metaDescription(keyword, locale, benefit, cta) {
  const k = clean(keyword);
  const b = clean(benefit);
  const action = clean(cta) || (locale === 'en' ? 'review the checklist before deciding' : 'tinjau checklist sebelum memilih');
  let text = locale === 'en'
    ? 'Explore ' + k + ': practical steps, benefits, risks, and selection criteria. ' + (b ? b + '. ' : '') + 'Compare options and ' + action + '.'
    : 'Pelajari ' + k + ': panduan praktis, manfaat, risiko, dan kriteria memilih. ' + (b ? b + '. ' : '') + 'Bandingkan opsi lalu ' + action + '.';
  text = clean(text);
  if (text.length > 155) {
    const suffix = locale === 'en' ? ' Compare options and decide wisely.' : ' Bandingkan opsi sebelum memilih.';
    const prefix = locale === 'en' ? 'Explore ' + k + ': ' : 'Pelajari ' + k + ': ';
    const core = locale === 'en' ? 'benefits, risks, and selection criteria.' : 'manfaat, risiko, dan kriteria memilih.';
    text = clean(prefix + core + suffix);
  }
  if (text.length > 155) text = text.slice(0, 152).replace(/\s+\S*$/, '') + '...';
  if (text.length < 120) {
    const add = locale === 'en' ? ' Use this guide to compare choices before taking action.' : ' Gunakan panduan ini untuk membandingkan pilihan sebelum bertindak.';
    text = clean(text + add);
  }
  if (text.length > 155) text = text.slice(0, 152).replace(/\s+\S*$/, '') + '...';
  return text;
}
function titleFor(keyword, audience, locale, index) {
  const templates = TITLE_TEMPLATES[locale] || TITLE_TEMPLATES.id;
  const audienceText = clean(audience) || (locale === 'en' ? 'your audience' : 'target audiens');
  let title = templates[index % templates.length].replaceAll('{keyword}', clean(keyword)).replaceAll('{audience}', audienceText);
  if (title.length > 60) title = title.slice(0, 57).replace(/\s+\S*$/, '') + '...';
  return title;
}
function makeRows(keyword, locale, audience, benefit, cta) {
  const templates = CATEGORY_TEMPLATES[locale] || CATEGORY_TEMPLATES.id;
  const rows = [];
  templates.forEach((group, groupIndex) => {
    const cluster = group[0], intent = group[1], modifiers = group[2];
    modifiers.forEach((modifier, itemIndex) => {
      const phrase = locale === 'en' ? modifier + ' ' + keyword : keyword + ' ' + modifier;
      const searchKeyword = clean(phrase);
      rows.push({
        cluster,
        keyword: searchKeyword,
        searchVolume: null,
        keywordDifficulty: null,
        searchIntent: intent,
        title: titleFor(searchKeyword, audience, locale, itemIndex + groupIndex),
        metaDescription: metaDescription(searchKeyword, locale, benefit, cta),
        metricStatus: 'not measured',
        reviewRequired: true
      });
    });
  });
  return rows;
}
export function generateSeoPlan(input) {
  const data = input || {};
  const keyword = clean(data.keyword);
  if (keyword.length < 2) throw new Error('Masukkan target keyword yang jelas.');
  const locale = data.locale === 'en' ? 'en' : 'id';
  const audience = clean(data.audience) || (locale === 'en' ? 'affiliate marketers' : 'affiliate marketer');
  const benefit = clean(data.benefit);
  const cta = clean(data.cta);
  const intent = classifySearchIntent(keyword);
  const rows = makeRows(keyword, locale, audience, benefit, cta);
  const supplied = clean(data.relatedKeywords).split(/\n|,|;/).map(clean).filter(Boolean);
  const seen = new Set(rows.map((row) => row.keyword.toLocaleLowerCase()));
  supplied.forEach((item) => {
    const key = item.toLocaleLowerCase();
    if (!seen.has(key)) {
      const classified = classifySearchIntent(item);
      rows.push({
        cluster: locale === 'en' ? 'User-supplied related keywords' : 'Keyword terkait dari pengguna',
        keyword: item,
        searchVolume: null,
        keywordDifficulty: null,
        searchIntent: classified.intent,
        title: titleFor(item, audience, locale, rows.length),
        metaDescription: metaDescription(item, locale, benefit, cta),
        metricStatus: 'not measured',
        reviewRequired: true
      });
      seen.add(key);
    }
  });
  const titles = Array.from({ length: 5 }, (_, i) => titleFor(keyword, audience, locale, i));
  const description = metaDescription(keyword, locale, benefit, cta);
  const outline = locale === 'en'
    ? ['What the topic means and who it serves', 'Key benefits and limitations', 'How to evaluate options', 'Practical steps and examples', 'Costs, risks, and compliance checks', 'Decision checklist and next action']
    : ['Pengertian topik dan siapa yang membutuhkannya', 'Manfaat utama serta batasan', 'Cara mengevaluasi pilihan', 'Langkah praktis dan contoh', 'Biaya, risiko, dan pemeriksaan kepatuhan', 'Checklist keputusan dan tindakan berikutnya'];
  return {
    keyword, locale, audience, searchIntent: intent.intent, intentRationale: intent.rationale,
    titles, metaDescription: description, metaDescriptionCharacters: description.length,
    outline, rows, clusterCount: CATEGORY_TEMPLATES[locale].length,
    keywordCount: rows.length, metricsAvailable: false,
    quality: {
      metaDescriptionLengthValid: description.length >= 120 && description.length <= 155,
      searchVolumeFabricated: false,
      keywordDifficultyFabricated: false,
      humanReviewRequired: true
    }
  };
}
