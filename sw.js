const V='mcp-v20',R='mcp-ref',A=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','cover.jpg','update-kit.js'];
// install: download every app file and report the real progress to the page (drives the update ring).
// The new version then WAITS; it is switched on only when the user taps "Update" (see update-kit.js).
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(V);let n=0,dead=0;
 const say=async p=>{const l=await clients.matchAll({includeUncontrolled:true,type:'window'});if(!dead)l.forEach(w=>w.postMessage({type:'upk-progress',v:V,pct:p}))};
 await say(0);
 try{await Promise.all(A.map(async u=>{const r=await fetch(u,{cache:'reload'});if(!r.ok)throw new Error(u);await c.put(u,r);await say(Math.round(++n/A.length*100))}))}catch(x){dead=1;throw x}})()));
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
// keep the downloaded reference images (R) across app updates
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!==R).map(x=>caches.delete(x)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
 const u=new URL(e.request.url),own=u.origin===location.origin;
 e.respondWith(caches.open(own?V:R).then(async c=>{const m=await c.match(e.request,{ignoreSearch:own,ignoreVary:true});
  const n=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>m);
  return m||n}))});
