const CACHE='trail-scan-v6-6.2.0';
const LOCAL=[
  './','./index.html','./login.html','./pending.html','./results.html',
  './admin/index.html','./scanner/index.html','./manifest.webmanifest',
  './assets/css/app.css?v=6.2.0','./assets/js/core.js?v=6.2.0',
  './assets/js/idb.js?v=6.2.0','./assets/js/login.js?v=6.2.0',
  './assets/js/pending.js?v=6.2.0','./assets/js/public-results.js?v=6.2.0',
  './assets/js/scanner.js?v=6.2.0','./assets/js/admin.js?v=6.2.0'
];
const REMOTE=[
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'
];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  for(const url of LOCAL){try{const r=await fetch(url,{cache:'reload'});if(r.ok)await cache.put(url,r)}catch{}}
  for(const url of REMOTE){try{const r=await fetch(url,{cache:'no-store'});if(r.ok)await cache.put(url,r)}catch{}}
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin&&url.pathname.endsWith('/assets/config.js')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));return;
  }
  if(url.origin===self.location.origin||REMOTE.includes(event.request.url)){
    event.respondWith((async()=>{
      try{const response=await fetch(event.request,{cache:'no-cache'});if(response.ok)(await caches.open(CACHE)).put(event.request,response.clone());return response}
      catch{return (await caches.match(event.request))||(await caches.match('./scanner/index.html'))}
    })());
  }
});
