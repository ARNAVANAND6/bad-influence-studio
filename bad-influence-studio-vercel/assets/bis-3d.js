/*
 * BAD INFLUENCE STUDIO — bis-3d.js
 * Shared real-time 3D for the theme (ES module; `three` comes from the import map in theme.liquid).
 *
 *  createFigure()   a fashion mannequin (chrome / graphite / matte black) wearing a draped garment:
 *                   oversized tee, long sleeve or hoodie. The garment is a cloth shell built over the body:
 *                   it hangs from the shoulders and chest under gravity, with folds, drag lines under the
 *                   arms, a rib collar, rolled hems, side seams, and the print mapped onto the fabric surface
 *                   so it bends with every fold.
 *  buildSculpture() the liquid-chrome barbed knot.
 *  createStudio()   lights, a reflective studio environment and a concrete backdrop with acid-red spill.
 *  renderMock()     renders a still "3D MOCKUP" image for products that have no photography yet.
 *  mountViewer()    an interactive, drag-to-rotate viewer (real 3D, so rotation is honest).
 *
 * Nothing here touches prices, stock or cart — those stay in HTML/Shopify.
 */
import * as THREE from 'three';

/* ======================= utils ======================= */
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const angDist = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };

/** Catmull-Rom through keyed rows [y, v1, v2, …] (sorted by y). */
function interp(keys, y) {
  if (y <= keys[0][0]) return keys[0].slice(1);
  const last = keys[keys.length - 1];
  if (y >= last[0]) return last.slice(1);
  let i = 0;
  while (keys[i + 1][0] < y) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = (y - k1[0]) / (k2[0] - k1[0]), t2 = t * t, t3 = t2 * t;
  const out = [];
  for (let c = 1; c < k1.length; c++) {
    const p0 = k0[c], p1 = k1[c], p2 = k2[c], p3 = k3[c];
    out.push(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
  }
  return out;
}

/** Superellipse cross-section point with separate front/back depth. θ=0 → +x (wearer's left), θ=π/2 → +z (front). */
function section(a, bf, bb, zc, n, th) {
  const c = Math.cos(th), s = Math.sin(th), e = 2 / n;
  const x = a * Math.sign(c) * Math.pow(Math.abs(c), e);
  const z = zc + (s >= 0 ? bf : bb) * Math.sign(s) * Math.pow(Math.abs(s), e);
  return [x, z];
}

/* ======================= anatomy ======================= */
// y (0 = crotch line, 1 = base of neck), half-width, front depth, back depth, z offset, superellipse exponent
const BODY = [
  [-0.07, 0.168, 0.094, 0.108, 0.000, 2.2],
  [0.02, 0.180, 0.098, 0.118, -0.004, 2.2],
  [0.10, 0.176, 0.095, 0.104, 0.000, 2.2],
  [0.20, 0.152, 0.094, 0.086, 0.006, 2.3],
  [0.30, 0.157, 0.104, 0.089, 0.010, 2.3],
  [0.40, 0.166, 0.119, 0.095, 0.012, 2.4],
  [0.48, 0.172, 0.127, 0.100, 0.010, 2.5],
  [0.55, 0.183, 0.119, 0.104, 0.002, 2.6],
  [0.60, 0.203, 0.100, 0.100, -0.006, 2.9],
  [0.635, 0.206, 0.085, 0.090, -0.010, 3.0],
  [0.665, 0.150, 0.070, 0.075, -0.010, 2.6],
  [0.69, 0.092, 0.060, 0.062, -0.008, 2.2],
  [0.72, 0.062, 0.056, 0.058, -0.006, 2.0],
  [0.82, 0.054, 0.050, 0.054, -0.004, 2.0]
];
const bodyAt = (y) => interp(BODY, y);

// Precomputed "max above" tables so cloth can hang straight down from the widest point above it.
const TABLE_N = 240, T_MIN = -0.1, T_MAX = 0.75;
const maxAbove = (() => {
  const a = new Float32Array(TABLE_N), bf = new Float32Array(TABLE_N), bb = new Float32Array(TABLE_N);
  let ma = 0, mf = 0, mb = 0;
  for (let i = TABLE_N - 1; i >= 0; i--) {
    const y = T_MIN + (T_MAX - T_MIN) * (i / (TABLE_N - 1));
    const [ba, bfr, bbk] = bodyAt(y);
    if (y <= 0.56) ma = Math.max(ma, ba); else ma = ba;   // above the armpit the cloth follows the shoulder
    if (y <= 0.50) mf = Math.max(mf, bfr); else mf = bfr; // hangs from the chest in front
    if (y <= 0.62) mb = Math.max(mb, bbk); else mb = bbk; // and from the shoulder blades behind
    a[i] = ma; bf[i] = mf; bb[i] = mb;
  }
  return (y) => {
    const f = clamp((y - T_MIN) / (T_MAX - T_MIN), 0, 1) * (TABLE_N - 1);
    const i = Math.floor(f), j = Math.min(TABLE_N - 1, i + 1), t = f - i;
    return [lerp(a[i], a[j], t), lerp(bf[i], bf[j], t), lerp(bb[i], bb[j], t)];
  };
})();

/** Arm path for one side (sgn = +1 wearer's left / screen right when facing camera). */
function armPoints(sgn, pose) {
  const out = pose.armOut || 0, fwd = pose.armFwd || 0;
  return [
    new THREE.Vector3(sgn * 0.205, 0.622, -0.008),
    new THREE.Vector3(sgn * (0.226 + out * 0.5), 0.47, -0.022 + fwd * 0.4),
    new THREE.Vector3(sgn * (0.24 + out), 0.33, -0.032 + fwd),
    new THREE.Vector3(sgn * (0.248 + out * 1.25), 0.2, -0.008 + fwd * 1.4),
    new THREE.Vector3(sgn * (0.252 + out * 1.45), 0.075, 0.02 + fwd * 1.7)
  ];
}

/* ======================= geometry builders ======================= */
/** Tube along a curve with radius(t) and an optional radial offset(t, φ). Optional vertex colour fn. */
function variableTube(curve, segs, radial, radiusFn, offsetFn, opts = {}) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], uv = [], col = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  const down = opts.sag ? new THREE.Vector3(0, -1, 0) : null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const r = radiusFn(t);
    for (let j = 0; j <= radial; j++) {
      const phi = (j / radial) * Math.PI * 2;
      const sin = Math.sin(phi), cos = -Math.cos(phi);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], cos).addScaledVector(frames.binormals[i], sin).normalize();
      let rr = r + (offsetFn ? offsetFn(t, phi, N) : 0);
      let x = P.x + N.x * rr, y = P.y + N.y * rr, z = P.z + N.z * rr;
      if (down) { const sag = opts.sag(t) * Math.max(0, -N.y); y -= sag; }
      pos.push(x, y, z);
      uv.push(j / radial, t);
      if (opts.colorFn) col.push(...opts.colorFn(t, phi, N));
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // make faces point outward whatever the Frenet frame handedness turned out to be
  {
    const A = new THREE.Vector3(pos[idx[0] * 3], pos[idx[0] * 3 + 1], pos[idx[0] * 3 + 2]);
    const B = new THREE.Vector3(pos[idx[1] * 3], pos[idx[1] * 3 + 1], pos[idx[1] * 3 + 2]);
    const C = new THREE.Vector3(pos[idx[2] * 3], pos[idx[2] * 3 + 1], pos[idx[2] * 3 + 2]);
    const nrm = new THREE.Vector3().crossVectors(B.clone().sub(A), C.clone().sub(A));
    const centre = curve.getPointAt(0);
    if (nrm.dot(A.clone().sub(centre)) < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildBodyGeometry(rows = 110, cols = 72) {
  const y0 = BODY[0][0], y1 = BODY[BODY.length - 1][0];
  const pos = [], idx = [];
  for (let i = 0; i <= rows; i++) {
    const y = lerp(y0, y1, i / rows);
    const [a, bf, bb, zc, n] = bodyAt(y);
    for (let j = 0; j < cols; j++) {
      const [x, z] = section(a, bf, bb, zc, n, (j / cols) * Math.PI * 2);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * cols + j, b = a + cols, a1 = i * cols + ((j + 1) % cols), b1 = a1 + cols;
      idx.push(a, b, a1, b, b1, a1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ======================= materials & textures ======================= */
export function mannequinMaterial(kind = 'chrome') {
  if (kind === 'graphite') return new THREE.MeshPhysicalMaterial({ color: '#3b3d42', metalness: 0.88, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  if (kind === 'black') return new THREE.MeshPhysicalMaterial({ color: '#141414', metalness: 0.25, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  return new THREE.MeshPhysicalMaterial({ color: '#e6e8ec', metalness: 1, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.08 });
}

let _knit;
function knitTexture() {
  if (_knit) return _knit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) { x.fillStyle = i % 4 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.12)'; x.fillRect(i, 0, 1, 128); }
  for (let i = 0; i < 2600; i++) { x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.18)'; x.fillRect(Math.random() * 128, Math.random() * 128, 1, 2); }
  _knit = new THREE.CanvasTexture(c);
  _knit.wrapS = _knit.wrapT = THREE.RepeatWrapping;
  _knit.repeat.set(26, 26);
  return _knit;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

/** Fabric canvas: u wraps the body (side seams at u=0 / .5 / 1, front centre u=.75, back centre u=.25), v = height (top = collar). */
function fabricCanvas(p, size) {
  const W = Math.round(size * 1.5), H = size;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = p.color; x.fillRect(0, 0, W, H);

  // knit streaks + slub
  const light = isDark(p.color);
  x.globalAlpha = 0.05;
  x.globalAlpha = 0.025;
  for (let i = 0; i < W; i += 3) { x.fillStyle = i % 6 ? '#fff' : '#000'; x.fillRect(i, 0, 1, H); }
  x.globalAlpha = light ? 0.09 : 0.06;
  for (let i = 0; i < 9000; i++) { x.fillStyle = Math.random() > 0.5 ? '#fff' : '#000'; x.fillRect(Math.random() * W, Math.random() * H, 1, 3); }
  x.globalAlpha = 1;

  // side seams + stitches
  const seamCol = light ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.28)';
  [0, W / 2, W].forEach((sx) => {
    x.fillStyle = seamCol; x.fillRect(sx - 2, 0, 4, H);
  });
  x.strokeStyle = light ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.25)';
  x.setLineDash([size * 0.006, size * 0.005]);
  x.lineWidth = Math.max(1, size / 700);
  x.beginPath(); x.moveTo(0, H * 0.972); x.lineTo(W, H * 0.972); x.stroke();          // hem stitching
  if (p.kind === 'hoodie') {
    // kangaroo pocket on the front panel
    const cx = W * 0.75, top = H * 0.62, bot = H * 0.86, hw = W * 0.085, hb = W * 0.11;
    x.beginPath(); x.moveTo(cx - hw, top); x.lineTo(cx + hw, top); x.lineTo(cx + hb, bot); x.lineTo(cx - hb, bot); x.closePath(); x.stroke();
    x.setLineDash([]);
    x.strokeStyle = light ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.35)';
    x.lineWidth = Math.max(2, size / 400);
    x.beginPath(); x.moveTo(cx - hw, top); x.lineTo(cx - hb * 1.02, bot - H * 0.08); x.stroke();
    x.beginPath(); x.moveTo(cx + hw, top); x.lineTo(cx + hb * 1.02, bot - H * 0.08); x.stroke();
  }
  x.setLineDash([]);

  // prints (drawn on their own layer, then distressed)
  const layer = document.createElement('canvas');
  layer.width = W; layer.height = H;
  const l = layer.getContext('2d');
  const font = (px) => `900 ${px}px Archivo, "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  try { l.fontStretch = 'condensed'; } catch (e) {}
  l.textAlign = 'center'; l.textBaseline = 'alphabetic';

  const imgFront = p.frontImage || null, imgBack = p.backImage || null;
  const frontLines = imgFront ? [] : (p.front || 'BAD|INFLUENCE').toUpperCase().split('|').slice(0, 3);
  const fcx = W * 0.75, fTop = H * (p.kind === 'hoodie' ? 0.30 : 0.27);
  const fSize = H * 0.055;
  l.fillStyle = p.printColor;
  frontLines.forEach((ln, i) => { l.font = font(fSize); l.fillText(ln, fcx, fTop + i * fSize * 0.92, W * 0.14); });
  if (!imgFront) {
    l.fillStyle = p.accent;
    l.fillRect(fcx - W * 0.055, fTop + frontLines.length * fSize * 0.92 - fSize * 0.55, W * 0.11, H * 0.007);
  }

  // back: emblem + big stacked words + tagline (or the uploaded artwork)
  const bcx = W * 0.25, bTop = H * 0.20;
  if (!imgBack) {
  drawEmblem(l, bcx, bTop + H * 0.06, H * 0.075, p.printColor, p.accent);
  const backLines = (p.back || p.front || 'BAD|INFLUENCE').toUpperCase().split('|').slice(0, 3);
  const bSize = H * 0.105;
  l.fillStyle = p.printColor;
  backLines.forEach((ln, i) => { l.font = font(bSize); l.fillText(ln, bcx, bTop + H * 0.24 + i * bSize * 0.9, W * 0.27); });
  l.font = `500 ${Math.round(H * 0.017)}px "IBM Plex Mono", ui-monospace, monospace`;
  if ('letterSpacing' in l) l.letterSpacing = `${Math.round(H * 0.003)}px`;
  const tagY = bTop + H * 0.24 + (backLines.length - 1) * bSize * 0.9 + H * 0.045;
  l.fillStyle = p.accent;
  l.fillText((p.tagline || 'NOT MADE TO FIT IN.').toUpperCase(), bcx, tagY, W * 0.2);
  l.fillStyle = p.printColor;
  l.fillText('BAD INFLUENCE STUDIO', bcx, tagY + H * 0.03, W * 0.2);
  if ('letterSpacing' in l) l.letterSpacing = '0px';
  }

  // distress: knock out specks and scratches so the print reads as screen-printed ink
  l.globalCompositeOperation = 'destination-out';
  const r = rng(hashString(p.front + p.back));
  for (let i = 0; i < 2200; i++) { l.globalAlpha = 0.35 + r() * 0.65; l.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1 + r() * 2.5); }
  l.globalAlpha = 0.5; l.lineWidth = 1;
  for (let i = 0; i < 80; i++) { const sx = r() * W, sy = r() * H; l.beginPath(); l.moveTo(sx, sy); l.lineTo(sx + (r() - 0.5) * 60, sy + (r() - 0.5) * 8); l.stroke(); }
  l.globalAlpha = 1; l.globalCompositeOperation = 'source-over';
  x.globalAlpha = 0.94;
  x.drawImage(layer, 0, 0);
  x.globalAlpha = 1;
  // uploaded print artwork: real proportions, centred on the chest / upper back
  if (imgFront) placeArt(x, imgFront, W * 0.75, H * 0.2, W * 0.125, H * 0.2);
  if (imgBack) placeArt(x, imgBack, W * 0.25, H * 0.155, W * 0.2, H * 0.47);
  return c;
}

function placeArt(ctx, img, cx, top, maxW, maxH) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  // the fabric map packs the whole body circumference into its width, so art is narrowed to keep true proportions
  const SX = 0.72;
  const k = Math.min(maxW / (iw * SX), maxH / ih);
  const w = iw * k * SX, h = ih * k;
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.drawImage(img, cx - w / 2, top, w, h);
  ctx.restore();
}

/**
 * Load a print file for the 3D garment. Transparent margins are trimmed so the artwork sits at its real size.
 * Resolves to a canvas, or null if the image can't be read (e.g. a CORS-blocked host) — the text print is used then.
 */
const _prints = new Map();
export function loadPrint(url, maxSide = 1400) {
  if (!url) return Promise.resolve(null);
  if (_prints.has(url)) return _prints.get(url);
  const job = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let yy = 0; yy < h; yy += 2) for (let xx = 0; xx < w; xx += 2) {
          if (d[(yy * w + xx) * 4 + 3] > 12) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
        }
        if (x1 < 0) return resolve(null);
        const tw = Math.min(w, x1 - x0 + 3), th = Math.min(h, y1 - y0 + 3);
        const out = document.createElement('canvas'); out.width = tw; out.height = th;
        out.getContext('2d').drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
        resolve(out);
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  _prints.set(url, job);
  return job;
}

function drawEmblem(ctx, cx, cy, R, ink, accent) {
  // four-point star wrapped by an orbit — the brand's flare, as a print
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = accent; ctx.lineWidth = R * 0.09;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.5, R * 0.48, -0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? R * 0.16 : R;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** The inside of the garment (seen through the neck, hem and sleeves in ghost mode) is in shadow. */
function darkInside(mat) {
  if (!mat || mat.userData.darkInside) return;
  mat.userData.darkInside = true;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.32;');
  };
  mat.customProgramCacheKey = () => 'bis-dark-inside';
}

function isDark(hex) {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.35;
}

/* ======================= the figure ======================= */
/**
 * params: { garment: 'tee'|'longsleeve'|'hoodie', color, printColor, accent, front, back, tagline,
 *           mannequin: 'chrome'|'graphite'|'black', seed, quality: 'high'|'low' }
 */
export function createFigure(params = {}) {
  const p = Object.assign({
    garment: 'tee', color: '#141414', printColor: '#F3F0E9', accent: '#FF3038',
    front: 'BAD|INFLUENCE', back: 'BAD|INFLUENCE', tagline: 'NOT MADE TO FIT IN.',
    mannequin: 'graphite', seed: 7, quality: 'high'
  }, params);
  const hi = p.quality !== 'low';
  const rand = rng(p.seed);
  const ghostPose = p.mannequin === 'none' || p.mannequin === 'ghost';
  const pose = ghostPose ? { armOut: 0.11, armFwd: 0.01, lean: 0, head: 0 } : { armOut: (rand() - 0.5) * 0.03, armFwd: (rand() - 0.5) * 0.04, lean: (rand() - 0.5) * 0.04, head: (rand() - 0.5) * 0.2 };

  const group = new THREE.Group();
  const bodyMat = mannequinMaterial(p.mannequin);

  /* -- mannequin (skipped in ghost mode: the garment keeps its worn shape with nobody inside) -- */
  const ghost = p.mannequin === 'none' || p.mannequin === 'ghost';
  const armCurves = [];
  [1, -1].forEach((sgn) => armCurves.push(new THREE.CatmullRomCurve3(armPoints(sgn, pose))));
  if (!ghost) {
    const body = new THREE.Mesh(buildBodyGeometry(hi ? 110 : 70, hi ? 72 : 48), bodyMat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, hi ? 48 : 28, hi ? 36 : 20), bodyMat);
    head.scale.set(0.074, 0.112, 0.092);
    head.position.set(0, 0.935, 0.006);
    head.rotation.set(-0.12, pose.head, 0);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), bodyMat);
    pelvis.scale.set(0.168, 0.06, 0.11);
    pelvis.position.set(0, -0.07, 0);
    group.add(body, head, pelvis);

    armCurves.forEach((curve, ai) => {
      const sgn = ai === 0 ? 1 : -1;
      const arm = new THREE.Mesh(variableTube(curve, hi ? 64 : 36, hi ? 24 : 14,
        (t) => interp([[0, 0.054], [0.2, 0.049], [0.47, 0.04], [0.55, 0.039], [0.78, 0.034], [1, 0.027]], t)[0]), bodyMat);
      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), bodyMat);
      delt.position.copy(curve.getPointAt(0.03)).add(new THREE.Vector3(-sgn * 0.004, -0.012, 0));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), bodyMat);
      const tip = curve.getPointAt(1), tan = curve.getTangentAt(1);
      hand.position.copy(tip).addScaledVector(tan, 0.07);
      hand.scale.set(0.034, 0.088, 0.019);
      hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      group.add(arm, delt, hand);
    });
    [1, -1].forEach((sgn) => {
      const leg = new THREE.CatmullRomCurve3([new THREE.Vector3(sgn * 0.092, 0.0, 0), new THREE.Vector3(sgn * 0.098, -0.38, 0.004), new THREE.Vector3(sgn * 0.102, -0.85, 0.0)]);
      group.add(new THREE.Mesh(variableTube(leg, 24, hi ? 24 : 14, (t) => lerp(0.09, 0.058, t)), bodyMat));
    });
  }

  /* -- garment -- */
  const fabric = buildGarment(p, armCurves, hi);
  if (ghost) fabric.group.traverse((o) => { if (o.isMesh) darkInside(o.material); });
  group.add(fabric.group);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.rotation.z = ghost ? 0 : pose.lean;
  group.userData = { params: p, ghost, update: fabric.update, dispose: () => disposeTree(group) };
  return group;
}

/** Knit rib collar: a short band rising from the neckline, slightly hugging the neck, with a rolled top edge. */
function ribBand(ring, height, thick, pull = 0.008) {
  const n = ring.length, pos = [], idx = [];
  const c = ring.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / n);
  const rows = 6;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const lift = height * t, inset = thick * Math.sin(t * Math.PI);
    for (let j = 0; j < n; j++) {
      const v = ring[j], dx = v.x - c.x, dz = v.z - c.z, L = Math.hypot(dx, dz) || 1;
      pos.push(v.x - (dx / L) * (pull * t) + (dx / L) * inset * 0.4, v.y + lift, v.z - (dz / L) * (pull * t) + (dz / L) * inset * 0.4);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = a + n, a1 = i * n + ((j + 1) % n), b1 = a1 + n;
    idx.push(a, a1, b, b, a1, b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildGarment(p, armCurves, hi) {
  const kind = p.garment;
  const group = new THREE.Group();
  const tex = new THREE.CanvasTexture(fabricCanvas({ ...p, kind }, hi ? 1400 : 960));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const dark = isDark(p.color);
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, vertexColors: true, roughness: 0.94, metalness: 0,
    sheen: dark ? 0.6 : 0.35, sheenRoughness: 0.75, sheenColor: new THREE.Color(dark ? '#5a5a5a' : '#ffffff'),
    bumpMap: knitTexture(), bumpScale: 0.6, side: THREE.DoubleSide
  });
  const plainCanvas = document.createElement('canvas');
  plainCanvas.width = plainCanvas.height = 64;
  const pc = plainCanvas.getContext('2d'); pc.fillStyle = p.color; pc.fillRect(0, 0, 64, 64);
  const plainTex = new THREE.CanvasTexture(plainCanvas); plainTex.colorSpace = THREE.SRGBColorSpace;
  const matPlain = mat.clone(); matPlain.map = plainTex;
  const matSolid = matPlain.clone(); matSolid.vertexColors = false;
  const rib = new THREE.MeshPhysicalMaterial({ color: shade(p.color, dark ? 1.25 : 0.9), roughness: 0.9, sheen: 0.4, sheenColor: new THREE.Color('#777'), bumpMap: knitTexture(), bumpScale: 1.2, side: THREE.DoubleSide });

  const isHood = kind === 'hoodie';
  const yHem = isHood ? 0.0 : -0.04;
  const COLS = hi ? 144 : 96, ROWS = hi ? 120 : 72;
  const vTop = 0.735, vBase = yHem - 0.03;

  const pos = new Float32Array((COLS + 1) * (ROWS + 1) * 3);
  const col = new Float32Array((COLS + 1) * (ROWS + 1) * 3);
  const uv = new Float32Array((COLS + 1) * (ROWS + 1) * 2);
  const idx = [];
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
    const a = i * (COLS + 1) + j, b = a + COLS + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const topY = (th) => 0.712 - 0.036 * Math.pow(Math.max(0, Math.sin(th)), 1.6) + 0.004 * Math.max(0, -Math.sin(th));
  const hemY = (th) => yHem + 0.014 * Math.sin(3 * th + 0.7) + 0.008 * Math.sin(7 * th + 1.1);
  const neck = [], hem = [];

  function fill(time = 0) {
    neck.length = 0; hem.length = 0;
    for (let j = 0; j <= COLS; j++) {
      const th = (j / COLS) * Math.PI * 2;
      const s = Math.sin(th);
      const side = Math.exp(-Math.pow(angDist(th, 0), 2) / 0.07) + Math.exp(-Math.pow(angDist(th, Math.PI), 2) / 0.07);
      const front = Math.max(0, s), back = Math.max(0, -s);
      const yT = topY(th), yB = hemY(th);
      for (let i = 0; i <= ROWS; i++) {
        const v = i / ROWS;
        const y = lerp(yB, yT, v);
        const [ba, bfr, bbk, zc, n] = bodyAt(y);
        const [ma, mf, mb] = maxAbove(y);
        // ease: snug at the neck, roomy (oversized) through the body, a touch of flare at the hem
        const roomy = isHood ? 0.06 : 0.05;
        const ease = 0.012 + roomy * smoothstep(0.66, 0.5, y) + 0.012 * smoothstep(0.2, yHem, y);
        const a = (y > 0.56 ? ba + 0.03 * smoothstep(0.7, 0.6, y) : ma + 0.03) + ease;
        const bf = (y > 0.5 ? bfr : mf) + ease * 0.75;
        const bb = (y > 0.62 ? bbk : mb) + ease * 0.75;
        const nn = lerp(2.15, n, smoothstep(0.4, 0.66, y));
        const [x0, z0] = section(a, bf, bb, zc, nn, th);
        // outward direction for fold displacement
        let dx = x0, dz = z0 - zc; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;

        const hang = Math.pow(smoothstep(0.62, yHem, y), 1.1);
        const wobble = time * 0.55;
        const grav = 0.016 * Math.sin(5 * th + 1.3 + 2.2 * y + wobble * 0.6)
          + 0.011 * Math.sin(9 * th - 0.7 - 3.4 * y - wobble * 0.4)
          + 0.005 * Math.sin(16 * th + 2.0 + 5 * y + wobble)
          + 0.008 * Math.sin(3 * th + 0.4) * smoothstep(0.35, yHem, y);
        const dragL = side * smoothstep(0.36, 0.48, y) * smoothstep(0.6, 0.52, y) * 0.009 * Math.sin(66 * y + 10 * Math.abs(s) + 1.1);
        const chest = 0.005 * front * Math.exp(-Math.pow(y - 0.36, 2) / 0.0015) * Math.sin(9 * th + 0.5);
        const backFold = 0.006 * back * smoothstep(0.55, 0.3, y) * Math.sin(5 * th + 2.4 + 4 * y);
        const hemRip = 0.006 * Math.sin(9 * th + 0.3) * smoothstep(0.12, yHem, y);
        const d = hang * grav + dragL + chest + backFold + hemRip;

        const k = (i * (COLS + 1) + j);
        pos[k * 3] = x0 + dx * d;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = z0 + dz * d;

        // ambient occlusion: fold valleys, armpits, under the collar
        const valley = clamp(-d / 0.016, 0, 1);
        const pit = side * smoothstep(0.42, 0.56, y) * smoothstep(0.64, 0.56, y);
        const ao = clamp(1 - valley * 0.32 - pit * 0.38 - 0.18 * smoothstep(yT - 0.02, yT, y) - 0.12 * smoothstep(yB + 0.03, yB, y), 0.35, 1);
        col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;

        uv[k * 2] = 1 - j / COLS;
        uv[k * 2 + 1] = clamp((y - vBase) / (vTop - vBase), 0, 1);

        if (i === ROWS && j < COLS) neck.push(new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
        if (i === 0 && j < COLS) hem.push(new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
  }
  // the canvas is drawn with v pointing down; flip so the print sits upright
  tex.flipY = true;
  fill(0);
  const shell = new THREE.Mesh(geo, mat);
  group.add(shell);

  // rib collar + rolled hem
  const collar = new THREE.Mesh(ribBand(neck, isHood ? 0.026 : 0.02, isHood ? 0.006 : 0.0045), rib);
  const hemCurve = new THREE.CatmullRomCurve3(hem, true);
  const hemMesh = isHood
    ? new THREE.Mesh(ribBand(hem, -0.06, 0.006, -0.012), rib)
    : new THREE.Mesh(new THREE.TubeGeometry(hemCurve, COLS, 0.005, 8, true), matSolid);
  group.add(collar, hemMesh);

  // sleeves
  const long = kind !== 'tee';
  armCurves.forEach((arm, ai) => {
    const sgn = ai === 0 ? 1 : -1;
    const tEnd = long ? 0.97 : 0.42;
    const pts = [
      new THREE.Vector3(sgn * 0.15, 0.565, -0.008),
      new THREE.Vector3(sgn * 0.232, 0.572, -0.01),
      arm.getPointAt(tEnd * 0.5).add(new THREE.Vector3(sgn * 0.012, 0, 0)),
      arm.getPointAt(tEnd).add(new THREE.Vector3(sgn * 0.01, 0, 0))
    ];
    const sCurve = new THREE.CatmullRomCurve3(pts);
    const rFn = (t) => interp(long
      ? [[0, 0.07], [0.18, 0.074], [0.45, 0.064], [0.8, 0.054], [0.93, 0.048], [1, 0.04]]
      : [[0, 0.07], [0.25, 0.08], [0.6, 0.074], [1, 0.07]], t)[0];
    const off = (t, phi) => {
      const f = 0.006 * Math.sin(5 * phi + t * 6 + ai) * t + 0.005 * Math.sin(3 * phi + 1 + ai);
      const bunch = long ? 0.006 * Math.sin(phi * 4 + t * 34) * smoothstep(0.7, 0.98, t) : 0;
      return f + bunch;
    };
    const colorFn = (t) => {
      const seam = 1 - 0.35 * Math.exp(-Math.pow((t - 0.24) / 0.012, 2));
      const end = 1 - 0.25 * smoothstep(0.92, 1, t);
      const v = clamp(seam * end * (0.85 + 0.15 * t), 0.4, 1);
      return [v, v, v];
    };
    const sGeo = variableTube(sCurve, hi ? 60 : 36, hi ? 40 : 24, rFn, off, { colorFn, sag: (t) => 0.012 * t });
    group.add(new THREE.Mesh(sGeo, matPlain));
    // sleeve hem / cuff
    const endFrames = sCurve.computeFrenetFrames(1, false);
    const cuffR = rFn(1) + (long ? 0.004 : 0.002);
    const ring = new THREE.Mesh(long ? new THREE.CylinderGeometry(cuffR * 0.92, cuffR * 0.85, 0.05, 32, 1, true) : new THREE.TorusGeometry(cuffR, 0.004, 8, 48), long ? rib : matSolid);
    ring.position.copy(sCurve.getPointAt(1));
    const tan = sCurve.getTangentAt(1);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, long ? 1 : 0, long ? 0 : 1), tan);
    if (long) ring.position.addScaledVector(tan, 0.02);
    void endFrames;
    group.add(ring);
  });

  if (isHood) {
    // hood resting on the shoulders + drawcords
    const hoodGeo = new THREE.SphereGeometry(1, hi ? 48 : 28, hi ? 24 : 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const hood = new THREE.Mesh(hoodGeo, matSolid);
    const ghostHood = p.mannequin === 'none' || p.mannequin === 'ghost';
    if (ghostHood) {
      // nobody inside: the hood folds down flat over the upper back
      hood.scale.set(0.165, 0.075, 0.13);
      hood.position.set(0, 0.66, -0.1);
      hood.rotation.set(-2.35, 0, 0);
      darkInside(hood.material);
    } else {
      hood.scale.set(0.17, 0.11, 0.15);
      hood.position.set(0, 0.69, -0.07);
      hood.rotation.set(-1.95, 0, 0);
    }
    group.add(hood);
    [-1, 1].forEach((sgn) => {
      const cord = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sgn * 0.035, 0.69, 0.07), new THREE.Vector3(sgn * 0.04, 0.6, 0.12), new THREE.Vector3(sgn * 0.045, 0.48, 0.15)
      ]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(cord, 20, 0.004, 6), rib));
    });
  }

  return {
    group,
    update(t) { fill(t); }
  };
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        ['map', 'bumpMap'].forEach((k) => { if (m[k] && m[k] !== _knit) m[k].dispose(); });
        m.dispose();
      });
    }
  });
}

/* ======================= chrome sculpture ======================= */
export function buildSculpture({ accent = '#FF3038', isSmall = false, seed = 1337 } = {}) {
  const rand = rng(seed);
  class Knot extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2, p = 2, q = 5;
      const r = 0.62 + 0.24 * Math.cos(q * a);
      return target.set(r * Math.cos(p * a), r * Math.sin(p * a) * 0.92, 0.36 * Math.sin(q * a));
    }
  }
  const curve = new Knot();
  const chrome = new THREE.MeshPhysicalMaterial({ color: '#eceef2', metalness: 1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.05 });
  const blood = new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.75, roughness: 0.18, clearcoat: 1, emissive: accent, emissiveIntensity: 0.12 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, isSmall ? 220 : 360, 0.085, isSmall ? 10 : 16, true), chrome));
  const cone = new THREE.ConeGeometry(0.038, 1, isSmall ? 6 : 10, 1);
  cone.translate(0, 0.5, 0);
  const N = isSmall ? 150 : 260, redEvery = 9;
  const silver = new THREE.InstancedMesh(cone, chrome, N);
  const red = new THREE.InstancedMesh(cone, blood, Math.ceil(N / redEvery));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3(), tan = new THREE.Vector3(), dir = new THREE.Vector3(), out = new THREE.Vector3();
  let si = 0, ri = 0;
  for (let i = 0; i < N; i++) {
    const t = rand();
    curve.getPointAt(t, p); curve.getTangentAt(t, tan);
    out.copy(p).normalize().multiplyScalar(0.8);
    dir.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).add(out);
    dir.addScaledVector(tan, -dir.dot(tan)).normalize();
    const long = rand() < 0.14;
    const len = long ? 0.9 + rand() * 1.5 : 0.18 + Math.pow(rand(), 1.6) * 0.6;
    const thick = long ? 0.9 + rand() * 0.8 : 0.6 + rand() * 0.7;
    q.setFromUnitVectors(up, dir); s.set(thick, len, thick); m.compose(p, q, s);
    if (i % redEvery === 0 && ri < red.count) red.setMatrixAt(ri++, m); else silver.setMatrixAt(si++, m);
  }
  silver.count = si; red.count = ri;
  group.add(silver, red);
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25 + k * 0.28, 0.012, 8, 160), chrome);
    ring.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
    ring.userData.spin = (rand() - 0.5) * 0.4;
    group.add(ring);
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

/* ======================= studio ======================= */
function backdropTexture(accent, w = 512, h = 640) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a1a1a'); g.addColorStop(0.55, '#121212'); g.addColorStop(1, '#070707');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // concrete: blotches + pores
  const r = rng(42);
  for (let i = 0; i < 70; i++) {
    const rg = x.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 30 + r() * 120);
    const v = r() > 0.5 ? 255 : 0;
    rg.addColorStop(0, `rgba(${v},${v},${v},${0.025 + r() * 0.03})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg; x.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < 5000; i++) { x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.25)'; x.fillRect(r() * w, r() * h, 1, 1); }
  // soft top light + acid spill
  const top = x.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.18, w * 0.75);
  top.addColorStop(0, 'rgba(255,255,255,.12)'); top.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = top; x.fillRect(0, 0, w, h);
  const red = x.createRadialGradient(w * 0.92, h * 0.55, 0, w * 0.92, h * 0.55, w * 0.7);
  const ac = new THREE.Color(accent);
  red.addColorStop(0, `rgba(${ac.r * 255 | 0},${ac.g * 255 | 0},${ac.b * 255 | 0},.28)`); red.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = red; x.fillRect(0, 0, w, h);
  const vig = x.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.6)');
  x.fillStyle = vig; x.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createStudio(renderer, { accent = '#FF3038', backdrop = true, shadowSize = 1024 } = {}) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.background = new THREE.Color('#050505');
  const panel = (color, w, h, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m);
  };
  panel('#ffffff', 7, 1.6, [0, 4.5, 0.5], [Math.PI / 2, 0, 0]);
  panel('#ffffff', 1.2, 6, [-5, 0.5, 1.5], [0, Math.PI / 2, 0]);
  panel('#cfd2d8', 0.7, 6, [4.5, 0.5, 3], [0, -Math.PI / 2.4, 0]);
  panel(accent, 1.6, 7, [5, 0, -1.5], [0, -Math.PI / 2, 0]);
  panel(accent, 6, 0.5, [0, -3.5, -3], [-Math.PI / 4, 0, 0]);
  panel('#2c2c2c', 12, 5, [0, -2, -6], [0, 0, 0]);
  panel('#1c1c1c', 12, 12, [0, -3.2, 0], [Math.PI / 2, 0, 0]);
  scene.environment = pmrem.fromScene(env, 0.02).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.9;
  pmrem.dispose();
  if (backdrop) scene.background = backdropTexture(accent);

  scene.add(new THREE.HemisphereLight('#f3f0e9', '#0b0b0b', 0.35));
  const key = new THREE.DirectionalLight('#fff4e8', 2.4);
  key.position.set(-2.2, 3.2, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 1.8, bottom: -1.2, near: 0.5, far: 12 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 4;
  const fill = new THREE.DirectionalLight('#dfe4ff', 0.35);
  fill.position.set(2.5, 1, 3);
  const rim = new THREE.DirectionalLight(accent, 3.4);
  rim.position.set(2.6, 1.6, -2.4);
  const rim2 = new THREE.DirectionalLight('#ffffff', 1.2);
  rim2.position.set(-2.8, 2.2, -2.2);
  scene.add(key, fill, rim, rim2);

  // a wall behind the figure that only shows the cast shadow
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.ShadowMaterial({ opacity: 0.45 }));
  wall.position.set(0, 0.3, -0.85);
  wall.receiveShadow = true;
  scene.add(wall);

  const camera = new THREE.PerspectiveCamera(26, 4 / 5, 0.05, 50);
  return { scene, camera, key, rim, wall };
}

/* ======================= camera views ======================= */
// yaw rotates the figure (lights stay put, so every view is lit like the same set).
export const VIEWS = {
  front: { yaw: 0.0, target: [0, 0.42, 0], dist: 3.0, elev: 0.08 },
  front34: { yaw: 0.62, target: [0, 0.42, 0], dist: 3.0, elev: 0.1 },
  side: { yaw: 1.45, target: [0, 0.42, 0], dist: 3.0, elev: 0.08 },
  back34: { yaw: 2.5, target: [0, 0.42, 0], dist: 3.0, elev: 0.1 },
  back: { yaw: Math.PI, target: [0, 0.42, 0], dist: 3.0, elev: 0.08 },
  print: { yaw: 0.12, target: [0, 0.46, 0.1], dist: 1.05, elev: 0.02 },
  backprint: { yaw: Math.PI - 0.15, target: [0, 0.4, -0.08], dist: 1.35, elev: 0.03 },
  collar: { yaw: 0.45, target: [0, 0.66, 0.05], dist: 0.75, elev: 0.08 }
};

export function frameView(studio, figure, viewName, aspect) {
  const v = VIEWS[viewName] || VIEWS.front;
  figure.rotation.y = -v.yaw;
  const cam = studio.camera;
  cam.aspect = aspect;
  // ghost garments (no mannequin) are framed tighter, on the garment itself
  const ghost = figure.userData && figure.userData.ghost;
  const full = v.dist >= 2.5;
  const ty = ghost && full ? v.target[1] - 0.06 : v.target[1];
  const elev = ghost && full ? v.elev + 0.22 : v.elev;
  // keep the same framing on wide and tall images
  const dist = v.dist * (ghost && full ? 0.78 : 1) * (aspect < 0.78 ? 0.78 / aspect : 1);
  cam.position.set(v.target[0], ty + elev, v.target[2] + dist);
  cam.lookAt(v.target[0], ty, v.target[2]);
  cam.updateProjectionMatrix();
}

/* ======================= mock renderer (stills) ======================= */
let _mock = null;
function mockRenderer() {
  if (_mock) return _mock;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const studio = createStudio(renderer, { accent: '#FF3038', backdrop: true, shadowSize: 1024 });
  _mock = { renderer, studio, figures: new Map() };
  return _mock;
}

/** Render a still. params = figure params + { view }. Returns a JPEG data URL. */
export async function renderMock(params, { width = 720, height = 900 } = {}) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
  const M = mockRenderer();
  const key = JSON.stringify([params.garment, params.color, params.printColor, params.front, params.back, params.mannequin, params.seed, params.frontUrl, params.backUrl]);
  let fig = M.figures.get(key);
  if (!fig) {
    if (M.figures.size > 3) { const [k0, f0] = M.figures.entries().next().value; f0.userData.dispose(); M.figures.delete(k0); }
    const [frontImage, backImage] = await Promise.all([loadPrint(params.frontUrl), loadPrint(params.backUrl)]);
    fig = createFigure({ ...params, frontImage, backImage, quality: width > 600 ? 'high' : 'low' });
    M.figures.set(key, fig);
  }
  M.studio.scene.children.filter((c) => c.userData && c.userData.isFigure).forEach((c) => M.studio.scene.remove(c));
  fig.userData.isFigure = true;
  M.studio.scene.add(fig);
  M.renderer.setSize(width, height, false);
  frameView(M.studio, fig, params.view || 'front', width / height);
  M.renderer.render(M.studio.scene, M.studio.camera);
  return M.renderer.domElement.toDataURL('image/jpeg', 0.86);
}

/* ======================= interactive viewer ======================= */
/**
 * mountViewer(canvas, params, { backdrop, autoRotate, onReady })
 * Real 3D, so drag-to-rotate is genuine. Pauses offscreen; static under reduced motion.
 */
export function mountViewer(canvas, params, opts = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = window.matchMedia('(max-width: 749px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: !opts.backdrop });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  const studio = createStudio(renderer, { accent: params.accent || '#FF3038', backdrop: !!opts.backdrop, shadowSize: small ? 512 : 1024 });
  const fig = createFigure({ ...params, quality: small ? 'low' : 'high' });
  studio.scene.add(fig);
  const view = params.view || 'front34';
  let yaw = (VIEWS[view] || VIEWS.front34).yaw, vel = 0, dragging = false, lastX = 0, running = false, visible = true, raf = 0;
  const clock = new THREE.Clock();

  function size() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    frameView(studio, fig, view, Math.max(1, r.width) / Math.max(1, r.height));
  }
  function draw() {
    fig.rotation.y = -yaw;
    renderer.render(studio.scene, studio.camera);
  }
  function loop() {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta());
    if (!dragging) { yaw += (opts.autoRotate === false ? 0 : dt * 0.25) + vel; vel *= 0.92; }
    draw();
    raf = requestAnimationFrame(loop);
  }
  const play = () => { if (running || reduce || !visible || document.hidden) return; running = true; clock.getDelta(); raf = requestAnimationFrame(loop); };
  const pause = () => { running = false; cancelAnimationFrame(raf); };

  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) * 0.01; lastX = e.clientX;
    yaw -= dx; vel = -dx * 0.5;
    if (!running) draw();
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { yaw += 0.25; draw(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { yaw -= 0.25; draw(); e.preventDefault(); }
  });

  new ResizeObserver(() => { size(); draw(); }).observe(canvas);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? play() : pause(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  size(); draw(); play();
  opts.onReady && opts.onReady();
  return { renderer, studio, figure: fig, destroy() { pause(); fig.userData.dispose(); renderer.dispose(); } };
}

/* ======================= product → mock params ======================= */
const COLOR_WORDS = {
  black: '#141414', 'jet black': '#101010', charcoal: '#2b2b2d', grey: '#7d7d7f', gray: '#7d7d7f', 'heather grey': '#9a9a9c',
  'off-white': '#ECE8DF', 'off white': '#ECE8DF', white: '#F4F4F2', cream: '#ECE5D3', ecru: '#E6DECB', bone: '#E3DCCB',
  red: '#B3121B', maroon: '#5A1218', navy: '#1B2233', olive: '#4A4E34', brown: '#4B3527', sand: '#CBB894'
};
export function colorFromName(name, fallback = '#141414') {
  if (!name) return fallback;
  const k = String(name).trim().toLowerCase();
  return COLOR_WORDS[k] || (k.startsWith('#') ? k : fallback);
}
export function garmentFromType(type, title = '') {
  const s = `${type} ${title}`.toLowerCase();
  if (/hood/.test(s)) return 'hoodie';
  if (/long ?sleeve|\bls\b|crew ?neck|sweat/.test(s)) return 'longsleeve';
  return 'tee';
}
export function printFromTitle(title = '') {
  const words = String(title).toUpperCase().replace(/\b(TEE|T-SHIRT|TSHIRT|HOODIE|LONG SLEEVE|LONGSLEEVE|SWEATSHIRT)\b/g, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'BAD|INFLUENCE';
  if (words.length <= 2) return words.join('|');
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')].join('|');
}
