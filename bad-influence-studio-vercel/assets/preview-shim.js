/* Public preview build (no Shopify backend yet): the store browses normally, but the bag and checkout
   say "opening soon" instead of pretending to take orders. */
window.BIS_PREVIEW = true;
(function () {
  const real = window.fetch.bind(window);
  const MSG = 'Orders open soon. The store is not taking payments yet.';
  const json = (o, status) => Promise.resolve(new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  window.fetch = function (url, opts) {
    const u = String(url);
    if (/\/cart\/(add|change)\.js/.test(u)) return json({ status: 422, message: MSG, description: MSG }, 422);
    if (/\/cart\.js/.test(u)) return json({ item_count: 0, items: [] });
    if (/recommendations\/products|\?section_id=|view=card/.test(u)) return Promise.resolve(new Response('', { status: 200 }));
    return real(url, opts);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.setAttribute('style', 'position:fixed;left:12px;bottom:12px;z-index:9999;font:500 10px/1.4 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;background:#FF3038;color:#090909;padding:6px 10px;pointer-events:none');
    b.textContent = 'Store opening soon · orders not live yet';
    document.body.appendChild(b);
    document.addEventListener('submit', (e) => {
      const f = e.target;
      if (f.matches('[action*="/cart"]')) { e.preventDefault(); e.stopImmediatePropagation(); alert(MSG); }
    }, true);
    document.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href');
      if (h === '/') a.setAttribute('href', 'index.html');
      else if (/^\/collections\//.test(h) || /^\/search/.test(h)) a.setAttribute('href', 'shop.html');
      else { const m = h.match(/^\/products\/([\w-]+)/); if (m) a.setAttribute('href', 'product-' + m[1] + '.html');
        else if (/^\/(pages|policies|account|cart)/.test(h)) a.setAttribute('href', 'index.html'); }
    });
  });
})();
