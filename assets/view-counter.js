/* Live view counter for the footer.
   Uses Abacus (free, no signup): https://github.com/JasonLovesDoggo/abacus
   Every page load on the live domain adds +1. The number then refreshes live
   (stream if available, otherwise a quick poll) so it ticks up while you watch. */
(function () {
  var API = 'https://abacus.jasoncameron.dev';
  var NS = 'badinfluencestudio-in';
  var KEY = 'site-views';
  var POLL_MS = 15000;

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

  function render(n, bump) {
    if (typeof n !== 'number' || !isFinite(n) || n < shown) return;
    var from = shown; shown = n;
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
    return fetch(API + path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(r.status); return r.json();
    }).then(function (d) { return Number(d.value); });
  }

  function poll() {
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

  var first = isLive ? get('/hit/' + NS + '/' + KEY) : get('/get/' + NS + '/' + KEY);
  first.then(function (n) {
    render(n, false);
    if (youEl && isLive) youEl.textContent = "you're #" + n.toLocaleString('en-IN') + '. no going back now.';
    live();
  }).catch(function () { /* counter service down: stay hidden, site stays clean */ });
})();
