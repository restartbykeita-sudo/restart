const CACHE='trail-scan-v2-20260718';
const LOCAL=['./','./index.html','./login.html','./admin/index.html','./scanner/index.html','./manifest.webmanifest','./assets/config.js','./assets/css/app.css','./assets/js/core.js','./assets/js/idb.js','./assets/js/scanner.js'];
const REMOTE=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(LOCAL);for(const u of REMOTE)try{const r=await fetch(u);if(r.ok)await c.put(u,r)}catch{}await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const n of await caches.keys())if(n!==CACHE)await caches.delete(n);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin===location.origin||REMOTE.includes(e.request.url))e.respondWith((async()=>{const old=await caches.match(e.request);try{const r=await fetch(e.request);if(r.ok)(await caches.open(CACHE)).put(e.request,r.clone());return r}catch{return old||caches.match('./scanner/index.html')}})())});
