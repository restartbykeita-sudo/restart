(() => {
  const NAME='trail-scan-offline-v2',VER=1;
  const open=()=>new Promise((res,rej)=>{const r=indexedDB.open(NAME,VER);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('manifest'))d.createObjectStore('manifest',{keyPath:'key'});if(!d.objectStoreNames.contains('scans')){const s=d.createObjectStore('scans',{keyPath:'offline_id'});s.createIndex('sync_status','sync_status');s.createIndex('created_at','created_at')}if(!d.objectStoreNames.contains('settings'))d.createObjectStore('settings',{keyPath:'key'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  async function op(store,mode,fn){const d=await open();return new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store);let r;try{r=fn(s)}catch(e){rej(e)}t.oncomplete=()=>res(r?.result);t.onerror=()=>rej(t.error)})}
  window.IDBStore={put:(s,v)=>op(s,'readwrite',x=>x.put(v)),get:(s,k)=>op(s,'readonly',x=>x.get(k)),all:s=>op(s,'readonly',x=>x.getAll()),clear:s=>op(s,'readwrite',x=>x.clear()),async pending(){return(await this.all('scans')).filter(x=>x.sync_status!=='SYNCED').sort((a,b)=>a.created_at.localeCompare(b.created_at))}};
})();
