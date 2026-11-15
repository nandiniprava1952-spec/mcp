const V='mcp-v5',A=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','cover.jpg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(A)).then(()=>skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim())));
// cache-first with background refresh: app shell and GitHub reference images work offline after first view
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
 e.respondWith(caches.open(V).then(async c=>{const m=await c.match(e.request,{ignoreSearch:true});
  const n=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>m);
  return m||n}))});
