/* -------------------------------------------------------------------
   LJR PHOTOBOOTH � app.js  (macOS redesign, no stickers)
   ------------------------------------------------------------------- */

// --- Config ------------------------------------------------------------------

const CELL_W  = 480;
const CELL_H  = 360;
const PAD     = 20;
const GAP     = 10;
const LABEL_H = 48;

const LAYOUTS = {
  single: { shots: 1, cols: 1, rows: 1, label: 'Single Shot'   },
  strip3: { shots: 3, cols: 1, rows: 3, label: 'Classic Strip' },
  strip4: { shots: 4, cols: 1, rows: 4, label: 'Tall Strip'    },
  grid4:  { shots: 4, cols: 2, rows: 2, label: '2×2 Grid'      },
  wide4:  { shots: 4, cols: 4, rows: 1, label: 'Wide Strip'    },
};

const FILTERS = {
  normal:    { label: 'Normal',  css: 'none' },
  grayscale: { label: 'Gray',    css: 'grayscale(100%)' },
  sepia:     { label: 'Sepia',   css: 'sepia(100%)' },
  vivid:     { label: 'Vivid',   css: 'saturate(200%) contrast(110%)' },
  cool:      { label: 'Cool',    css: 'hue-rotate(190deg) saturate(130%) brightness(105%)' },
  warm:      { label: 'Warm',    css: 'sepia(40%) saturate(150%) brightness(110%)' },
  vintage:   { label: 'Vintage', css: 'sepia(60%) contrast(85%) brightness(90%) saturate(75%)' },
  fade:      { label: 'Fade',    css: 'brightness(115%) contrast(80%) saturate(80%)' },
  dramatic:  { label: 'Drama',   css: 'contrast(150%) brightness(90%) grayscale(20%)' },
  duotone:   { label: 'Duotone', css: 'grayscale(100%) sepia(100%) hue-rotate(220deg) saturate(500%)', duoLive: true },
};

// --- State -------------------------------------------------------------------

const state = {
  layout:           'strip3',
  filter:           'normal',
  photos:           [],
  stream:           null,
  captureActive:    false,
  currentSessionId: null,
};

// --- DOM refs ----------------------------------------------------------------

const panels = {
  home:    document.getElementById('panel-home'),
  camera:  document.getElementById('panel-camera'),
  result:  document.getElementById('panel-result'),
  gallery: document.getElementById('panel-gallery'),
};
const webcam          = document.getElementById('webcam');
const resultCanvas    = document.getElementById('result-canvas');
const shotStrip       = document.getElementById('shot-strip');
const shotCounter     = document.getElementById('shot-counter');
const layoutBadge     = document.getElementById('layout-badge');
const countdownOvl    = document.getElementById('countdown-overlay');
const countdownNum    = document.getElementById('countdown-number');
const flashOvl        = document.getElementById('flash-overlay');
const duotoneLive     = document.getElementById('duotone-live');
const galleryGrid     = document.getElementById('gallery-grid');
const galleryEmpty    = document.getElementById('gallery-empty');
const galleryModal    = document.getElementById('gallery-modal');
const modalImg        = document.getElementById('modal-img');
const modalMeta       = document.getElementById('modal-meta');
const printImg        = document.getElementById('print-img');
const captureBtn      = document.getElementById('btn-capture');
const layoutSection   = document.getElementById('layout-section');
const navHome         = document.getElementById('nav-home');
const navGallery      = document.getElementById('nav-gallery');

// --- Panel Management --------------------------------------------------------

function showPanel(name) {
  Object.entries(panels).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
  // Sidebar active state
  navHome.classList.toggle('active',    name === 'home' || name === 'camera' || name === 'result');
  navGallery.classList.toggle('active', name === 'gallery');
  // Show layout picker only on home/camera
  layoutSection.style.display = (name === 'home' || name === 'camera') ? '' : 'none';
}

// --- Sidebar Nav -------------------------------------------------------------

navHome.addEventListener('click', () => {
  stopCamera();
  showPanel('home');
});
navGallery.addEventListener('click', async () => {
  stopCamera();
  showPanel('gallery');
  await loadGallery();
});

// --- Layout Preview (home panel) --------------------------------------------

function updateLayoutPreview() {
  const info  = LAYOUTS[state.layout];
  const paper = document.getElementById('layout-preview-paper');
  const slots = document.getElementById('layout-preview-slots');
  const label = document.getElementById('hero-preview-label');
  if (!paper || !slots) return;

  paper.className = `layout-preview-paper lp-paper-${state.layout}`;

  // Clone node to retrigger CSS animation on each switch
  const fresh = slots.cloneNode(false);
  fresh.className = `layout-preview-slots lps-${state.layout}`;
  const svg = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M19 15.5A1.5 1.5 0 0117.5 17h-15A1.5 1.5 0 011 15.5V7.5A1.5 1.5 0 012.5 6H5L6.5 4h7L15 6h2.5A1.5 1.5 0 0119 7.5z"/><circle cx="10" cy="11.5" r="2.5"/></svg>`;
  fresh.innerHTML = Array.from({ length: info.shots }, () =>
    `<div class="lps-slot">${svg}</div>`
  ).join('');
  slots.replaceWith(fresh);

  if (label) label.textContent = `${info.label} \u00b7 ${info.shots} photo${info.shots > 1 ? 's' : ''}`;
}

// --- Layout Picker (sidebar) -------------------------------------------------

document.querySelectorAll('.sl-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.sl-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.layout = card.dataset.layout;
    updateLayoutPreview();
  });
});

// --- Filter Bar Builder ------------------------------------------------------

function buildFilterBar(containerId, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  Object.entries(FILTERS).forEach(([key, f]) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (key === state.filter ? ' selected' : '');
    btn.dataset.filter = key;

    const swatch = document.createElement('div');
    swatch.className = 'filter-swatch';
    swatch.style.filter = f.css === 'none' ? '' : f.css;

    const label = document.createElement('span');
    label.textContent = f.label;

    btn.appendChild(swatch);
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(key);
    });
    container.appendChild(btn);
  });
}

// --- Camera ------------------------------------------------------------------

async function startCamera() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    webcam.srcObject = state.stream;
    await new Promise(r => (webcam.onloadedmetadata = r));
  } catch (err) {
    alert('Camera access denied or unavailable.\n\n' + err.message);
    showPanel('home');
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
    webcam.srcObject = null;
  }
}

function applyLiveFilter(filterKey) {
  state.filter = filterKey;
  const f = FILTERS[filterKey];
  webcam.style.filter = f.css === 'none' ? '' : f.css;
  duotoneLive.classList.toggle('hidden', !f.duoLive);

  // Sync both filter bars
  ['camera-filter-bar', 'result-filter-bar'].forEach(id => {
    document.querySelectorAll(`#${id} .filter-btn`).forEach(b => {
      b.classList.toggle('selected', b.dataset.filter === filterKey);
    });
  });
}

// --- Countdown & Capture -----------------------------------------------------

async function doCountdown(seconds = 3) {
  return new Promise(resolve => {
    let n = seconds;
    countdownNum.textContent = n;
    countdownOvl.classList.remove('hidden');

    const tick = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(tick);
        countdownOvl.classList.add('hidden');
        resolve();
      } else {
        countdownNum.textContent = n;
        countdownNum.style.animation = 'none';
        requestAnimationFrame(() => { countdownNum.style.animation = ''; });
      }
    }, 1000);
  });
}

function showFlash() {
  flashOvl.classList.remove('hidden');
  setTimeout(() => flashOvl.classList.add('hidden'), 300);
}

function captureFrame() {
  const offscreen = document.createElement('canvas');
  offscreen.width  = CELL_W;
  offscreen.height = CELL_H;
  const ctx        = offscreen.getContext('2d');

  // object-fit: cover � centre-crop to CELL aspect ratio
  const vw    = webcam.videoWidth  || webcam.clientWidth;
  const vh    = webcam.videoHeight || webcam.clientHeight;
  const scale = Math.max(CELL_W / vw, CELL_H / vh);
  const srcW  = CELL_W / scale;
  const srcH  = CELL_H / scale;
  const srcX  = (vw - srcW) / 2;
  const srcY  = (vh - srcH) / 2;

  // Mirror to match selfie preview
  ctx.translate(CELL_W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(webcam, srcX, srcY, srcW, srcH, 0, 0, CELL_W, CELL_H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return offscreen.toDataURL('image/png');
}

function addThumbnail(dataURL, index) {
  const img = document.createElement('img');
  img.className = 'shot-thumb latest';
  img.src = dataURL;
  img.alt = `Shot ${index}`;
  shotStrip.querySelectorAll('.shot-thumb').forEach(t => t.classList.remove('latest'));
  shotStrip.appendChild(img);
}

async function takePhoto() {
  if (state.captureActive) return;
  state.captureActive = true;
  captureBtn.disabled = true;

  await doCountdown(3);
  showFlash();

  const dataURL = captureFrame();
  state.photos.push(dataURL);
  addThumbnail(dataURL, state.photos.length);

  const needed = LAYOUTS[state.layout].shots;

  if (state.photos.length >= needed) {
    setTimeout(() => goToResult(), 400);
  } else {
    shotCounter.textContent = `Shot ${state.photos.length + 1} of ${needed}`;
    captureBtn.disabled = false;
    state.captureActive = false;
  }
}

// --- Result View -------------------------------------------------------------

async function goToResult() {
  stopCamera();
  showPanel('result');
  await renderComposite();

  buildFilterBar('result-filter-bar', async (key) => {
    state.filter = key;
    await renderComposite();
    // Update saved thumbnail
    const dataURL = resultCanvas.toDataURL('image/png');
    if (state.currentSessionId != null) {
      await db.sessions.update(state.currentSessionId, { composite: dataURL, filter: key });
    }
  });

  // Auto-save to gallery
  const dataURL = resultCanvas.toDataURL('image/png');
  state.currentSessionId = await dbSaveSession(state.layout, state.filter, dataURL);
}

// --- Canvas Rendering --------------------------------------------------------

function getCanvasDimensions() {
  const cfg = LAYOUTS[state.layout];
  const W   = PAD * 2 + cfg.cols * CELL_W + (cfg.cols - 1) * GAP;
  const H   = PAD * 2 + cfg.rows * CELL_H + (cfg.rows - 1) * GAP + LABEL_H;
  return { W, H, cfg };
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img  = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

async function renderComposite() {
  const { W, H, cfg } = getCanvasDimensions();
  const filterCSS     = FILTERS[state.filter].css;
  const isDuotone     = !!FILTERS[state.filter].duoLive;
  const ctx           = resultCanvas.getContext('2d');

  resultCanvas.width  = W;
  resultCanvas.height = H;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Subtle border
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth   = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  // Photos
  for (let i = 0; i < state.photos.length; i++) {
    const col = i % cfg.cols;
    const row = Math.floor(i / cfg.cols);
    const x   = PAD + col * (CELL_W + GAP);
    const y   = PAD + row * (CELL_H + GAP);

    const img = await loadImage(state.photos[i]);

    if (isDuotone) {
      ctx.filter = 'grayscale(100%)';
      ctx.drawImage(img, x, y, CELL_W, CELL_H);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'multiply';
      const grad = ctx.createLinearGradient(x, y, x + CELL_W, y + CELL_H);
      grad.addColorStop(0, '#0a1aff');
      grad.addColorStop(1, '#cc00ff');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, CELL_W, CELL_H);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.filter = filterCSS === 'none' ? 'none' : filterCSS;
      ctx.drawImage(img, x, y, CELL_W, CELL_H);
      ctx.filter = 'none';
    }
  }

  // Watermark
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  ctx.fillStyle    = '#aaaaaa';
  ctx.font         = `500 ${cfg.cols > 1 ? 14 : 12}px -apple-system, Helvetica, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LJR Photobooth  �  ${dateStr}`, W / 2, H - LABEL_H / 2);
}

// --- Export / Download / Share / Print --------------------------------------

async function getExportDataURL(type = 'image/png', quality = 0.92) {
  await renderComposite();
  return resultCanvas.toDataURL(type, quality);
}

async function downloadPhoto(format) {
  const mime    = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const ext     = format === 'jpg' ? 'jpg' : 'png';
  const quality = format === 'jpg' ? 0.92  : undefined;
  const dataURL = await getExportDataURL(mime, quality);

  const link    = document.createElement('a');
  const date    = new Date().toISOString().slice(0, 10);
  link.download = `ljr-photobooth-${date}.${ext}`;
  link.href     = dataURL;
  link.click();

  if (state.currentSessionId != null) {
    await db.sessions.update(state.currentSessionId, { composite: dataURL });
  }
}

async function sharePhoto() {
  const dataURL = await getExportDataURL('image/png');

  if (navigator.share && navigator.canShare) {
    try {
      const blob = await (await fetch(dataURL)).blob();
      const file = new File([blob], 'photobooth.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'LJR Photobooth', text: '?? Check out my photobooth strip!' });
        return;
      }
    } catch { /* fall through */ }
  }
  try {
    const blob = await (await fetch(dataURL)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Copied to clipboard');
  } catch {
    showToast('Could not share � try downloading instead.');
  }
}

async function printPhoto() {
  const dataURL = await getExportDataURL('image/png');
  printImg.src  = dataURL;
  window.print();
}

// --- Toast -------------------------------------------------------------------

function showToast(msg) {
  let t = document.getElementById('ljr-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'ljr-toast';
    Object.assign(t.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(28,28,30,.92)', backdropFilter: 'blur(12px)',
      color: '#fff', padding: '9px 18px', borderRadius: '980px',
      fontSize: '13px', fontWeight: '500', zIndex: '9999',
      boxShadow: '0 4px 20px rgba(0,0,0,.3)', transition: 'opacity .3s ease',
      fontFamily: '-apple-system, Helvetica, sans-serif',
    });
    document.body.appendChild(t);
  }
  t.textContent   = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2600);
}

// --- Gallery (macOS Photos style � grouped by month) -------------------------

async function loadGallery() {
  galleryGrid.innerHTML = '';
  const sessions = await dbGetAllSessions();

  if (sessions.length === 0) {
    galleryEmpty.classList.remove('hidden');
    galleryGrid.classList.add('hidden');
    return;
  }

  galleryEmpty.classList.add('hidden');
  galleryGrid.classList.remove('hidden');

  // Group by "Month Year"
  const groups = {};
  sessions.forEach(session => {
    const d    = new Date(session.date);
    const key  = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(session);
  });

  Object.entries(groups).forEach(([monthLabel, items]) => {
    const group = document.createElement('div');
    group.className = 'gallery-month-group';

    const header = document.createElement('h2');
    header.className   = 'gallery-month-header';
    header.textContent = monthLabel;
    group.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'gallery-month-grid';

    items.forEach(session => {
      const item = document.createElement('div');
      item.className = 'gallery-photo-item';

      const img = document.createElement('img');
      img.src     = session.composite;
      img.alt     = 'Session';
      img.loading = 'lazy';

      const hover = document.createElement('div');
      hover.className = 'photo-hover';

      const time = document.createElement('span');
      time.className   = 'photo-time';
      time.textContent = new Date(session.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      hover.appendChild(time);
      item.appendChild(img);
      item.appendChild(hover);
      item.addEventListener('click', () => openModal(session));
      grid.appendChild(item);
    });

    group.appendChild(grid);
    galleryGrid.appendChild(group);
  });
}

let activeModalSession = null;

function openModal(session) {
  activeModalSession  = session;
  modalImg.src        = session.composite;
  const d             = new Date(session.date);
  const layoutLabel   = LAYOUTS[session.layout]?.label ?? session.layout;
  const filterLabel   = FILTERS[session.filter]?.label  ?? session.filter ?? '';
  modalMeta.textContent = `${layoutLabel}  �  ${filterLabel}  �  ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  galleryModal.classList.remove('hidden');
}

function closeModal() {
  galleryModal.classList.add('hidden');
  activeModalSession = null;
}

// --- Session Setup -----------------------------------------------------------

async function startSession() {
  state.photos          = [];
  state.filter          = 'normal';
  state.captureActive   = false;
  state.currentSessionId = null;

  shotStrip.innerHTML   = '';
  captureBtn.disabled   = false;

  const cfg = LAYOUTS[state.layout];
  shotCounter.textContent = `Shot 1 of ${cfg.shots}`;
  layoutBadge.textContent = cfg.label;

  buildFilterBar('camera-filter-bar', key => applyLiveFilter(key));

  showPanel('camera');
  await startCamera();

  document.querySelectorAll('#camera-filter-bar .filter-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.filter === 'normal');
  });
}

// --- Event Wiring ------------------------------------------------------------

// Home
document.getElementById('btn-start').addEventListener('click', startSession);

// Camera
document.getElementById('btn-back-home').addEventListener('click', () => {
  stopCamera();
  showPanel('home');
});
captureBtn.addEventListener('click', takePhoto);

// Result
document.getElementById('btn-retake').addEventListener('click', async () => {
  state.photos        = [];
  state.captureActive = false;
  captureBtn.disabled = false;
  shotStrip.innerHTML = '';

  const cfg = LAYOUTS[state.layout];
  shotCounter.textContent = `Shot 1 of ${cfg.shots}`;

  showPanel('camera');
  await startCamera();
});

document.getElementById('btn-new-session').addEventListener('click', () => {
  stopCamera();
  showPanel('home');
});

document.getElementById('btn-download-png').addEventListener('click', () => downloadPhoto('png'));
document.getElementById('btn-download-jpg').addEventListener('click', () => downloadPhoto('jpg'));
document.getElementById('btn-share').addEventListener('click', sharePhoto);
document.getElementById('btn-print').addEventListener('click', printPhoto);

// Gallery
document.getElementById('btn-clear-all').addEventListener('click', async () => {
  if (confirm('Delete all photos? This cannot be undone.')) {
    await dbClearAll();
    await loadGallery();
  }
});
document.getElementById('btn-go-shoot').addEventListener('click', () => showPanel('home'));

// Modal
document.getElementById('btn-modal-close').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', closeModal);
document.getElementById('btn-modal-download').addEventListener('click', () => {
  if (!activeModalSession) return;
  const link    = document.createElement('a');
  link.href     = activeModalSession.composite;
  const d       = new Date(activeModalSession.date).toISOString().slice(0, 10);
  link.download = `ljr-photobooth-${d}.png`;
  link.click();
});
document.getElementById('btn-modal-delete').addEventListener('click', async () => {
  if (!activeModalSession) return;
  if (confirm('Delete this photo?')) {
    await dbDeleteSession(activeModalSession.id);
    closeModal();
    await loadGallery();
  }
});

// --- Init -------------------------------------------------------------------
updateLayoutPreview();
