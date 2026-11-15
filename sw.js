const V='mcp-v12',R='mcp-ref',A=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','cover.jpg'];
// install: save each app file and tell the page the progress (drives the update circle/line)
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(V);
 for(let n=0;n<A.length;){const r=await fetch(A[n],{cache:'reload'});if(!r.ok)throw 0;await c.put(A[n],r);n++;
  (await clients.matchAll({includeUncontrolled:true})).forEach(w=>w.postMessage({p:n/A.length}))}
 await skipWaiting()})()));
// keep the downloaded reference images (R) across app updates
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!==R).map(x=>caches.delete(x)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
 const u=new URL(e.request.url),own=u.origin===location.origin;
 e.respondWith(caches.open(own?V:R).then(async c=>{const m=await c.match(e.request,{ignoreSearch:own,ignoreVary:true});
  const n=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>m);
  return m||n}))});
