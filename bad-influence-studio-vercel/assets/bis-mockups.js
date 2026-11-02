/*
 * BAD INFLUENCE STUDIO — bis-mockups.js (tiny loader, every page)
 * Finds 3D mockup slots (snippets/mock3d.liquid) and renders them only when they approach
 * the viewport. Three.js + bis-3d.js are imported on demand, so pages without slots load nothing.
 * Stills are cached in sessionStorage so moving between pages doesn't re-render.
 * No WebGL / Save-Data → slots keep their dark CSS placeholder (still labelled "3D mockup").
 */
const STILL = 'img[data-mock3d]:not([data-mock3d-done])';
const LIVE = '[data-viewer3d]:not([data-viewer3d-done])';
const saveData = navigator.connection && navigator.connection.saveData;
let lib = null;
const loadLib = () => lib || (lib = import('bis-3d'));

function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
const canRender = !saveData && webgl();

function toParams(raw, L) {
  const d = JSON.parse(raw);
  const color = L.colorFromName(d.color, '#141414');
  const dark = (() => { const c = color.replace('#', ''); const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16); return r * 0.3 + g * 0.59 + b * 0.11 < 100; })();
  const front = d.print || L.printFromTitle(d.title);
  return {
    garment: ['tee', 'longsleeve', 'hoodie'].includes(d.type) ? d.type : L.garmentFromType(d.type || '', d.title || ''),
    color,
    printColor: dark ? '#F3F0E9' : '#0d0d0d',
    accent: getComputedStyle(document.documentElement).getPropertyValue('--acid').trim() || '#FF3038',
    front,
    back: d.back || front,
    mannequin: d.mannequin || 'none',
    // print files: light-ink artwork on dark garments, the "alt" (dark-ink) artwork on light ones
    frontUrl: dark ? (d.printFront || d.printFrontAlt) : (d.printFrontAlt || d.printFront),
    backUrl: dark ? (d.printBack || d.printBackAlt) : (d.printBackAlt || d.printBack),
    seed: Number(d.seed) || 7,
    view: d.view || 'front'
  };
}

const queue = [];
let busy = false;
async function pump() {
  if (busy || !queue.length) return;
  busy = true;
  const img = queue.shift();
  try {
    const L = await loadLib();
    const p = toParams(img.dataset.mock3d, L);
    const ratio = (Number(img.getAttribute('height')) || 1000) / (Number(img.getAttribute('width')) || 800);
    const cssW = img.getBoundingClientRect().width || 400;
    const w = Math.round(Math.min(1100, Math.max(360, cssW * Math.min(window.devicePixelRatio || 1, 1.6))));
    const h = Math.round(w * ratio);
    const key = `bis3d:v3:${img.dataset.mock3d}:${w}x${h}`;
    let url = null;
    try { url = sessionStorage.getItem(key); } catch (e) {}
    if (!url) {
      url = await L.renderMock(p, { width: w, height: h });
      try { if (url.length < 450000) sessionStorage.setItem(key, url); } catch (e) {}
    }
    img.src = url;
    img.closest('.mock-host, .card__media, .viewer3d, figure')?.classList.add('is-rendered');
    // thumbnails that mirror this render (product gallery) reuse it instead of rendering again
    document.querySelectorAll('img[data-mock3d-mirror]').forEach((m) => { if (m.dataset.mock3dMirror === img.dataset.mock3d) m.src = url; });
  } catch (err) {
    console.warn('[BIS] mockup render failed', err);
    img.classList.add('mock3d--off');
  }
  busy = false;
  // yield to the browser between renders so scrolling stays smooth
  setTimeout(pump, 16);
}

async function mountLive(el) {
  try {
    const L = await loadLib();
    const canvas = el.querySelector('canvas');
    const p = toParams(el.dataset.viewer3d, L);
    if (el._viewer) { el._viewer.destroy(); el.classList.remove('is-live'); }
    el._viewer = L.mountViewer(canvas, { ...p, view: p.view === 'front' ? 'front34' : p.view }, {
      backdrop: true,
      onReady: () => el.classList.add('is-live')
    });
  } catch (err) {
    console.warn('[BIS] 3D viewer unavailable', err);
  }
}

const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    if (en.target.matches('img[data-mock3d]')) { queue.push(en.target); pump(); }
    else mountLive(en.target);
  });
}, { rootMargin: '700px 0px' }) : null;

function scan(root = document) {
  root.querySelectorAll(STILL).forEach((img) => {
    img.dataset.mock3dDone = '1';
    if (!canRender) { img.classList.add('mock3d--off'); return; }
    // product galleries scroll sideways, so their slides never "enter" the viewport: render them in order
    if (img.closest('[data-gallery-track]')) { queue.push(img); pump(); return; }
    io ? io.observe(img) : (queue.push(img), pump());
  });
  root.querySelectorAll(LIVE).forEach((el) => {
    el.dataset.viewer3dDone = '1';
    if (!canRender) return;
    io ? io.observe(el) : mountLive(el);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan());
else scan();
// cart drawer re-renders, "load more", recommendations, theme editor reloads
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n.parentElement || n);
}).observe(document.documentElement, { childList: true, subtree: true });

// Picking another colour on a product page re-renders its mockups in that colour.
document.addEventListener('bis:variant', (e) => {
  const root = e.target;
  const names = (e.detail && e.detail.optionNames) || [];
  const values = (e.detail && e.detail.options) || [];
  const ci = names.findIndex((n) => /^colou?r$/i.test(String(n)));
  if (ci < 0 || !canRender) return;
  const colour = values[ci];
  const retarget = (el, attr) => {
    try {
      const d = JSON.parse(el.getAttribute(attr));
      if (d.color === colour) return false;
      d.color = colour;
      el.setAttribute(attr, JSON.stringify(d));
      return true;
    } catch (err) { return false; }
  };
  root.querySelectorAll('img[data-mock3d]').forEach((img) => {
    if (retarget(img, 'data-mock3d')) { delete img.dataset.mock3dDone; }
  });
  root.querySelectorAll('img[data-mock3d-mirror]').forEach((m) => retarget(m, 'data-mock3d-mirror'));
  root.querySelectorAll('[data-viewer3d]').forEach((v) => { if (retarget(v, 'data-viewer3d')) mountLive(v); });
  scan(root);
});
