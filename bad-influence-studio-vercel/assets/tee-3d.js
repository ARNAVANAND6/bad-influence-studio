/*
 * BAD INFLUENCE STUDIO — tee-3d.js
 * <bis-tee3d> : the interactive 3D T-shirt.
 *
 * A real-time 3D garment (oversized tee, long sleeve or hoodie) built by bis-3d.js — cloth shell with folds,
 * rib collar, hems and seams — with the product's own print files mapped onto the fabric, so the artwork
 * bends with every fold. Visitors can:
 *   drag to turn it (and tilt a little), pinch / scroll / +− to zoom, jump to Front, Back or Side,
 *   pause the slow 360° spin, and switch colours (it follows the colour picked on the product page).
 *
 * Config comes from the element's data-tee3d JSON (written by snippets/tee-3d.liquid):
 *   { garment, color, colors:[{name,hex}], printFront, printBack, printFrontAlt, printBackAlt,
 *     print, backPrint, mannequin:'none'|'chrome'|'graphite'|'black', view, autoRotate, backdrop, title }
 * Three.js and bis-3d.js are only downloaded when the element comes near the screen (or is opened).
 * No WebGL / Save-Data → the poster stays and the controls hide. Prices, cart and variant state never
 * live in here; they stay in the HTML product form.
 */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
let libs = null;
const loadLibs = () => libs || (libs = Promise.all([import('three'), import('bis-3d')]));

function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
function hexDark(hex) {
  const c = String(hex || '#141414').replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return r * 0.3 + g * 0.59 + b * 0.11 < 100;
}
const VIEW_YAW = { front: 0, front34: 0.6, side: Math.PI / 2, back34: 2.5, back: Math.PI };

class BisTee3d extends HTMLElement {
  connectedCallback() {
    if (this._init) return;
    this._init = true;
    try { this.cfg = JSON.parse(this.dataset.tee3d || '{}'); } catch (e) { this.cfg = {}; }
    this.canvas = this.querySelector('canvas');
    this.status = this.querySelector('[data-tee3d-status]');
    if (!this.canvas || saveData || !webgl()) { this.classList.add('is-off'); return; }

    this.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tee3d-action]');
      if (!b || !this.contains(b)) return;
      this.action(b.dataset.tee3dAction, b);
    });
    this.querySelectorAll('[data-tee3d-color]').forEach((chip) => {
      chip.addEventListener('click', () => this.setColor(chip.dataset.tee3dColor, chip.dataset.colorName));
    });

    // follow the colour picked in the product form
    const section = this.closest('[data-product-section]');
    if (section) {
      section.addEventListener('bis:variant', (e) => {
        const names = (e.detail && e.detail.optionNames) || [];
        const ci = names.findIndex((n) => /^colou?r$/i.test(String(n)));
        if (ci < 0) return;
        const name = e.detail.options[ci];
        const match = (this.cfg.colors || []).find((c) => String(c.name).toLowerCase() === String(name).toLowerCase());
        this.setColor(match ? match.hex : null, name);
      });
    }

    if (this.hasAttribute('data-eager')) this.boot();
    else if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); this.boot(); } }, { rootMargin: '400px 0px' });
      io.observe(this);
    } else this.boot();
  }

  disconnectedCallback() { this.destroy(); }

  say(msg) { if (this.status) this.status.textContent = msg; }

  async boot() {
    if (this.booting) return this.booting;
    this.classList.add('is-loading');
    this.booting = (async () => {
      try {
        const [THREE, B] = await loadLibs();
        this.THREE = THREE; this.B = B;
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
        this.setup();
        await this.buildFigure();
        this.classList.remove('is-loading');
        this.classList.add('is-live');
        this.say('3D view ready. Drag to turn, scroll or pinch to zoom.');
      } catch (err) {
        console.warn('[BIS] 3D tee unavailable', err);
        this.classList.remove('is-loading');
        this.classList.add('is-off');
      }
    })();
    return this.booting;
  }

  setup() {
    const { THREE, B } = this;
    const small = window.matchMedia('(max-width: 749px)').matches;
    this.small = small;
    const backdrop = this.cfg.backdrop !== false;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: !backdrop, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.6 : 2));
    const studio = B.createStudio(renderer, { accent: this.accent(), backdrop, shadowSize: small ? 1024 : 2048 });
    studio.camera.fov = 24;
    studio.wall.material.opacity = 0.35;
    studio.wall.position.z = -0.9;
    this.renderer = renderer; this.studio = studio;
    this.rig = new THREE.Group();
    studio.scene.add(this.rig);
    this.clock = new THREE.Clock();

    const startView = this.cfg.view || 'front34';
    this.state = {
      yaw: VIEW_YAW[startView] != null ? VIEW_YAW[startView] : 0.6, yawTo: null, pitch: 0.14, vel: 0,
      zoom: 1, zoomTo: 1, dragging: false, spin: this.cfg.autoRotate !== false && !reduceMotion,
      visible: true, running: false
    };
    this.syncSpinButton();
    this.bindInput();
    this._ro = new ResizeObserver(() => { this.resize(); this.draw(); });
    this._ro.observe(this.canvas);
    this._io = new IntersectionObserver(([en]) => { this.state.visible = en.isIntersecting; en.isIntersecting ? this.play() : this.pause(); });
    this._io.observe(this);
    this._vis = () => (document.hidden ? this.pause() : this.play());
    document.addEventListener('visibilitychange', this._vis);
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.pause(); this.classList.add('is-off'); });
    this.resize();
  }

  accent() {
    return this.cfg.accent || getComputedStyle(document.documentElement).getPropertyValue('--acid').trim() || '#FF3038';
  }

  /** Prints for the current colour: light-ink files on dark garments, the "alt" (dark-ink) files on light ones. */
  printsFor(color) {
    const c = this.cfg, dark = hexDark(color);
    const front = dark ? (c.printFront || c.printFrontAlt) : (c.printFrontAlt || c.printFront);
    const back = dark ? (c.printBack || c.printBackAlt) : (c.printBackAlt || c.printBack);
    return { front, back, dark };
  }

  async buildFigure() {
    const { B } = this;
    const color = this.color || this.cfg.color || '#141414';
    this.color = color;
    const pr = this.printsFor(color);
    const [frontImage, backImage] = await Promise.all([B.loadPrint(pr.front), B.loadPrint(pr.back)]);
    const fig = B.createFigure({
      garment: this.cfg.garment || 'tee',
      color,
      printColor: pr.dark ? '#F3F0E9' : '#0d0d0d',
      accent: this.accent(),
      front: this.cfg.print || 'BAD|INFLUENCE',
      back: this.cfg.backPrint || this.cfg.print || 'BAD|INFLUENCE',
      frontImage, backImage,
      mannequin: this.cfg.mannequin || 'none',
      seed: Number(this.cfg.seed) || 7,
      quality: this.small ? 'low' : 'high'
    });
    if (this.figure) { this.rig.remove(this.figure); this.figure.userData.dispose(); }
    this.figure = fig;
    this.rig.add(fig);
    this.frame();
    this.draw();
    this.play();
  }

  async setColor(hex, name) {
    if (!this.cfg) return;
    if (!hex && name) {
      const words = { black: '#141414', 'jet black': '#101010', charcoal: '#2b2b2d', grey: '#7d7d7f', gray: '#7d7d7f', 'off-white': '#ECE8DF', 'off white': '#ECE8DF', white: '#F4F4F2', cream: '#ECE5D3', red: '#B3121B', maroon: '#5A1218', navy: '#1B2233', olive: '#4A4E34', sand: '#CBB894' };
      hex = words[String(name).trim().toLowerCase()] || null;
    }
    if (!hex || hex === this.color) return;
    this.color = hex;
    this.querySelectorAll('[data-tee3d-color]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.tee3dColor === hex)));
    if (!this.figure) return;
    this.classList.add('is-loading');
    await this.buildFigure();
    this.classList.remove('is-loading');
    this.say(`Showing ${name || 'new colour'}.`);
  }

  action(name, btn) {
    const st = this.state;
    if (!st) return;
    if (name in VIEW_YAW) {
      // shortest turn to the requested view
      const target = VIEW_YAW[name];
      const tau = Math.PI * 2;
      const cur = ((st.yaw % tau) + tau) % tau;
      let d = target - cur;
      if (d > Math.PI) d -= tau; if (d < -Math.PI) d += tau;
      st.yawTo = st.yaw + d; st.vel = 0; st.spin = false;
      this.syncSpinButton();
      this.say(`${btn ? btn.textContent.trim() : name} view.`);
    } else if (name === 'spin') {
      st.spin = !st.spin; this.syncSpinButton();
    } else if (name === 'zoom-in') st.zoomTo = Math.min(2.6, st.zoomTo * 1.25);
    else if (name === 'zoom-out') st.zoomTo = Math.max(0.8, st.zoomTo / 1.25);
    else if (name === 'reset') { st.zoomTo = 1; st.pitch = 0.14; st.yawTo = st.yaw - (st.yaw % (Math.PI * 2)) + 0.6; }
    this.play();
    if (!st.running) this.tick(0.016);
  }

  syncSpinButton() {
    const b = this.querySelector('[data-tee3d-action="spin"]');
    if (b && this.state) b.setAttribute('aria-pressed', String(this.state.spin));
  }

  bindInput() {
    const c = this.canvas, st = this.state;
    const pts = new Map();
    let lastX = 0, lastY = 0, pinch0 = 0, zoom0 = 1;
    c.style.touchAction = 'pan-y';
    c.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c.setPointerCapture(e.pointerId);
      st.dragging = true; st.yawTo = null; lastX = e.clientX; lastY = e.clientY;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = st.zoomTo; }
      this.classList.add('is-touched');
      this.play();
    });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0) st.zoomTo = Math.min(2.6, Math.max(0.8, zoom0 * d / pinch0));
        return;
      }
      const dx = (e.clientX - lastX) * 0.01, dy = (e.clientY - lastY) * 0.004;
      lastX = e.clientX; lastY = e.clientY;
      st.yaw += dx; st.vel = dx;
      st.pitch = Math.max(-0.35, Math.min(0.5, st.pitch + dy));
    });
    const up = (e) => { pts.delete(e.pointerId); if (!pts.size) st.dragging = false; pinch0 = 0; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      if (!this.matches(':hover') && document.activeElement !== c) return;
      e.preventDefault();
      st.zoomTo = Math.min(2.6, Math.max(0.8, st.zoomTo * (e.deltaY < 0 ? 1.1 : 0.9)));
      this.play();
    }, { passive: false });
    c.tabIndex = 0;
    c.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft') st.yaw -= 0.3; else if (k === 'ArrowRight') st.yaw += 0.3;
      else if (k === 'ArrowUp') st.pitch = Math.min(0.5, st.pitch + 0.08); else if (k === 'ArrowDown') st.pitch = Math.max(-0.35, st.pitch - 0.08);
      else if (k === '+' || k === '=') st.zoomTo = Math.min(2.6, st.zoomTo * 1.2); else if (k === '-') st.zoomTo = Math.max(0.8, st.zoomTo / 1.2);
      else return;
      e.preventDefault(); st.yawTo = null; this.play(); if (!st.running) this.tick(0.016);
    });
  }

  resize() {
    if (!this.renderer) return;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.studio.camera.aspect = w / h;
    this.studio.camera.updateProjectionMatrix();
    this.frame();
  }

  /** Frame the garment (or the mannequin wearing it) so it fills the stage on any shape. */
  frame() {
    if (!this.studio) return;
    const cam = this.studio.camera, a = cam.aspect || 0.8, st = this.state;
    const ghost = !this.cfg.mannequin || this.cfg.mannequin === 'none';
    const isHood = this.cfg.garment === 'hoodie';
    const ty = ghost ? (isHood ? 0.42 : 0.36) : 0.42;
    const base = ghost ? 2.35 : 3.1;
    const dist = (base * (a < 0.85 ? 0.85 / a : 1)) / (st ? st.zoom : 1);
    const pitch = st ? st.pitch : 0.14;
    cam.position.set(0, ty + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    cam.lookAt(0, ty + (st ? (st.zoom - 1) * 0.06 : 0), 0);
  }

  tick(dt) {
    const st = this.state;
    if (!st || !this.figure) return;
    if (st.yawTo != null) {
      st.yaw += (st.yawTo - st.yaw) * Math.min(1, dt * 6);
      if (Math.abs(st.yawTo - st.yaw) < 0.002) { st.yaw = st.yawTo; st.yawTo = null; }
    } else if (!st.dragging) {
      st.yaw += st.vel + (st.spin ? dt * 0.35 : 0);
      st.vel *= 0.93;
    }
    st.zoom += (st.zoomTo - st.zoom) * Math.min(1, dt * 8);
    this.figure.rotation.y = st.yaw;
    // cloth breathes slowly while it spins (desktop only, ~15 fps)
    if (!this.small && !reduceMotion && st.spin) {
      this._clothAcc = (this._clothAcc || 0) + dt;
      if (this._clothAcc > 0.066) { this._clothT = (this._clothT || 0) + this._clothAcc; this._clothAcc = 0; this.figure.userData.update(this._clothT); }
    }
    this.frame();
    this.draw();
  }

  draw() { if (this.renderer && this.figure) this.renderer.render(this.studio.scene, this.studio.camera); }

  loop() {
    const st = this.state;
    if (!st.running) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.tick(dt);
    // stop the loop when nothing moves (saves battery); any input restarts it
    const idle = !st.spin && !st.dragging && st.yawTo == null && Math.abs(st.vel) < 1e-4 && Math.abs(st.zoomTo - st.zoom) < 1e-3;
    if (idle) { st.running = false; return; }
    this._raf = requestAnimationFrame(() => this.loop());
  }

  play() {
    const st = this.state;
    if (!st || st.running || !st.visible || document.hidden) return;
    st.running = true; this.clock.getDelta();
    this._raf = requestAnimationFrame(() => this.loop());
  }

  pause() { if (this.state) { this.state.running = false; cancelAnimationFrame(this._raf); } }

  destroy() {
    this.pause();
    this._ro && this._ro.disconnect();
    this._io && this._io.disconnect();
    this._vis && document.removeEventListener('visibilitychange', this._vis);
    if (this.figure) this.figure.userData.dispose();
    if (this.renderer) this.renderer.dispose();
    this.renderer = null; this.figure = null;
  }
}

if (!customElements.get('bis-tee3d')) customElements.define('bis-tee3d', BisTee3d);

/* Product page: the "3D VIEW" button swaps the gallery's main stage for the 3D tee (and back). */
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-tee3d-open]');
  const close = e.target.closest('[data-tee3d-close]');
  const btn = open || close;
  if (!btn) return;
  const gallery = btn.closest('[data-gallery]');
  if (!gallery) return;
  const panel = gallery.querySelector('[data-tee3d-panel]');
  if (!panel) return;
  const on = !!open && panel.hidden;
  panel.hidden = !on;
  gallery.classList.toggle('is-3d', on);
  gallery.querySelectorAll('[data-tee3d-open]').forEach((b) => b.setAttribute('aria-expanded', String(on)));
  if (on) {
    const el = panel.querySelector('bis-tee3d');
    if (el) { el.boot(); requestAnimationFrame(() => { el.resize && el.resize(); el.play && el.play(); }); }
    const canvas = panel.querySelector('canvas'); canvas && canvas.focus({ preventScroll: true });
  } else {
    const o = gallery.querySelector('[data-tee3d-open]'); o && o.focus({ preventScroll: true });
  }
});
