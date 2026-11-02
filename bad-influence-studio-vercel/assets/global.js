/*
 * BAD INFLUENCE STUDIO — global.js
 * No framework, no build step. Every commerce action talks to Shopify's own
 * Ajax Cart API + Section Rendering API, so prices/stock always come from Shopify.
 * If this file fails to load, every form still works as a normal page post.
 */
(() => {
  'use strict';

  const BIS = window.BIS || { routes: {}, strings: {} };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMobile = window.matchMedia('(max-width: 989px)');

  /* ---------------- Analytics (Shopify Customer Events only; no 3rd-party scripts) ---------------- */
  function track(name, data = {}) {
    try {
      if (window.Shopify && Shopify.analytics && typeof Shopify.analytics.publish === 'function') {
        Shopify.analytics.publish(name, data);
      }
    } catch (e) { /* never break the page for analytics */ }
  }

  /* ---------------- Money ---------------- */
  function formatMoney(cents, format = BIS.moneyFormat || '₹{{amount}}') {
    const value = Number(cents) / 100;
    const fmt = (n, decimals, thousands, decimal) => {
      const fixed = n.toFixed(decimals).split('.');
      const whole = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return fixed[1] ? whole + decimal + fixed[1] : whole;
    };
    return format.replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
      switch (key) {
        case 'amount_no_decimals': return fmt(value, 0, ',', '.');
        case 'amount_with_comma_separator': return fmt(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return fmt(value, 0, '.', ',');
        case 'amount_with_space_separator': return fmt(value, 2, ' ', ',');
        case 'amount_with_apostrophe_separator': return fmt(value, 2, "'", '.');
        default: return fmt(value, 2, ',', '.');
      }
    });
  }

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = $('.toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* ---------------- Header ---------------- */
  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  /* ---------------- Announcement rotator ---------------- */
  function initAnnouncements() {
    const bar = $('[data-announce]');
    if (!bar) return;
    const items = $$('.announce__item', bar);
    if (items.length < 2 || reduceMotion) return;
    let i = 0, paused = false;
    bar.addEventListener('mouseenter', () => (paused = true));
    bar.addEventListener('mouseleave', () => (paused = false));
    bar.addEventListener('focusin', () => (paused = true));
    bar.addEventListener('focusout', () => (paused = false));
    setInterval(() => {
      if (paused || document.hidden) return;
      const cur = items[i];
      i = (i + 1) % items.length;
      cur.classList.remove('is-active');
      cur.classList.add('is-leaving');
      items[i].classList.add('is-active');
      setTimeout(() => cur.classList.remove('is-leaving'), 600);
    }, Number(bar.dataset.interval) || 4000);
  }

  /* ---------------- Dialogs (menu, search, size guide) ---------------- */
  function openDialog(dialog, opener) {
    if (!dialog || dialog.open) return;
    dialog._opener = opener || document.activeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    if (opener) opener.setAttribute('aria-expanded', 'true');
  }
  function closeDialog(dialog) {
    if (!dialog || !dialog.open) return;
    const finish = () => {
      dialog.classList.remove('is-closing');
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    };
    if (dialog.classList.contains('drawer') && !reduceMotion) {
      dialog.classList.add('is-closing');
      setTimeout(finish, 280);
    } else finish();
  }
  function initDialogs() {
    $$('dialog').forEach((d) => {
      d.addEventListener('close', () => {
        document.documentElement.style.overflow = '';
        document.body.classList.remove('drawer-open');
        if (d._opener) {
          d._opener.setAttribute && d._opener.setAttribute('aria-expanded', 'false');
          d._opener.focus && d._opener.focus();
        }
      });
      // click on the backdrop closes
      d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
      d.addEventListener('cancel', (e) => { if (d.classList.contains('drawer')) { e.preventDefault(); closeDialog(d); } });
    });
    document.addEventListener('click', (e) => {
      const close = e.target.closest('[data-dialog-close]');
      if (close) return closeDialog(close.closest('dialog'));
      const menuBtn = e.target.closest('[data-menu-open]');
      if (menuBtn) return openDialog($('[data-menu-drawer]'), menuBtn);
      const searchBtn = e.target.closest('[data-search-open]');
      if (searchBtn) {
        openDialog($('[data-search-dialog]'), searchBtn);
        const input = $('#SearchInput');
        input && setTimeout(() => input.focus(), 50);
        return;
      }
      const guideBtn = e.target.closest('[data-size-guide-open]');
      if (guideBtn) return openDialog(document.getElementById(guideBtn.getAttribute('aria-controls')), guideBtn);
      const forgot = e.target.closest('[data-toggle-recover]');
      if (forgot) { const r = $('#recover'); r && (r.style.display = 'block'); }
    });
  }

  /* ---------------- Cart ---------------- */
  const Cart = {
    get drawer() { return $('[data-cart-drawer]'); },
    sectionId: 'cart-drawer',

    open(opener) {
      const d = this.drawer;
      if (!d) return false;
      openDialog(d, opener);
      document.body.classList.add('drawer-open');
      const focusTarget = $('.drawer__checkout button, [data-dialog-close]', d);
      focusTarget && focusTarget.focus({ preventScroll: true });
      return true;
    },

    render(sections) {
      if (!sections || !sections[this.sectionId]) return;
      const doc = new DOMParser().parseFromString(sections[this.sectionId], 'text/html');
      const fresh = $('[data-cart-drawer-inner]', doc);
      const current = $('[data-cart-drawer-inner]', this.drawer || document);
      if (fresh && current) current.innerHTML = fresh.innerHTML;
    },

    setCount(count) {
      $$('[data-cart-count]').forEach((el) => {
        el.textContent = count;
        el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump');
      });
      $$('[data-cart-count-label]').forEach((el) => { el.textContent = `Bag, ${count} ${count === 1 ? 'item' : 'items'}`; });
    },

    async refreshCount() {
      try {
        const res = await fetch(`${BIS.routes.root}cart.js`.replace('//cart', '/cart'), { headers: { Accept: 'application/json' } });
        const cart = await res.json();
        this.setCount(cart.item_count);
        return cart;
      } catch (e) { return null; }
    },

    showError(msg) {
      const el = $('[data-cart-error]', this.drawer || document);
      if (el) { el.textContent = msg; el.hidden = false; }
      else toast(msg);
    },

    async add(formData) {
      formData.append('sections', this.sectionId);
      formData.append('sections_url', window.location.pathname);
      const res = await fetch(`${BIS.routes.cartAdd}.js`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: formData
      });
      const data = await res.json();
      if (!res.ok || data.status) {
        // 422 = out of stock / quantity unavailable, straight from Shopify
        throw new Error(data.description || data.message || BIS.strings.cartError);
      }
      this.render(data.sections);
      await this.refreshCount();
      return data;
    },

    async change(line, quantity) {
      const lineEl = $(`.cart-line[data-line="${line}"]`, this.drawer);
      lineEl && lineEl.classList.add('is-loading');
      try {
        const res = await fetch(`${BIS.routes.cartChange}.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ line: Number(line), quantity: Number(quantity), sections: [this.sectionId], sections_url: window.location.pathname })
        });
        const data = await res.json();
        if (!res.ok || data.status) {
          const fallback = await fetch(`${window.location.pathname}?section_id=${this.sectionId}`).then((r) => r.text());
          this.render({ [this.sectionId]: fallback });
          this.showError(data.description || data.message || BIS.strings.cartError);
          return;
        }
        this.render(data.sections);
        this.setCount(data.item_count);
      } catch (e) {
        this.showError(BIS.strings.cartError);
        lineEl && lineEl.classList.remove('is-loading');
      }
    }
  };

  function initCart() {
    document.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-cart-open]');
      if (opener && Cart.drawer && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        Cart.open(opener);
        return;
      }
      const remove = e.target.closest('[data-cart-remove]');
      if (remove) { e.preventDefault(); Cart.change(remove.dataset.line, 0); }
    });

    // Quantity changes inside the drawer (debounced so +++ = one request)
    let t;
    document.addEventListener('change', (e) => {
      const input = e.target.closest('[data-cart-qty]');
      if (!input) return;
      clearTimeout(t);
      t = setTimeout(() => Cart.change(input.dataset.line, Math.max(0, parseInt(input.value, 10) || 0)), 350);
    });
  }

  /* ---------------- Quantity steppers ---------------- */
  function initQuantity() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-qty-minus], [data-qty-plus]');
      if (!btn) return;
      const wrap = btn.closest('[data-qty]');
      const input = $('input', wrap);
      if (!input) return;
      const min = input.hasAttribute('min') ? Number(input.min) : 0;
      const step = btn.hasAttribute('data-qty-plus') ? 1 : -1;
      const next = Math.max(min, (parseInt(input.value, 10) || 0) + step);
      if (next === Number(input.value)) return;
      input.value = next;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  /* ---------------- Add to cart (product form + quick add) ---------------- */
  function initAddForms() {
    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-product-form], [data-quick-add]');
      if (!form || !Cart.drawer) return; // no drawer → normal POST to /cart/add
      e.preventDefault();

      const submitter = e.submitter;
      let fd;
      try { fd = new FormData(form, submitter); } catch (err) {
        fd = new FormData(form);
        if (submitter && submitter.name) fd.set(submitter.name, submitter.value);
      }
      if (!fd.get('id')) return;

      const buttons = form.matches('[data-product-form]')
        ? [$('[data-add-button]', form), $('[data-buybar-button]')].filter(Boolean)
        : [submitter || $('button[type="submit"]', form)].filter(Boolean);
      const labels = buttons.map((b) => [b, b.innerHTML]);
      buttons.forEach((b) => { b.disabled = true; b.setAttribute('aria-busy', 'true'); });
      const errEl = $('[data-form-error]', form.closest('[data-product-section]') || form);
      errEl && (errEl.hidden = true);

      try {
        await Cart.add(fd);
        Cart.open(submitter);
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
        else toast(err.message);
      } finally {
        labels.forEach(([b, html]) => { b.innerHTML = html; b.removeAttribute('aria-busy'); b.disabled = b.dataset.unavailable === 'true'; });
      }
    });
  }

  /* ---------------- Variant picker ---------------- */
  function initProduct(section) {
    const jsonEl = $('[data-product-json]', section);
    if (!jsonEl) return;
    const product = JSON.parse(jsonEl.textContent);
    const invEl = $('[data-inventory-json]', section);
    const inventory = invEl ? JSON.parse(invEl.textContent) : null;
    const form = $('[data-product-form]', section);
    const idInput = $('[data-variant-id]', section);
    const picker = $('[data-variant-picker]', section);
    const addBtn = $('[data-add-button]', section);
    const buyBtn = $('[data-buybar-button]', section);
    const stock = $('[data-stock]', section);
    const priceWrap = $('[data-variant-price]', section);
    const buyPrice = $('[data-buybar-price]', section);
    const sku = $('[data-variant-sku]', section);

    const selected = () => $$('.picker__group', section).map((g) => {
      const checked = $('input:checked', g);
      return checked ? checked.value : null;
    });

    const findVariant = (opts) => product.variants.find((v) => v.options.every((o, i) => o === opts[i]));

    function markAvailability(opts) {
      $$('.picker__group', section).forEach((group, gi) => {
        $$('.chip[data-option-value]', group).forEach((chip) => {
          const value = chip.dataset.optionValue;
          const test = opts.slice(); test[gi] = value;
          const match = product.variants.find((v) => v.options.every((o, i) => o === test[i]));
          const ok = !!(match && match.available);
          chip.classList.toggle('is-unavailable', !ok);
          chip.title = ok ? '' : (match ? 'Sold out' : 'Unavailable');
        });
      });
    }

    function setButtons(available, exists) {
      const text = exists ? (available ? BIS.strings.addToCart : BIS.strings.soldOut) : BIS.strings.unavailable;
      [addBtn, buyBtn].filter(Boolean).forEach((b) => {
        b.disabled = !available;
        b.dataset.unavailable = String(!available);
        const label = $('[data-add-label]', b);
        if (label) label.textContent = text;
      });
      const dyn = $('.pdp__dynamic', section);
      if (dyn) dyn.style.display = available ? '' : 'none';
    }

    function update() {
      const opts = selected();
      const variant = findVariant(opts);
      $$('.picker__group', section).forEach((g, i) => { const s = $('[data-option-selected]', g); s && (s.textContent = opts[i] || ''); });
      markAvailability(opts);

      if (!variant) {
        setButtons(false, false);
        stock && (stock.innerHTML = '<span class="dot dot--no"></span>Unavailable in this combination');
        return;
      }
      idInput.value = variant.id;
      setButtons(variant.available, true);

      // price (from Shopify's variant data)
      if (priceWrap) {
        const cur = $('[data-price-current]', priceWrap);
        const cmp = $('[data-price-compare]', priceWrap);
        const root = $('[data-price]', priceWrap);
        cur && (cur.textContent = formatMoney(variant.price));
        const onSale = variant.compare_at_price && variant.compare_at_price > variant.price;
        if (cmp) { cmp.hidden = !onSale; cmp.textContent = onSale ? formatMoney(variant.compare_at_price) : ''; }
        root && root.classList.toggle('price--sale', !!onSale);
      }
      buyPrice && (buyPrice.textContent = formatMoney(variant.price));
      sku && (sku.textContent = variant.sku || '');

      // stock line
      if (stock) {
        let html = variant.available ? '<span class="dot dot--ok"></span>In stock' : '<span class="dot dot--no"></span>Sold out';
        if (variant.available && inventory) {
          const q = inventory.variants[String(variant.id)];
          if (typeof q === 'number' && q > 0 && q <= inventory.threshold) html = `<span class="dot dot--low"></span>Only ${q} left`;
        }
        stock.innerHTML = html;
      }

      section.dispatchEvent(new CustomEvent('bis:variant', { bubbles: true, detail: { options: variant.options, optionNames: product.options.map((o) => (typeof o === 'string' ? o : o.name)) } }));

      // url + media
      const url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      history.replaceState(history.state, '', url.toString());
      if (variant.featured_media) showMedia(section, variant.featured_media.id);
    }

    if (picker) {
      picker.addEventListener('change', update);
      markAvailability(selected());
    }
    // initial low-stock line
    if (inventory && idInput) {
      const v = product.variants.find((x) => String(x.id) === String(idInput.value));
      if (v) {
        const q = inventory.variants[String(v.id)];
        if (v.available && typeof q === 'number' && q > 0 && q <= inventory.threshold && stock) stock.innerHTML = `<span class="dot dot--low"></span>Only ${q} left`;
      }
    }

    initGallery(section);
    initBuybar(section, form);
    rememberViewed(section.dataset.productHandle);
  }

  function showMedia(section, mediaId) {
    const track = $('[data-gallery-track]', section);
    const slide = track && $(`[data-media-id="${mediaId}"]`, track);
    if (!slide) return;
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function initGallery(section) {
    const track = $('[data-gallery-track]', section);
    if (!track) return;
    const idx = $('[data-gallery-index]', section);
    const thumbs = $$('[data-thumb]', section);
    thumbs.forEach((t) => t.addEventListener('click', () => showMedia(section, t.dataset.thumb)));
    let raf;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        idx && (idx.textContent = i + 1);
        thumbs.forEach((t, n) => {
          t.classList.toggle('is-active', n === i);
          n === i ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current');
        });
      });
    }, { passive: true });
  }

  function initBuybar(section, form) {
    const bar = $('[data-buybar]', section);
    const add = $('[data-add-button]', section);
    if (!bar || !add || !('IntersectionObserver' in window)) return;
    const btn = $('[data-buybar-button]', bar);
    const setVisible = (v) => {
      const show = v && mqMobile.matches;
      bar.classList.toggle('is-visible', show);
      bar.setAttribute('aria-hidden', String(!show));
      btn && (btn.tabIndex = show ? 0 : -1);
      document.body.classList.toggle('has-buybar', show);
    };
    let pastAdd = false, footerVisible = false;
    new IntersectionObserver(([en]) => {
      pastAdd = !en.isIntersecting && en.boundingClientRect.top < 0;
      setVisible(pastAdd && !footerVisible);
    }).observe(add);
    const footer = $('.footer');
    footer && new IntersectionObserver(([en]) => {
      footerVisible = en.isIntersecting;
      setVisible(pastAdd && !footerVisible);
    }).observe(footer);
  }

  /* ---------------- Recently viewed (handles only, this browser only) ---------------- */
  const RV_KEY = 'bis:recent';
  function readViewed() {
    try { return JSON.parse(localStorage.getItem(RV_KEY) || '[]').filter((h) => /^[a-z0-9-]+$/.test(h)); }
    catch (e) { return []; }
  }
  function rememberViewed(handle) {
    if (!handle) return;
    try {
      const list = [handle, ...readViewed().filter((h) => h !== handle)].slice(0, 12);
      localStorage.setItem(RV_KEY, JSON.stringify(list));
    } catch (e) { /* storage blocked: feature simply stays hidden */ }
  }
  async function initRecentlyViewed() {
    const section = $('[data-recently-viewed]');
    if (!section) return;
    const list = $('[data-recent-list]', section);
    const current = section.dataset.current;
    const limit = Number(section.dataset.limit) || 4;
    const handles = readViewed().filter((h) => h !== current).slice(0, limit);
    if (!handles.length) return;
    const cards = await Promise.all(handles.map((h) =>
      fetch(`${BIS.routes.root}products/${h}?view=card`.replace('//products', '/products'))
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '')
    ));
    const html = cards.filter((c) => c.includes('rail__item')).join('');
    if (!html) return;
    list.innerHTML = html;
    section.hidden = false;
  }

  /* ---------------- Recommendations ---------------- */
  async function initRecommendations() {
    const el = $('[data-recommendations]');
    if (!el || !el.dataset.url || el.children.length) return;
    try {
      const text = await fetch(el.dataset.url).then((r) => r.text());
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const fresh = $('[data-recommendations]', doc);
      if (fresh && fresh.innerHTML.trim()) el.innerHTML = fresh.innerHTML;
    } catch (e) { /* recommendations are optional */ }
  }

  /* ---------------- Collection: filters, sort, load more ---------------- */
  function initFacets() {
    const form = $('[data-facets]');
    if (!form) return;
    const clean = () => $$('input, select', form).forEach((i) => { if (!i.value) i.name = ''; });
    form.addEventListener('submit', clean);
    form.addEventListener('change', (e) => {
      if (e.target.matches('input[type="checkbox"], select')) { clean(); form.submit(); }
    });
  }
  function initLoadMore() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-load-more]');
      if (!btn) return;
      e.preventDefault();
      btn.setAttribute('aria-busy', 'true');
      btn.classList.add('is-loading');
      try {
        const doc = new DOMParser().parseFromString(await fetch(btn.href).then((r) => r.text()), 'text/html');
        const grid = $('[data-product-grid]');
        const items = $$('[data-grid-item]', doc);
        items.forEach((i) => grid.append(i));
        const next = $('[data-load-more]', doc);
        if (next) { btn.href = next.href; btn.innerHTML = next.innerHTML; btn.removeAttribute('aria-busy'); btn.classList.remove('is-loading'); }
        else btn.closest('.shop__more').remove();
        const firstNew = items[0] && $('a.card__link', items[0]);
        firstNew && firstNew.focus({ preventScroll: true });
      } catch (err) {
        window.location.href = btn.href; // graceful fallback to real pagination
      }
    });
  }

  /* ---------------- Motion: reveal, statement depth, parallax, tilt ---------------- */
  function initReveal() {
    const els = $$('[data-reveal]');
    if (!els.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
  }

  function initScrollMotion() {
    if (reduceMotion) return;
    const statements = $$('[data-statement]');
    const parallax = $$('[data-parallax]');
    const tilts = $$('[data-tilt]');
    $$('[data-depth]').forEach((el) => el.style.setProperty('--d', el.dataset.depth));
    if (!statements.length && !parallax.length && !tilts.length) return;

    let ticking = false;
    const vh = () => window.innerHeight || 800;
    const progress = (el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh() + 100) return null;
      return ((r.top + r.height / 2) - vh() / 2) / (vh() / 2 + r.height / 2); // -1 … 1
    };
    function tick() {
      ticking = false;
      statements.forEach((s) => {
        const p = progress(s);
        if (p === null) return;
        s.style.setProperty('--p', p.toFixed(3));
        s.style.setProperty('--strike', Math.min(1, Math.max(0, (0.45 - p) * 1.6)).toFixed(3));
      });
      parallax.forEach((el) => {
        const p = progress(el);
        if (p === null) return;
        el.style.transform = `translate3d(0, ${(p * Number(el.dataset.parallax) * 200).toFixed(1)}px, 0)`;
      });
      if (!finePointer) tilts.forEach((t) => {
        const p = progress(t);
        if (p === null) return;
        t.style.setProperty('--rx', `${(p * 8).toFixed(2)}deg`);
        t.style.setProperty('--ry', `${(p * -14).toFixed(2)}deg`);
      });
    }
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }, { passive: true });
    tick();

    if (finePointer) tilts.forEach((t) => {
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        t.style.setProperty('--ry', `${(x * 22).toFixed(2)}deg`);
        t.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
      });
      t.addEventListener('pointerleave', () => { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------------- Drag-to-scroll for horizontal rails on desktop mice ---------------- */
  function initDragScroll() {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    $$('[data-drag-scroll]').forEach((el) => {
      let down = false, startX = 0, startLeft = 0, moved = false;
      el.addEventListener('pointerdown', (e) => {
        if (el.scrollWidth <= el.clientWidth || e.target.closest('button, select, input')) return;
        down = true; moved = false; startX = e.clientX; startLeft = el.scrollLeft;
      });
      window.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        el.scrollLeft = startLeft - dx;
      });
      window.addEventListener('pointerup', () => { down = false; });
      el.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    });
  }

  /* ---------------- WhatsApp + newsletter events ---------------- */
  function initSupportEvents() {
    document.addEventListener('click', (e) => {
      const wa = e.target.closest('[data-whatsapp-link]');
      if (wa) track('whatsapp_support_click', { page: window.location.pathname });
    });
    if ($('[data-newsletter-success]')) track('newsletter_signup', { page: window.location.pathname });
  }


  /* ---------------- Display type always fits its column, whatever font actually loaded ---------------- */
  function fitDisplay() {
    const heads = $$('h1.display, h2.display, .footer__big, .hero__title');
    if (!heads.length) return;
    const need = (el) => {
      if (el.classList.contains('hero__title')) {
        let w = 0;
        $$('.hero__line', el).forEach((line) => {
          const r = document.createRange();
          r.selectNodeContents(line);
          w = Math.max(w, r.getBoundingClientRect().width + (parseFloat(getComputedStyle(line).paddingLeft) || 0));
        });
        return w;
      }
      return el.scrollWidth;
    };
    const run = () => heads.forEach((el) => {
      el.style.fontSize = '';
      const avail = el.clientWidth;
      const w = need(el);
      if (avail > 0 && w > avail + 1) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${Math.floor(size * (avail / w) * 0.98)}px`;
      }
    });
    run();
    document.fonts && document.fonts.ready.then(run);
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 120); });
  }

  /* ---------------- Keep the WhatsApp pill off the hero buttons ---------------- */
  function initWhatsAppAvoid() {
    const pill = $('.wa-float');
    const avoid = $$('.hero__ctas');
    if (!pill || !avoid.length || !('IntersectionObserver' in window)) return;
    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
      pill.classList.toggle('is-tucked', visible.size > 0);
    });
    avoid.forEach((el) => io.observe(el));
  }


  /* ---------------- Card quick add toggle (touch + keyboard) ---------------- */
  function initQuickToggle() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quick-toggle]');
      $$('.card.is-quick-open').forEach((c) => {
        if (!btn || !c.contains(btn)) { c.classList.remove('is-quick-open'); const b = $('[data-quick-toggle]', c); b && b.setAttribute('aria-expanded', 'false'); }
      });
      if (!btn) return;
      const card = btn.closest('.card');
      const open = !card.classList.contains('is-quick-open');
      card.classList.toggle('is-quick-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------------- Filter bar: open on desktop, one dropdown at a time ---------------- */
  function initFacetDropdowns() {
    const panel = $('[data-facets-panel]');
    if (!panel) return;
    const desktop = window.matchMedia('(min-width: 990px)');
    const sync = () => { if (desktop.matches) panel.open = true; };
    sync();
    desktop.addEventListener ? desktop.addEventListener('change', sync) : desktop.addListener(sync);
    const drops = $$('[data-facet]', panel);
    drops.forEach((d) => d.addEventListener('toggle', () => {
      if (d.open && desktop.matches) drops.forEach((o) => { if (o !== d) o.open = false; });
    }));
    document.addEventListener('click', (e) => {
      if (!desktop.matches || e.target.closest('[data-facet]')) return;
      drops.forEach((d) => { d.open = false; });
    });
  }


  /* ---------------- Animated mockups (Virtual Threads exports as silent loops) ---------------- */
  const motionIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const box = en.target;
      box._inView = en.isIntersecting && en.intersectionRatio >= 0.35;
      syncMotion(box);
    });
  }, { threshold: [0, 0.35, 0.6] }) : null;

  function syncMotion(box) {
    const v = box.querySelector('video');
    if (!v) return;
    const want = box._inView && !box._userPaused && !document.hidden && !(reduceMotion && !box._userPlayed);
    if (want) {
      if (v.preload === 'none') v.preload = 'auto';
      const p = v.play();
      if (p && p.catch) p.catch(() => { box.classList.add('is-paused'); });
    } else if (!v.paused) {
      v.pause();
    }
    const paused = !want;
    box.classList.toggle('is-paused', paused);
    const btn = box.querySelector('[data-motion-toggle]');
    if (btn) {
      btn.setAttribute('aria-pressed', String(paused));
      const label = btn.querySelector('[data-motion-label]');
      if (label) label.textContent = label.textContent.replace(/^(Pause|Play) animation/, paused ? 'Play animation' : 'Pause animation');
    }
  }

  function initMotion(root = document) {
    $$('[data-motion]', root).forEach((box) => {
      if (box._motionReady) return;
      box._motionReady = true;
      const v = box.querySelector('video');
      if (!v) return;
      v.muted = true; // required for inline autoplay on iOS/Android
      if (reduceMotion) box.classList.add('is-paused');
      if (motionIO) motionIO.observe(box); else { box._inView = true; syncMotion(box); }
    });
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-motion-toggle]');
    if (!btn) return;
    e.preventDefault();
    const box = btn.closest('[data-motion]');
    const v = box && box.querySelector('video');
    if (!v) return;
    if (v.paused) { box._userPaused = false; box._userPlayed = true; }
    else { box._userPaused = true; box._userPlayed = false; }
    syncMotion(box);
  });
  document.addEventListener('visibilitychange', () => $$('[data-motion]').forEach(syncMotion));

  // Picking a colour shows that colour's animated mockup when its video alt text names the colour (e.g. "Black").
  document.addEventListener('bis:variant', (e) => {
    const section = e.target.closest ? e.target.closest('[data-product-section]') || e.target : e.target;
    const names = (e.detail && e.detail.optionNames) || [];
    const values = (e.detail && e.detail.options) || [];
    const ci = names.findIndex((n) => /^colou?r$/i.test(String(n)));
    if (ci < 0) return;
    const colour = String(values[ci] || '').toLowerCase();
    const slide = $$('[data-media-alt]', section).find((li) => {
      const alt = (li.dataset.mediaAlt || '').toLowerCase();
      return alt && (alt === colour || alt.split(/[^a-z0-9-]+/).includes(colour) || alt.includes(colour));
    });
    if (slide) showMedia(section, slide.dataset.mediaId);
  });

  /* ---------------- Boot ---------------- */
  function boot() {
    initHeader();
    initMotion();
    fitDisplay();
    initWhatsAppAvoid();
    initAnnouncements();
    initDialogs();
    initCart();
    initQuantity();
    initAddForms();
    $$('[data-product-section]').forEach(initProduct);
    initRecommendations();
    initRecentlyViewed();
    initFacets();
    initFacetDropdowns();
    initQuickToggle();
    initLoadMore();
    initReveal();
    initScrollMotion();
    initDragScroll();
    initSupportEvents();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Theme editor: re-run when sections are re-rendered
  document.addEventListener('shopify:section:load', (e) => { initReveal(); initScrollMotion(); initRecommendations(); initMotion(e.target); });
  let motionScan = false;
  new MutationObserver(() => {
    if (motionScan) return;
    motionScan = true;
    requestAnimationFrame(() => { motionScan = false; initMotion(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
