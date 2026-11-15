/*! update-kit.js — in-app update flow shared by the PWAs
 *
 *  1. Checks for a new version when the app opens, when you return to it,
 *     and every 30 minutes.
 *  2. A new version is found  -> card at the top: progress ring + "Downloading update…".
 *  3. Download reaches 100%   -> "Update available" with [Update] [Later].
 *     "Later" hides the card until the next check.
 *  4. [Update]                -> spinning ring + "Installing update…", then the app restarts.
 *  5. After the restart       -> "✔ Updated to the latest version".
 *
 *  Needs the matching sw.js behaviour: post {type:'upk-progress', v, pct} while installing,
 *  do NOT call skipWaiting() on install, and call it on message {type:'SKIP_WAITING'}.
 *
 *  UpdateKit.init({
 *    id:         'mcp',              // used for the "just updated" flag
 *    sw:         'sw.js',            // service worker file
 *    accent:     '#0f766e',          // ring + Update button (light theme)
 *    accentDark: '#2dd4bf',          // same, dark theme
 *    lang:       () => 'en',         // 'en' | 'or' | 'both'  (read each time the card is drawn)
 *    extraCheck: () => Promise<bool> // optional: true if content changed without a new sw.js
 *  });
 *  UpdateKit.refresh()  -> redraw texts (call after the app language changes)
 *  UpdateKit.check(true)-> run a check now
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) { window.UpdateKit = { init: function () {}, refresh: function () {}, check: function () {} }; return; }

  var CHECK_EVERY = 30 * 60 * 1000;   // regular check
  var MIN_GAP = 15 * 1000;            // ignore checks closer together than this
  var HOLD_100 = 450;                 // show 100% briefly before switching to "Update available"
  var MIN_INSTALLING = 1200;          // keep "Installing update…" visible at least this long
  var RESTART_FALLBACK = 8000;        // reload anyway if the new worker never reports in
  var DONE_TTL = 2 * 60 * 1000;       // "Updated" message only if the restart was just now
  var DONE_SHOWN = 4500;
  var RING = 113.1;                   // circumference for r = 18

  var T = {
    en: { downloading: 'Downloading update…', available: 'Update available', update: 'Update', later: 'Later',
          installing: 'Installing update…', done: '✔ Updated to the latest version' },
    or: { downloading: 'ଅପଡେଟ୍ ଡାଉନଲୋଡ୍ ହେଉଛି…', available: 'ନୂଆ ଅପଡେଟ୍ ଉପଲବ୍ଧ', update: 'ଅପଡେଟ୍', later: 'ପରେ',
          installing: 'ଅପଡେଟ୍ ଇନଷ୍ଟଲ୍ ହେଉଛି…', done: '✔ ଶେଷ ସଂସ୍କରଣକୁ ଅପଡେଟ୍ ହୋଇଛି' }
  };

  var opts = {}, reg = null, hasCtl = !!navigator.serviceWorker.controller;
  var state = 'idle';                 // idle | downloading | ready | installing
  var pct = 0, curV = null, reloading = false, last = 0, started = false, installStart = 0;
  var card, ring, pctEl, title, sub, btns, goBtn, laterBtn, toast, toastA, toastB, toastTimer;

  function noop() {}
  function flagKey() { return 'upk-updated:' + (opts.id || location.pathname); }
  function lang() { try { return (opts.lang && opts.lang()) || 'en'; } catch (e) { return 'en'; } }
  function lines(k) { var l = lang(); return l === 'or' ? [T.or[k]] : l === 'both' ? [T.en[k], T.or[k]] : [T.en[k]]; }

  /* ---------- UI ---------- */
  function css() {
    var a = opts.accent || '#0f766e', d = opts.accentDark || a;
    return '' +
    '.upk,.upk-toast{--upk-bg:#fff;--upk-fg:#15202b;--upk-bd:rgba(0,0,0,.12);--upk-trk:rgba(0,0,0,.12);--upk-ac:' + a + ';--upk-ink:#fff}' +
    '@media(prefers-color-scheme:dark){.upk,.upk-toast{--upk-bg:#1d252c;--upk-fg:#eef2f5;--upk-bd:rgba(255,255,255,.16);--upk-trk:rgba(255,255,255,.18);--upk-ac:' + d + ';--upk-ink:#0b1114}}' +
    '.upk,.upk-toast{position:fixed;z-index:2147483000;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top,0px));max-width:480px;margin:0 auto;box-sizing:border-box;' +
      'background:var(--upk-bg);color:var(--upk-fg);border:1px solid var(--upk-bd);border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.28);' +
      'font:15px/1.3 system-ui,-apple-system,"Noto Sans Oriya",Kalinga,sans-serif;-webkit-text-size-adjust:100%;' +
      'visibility:hidden;opacity:0;transform:translateY(-130%);transition:transform .3s ease,opacity .3s ease,visibility 0s linear .3s}' +
    '.upk.on,.upk-toast.on{visibility:visible;opacity:1;transform:none;transition-delay:0s}' +
    '.upk [hidden],.upk-toast [hidden]{display:none!important}' +
    '.upk{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 12px}' +
    '.upk-ring{position:relative;flex:none;width:44px;height:44px}' +
    '.upk-ring svg{display:block;width:100%;height:100%;transform:rotate(-90deg)}' +
    '.upk-trk,.upk-bar{fill:none;stroke-width:4}' +
    '.upk-trk{stroke:var(--upk-trk)}' +
    '.upk-bar{stroke:var(--upk-ac);stroke-linecap:round;stroke-dasharray:' + RING + ';stroke-dashoffset:' + RING + ';transition:stroke-dashoffset .3s ease}' +
    '.upk-pct{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font:700 11px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}' +
    '.upk.s-ready .upk-pct{font-size:18px;color:var(--upk-ac)}' +
    '.upk.s-installing .upk-bar{stroke-dasharray:28 ' + (RING - 28).toFixed(1) + ';stroke-dashoffset:0;transition:none}' +
    '.upk.s-installing .upk-ring svg{animation:upk-spin .9s linear infinite}' +
    '@keyframes upk-spin{from{transform:rotate(-90deg)}to{transform:rotate(270deg)}}' +
    '.upk-txt{flex:1 1 125px;min-width:0}' +
    '.upk-t{display:block;font-weight:700}' +
    '.upk-s{display:block;font-size:12.5px;opacity:.75;margin-top:1px}' +
    '.upk-btns{display:flex;flex:none;gap:6px;margin-left:auto}' +
    '.upk-btns button{font:inherit;font-size:14px;font-weight:700;min-height:40px;padding:0 12px;border:0;border-radius:10px;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.upk-go{background:var(--upk-ac);color:var(--upk-ink)}' +
    '.upk-later{background:transparent;color:var(--upk-fg);opacity:.8}' +
    '.upk-toast{padding:12px 16px;text-align:center;font-weight:600;cursor:pointer}' +
    '.upk-toast span{display:block}.upk-toast span+span{font-size:13px;font-weight:500;opacity:.8;margin-top:2px}' +
    '@media(prefers-reduced-motion:reduce){.upk,.upk-toast,.upk-bar{transition-duration:0s!important}}';
  }

  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }

  function build() {
    if (card) return;
    var st = el('style'); st.textContent = css(); document.head.appendChild(st);

    card = el('div', 'upk'); card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
    var rw = el('div', 'upk-ring', card);
    rw.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="upk-trk" cx="22" cy="22" r="18"/><circle class="upk-bar" cx="22" cy="22" r="18"/></svg>';
    ring = rw.querySelector('.upk-bar'); pctEl = el('span', 'upk-pct', rw);
    var tx = el('div', 'upk-txt', card); title = el('b', 'upk-t', tx); sub = el('small', 'upk-s', tx);
    btns = el('div', 'upk-btns', card);
    goBtn = el('button', 'upk-go', btns); goBtn.type = 'button';
    laterBtn = el('button', 'upk-later', btns); laterBtn.type = 'button';
    goBtn.addEventListener('click', doUpdate);
    laterBtn.addEventListener('click', function () { if (state === 'ready') { state = 'idle'; render(); } });
    document.body.appendChild(card);

    toast = el('div', 'upk-toast'); toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
    toastA = el('span', '', toast); toastB = el('span', '', toast);
    toast.addEventListener('click', function () { toast.classList.remove('on'); });
    document.body.appendChild(toast);
  }

  function render() {
    if (!card) return;
    if (state === 'idle') { card.classList.remove('on'); return; }
    var key = state === 'downloading' ? 'downloading' : state === 'installing' ? 'installing' : 'available';
    var L = lines(key);
    title.textContent = L[0]; sub.textContent = L[1] || ''; sub.hidden = !L[1];
    goBtn.textContent = lines('update').join(' / '); laterBtn.textContent = lines('later').join(' / ');
    btns.hidden = state !== 'ready';
    card.className = 'upk on s-' + state;
    var shown = state === 'ready' ? 100 : pct;
    ring.style.strokeDashoffset = state === 'installing' ? '' : String(RING * (1 - shown / 100));
    pctEl.textContent = state === 'downloading' ? Math.round(pct) + '%' : state === 'ready' ? '↑' : '';
    card.setAttribute('aria-busy', state === 'downloading' || state === 'installing' ? 'true' : 'false');
  }

  function showDone() {
    var ts = 0;
    try { ts = +localStorage.getItem(flagKey()); localStorage.removeItem(flagKey()); } catch (e) { return; }
    if (!ts || Date.now() - ts > DONE_TTL) return;
    setTimeout(function () {
      var L = lines('done'); toastA.textContent = L[0]; toastB.textContent = L[1] || ''; toastB.hidden = !L[1];
      toast.classList.add('on'); clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove('on'); }, DONE_SHOWN);
    }, 500);
  }

  /* ---------- update logic ---------- */
  function reload() { if (reloading) return; reloading = true; location.reload(); }
  function restartSoon() { setTimeout(reload, Math.max(0, MIN_INSTALLING - (Date.now() - installStart))); }

  function doUpdate() {
    if (state !== 'ready') return;
    state = 'installing'; installStart = Date.now(); render();
    try { localStorage.setItem(flagKey(), String(Date.now())); } catch (e) {}
    var w = reg && reg.waiting;
    if (w) {
      w.postMessage({ type: 'SKIP_WAITING' });          // worker activates -> controllerchange -> reload
      setTimeout(reload, RESTART_FALLBACK);
    } else {
      restartSoon();                                    // content-only update: a reload fetches it
    }
  }

  function toReady() { state = 'ready'; render(); }

  function onWorkerState(w) {
    if (w.state === 'installed') {
      if (state === 'installing') return;
      pct = 100; state = 'downloading'; render();
      setTimeout(function () { if (state === 'downloading') toReady(); }, HOLD_100);
    } else if (w.state === 'redundant' && state === 'downloading') {
      state = 'idle'; render();                         // download failed; the next check retries
    }
  }

  function watch(w) {
    if (!w || !navigator.serviceWorker.controller) return;   // first install: nothing to update
    if (state === 'installing') return;
    if (state !== 'downloading') { pct = 0; curV = null; state = 'downloading'; render(); }
    w.addEventListener('statechange', function () { onWorkerState(w); });
    onWorkerState(w);
  }

  function onMessage(e) {
    var d = e.data;
    if (!d || d.type !== 'upk-progress' || !navigator.serviceWorker.controller) return;
    if (state === 'installing' || state === 'ready') return;
    if (!reg || !reg.installing) return;                // stray message from a worker that already failed or finished
    if (d.v !== curV) { curV = d.v; pct = 0; }
    pct = Math.max(pct, Math.min(100, +d.pct || 0));
    if (state !== 'downloading') state = 'downloading';
    render();
  }

  function check(force) {
    var now = Date.now();
    if (!force && now - last < MIN_GAP) return;
    last = now;
    if (!reg) return;
    if (state === 'downloading' && !reg.installing && !reg.waiting) { state = 'idle'; render(); }   // download died: reset
    if (state === 'idle' && reg.waiting && navigator.serviceWorker.controller) toReady();   // downloaded earlier, not installed yet
    if (!navigator.onLine) return;
    reg.update().catch(noop);
    if (opts.extraCheck) {
      Promise.resolve().then(opts.extraCheck).then(function (has) {
        if (has && state === 'idle') toReady();
      }).catch(noop);
    }
  }

  function start() {
    navigator.serviceWorker.register(opts.sw || 'sw.js', { updateViaCache: 'none' }).then(function (r) {
      reg = r;
      r.addEventListener('updatefound', function () { watch(r.installing); });
      if (r.installing) watch(r.installing);
      check(true);
    }).catch(noop);
  }

  function init(o) {
    if (started) return; started = true;
    opts = o || {};
    var go = function () {
      build(); render(); showDone();
      navigator.serviceWorker.addEventListener('message', onMessage);
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        var was = hasCtl; hasCtl = !!navigator.serviceWorker.controller;
        if (!was || reloading) return;                  // first install taking control
        if (state === 'installing') restartSoon();      // the Update we just asked for
        else { state = 'idle'; toReady(); }             // another tab updated: offer a restart here too
      });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
      addEventListener('pageshow', function (e) { if (e.persisted) check(); });
      setInterval(check, CHECK_EVERY);
      if (document.readyState === 'complete') start(); else addEventListener('load', start);
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  window.UpdateKit = {
    init: init,
    refresh: function () { render(); },
    check: check
  };
})();
