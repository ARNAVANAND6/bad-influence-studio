/*
 * BAD INFLUENCE STUDIO — homepage hero scene (ES module, homepage only)
 *  "mannequin" (default): a chrome mannequin wearing the hero garment, turned three-quarters away so the
 *               back print, shoulder drape and sleeves read, with the chrome barbed sculpture floating
 *               behind it and acid-red rim light. Drag rotates the mannequin a full turn (it is real 3D).
 *  "sculpture" (default, as in the reference): the chrome barbed knot, large, right of the headline.
 *  "tee":       the 3D T-shirt (no mannequin) turning slowly in front of the sculpture, print files mapped on.
 * Loads after first paint; any failure (no WebGL, Save-Data, module error) leaves the poster in place.
 * Navigation, prices and buttons are never inside the canvas.
 */
const hero = document.querySelector('[data-hero]');
if (hero) boot(hero);

function boot(root) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = window.matchMedia('(max-width: 749px)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (root.dataset['3d'] !== 'true') return fallback(root, 'disabled');
  if (isSmall && root.dataset['3dMobile'] !== 'true') return fallback(root, 'mobile-off');
  if (saveData) return fallback(root, 'save-data');
  if (!hasWebGL()) return fallback(root, 'no-webgl');

  const start = () => Promise.all([import('three'), import('bis-3d')])
    .then(([THREE, B]) => init(THREE, B, root, { reduceMotion, isSmall }))
    .catch((err) => { console.warn('[BIS] 3D hero unavailable, showing poster.', err); fallback(root, 'load-failed'); });
  if (document.readyState === 'complete') idle(start);
  else window.addEventListener('load', () => idle(start), { once: true });
}
function idle(fn) { ('requestIdleCallback' in window) ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 250); }
function hasWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
function fallback(root, reason) { root.classList.add('hero--fallback'); root.dataset.fallback = reason; }

async function init(THREE, B, root, { reduceMotion, isSmall }) {
  const ds = root.dataset;
  const canvas = root.querySelector('[data-hero-canvas]');
  const accent = ds.accent || '#FF3038';
  const mode = ['sculpture', 'tee', 'mannequin'].includes(ds.object) ? ds.object : 'sculpture';
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isSmall, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 2));
  const studio = B.createStudio(renderer, { accent, backdrop: false, shadowSize: isSmall ? 1024 : 2048 });
  const { scene, camera } = studio;
  camera.fov = 28;
  studio.wall.material.opacity = 0.55;
  studio.wall.position.z = -1.1;

  const rig = new THREE.Group();
  scene.add(rig);

  let figure = null;
  if (mode === 'mannequin' || mode === 'tee') {
    const dark = isDark(ds.teeColor || '#141414');
    const [frontImage, backImage] = await Promise.all([B.loadPrint(ds.printFrontUrl), B.loadPrint(ds.printBackUrl)]);
    figure = B.createFigure({
      frontImage, backImage,
      garment: ds.garment || 'tee',
      color: ds.teeColor || '#141414',
      printColor: ds.printColor || (dark ? '#F3F0E9' : '#0d0d0d'),
      accent,
      front: ds.print || 'BAD|INFLUENCE',
      back: ds.backPrint || ds.print || 'BAD|INFLUENCE',
      tagline: ds.tagline || 'NOT MADE TO FIT IN.',
      mannequin: mode === 'tee' ? 'none' : (ds.mannequin || 'chrome'),
      seed: 11,
      quality: isSmall ? 'low' : 'high'
    });
    if (mode === 'tee') { figure.scale.setScalar(1.45); figure.position.y = -0.12; }
    rig.add(figure);
  }

  let sculpture = null;
  if (mode === 'sculpture' || ds.sculpture !== 'false') {
    sculpture = B.buildSculpture({ accent, isSmall });
    if (mode === 'mannequin') {
      sculpture.scale.setScalar(0.26);
      sculpture.position.set(0.44, 0.74, -0.6);
    } else if (mode === 'tee') {
      sculpture.scale.setScalar(0.5);
      sculpture.position.set(0.1, 0.5, -1.2);
    } else {
      sculpture.scale.setScalar(0.62);
      sculpture.position.set(0, 0.45, 0);
    }
    rig.add(sculpture);
  }

  /* ---- framing per viewport shape: [lookX, lookY, distance] ---- */
  let look = new THREE.Vector3(), dist = 3.3;
  function layout() {
    const r = root.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const a = w / h;
    if (mode === 'tee') {
      if (a < 0.8) { look.set(0.02, 0.28, 0); dist = 5.4; }
      else if (a < 1.25) { look.set(-0.45, 0.42, 0); dist = 4.2; }
      else { look.set(-0.85, 0.42, 0); dist = 3.9; }
    } else if (mode === 'mannequin') {
      if (a < 0.8) { look.set(0.04, 0.02, 0); dist = 5.9; }          // phone: figure between header and headline
      else if (a < 1.25) { look.set(-0.36, 0.3, 0); dist = 3.9; }   // tablet
      else { look.set(-0.78, 0.36, 0); dist = 3.6; }                // desktop: figure right of centre
    } else {
      if (a < 0.8) { look.set(0, -0.2, 0); dist = 6.2; }
      else if (a < 1.25) { look.set(-0.7, 0.3, 0); dist = 5.4; }
      else { look.set(-1.25, 0.38, 0); dist = 5.0; }
    }
  }
  layout();

  /* ---- input ---- */
  const hint = root.querySelector('[data-hero-hint]');
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (window.matchMedia('(pointer: fine)').matches && !reduceMotion) {
    root.addEventListener('pointermove', (e) => {
      const r = root.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    root.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; });
  }
  const baseYaw = mode === 'tee' ? 0.55 : 2.45; // tee: front three-quarter; mannequin: three-quarter rear so the back print shows
  let yaw = 0, vel = 0, dragging = false, lastX = 0, running = false, visible = true, raf = 0;
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button, input, select')) return;
    dragging = true; lastX = e.clientX; vel = 0;
    hint && hint.classList.add('is-hidden');
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) * 0.008; lastX = e.clientX;
    yaw += dx; vel = dx;
    if (!running) frame(0.016, clock.getElapsedTime());
  });
  const end = () => { dragging = false; };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);

  let scrollP = 0;
  const onScroll = () => { const r = root.getBoundingClientRect(); scrollP = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height))); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- loop ---- */
  const clock = new THREE.Clock();
  const target = new THREE.Vector3();
  let clothT = 0, clothAcc = 0;
  function frame(dt, t) {
    const motion = reduceMotion ? 0 : 1;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    if (!dragging) { yaw += vel; vel *= 0.94; }

    if (figure) {
      figure.rotation.y = mode === 'tee'
        ? -baseYaw + t * 0.3 * motion + yaw + scrollP * 1.2 * motion
        : -(baseYaw + Math.sin(t * 0.22) * 0.32 * motion) + yaw + scrollP * 0.9 * motion;
      if (mode === 'tee') figure.position.y = -0.12 + Math.sin(t * 0.7) * 0.025 * motion;
      // cloth breathes slowly; recompute at ~20fps on desktop only
      clothAcc += dt;
      if (motion && !isSmall && clothAcc > 0.05) { clothT += clothAcc; clothAcc = 0; figure.userData.update(clothT); }
    }
    if (sculpture) {
      sculpture.rotation.y = 0.2 + t * 0.12 * motion + (mode === 'sculpture' ? yaw : 0);
      sculpture.rotation.x = 0.35 + Math.sin(t * 0.3) * 0.12 * motion;
      sculpture.position.y = (mode === 'mannequin' ? 0.74 : mode === 'tee' ? 0.5 : 0.45) + Math.sin(t * 0.6) * 0.03 * motion;
      sculpture.children.forEach((c) => { if (c.userData.spin) c.rotation.z += c.userData.spin * 0.016 * motion; });
    }

    target.copy(look);
    target.y += scrollP * 0.25 * motion;
    camera.position.set(look.x + pointer.x * 0.22, look.y + 0.12 - pointer.y * 0.12 + scrollP * 0.35 * motion, dist + scrollP * 0.9 * motion);
    camera.lookAt(target);
    renderer.render(scene, camera);
  }
  function loop() {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta());
    frame(dt, clock.elapsedTime);
    raf = requestAnimationFrame(loop);
  }
  const play = () => { if (running || reduceMotion || !visible || document.hidden) return; running = true; clock.getDelta(); raf = requestAnimationFrame(loop); };
  const pause = () => { running = false; cancelAnimationFrame(raf); };

  new ResizeObserver(() => { layout(); if (!running) frame(0.016, clock.getElapsedTime()); }).observe(root);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? play() : pause(); }, { threshold: 0.01 }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); pause(); fallback(root, 'context-lost'); });

  frame(0.016, 0);
  root.classList.add('hero--3d-ready');
  play();
}

function isDark(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return r * 0.3 + g * 0.59 + b * 0.11 < 100;
}
