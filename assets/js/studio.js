import { generateStoryboard } from './agents/storyboard-planner.js';
import { reviewAffiliateDraft } from './agents/affiliate-compliance.js';

const $ = (id) => document.getElementById(id);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function initializeStudio({ getContext, api, slugify, message }) {
  let plan = null;
  let compliance = null;
  let images = [];
  let imageUrls = [];
  let videoUrl = null;
  const canvas = $('studio-canvas');
  const ctx = canvas.getContext('2d');
  const renderButton = $('render-studio-video');
  const imageButton = $('download-promo-image');
  renderButton.disabled = true;
  imageButton.disabled = true;

  function status(text, kind) {
    $('studio-status').textContent = text || '';
    $('studio-status').className = 'form-note' + (kind ? ' notice-' + kind : '');
  }
  function canvasSize(ratio) {
    if (ratio === '1:1') return [720,720];
    if (ratio === '16:9') return [1280,720];
    return [720,1280];
  }
  function fitCanvas() {
    const [width,height] = canvasSize($('studio-ratio').value);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }
  function wrapText(text, maxWidth, font) {
    ctx.font = font;
    const words = String(text || '').split(/\s+/);
    const lines = []; let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawScene(scene, index, progress) {
    fitCanvas();
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0,0,width,height);
    const image = images.length ? images[index % images.length] : null;
    if (image && image.complete && image.naturalWidth) {
      const zoom = 1.02 + Math.max(0,Math.min(1,progress)) * 0.04;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
      const drawWidth = image.naturalWidth * scale, drawHeight = image.naturalHeight * scale;
      const x = (width - drawWidth) / 2, y = (height - drawHeight) / 2;
      ctx.drawImage(image,x,y,drawWidth,drawHeight);
    } else {
      const gradient = ctx.createLinearGradient(0,0,width,height);
      gradient.addColorStop(0,'#102a43'); gradient.addColorStop(1,'#050b15');
      ctx.fillStyle = gradient; ctx.fillRect(0,0,width,height);
      ctx.strokeStyle = 'rgba(137,220,197,.22)'; ctx.lineWidth = Math.max(2,width/240);
      for (let i=0;i<8;i++) { ctx.beginPath(); ctx.arc(width*.5,height*.48,(i+1)*Math.min(width,height)/18,0,Math.PI*2); ctx.stroke(); }
    }
    const overlay = ctx.createLinearGradient(0,0,0,height);
    overlay.addColorStop(0,'rgba(4,10,18,.76)'); overlay.addColorStop(.35,'rgba(4,10,18,.30)'); overlay.addColorStop(1,'rgba(4,10,18,.86)');
    ctx.fillStyle = overlay; ctx.fillRect(0,0,width,height);
    const scaleUnit = width / 720;
    const margin = width * .085;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#8ddcc7'; ctx.font = '700 ' + Math.round(15*scaleUnit) + 'px system-ui, sans-serif';
    ctx.fillText('AFFILIATE CONTENT STUDIO', margin, height * .07);
    ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(27*scaleUnit) + 'px system-ui, sans-serif';
    const productLines = wrapText(plan.productName, width - margin*2, ctx.font);
    productLines.slice(0,2).forEach((line,i)=>ctx.fillText(line,margin,height*.14+i*36*scaleUnit));
    const sceneY = height * .38;
    ctx.fillStyle = '#8ddcc7'; ctx.font = '700 ' + Math.round(16*scaleUnit) + 'px system-ui, sans-serif';
    ctx.fillText('SCENE ' + scene.scene + ' / ' + plan.scenes.length + ' · ' + scene.durationSeconds + 's', margin, sceneY);
    ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(32*scaleUnit) + 'px system-ui, sans-serif';
    const lines = wrapText(scene.onScreenText, width - margin*2, ctx.font);
    const lineHeight = 42*scaleUnit;
    lines.slice(0,5).forEach((line,i)=>ctx.fillText(line,margin,sceneY+44*scaleUnit+i*lineHeight));
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = '400 ' + Math.round(13*scaleUnit) + 'px system-ui, sans-serif';
    const footer = $('studio-disclosure').checked ? 'Affiliate disclosure: link may earn a commission.' : 'Check product facts and rights before publishing.';
    ctx.fillText(footer,margin,height*.91);
    ctx.fillStyle = 'rgba(255,255,255,.26)'; ctx.fillRect(margin,height*.95,width-margin*2,Math.max(3,4*scaleUnit));
    ctx.fillStyle = '#8ddcc7'; ctx.fillRect(margin,height*.95,(width-margin*2)*Math.max(0,Math.min(1,progress)),Math.max(3,4*scaleUnit));
  }
  function renderStoryboard() {
    $('storyboard-list').replaceChildren();
    plan.scenes.forEach((scene) => {
      const card = document.createElement('article'); card.className = 'record-card';
      const heading = document.createElement('div'); heading.className = 'record-heading';
      const title = document.createElement('h3'); title.textContent = scene.scene + '. ' + scene.label;
      const badge = document.createElement('span'); badge.className = 'record-badge'; badge.textContent = scene.durationSeconds + 's';
      heading.append(title,badge); card.append(heading);
      const range = document.createElement('p'); range.textContent = scene.startSeconds + 's – ' + scene.endSeconds + 's'; card.append(range);
      const copy = document.createElement('p'); copy.textContent = scene.onScreenText; card.append(copy);
      const prompt = document.createElement('p'); prompt.textContent = scene.narrationPrompt; card.append(prompt);
      $('storyboard-list').append(card);
    });
    drawScene(plan.scenes[0],0,0);
    renderButton.disabled = false; imageButton.disabled = false;
  }
  async function loadImages(files) {
    imageUrls.forEach((url) => URL.revokeObjectURL(url));
    imageUrls = []; images = [];
    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      imageUrls.push(url);
      const image = new Image();
      image.src = url;
      await new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; });
      if (image.naturalWidth) images.push(image);
    }
    if (files && files.length && !images.length) throw new Error('Gambar tidak dapat dibaca. Gunakan file PNG, JPG, atau WebP.');
    if (plan) drawScene(plan.scenes[0],0,0);
    status(images.length ? images.length + ' gambar siap digunakan secara lokal di browser.' : 'Belum ada gambar. Studio akan menggunakan latar dan tipografi.', 'success');
  }
  $('studio-images').addEventListener('change', async (event) => {
    try { await loadImages(event.currentTarget.files); }
    catch (error) { status(error.message, 'error'); }
  });
  $('studio-ratio').addEventListener('change', () => { if (plan) drawScene(plan.scenes[0],0,0); });
  $('studio-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      plan = generateStoryboard({
        productName: values.productName, benefit: values.benefit, cta: values.cta,
        duration: values.duration, locale: values.locale
      });
      const sourceUrl = String(values.sourceUrl || '').trim();
      const affiliateUrl = String(values.affiliateUrl || '').trim();
      compliance = reviewAffiliateDraft({
        productName: values.productName, description: values.benefit,
        sourceUrl, affiliateUrl, disclosure: $('studio-disclosure').checked,
        claims: [values.benefit]
      });
      $('studio-results').hidden = false;
      $('studio-compliance').textContent = compliance.status.toUpperCase() + ' · ' + (compliance.issues.length ? compliance.issues.map((issue) => issue.message).join(' ') : 'No checklist issues detected; human review is still required.');
      $('studio-compliance').className = 'notice ' + (compliance.status === 'blocked' ? 'notice-error' : compliance.issues.length ? '' : 'notice-success');
      renderStoryboard();
      status('Storyboard total ' + plan.totalSeconds + ' detik. Rendering akan menambah hold singkat di scene terakhir untuk menjaga durasi file.', 'success');
      message('workspace-message', 'Storyboard dibuat dengan planner lokal. Tidak ada model AI eksternal yang dipanggil.', 'success');
    } catch (error) { status(error.message || 'Gagal membuat storyboard.', 'error'); }
  });
  $('download-promo-image').addEventListener('click', () => {
    if (!plan) return;
    drawScene(plan.scenes[0],0,0);
    canvas.toBlob((blob) => {
      if (!blob) { status('Gagal membuat gambar PNG.', 'error'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'affiliate-promo-' + (slugify(plan.productName) || 'product') + '.png';
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      status('Gambar promosi PNG diunduh. Ini adalah desain template, bukan gambar AI generatif.', 'success');
    }, 'image/png');
  });
  $('render-studio-video').addEventListener('click', async () => {
    if (!plan || !plan.scenes.length) return;
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') { status('Browser ini tidak mendukung Canvas captureStream atau MediaRecorder. Coba Chrome/Edge desktop terbaru.', 'error'); return; }
    const mimeCandidates = ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { status('Browser tidak menyediakan codec video yang didukung MediaRecorder.', 'error'); return; }
    renderButton.disabled = true; imageButton.disabled = true;
    $('studio-progress').value = 0;
    status('Rendering lokal dimulai. Jangan tutup tab sampai selesai.', '');
    const stream = canvas.captureStream(30);
    let recorder;
    const chunks = [];
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
        recorder.onerror = (event) => reject(event.error || new Error('MediaRecorder error'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });
      recorder.start(1000);
      const totalMs = plan.totalSeconds * 1000 + 1400;
      let elapsedMs = 0;
      for (let i = 0; i < plan.scenes.length; i++) {
        const scene = plan.scenes[i];
        const durationMs = scene.durationSeconds * 1000 + (i === plan.scenes.length - 1 ? 1400 : 0);
        const start = performance.now();
        while (performance.now() - start < durationMs) {
          const progress = Math.min(1,(elapsedMs + performance.now() - start) / totalMs);
          drawScene(scene,i,progress);
          $('studio-progress').value = Math.round(progress * 100);
          await delay(33);
        }
        elapsedMs += durationMs;
      }
      recorder.stop();
      const blob = await stopped;
      stream.getTracks().forEach((track) => track.stop());
      if (!blob || blob.size < 5000) throw new Error('File video kosong atau terlalu kecil.');
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      videoUrl = URL.createObjectURL(blob);
      const video = $('studio-video');
      video.src = videoUrl; video.hidden = false;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('Metadata video tidak dapat dibaca.'));
        video.load();
      });
      if (!Number.isFinite(video.duration) || video.duration + 0.25 < plan.totalSeconds) throw new Error('Durasi file hasil lebih pendek daripada storyboard (' + video.duration + 's). Render tidak dinyatakan lulus.');
      const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      const download = $('studio-download-video');
      download.href = videoUrl; download.download = 'affiliate-video-' + (slugify(plan.productName) || 'product') + '.' + extension; download.hidden = false;
      status('Render selesai · ' + video.duration.toFixed(1) + ' detik · ' + extension.toUpperCase() + ' · ' + Math.round(blob.size / 1024) + ' KB. Tidak ada upload cloud.', 'success');
      message('workspace-message', 'Video lokal selesai dirender. Periksa durasi dan hasil visual sebelum digunakan.', 'success');
    } catch (error) {
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
      stream.getTracks().forEach((track) => track.stop());
      status(error.message || 'Render video gagal.', 'error');
    } finally { renderButton.disabled = false; imageButton.disabled = false; }
  });
  $('save-storyboard-draft').addEventListener('click', async () => {
    if (!plan) { status('Buat storyboard terlebih dahulu.', 'error'); return; }
    const context = getContext();
    if (!context.user || !context.workspace || !['owner','admin','editor'].includes(context.role)) { status('Role ini tidak dapat menyimpan draft. Pastikan Anda masuk sebagai editor workspace.', 'error'); return; }
    try {
      const body = [
        'VIDEO STORYBOARD — LOCAL TEMPLATE RENDER',
        'Product: ' + plan.productName,
        'Duration: ' + plan.totalSeconds + ' seconds',
        'Benefit supplied by user: ' + plan.benefit,
        'Compliance status: ' + (compliance ? compliance.status : 'not checked'),
        'No external AI model, no synthetic voice, and no cloud upload were used.',
        '',
        ...plan.scenes.map((scene) => scene.scene + '. [' + scene.startSeconds + '-' + scene.endSeconds + 's] ' + scene.label + ': ' + scene.onScreenText)
      ].join('\n');
      const title = plan.productName + ' video storyboard';
      await api('content_items', { method: 'POST', body: {
        workspace_id: context.workspace.id, title, slug: slugify(title) + '-' + Date.now().toString().slice(-6),
        content_type: 'video_script', status: 'draft', body,
        meta_title: title.slice(0,60), meta_description: (plan.productName + ' — ' + plan.benefit + '. Review product facts, disclosure, and merchant terms before publishing.').slice(0,155),
        locale: plan.locale === 'en' ? 'en-US' : 'id-ID', disclosure_required: $('studio-disclosure').checked,
        author_user_id: context.user.id
      }});
      status('Storyboard disimpan sebagai draft teks di Neon. File video tetap lokal.', 'success');
      message('workspace-message', 'Storyboard disimpan sebagai draft; tidak dipublikasikan otomatis.', 'success');
    } catch (error) { status(error.message || 'Gagal menyimpan storyboard.', 'error'); }
  });
}
