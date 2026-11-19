/* Live view counter for the footer.
   Uses Abacus (free, no signup): https://github.com/JasonLovesDoggo/abacus
   Every page load on the live domain adds +1. The number then refreshes live
   (stream if available, otherwise a quick poll) so it ticks up while you watch.
   Abacus can be slow or briefly down, so the counter never hides: it shows the
   last number this browser saw (or the known floor) right away, retries with
   timeouts, and keeps polling until the service answers. */
(function () {
  var API = 'https://abacus.jasoncameron.dev';
  var NS = 'badinfluencestudio-in';
  var KEY = 'site-views';
  var POLL_MS = 15000;
  var TIMEOUT_MS = 12000;
  var FLOOR = 94;                       // last confirmed total (19 Nov 2026), never show less
  var STORE = 'bis-viewcount';

  var box = document.querySelector('[data-viewcount]');
  if (!box) return;
  var numEl = box.querySelector('[data-viewcount-num]');
  var youEl = box.querySelector('[data-viewcount-you]');
  var shown = 0;

  // Only real visits on the live site count. Previews and local copies just read.
  var host = location.hostname.replace(/^www\./, '');
  var isLive = host === 'badinfluencestudio.in';

  function pad(n) { var s = String(n); while (s.length < 6) s = '0' + s; return s; }
  function fmt(n) { return pad(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function load() { try { return Number(localStorage.getItem(STORE)) || 0; } catch (e) { return 0; } }
  function save(n) { try { localStorage.setItem(STORE, String(n)); } catch (e) {} }

  function render(n, bump) {
    if (typeof n !== 'number' || !isFinite(n) || n < shown) return;
    var from = shown; shown = n;
    save(n);
    box.hidden = false;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === 0 || n - from > 40) { numEl.textContent = fmt(n); }
    else {
      var cur = from;
      (function step() { cur++; numEl.textContent = fmt(cur); if (cur < n) setTimeout(step, 70); })();
    }
    if (bump && from !== n) {
      box.classList.remove('is-bump'); void box.offsetWidth; box.classList.add('is-bump');
    }
  }

  function get(path) {
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
    return fetch(API + path, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok) throw new Error(r.status); return r.json();
    }).then(function (d) {
      clearTimeout(timer);
      var v = Number(d.value);
      if (!isFinite(v)) throw new Error('bad value');
      return v;
    }, function (e) { clearTimeout(timer); throw e; });
  }
  // retry a request a few times with growing gaps before giving up
  function retry(path, tries, wait) {
    return get(path).catch(function (e) {
      if (tries <= 1) throw e;
      return new Promise(function (res) { setTimeout(res, wait); }).then(function () { return retry(path, tries - 1, wait * 2); });
    });
  }

  var polling = false;
  function poll() {
    if (polling) return; polling = true;
    setInterval(function () {
      if (document.hidden) return;
      get('/get/' + NS + '/' + KEY).then(function (n) { render(n, true); }).catch(function () {});
    }, POLL_MS);
  }

  function live() {
    if (!('EventSource' in window)) return poll();
    var es, gotMsg = false;
    try { es = new EventSource(API + '/stream/' + NS + '/' + KEY); } catch (e) { return poll(); }
    es.onmessage = function (e) {
      gotMsg = true;
      try { render(Number(JSON.parse(e.data).value), true); } catch (err) {}
    };
    es.onerror = function () { if (!gotMsg) { es.close(); poll(); } };
  }

  // show something straight away: the last number this browser saw, never below the floor
  render(Math.max(load(), FLOOR), false);

  var first = isLive ? retry('/hit/' + NS + '/' + KEY, 2, 3000) : retry('/get/' + NS + '/' + KEY, 3, 2000);
  first.then(function (n) {
    render(n, true);
    if (youEl && isLive) youEl.textContent = "you're #" + n.toLocaleString('en-IN') + '. no going back now.';
    live();
  }).catch(function () { poll(); /* service slow or down: keep the cached number and keep trying */ });
})();
