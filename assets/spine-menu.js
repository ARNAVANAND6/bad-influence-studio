/*
 * BAD INFLUENCE STUDIO — spine-menu.js
 * Menu drawer: a hanging chain of hyper-real thorny links (glossy black twisted vines, chrome + red spikes),
 * one link per menu item, labels riding their link (three.js, loaded through the page import map).
 * Markup it reads: <div class="spine" data-spine> with <a class="spine__link"> children.
 */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function build(root) {
    if (root.dataset.spineReady) return;
    root.dataset.spineReady = '1';

    // link list sits beside the sculpture
    const list = document.createElement('div');
    list.className = 'spine__list';
    root.querySelectorAll('.spine__link').forEach((a, n) => { a.style.setProperty('--n', n); list.append(a); });
    root.append(list);

    const canvas = document.createElement('canvas');
    canvas.className = 'spine__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.prepend(canvas);

    let THREE;
    try { THREE = await import('three'); } catch (e) { root.classList.add('spine--flat'); return; }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { root.classList.add('spine--flat'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);


    /* ---------- studio: big soft boxes + thin strips + one deep red panel ---------- */
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x030202, side: THREE.BackSide })));
    const panel = (w, h, color, k, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 0, 0); envScene.add(m);
    };
    panel(9, 6, 0xffffff, 2.2, [-6, 7, 6]);      // large soft box, top left front
    panel(16, 0.35, 0xffffff, 9, [0, 9.5, -1]);  // thin overhead strip -> long crisp streaks
    panel(0.3, 14, 0xffffff, 8, [-9.5, 0, 1]);   // thin left strip
    panel(0.25, 12, 0xf2f4ff, 6, [9, 1, 5]);     // thin right rim strip
    panel(11, 9, 0x9a0c16, 1.6, [7, -5, -5]);    // deep red panel, back right low
    panel(6, 2, 0x5a060c, 1, [-5, -8, 2]);       // faint red floor bounce
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.015).texture;
    pmrem.dispose();

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.6); keyLight.position.set(-3, 6, 5); scene.add(keyLight);
    const redLight = new THREE.PointLight(0xb0101a, 6, 25, 1.8); redLight.position.set(2.5, -2, -3); scene.add(redLight);
    scene.fog = new THREE.Fog(0x0a0304, 8, 20); // depth haze, retuned on resize

    /* ---------- micro surface variation (fine roughness noise, no texture files) ---------- */
    const noiseTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'), img = g.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 150 + Math.random() * 70; // rough channel lives in G
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 2);
      return t;
    })();

    /* ---------- materials ---------- */
    const lacquer = new THREE.MeshPhysicalMaterial({
      color: 0x050505, metalness: 0.0, roughness: 0.32, roughnessMap: noiseTex,
      clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.9, specularIntensity: 1,
    });
    const thornMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.13, envMapIntensity: 2.1, clearcoat: 0.6, clearcoatRoughness: 0.08 });
    const silver = new THREE.MeshPhysicalMaterial({ color: 0xd9dbe0, metalness: 1, roughness: 0.07, envMapIntensity: 2.2 });
    const C_BLACK = new THREE.Color(0x1c1d20), C_GUN = new THREE.Color(0x4a4c52), C_RED = new THREE.Color(0xb0121c), C_SILVER = new THREE.Color(0xc9ccd2);

    // seeded random so every page load gets the same sculpture
    let seed = 90210;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rr = (a, b) => a + rnd() * (b - a);

    /* ---------- the chain: interlocking links, each a twisted thorny lacquer vine ---------- */
    const links = [...list.querySelectorAll('.spine__link')];
    const COUNT = links.length + 2;              // one spare link off-screen top and bottom
    const A = 0.3, R = 0.62, WIRE = 0.19;         // straight half-length, end radius, wire radius
    const PITCH = 2 * (A + R) - 2.1 * WIRE;      // centre-to-centre so each link threads the next

    const chain = new THREE.Group();             // pivots from the top so it swings like it hangs
    scene.add(chain);

    // stadium-shaped closed path (a chain link), lightly irregular so it reads hand-forged
    const linkCurve = ph => {
      const pts = [], n = 120;
      for (let i = 0; i < n; i++) {
        const s = (i / n) * Math.PI * 2;
        const x = R * Math.cos(s), yb = R * Math.sin(s);
        const y = yb + (yb >= 0 ? A : -A) * Math.min(1, Math.abs(yb) / (R * 0.18));
        const w = 0.035 * Math.sin(3 * s + ph) + 0.02 * Math.sin(7 * s + ph * 2);
        pts.push(new THREE.Vector3(x * (1 + w), y + w * 0.5, 0.05 * Math.sin(2 * s + ph)));
      }
      return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    };
    // two strands twisted round the path, swelling and pinching like a vine
    const ropeGeos = (curve, thick, twists, segs, ph) => {
      const frames = curve.computeFrenetFrames(segs, true), out = [];
      for (let s = 0; s < 2; s++) {
        const pts = [];
        for (let i = 0; i < segs; i++) {
          const u = i / segs, a = twists * Math.PI * 2 * u + s * Math.PI;
          const off = thick * 0.6 * (1 + 0.12 * Math.sin(u * 31 + s + ph));
          pts.push(curve.getPointAt(u).addScaledVector(frames.normals[i], Math.cos(a) * off).addScaledVector(frames.binormals[i], Math.sin(a) * off));
        }
        const sc = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
        const tube = new THREE.TubeGeometry(sc, segs * 2, thick * 0.6, 16, true);
        const pos = tube.attributes.position, rs = 17, c = new THREE.Vector3(), v = new THREE.Vector3();
        for (let i = 0; i <= segs * 2; i++) {
          const u = i / (segs * 2);
          sc.getPointAt(u % 1, c);
          const f = 1 + 0.16 * Math.sin(u * 41 + s * 2 + ph) + 0.08 * Math.sin(u * 97 + s);
          for (let j = 0; j < rs; j++) { const k = i * rs + j; v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(f).add(c); pos.setXYZ(k, v.x, v.y, v.z); }
        }
        out.push(tube);
      }
      return out;
    };
    // tapered, flared, optionally curved thorn
    const thornGeo = bend => {
      const prof = [];
      for (let i = 0; i <= 22; i++) { const y = i / 22; prof.push(new THREE.Vector2(Math.max(Math.pow(1 - y, 1.7) * (1 + 1.4 * Math.exp(-y * 18)), 0.0005), y)); }
      const g = new THREE.LatheGeometry(prof, 12), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + bend * y * y); }
      g.computeVertexNormals();
      return g;
    };
    const thornGeos = [0, 0.12, 0.28].map(thornGeo);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), rollQ = new THREE.Quaternion();
    const pickColor = (pRed, pSilver) => { const x = rnd(); return x < pRed ? C_RED : x < pRed + pSilver ? C_SILVER : (rnd() < 0.5 ? C_BLACK : C_GUN); };

    const chainLinks = [];
    for (let i = 0; i < COUNT; i++) {
      const ph = rr(0, 6.28);
      const curve = linkCurve(ph);
      const holder = new THREE.Group();          // position + sway
      const body = new THREE.Group();            // alternate 90° turn + hover spin
      holder.add(body);
      ropeGeos(curve, WIRE, 4, 200, ph).forEach(g => body.add(new THREE.Mesh(g, lacquer)));

      const inst = thornGeos.map(g => { const m = new THREE.InstancedMesh(g, thornMat, 80); m.count = 0; body.add(m); return m; });
      const put = (pos, dir, len, base, color) => {
        const m = inst[(rnd() * 3) | 0];
        q4.setFromUnitVectors(up, dir); rollQ.setFromAxisAngle(up, rnd() * 6.28); q4.multiply(rollQ);
        m4.compose(pos, q4, new THREE.Vector3(base, len, base));
        m.setMatrixAt(m.count, m4); m.setColorAt(m.count, color); m.count++;
      };
      for (let k = 0; k < 64; k++) {
        const t = rnd(), p = curve.getPointAt(t), T = curve.getTangentAt(t);
        const d = new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
        d.addScaledVector(T, -d.dot(T));
        const outward = new THREE.Vector3(p.x, p.y * 0.4, 0).normalize();
        if (d.dot(outward) < -0.2) d.addScaledVector(outward, 1.2); // keep most thorns out of the link's eye
        d.normalize();
        const long = k < 5;
        const len = long ? rr(1.0, 2.1) : Math.pow(rnd(), 1.6) * 0.5 + 0.12;
        put(p.addScaledVector(d, WIRE * 0.6), d, len, long ? rr(0.03, 0.045) : len * rr(0.07, 0.11), pickColor(long ? 0.4 : 0.2, 0.12));
      }
      inst.forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });

      holder.position.y = -i * PITCH;
      body.rotation.y = i % 2 ? Math.PI / 2 : 0;
      chain.add(holder);
      chainLinks.push({ holder, body, base: body.rotation.y, ph, hot: 0, hotT: 0, spin: 0 });
    }
    const TOP = ((COUNT - 1) * PITCH) / 2;       // centre the chain vertically around y=0
    chainLinks.forEach(l => { l.holder.position.y += TOP; });

    /* ---------- thin chrome orbit rings around the chain ---------- */
    const rings = [
      { rx: 2.3, ry: 0.95, tilt: [1.35, 0, 0.22], y: TOP * 0.45, speed: 0.03 },
      { rx: 2.1, ry: 0.9, tilt: [1.2, 0.3, -0.3], y: -TOP * 0.3, speed: -0.04 },
    ].map(r => {
      const holder = new THREE.Group();
      holder.rotation.set(...r.tilt); holder.position.y = r.y;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 10, 320), silver);
      ring.scale.set(r.rx, r.rx * r.ry, 1);
      holder.add(ring); chain.add(holder);
      return { ring, speed: r.speed };
    });

    /* ---------- sizing: fit the visible links (not the spares) top to bottom ---------- */
    const vis = (links.length - 1) * PITCH + 2 * (A + R) + 0.6;
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const byH = (vis / 2) / tan;
      const byW = (3.0) / (tan * camera.aspect);  // keep link + thorns inside narrow phones
      camera.position.set(0, 0, Math.max(byH, byW));
      scene.fog.near = camera.position.z - 1; scene.fog.far = camera.position.z + 9;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas);
    resize();

    /* ---------- interaction ---------- */
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    root.addEventListener('pointermove', e => {
      const r = root.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    let hotIndex = -1;
    links.forEach((a, n) => {
      a.classList.add(n % 2 ? 'spine__link--r' : 'spine__link--l');
      const L = chainLinks[n + 1];
      const on = () => { L.hotT = 1; L.spin = 1; hotIndex = n + 1; }, off = () => { L.hotT = 0; if (hotIndex === n + 1) hotIndex = -1; };
      a.addEventListener('pointerenter', on); a.addEventListener('pointerleave', off);
      a.addEventListener('focus', on); a.addEventListener('blur', off);
    });

    /* ---------- loop: only while the drawer is open ---------- */
    const dialog = root.closest('dialog');
    const clock = new THREE.Clock();
    let raf = 0;
    const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 4);
    const v3 = new THREE.Vector3();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = reduce ? 0 : clock.elapsedTime;
      const intro = reduce ? 1 : ease(clock.elapsedTime / 1.8);

      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;

      // drops in from above, then hangs and swings very slowly
      chain.position.y = (1 - intro) * 4;
      chain.rotation.set(pointer.y * 0.06, pointer.x * 0.25 + Math.sin(t * 0.12) * 0.2, Math.sin(t * 0.35) * 0.02);
      chainLinks.forEach((l, i) => {
        l.hot += (l.hotT - l.hot) * 0.08;
        l.spin *= 0.97;
        if (!reduce) l.base += dt * l.spin * 2.2;
        l.body.rotation.y = l.base + Math.sin(t * 0.4 + l.ph) * 0.12;
        l.holder.rotation.z = Math.sin(t * 0.5 + i * 0.7) * 0.05;
        l.holder.scale.setScalar(1 + l.hot * 0.06);
      });
      if (!reduce) rings.forEach(r => { r.ring.rotation.z += dt * r.speed; });

      // red light slides to the hovered link
      const target = hotIndex >= 0 ? chainLinks[hotIndex].holder.position.y + chain.position.y : -1;
      redLight.position.y += (target - redLight.position.y) * 0.1;
      redLight.position.x = 1.6; redLight.position.z = 1.2;
      redLight.intensity = 5 + (hotIndex >= 0 ? 26 : 0) * (chainLinks[hotIndex]?.hot || 0);

      renderer.render(scene, camera);

      // labels ride their links, alternating sides so the chain stays visible
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const pxPerUnit = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z);
      const gap = (R + WIRE) * pxPerUnit + Math.max(14, W * 0.02);
      links.forEach((a, n) => {
        chainLinks[n + 1].holder.getWorldPosition(v3).project(camera);
        const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H;
        a.style.left = (n % 2 ? x + gap : x - gap) + 'px';
        a.style.top = y + 'px';
      });
    };
    const start = () => {
      if (raf) return;
      resize();
      clock.start(); clock.elapsedTime = 0;
      frame();
    };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const sync = () => (dialog && !dialog.open ? stop() : start());
    if (dialog) new MutationObserver(sync).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    sync();
  }

  const init = () => document.querySelectorAll('[data-spine]').forEach(build);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
