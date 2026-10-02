(function(){
'use strict';
const INSTANCES=new Set();
const I18N={
 th:{route:'เส้นทางการแข่งขัน',distance:'ระยะทาง',ascent:'ไต่ขึ้นสะสม',descent:'ลงสะสม',high:'จุดสูงสุด',low:'จุดต่ำสุด',position:'ตำแหน่งบนเส้นทาง',elevation:'ความสูง',progress:'ความคืบหน้า',play:'เล่น',pause:'หยุด',replay:'เริ่มใหม่',follow:'ติดตาม',overview:'ดูทั้งหมด',terrain:'ภูมิประเทศจริง',view:'2D / 3D',fullscreen:'เต็มจอ',speed:'ความเร็ว',start:'START',finish:'FINISH',loading:'กำลังอ่าน GPX และเตรียมเส้นทาง…',error:'เปิดเส้นทางไม่สำเร็จ',remaining:'เหลือ',checkpoint:'CHECKPOINT',water:'จุดให้น้ำ',arrived:'ถึงจุดนี้แล้ว',km:'กม.'},
 en:{route:'Race Route',distance:'Distance',ascent:'Total ascent',descent:'Total descent',high:'Highest point',low:'Lowest point',position:'Route position',elevation:'Elevation',progress:'Progress',play:'Play',pause:'Pause',replay:'Replay',follow:'Follow',overview:'Overview',terrain:'Satellite terrain',view:'2D / 3D',fullscreen:'Fullscreen',speed:'Speed',start:'START',finish:'FINISH',loading:'Reading GPX and preparing route…',error:'Unable to open route',remaining:'remaining',checkpoint:'CHECKPOINT',water:'WATER',arrived:'Reached this point',km:'km'},
 zh:{route:'比赛路线',distance:'距离',ascent:'累计爬升',descent:'累计下降',high:'最高点',low:'最低点',position:'路线位置',elevation:'海拔',progress:'进度',play:'播放',pause:'暂停',replay:'重播',follow:'跟随',overview:'全览',terrain:'真实地形',view:'2D / 3D',fullscreen:'全屏',speed:'速度',start:'起点',finish:'终点',loading:'正在读取 GPX…',error:'无法打开路线',remaining:'剩余',checkpoint:'检查点',water:'补水',arrived:'已到达',km:'公里'},
 ja:{route:'コース',distance:'距離',ascent:'累積上昇',descent:'累積下降',high:'最高地点',low:'最低地点',position:'現在位置',elevation:'標高',progress:'進捗',play:'再生',pause:'一時停止',replay:'リプレイ',follow:'追従',overview:'全体表示',terrain:'衛星地形',view:'2D / 3D',fullscreen:'全画面',speed:'速度',start:'START',finish:'FINISH',loading:'GPXを読み込み中…',error:'ルートを開けません',remaining:'残り',checkpoint:'CHECKPOINT',water:'給水',arrived:'到着',km:'km'},
 ru:{route:'Маршрут',distance:'Дистанция',ascent:'Набор высоты',descent:'Спуск',high:'Макс. высота',low:'Мин. высота',position:'Позиция',elevation:'Высота',progress:'Прогресс',play:'Старт',pause:'Пауза',replay:'Повтор',follow:'Следовать',overview:'Весь маршрут',terrain:'Спутниковый рельеф',view:'2D / 3D',fullscreen:'Полный экран',speed:'Скорость',start:'START',finish:'FINISH',loading:'Чтение GPX…',error:'Не удалось открыть маршрут',remaining:'осталось',checkpoint:'CHECKPOINT',water:'ВОДА',arrived:'Точка достигнута',km:'км'}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=v=>v*Math.PI/180;
function haversine(a,b){const R=6371000,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function bearing(a,b){const p1=rad(a.lat),p2=rad(b.lat),dl=rad(b.lon-a.lon);const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return (Math.atan2(y,x)*180/Math.PI+360)%360}
function parseGpx(text){
 const xml=new DOMParser().parseFromString(text,'application/xml');
 if(xml.querySelector('parsererror'))throw new Error('Invalid GPX');
 let nodes=[...xml.getElementsByTagNameNS('*','trkpt')];
 if(!nodes.length)nodes=[...xml.getElementsByTagNameNS('*','rtept')];
 if(nodes.length<2)throw new Error('No GPX route points');
 const pts=nodes.map(n=>({lat:Number(n.getAttribute('lat')),lon:Number(n.getAttribute('lon')),ele:Number(n.getElementsByTagNameNS('*','ele')[0]?.textContent||0),distance:0,ascent:0})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(p.ele));
 let total=0,asc=0,desc=0;
 for(let i=1;i<pts.length;i++){total+=haversine(pts[i-1],pts[i]);const de=pts[i].ele-pts[i-1].ele;if(de>0)asc+=de;else desc-=de;pts[i].distance=total;pts[i].ascent=asc}
 return{points:pts,totalDistance:total,ascent:asc,descent:desc,minElevation:Math.min(...pts.map(p=>p.ele)),maxElevation:Math.max(...pts.map(p=>p.ele))}
}
function pointAt(state,progress){
 const target=state.totalDistance*clamp(progress,0,1),p=state.points;let lo=0,hi=p.length-1;
 while(lo<hi){const m=(lo+hi)>>1;if(p[m].distance<target)lo=m+1;else hi=m}
 const r=Math.max(1,lo),a=p[r-1],b=p[r],span=Math.max(.001,b.distance-a.distance),q=clamp((target-a.distance)/span,0,1);
 return{lat:a.lat+(b.lat-a.lat)*q,lon:a.lon+(b.lon-a.lon)*q,ele:a.ele+(b.ele-a.ele)*q,ascent:a.ascent+(b.ascent-a.ascent)*q,distance:target,index:r,bearing:bearing(a,b)}
}
function line(coords){return{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}}
function point(coords){return{type:'Feature',properties:{},geometry:{type:'Point',coordinates:coords}}}
function style(){return{
 version:8,
 sources:{
  osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'},
  imagery:{type:'raster',tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Esri, Maxar, Earthstar Geographics, and the GIS User Community'},
  'terrain-dem':{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,maxzoom:15,encoding:'terrarium',attribution:'Elevation data © AWS Terrain Tiles'}
 },
 layers:[
  {id:'osm',type:'raster',source:'osm',paint:{'raster-saturation':-.18,'raster-brightness-max':.88,'raster-contrast':.08}},
  {id:'imagery',type:'raster',source:'imagery',layout:{visibility:'none'},paint:{'raster-saturation':.08,'raster-contrast':.08,'raster-brightness-min':.03,'raster-brightness-max':.95}},
  {id:'terrain-hillshade',type:'hillshade',source:'terrain-dem',layout:{visibility:'none'},paint:{'hillshade-exaggeration':.28,'hillshade-shadow-color':'#17201d','hillshade-highlight-color':'#f4ead0','hillshade-accent-color':'#655d4b'}}
 ]
}}
function endpoint(map,label,coord,kind){
 const el=document.createElement('div');el.className='rr-route-endpoint '+kind;el.textContent=label;
 return new maplibregl.Marker({element:el,anchor:'center'}).setLngLat(coord).addTo(map)
}
function kmMarker(map,km,coord){
 const el=document.createElement('div');el.className='rr-route-km';el.textContent=km;
 return new maplibregl.Marker({element:el,anchor:'center'}).setLngLat(coord).addTo(map)
}
function cpLabel(pt,t){
 if(pt.point_type==='CP_WATER')return (pt.code||t.checkpoint)+' · '+t.water;
 if(pt.point_type==='WATER')return pt.code||t.water;
 if(pt.point_type==='FOOD')return pt.code||(t===I18N.th?'อาหาร':'FOOD');
 if(pt.point_type==='MEDICAL')return pt.code||(t===I18N.th?'แพทย์':'MEDICAL');
 if(pt.point_type==='VIEWPOINT')return pt.code||(t===I18N.th?'จุดชมวิว':'VIEW');
 if(pt.point_type==='INFO')return pt.code||'INFO';
 if(pt.point_type==='CUSTOM')return pt.code||'POINT';
 return pt.code||t.checkpoint
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function mercatorWorld(lat,lon){
 const clamped=clamp(Number(lat),-85.05112878,85.05112878),x=(Number(lon)+180)/360;
 const s=Math.sin(rad(clamped)),y=.5-Math.log((1+s)/(1-s))/(4*Math.PI);
 return{x,y}
}
class RouteAnimation{
 constructor(root,route,coursePoints,opts={}){
  this.root=root;this.route=route;this.coursePoints=(coursePoints||[]).filter(x=>x.is_active!==false).sort((a,b)=>Number(a.distance_km)-Number(b.distance_km));this.lang=opts.lang||'th';this.t=I18N[this.lang]||I18N.en;
  this.state={map:null,points:[],totalDistance:0,ascent:0,descent:0,minElevation:0,maxElevation:0,progress:0,playing:false,speed:1,follow:true,is3D:true,topo:false,raf:0,last:0,holdUntil:0,reached:new Set(),markers:[]};
  this.renderShell();this.load()
 }
 renderShell(){
  const t=this.t,name=(this.route.name&&typeof this.route.name==='object'?(this.route.name[this.lang]||this.route.name.th||this.route.name.en):this.route.name)||t.route;
  const description=(this.route.description&&typeof this.route.description==='object'?(this.route.description[this.lang]||this.route.description.th||this.route.description.en):this.route.description)||'';
  const linked=(this.route.restart_route_categories||[]).map(x=>x.restart_race_categories).filter(Boolean);
  const chips=linked.length?'<div class="rr-route-cats">'+linked.map(c=>'<span>'+escapeHtml((c.name&&typeof c.name==='object'?(c.name[this.lang]||c.name.th||c.name.en):c.name)||'')+(c.distance_km!=null?' · '+c.distance_km+' km':'')+'</span>').join('')+'</div>':'';
  this.root.innerHTML='<div class="rr-route-head"><div><span class="preview-section-kicker">GPX · ANIMATED COURSE</span><h2>'+escapeHtml(name)+'</h2>'+(description?'<p class="rr-route-description">'+escapeHtml(description)+'</p>':'')+chips+'</div><a class="rr-route-download" href="'+escapeHtml(this.route.gpx_url)+'" target="_blank" rel="noopener">GPX ↗</a></div>'+
  '<div class="rr-route-stage"><div class="rr-route-map"></div><div class="rr-route-loading">'+escapeHtml(t.loading)+'</div><div class="rr-route-toast" hidden></div>'+
  '<div class="rr-route-stats">'+
   '<div><span>'+escapeHtml(t.position)+'</span><b data-v="position">0.00 '+escapeHtml(t.km)+'</b></div>'+
   '<div><span>'+escapeHtml(t.elevation)+'</span><b data-v="elevation">— m</b></div>'+
   '<div><span>'+escapeHtml(t.ascent)+'</span><b data-v="ascent">0 m</b></div>'+
   '<div><span>'+escapeHtml(t.progress)+'</span><b data-v="progress">0%</b></div>'+
  '</div></div>'+
  '<div class="rr-route-summary">'+
   '<div><span>'+escapeHtml(t.distance)+'</span><b data-v="distance">—</b></div>'+
   '<div><span>'+escapeHtml(t.ascent)+'</span><b data-v="totalAscent">—</b></div>'+
   '<div><span>'+escapeHtml(t.descent)+'</span><b data-v="descent">—</b></div>'+
   '<div><span>'+escapeHtml(t.high)+'</span><b data-v="high">—</b></div>'+
   '<div><span>'+escapeHtml(t.low)+'</span><b data-v="low">—</b></div>'+
  '</div>'+
  '<div class="rr-route-profile"><canvas></canvas></div>'+
  '<div class="rr-route-player"><button type="button" data-a="play" class="rr-route-primary">▶ '+escapeHtml(t.play)+'</button><button type="button" data-a="replay">↺ '+escapeHtml(t.replay)+'</button><input data-a="seek" type="range" min="0" max="1000" value="0" aria-label="'+escapeHtml(t.progress)+'"><button type="button" data-a="follow" class="is-on">⌖ '+escapeHtml(t.follow)+'</button><select data-a="speed" aria-label="'+escapeHtml(t.speed)+'"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select><button type="button" data-a="overview">'+escapeHtml(t.overview)+'</button><button type="button" data-a="terrain">'+escapeHtml(t.terrain)+'</button><button type="button" data-a="view">'+escapeHtml(t.view)+'</button><button type="button" data-a="full">⛶</button></div>';
  this.mapEl=this.root.querySelector('.rr-route-map');this.loading=this.root.querySelector('.rr-route-loading');this.toast=this.root.querySelector('.rr-route-toast');this.canvas=this.root.querySelector('canvas');
  this.root.querySelector('[data-a="play"]').onclick=()=>this.toggle();
  this.root.querySelector('[data-a="replay"]').onclick=()=>this.replay();
  this.root.querySelector('[data-a="seek"]').oninput=e=>{this.state.playing=false;this.state.progress=Number(e.target.value)/1000;this.update(false)};
  this.root.querySelector('[data-a="follow"]').onclick=e=>{this.state.follow=!this.state.follow;e.currentTarget.classList.toggle('is-on',this.state.follow)};
  this.root.querySelector('[data-a="speed"]').onchange=e=>this.state.speed=Number(e.target.value)||1;
  this.root.querySelector('[data-a="overview"]').onclick=()=>this.fit();
  this.root.querySelector('[data-a="terrain"]').onclick=()=>this.toggleTerrain();
  this.root.querySelector('[data-a="view"]').onclick=()=>this.toggleView();
  this.root.querySelector('[data-a="full"]').onclick=()=>this.root.requestFullscreen?.();
  this.updateModeButtons();
 }
 async load(){
  try{
   const res=await fetch(this.route.gpx_url,{cache:'no-store'});if(!res.ok)throw new Error('GPX HTTP '+res.status);
   Object.assign(this.state,parseGpx(await res.text()));
   let mapped=false;
   if(window.maplibregl){try{this.initMap();mapped=true}catch(err){console.warn('MapLibre fallback',err)}}
   if(!mapped)this.initFallback();
   this.updateSummary();this.drawChart();this.loading.hidden=true
  }catch(e){this.loading.textContent=this.t.error+' · '+(e.message||e);this.loading.classList.add('is-error')}
 }
 initMap(){
  const p=this.state.points,center=[p[0].lon,p[0].lat];
  this.state.map=new maplibregl.Map({container:this.mapEl,style:style(),center,zoom:13,pitch:46,bearing:-18,attributionControl:true});
  this.state.map.addControl(new maplibregl.NavigationControl({showCompass:true}),'top-right');
  this.state.map.on('load',()=>{
   const coords=p.map(x=>[x.lon,x.lat]);
   this.state.map.addSource('route',{type:'geojson',data:line(coords)});
   this.state.map.addLayer({id:'route-shadow',type:'line',source:'route',paint:{'line-color':'#08090d','line-width':8,'line-opacity':.66}});
   this.state.map.addLayer({id:'route-full',type:'line',source:'route',paint:{'line-color':'#c64fd7','line-width':5,'line-opacity':.92}});
   this.state.map.addSource('route-passed',{type:'geojson',data:line([[p[0].lon,p[0].lat],[p[0].lon,p[0].lat]])});
   this.state.map.addLayer({id:'route-passed',type:'line',source:'route-passed',paint:{'line-color':'#ffb24d','line-width':6,'line-opacity':1}});
   this.state.map.addSource('runner',{type:'geojson',data:point(center)});
   this.state.map.addLayer({id:'runner',type:'circle',source:'runner',paint:{'circle-radius':8,'circle-color':'#fff','circle-stroke-width':5,'circle-stroke-color':'#ff4d8d'}});
   endpoint(this.state.map,this.t.start,[p[0].lon,p[0].lat],'start');endpoint(this.state.map,this.t.finish,[p[p.length-1].lon,p[p.length-1].lat],'finish');
   if(this.route.show_km_markers!==false){for(let km=1;km<=Math.floor(this.state.totalDistance/1000);km++){if(this.coursePoints.some(cp=>Math.abs(Number(cp.distance_km)-km)<.2))continue;const x=pointAt(this.state,km*1000/this.state.totalDistance);kmMarker(this.state.map,km,[x.lon,x.lat])}}
   this.addCoursePoints();
   this.applyTerrainModel();
   this.applyBaseLayerMode();
   this.fit();this.update(false)
  })
 }
 initFallback(){
  const pts=this.state.points,W=1000,H=620,pad=54;
  const worlds=pts.map(p=>mercatorWorld(p.lat,p.lon));
  const minWX=Math.min(...worlds.map(p=>p.x)),maxWX=Math.max(...worlds.map(p=>p.x));
  const minWY=Math.min(...worlds.map(p=>p.y)),maxWY=Math.max(...worlds.map(p=>p.y));
  const spanWX=Math.max(1e-9,maxWX-minWX),spanWY=Math.max(1e-9,maxWY-minWY);
  let z=Math.floor(Math.log2(Math.min((W-pad*2)/(spanWX*256),(H-pad*2)/(spanWY*256))));
  z=Math.max(2,Math.min(18,Number.isFinite(z)?z:13));
  const n=2**z;
  const worldPx=p=>({x:p.x*n*256,y:p.y*n*256});
  const pMin=worldPx({x:minWX,y:minWY}),pMax=worldPx({x:maxWX,y:maxWY});
  const spanPX=Math.max(1,pMax.x-pMin.x),spanPY=Math.max(1,pMax.y-pMin.y);
  const scale=Math.min((W-pad*2)/spanPX,(H-pad*2)/spanPY);
  const offsetX=(W-spanPX*scale)/2-pMin.x*scale;
  const offsetY=(H-spanPY*scale)/2-pMin.y*scale;
  const xy=p=>{const w=worldPx(mercatorWorld(p.lat,p.lon));return{x:w.x*scale+offsetX,y:w.y*scale+offsetY}};
  const minTX=Math.floor(pMin.x/256)-1,maxTX=Math.floor(pMax.x/256)+1;
  const minTY=Math.max(0,Math.floor(pMin.y/256)-1),maxTY=Math.min(n-1,Math.floor(pMax.y/256)+1);
  let tiles='';
  for(let ty=minTY;ty<=maxTY;ty++)for(let tx=minTX;tx<=maxTX;tx++){
    const wrapped=((tx%n)+n)%n,x=tx*256*scale+offsetX,y=ty*256*scale+offsetY,size=256*scale;
    tiles+='<image href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+z+'/'+ty+'/'+wrapped+'" x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+(size+1).toFixed(2)+'" height="'+(size+1).toFixed(2)+'" preserveAspectRatio="none"/>';
  }
  const all=pts.map(p=>{const q=xy(p);return q.x.toFixed(2)+','+q.y.toFixed(2)}).join(' ');
  this.state.is3D=false;
  this.mapEl.classList.add('is-svg-fallback');
  this.mapEl.classList.remove('is-3d','is-terrain');
  this.mapEl.innerHTML='<svg class="rr-route-fallback-svg" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet">'+
   '<defs><linearGradient id="rrRouteGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#cc59e3"/><stop offset="55%" stop-color="#ff4d8d"/><stop offset="100%" stop-color="#ffb24d"/></linearGradient><filter id="rrGlow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
   '<rect class="rr-fallback-bg" width="1000" height="620" fill="#101117"/>'+
   '<g class="rr-fallback-grid" opacity=".12">'+Array.from({length:12},(_,i)=>'<line x1="0" y1="'+(50+i*48)+'" x2="1000" y2="'+(50+i*48)+'" stroke="#fff" stroke-width="1"/>').join('')+'</g>'+
   '<g class="rr-fallback-satellite">'+tiles+'<rect width="1000" height="620" fill="rgba(0,0,0,.10)"/></g>'+
   '<polyline points="'+all+'" fill="none" stroke="#090a0e" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>'+
   '<polyline points="'+all+'" fill="none" stroke="url(#rrRouteGlow)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>'+
   '<polyline class="rr-fallback-passed" points="" fill="none" stroke="#ffb24d" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#rrGlow)"/>'+
   '<g class="rr-fallback-markers"></g>'+
   '<circle class="rr-fallback-runner-halo" r="18" fill="rgba(255,77,141,.22)"/><circle class="rr-fallback-runner" r="9" fill="#fff" stroke="#ff4d8d" stroke-width="6"/>'+
   '<text class="rr-fallback-attribution" x="984" y="604" text-anchor="end">Satellite © Esri, Maxar, Earthstar Geographics</text>'+
   '</svg>';
  const svg=this.mapEl.querySelector('svg'),markers=svg.querySelector('.rr-fallback-markers');
  const addMarker=(p,label,kind)=>{
    const q=xy(p),g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('transform','translate('+q.x+' '+q.y+')');g.setAttribute('class','rr-fallback-marker '+kind);
    g.innerHTML='<circle r="16"></circle><text text-anchor="middle" dominant-baseline="central">'+escapeHtml(label)+'</text>';markers.appendChild(g)
  };
  addMarker(pts[0],this.t.start,'start');addMarker(pts[pts.length-1],this.t.finish,'finish');
  this.coursePoints.forEach(cp=>{if(Number(cp.distance_km)*1000>this.state.totalDistance)return;const p=pointAt(this.state,Number(cp.distance_km)*1000/this.state.totalDistance),q=xy(p),g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('transform','translate('+q.x+' '+q.y+')');g.setAttribute('class','rr-fallback-cp');g.innerHTML='<circle r="13"></circle><text y="-20" text-anchor="middle">'+escapeHtml(cpLabel(cp,this.t))+'</text>';g.style.cursor='pointer';g.addEventListener('click',()=>this.showPoint(cp,false));markers.appendChild(g)});
  this.state.fallback={xy,svg,passed:svg.querySelector('.rr-fallback-passed'),runner:svg.querySelector('.rr-fallback-runner'),halo:svg.querySelector('.rr-fallback-runner-halo'),satellite:true,real3D:false};
  this.updateModeButtons();
  this.update(false)
 }
 addCoursePoints(){
  this.coursePoints.forEach(cp=>{if(Number(cp.distance_km)*1000>this.state.totalDistance)return;const x=pointAt(this.state,Number(cp.distance_km)*1000/this.state.totalDistance);const el=document.createElement('button');el.type='button';el.className='rr-route-cp '+((cp.point_type==='CP_WATER'||cp.point_type==='WATER')?'is-water':cp.point_type==='MEDICAL'?'is-medical':cp.point_type==='FOOD'?'is-food':cp.point_type==='VIEWPOINT'?'is-view':'');el.innerHTML='<strong>'+escapeHtml(cpLabel(cp,this.t))+'</strong><small>'+Number(cp.distance_km).toFixed(Number(cp.distance_km)%1?1:0)+' '+escapeHtml(this.t.km)+'</small>';el.onclick=()=>this.showPoint(cp,false);new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([x.lon,x.lat]).addTo(this.state.map)})
 }
 updateSummary(){
  const s=this.state,nf=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1});
  this.set('distance',nf(s.totalDistance/1000)+' '+this.t.km);this.set('totalAscent',nf(s.ascent)+' m');this.set('descent',nf(s.descent)+' m');this.set('high',nf(s.maxElevation)+' m');this.set('low',nf(s.minElevation)+' m')
 }
 set(key,value){const el=this.root.querySelector('[data-v="'+key+'"]');if(el)el.textContent=value}
 update(moveCamera=true){
  const s=this.state;if(!s.points?.length)return;const x=pointAt(s,s.progress),pct=Math.round(s.progress*100);
  this.set('position',(x.distance/1000).toFixed(2)+' '+this.t.km);this.set('elevation',Math.round(x.ele)+' m');this.set('ascent',Math.round(x.ascent)+' m');this.set('progress',pct+'%');
  this.root.querySelector('[data-a="seek"]').value=Math.round(s.progress*1000);
  if(s.map?.getSource('runner')){
   s.map.getSource('runner').setData(point([x.lon,x.lat]));
   const passed=s.points.slice(0,Math.max(1,x.index)).map(p=>[p.lon,p.lat]);passed.push([x.lon,x.lat]);if(passed.length<2)passed.push([x.lon,x.lat]);s.map.getSource('route-passed').setData(line(passed));
   if(moveCamera&&s.follow){const now=performance.now();if(now-(s.lastCameraUpdate||0)>160){s.lastCameraUpdate=now;s.map.easeTo({center:[x.lon,x.lat],bearing:s.is3D?x.bearing-15:0,pitch:s.is3D?48:0,duration:220,zoom:15})}}
  }else if(s.fallback){
   const q=s.fallback.xy(x),passedPts=s.points.slice(0,Math.max(1,x.index)).map(p=>{const a=s.fallback.xy(p);return a.x.toFixed(2)+','+a.y.toFixed(2)});passedPts.push(q.x.toFixed(2)+','+q.y.toFixed(2));
   s.fallback.passed.setAttribute('points',passedPts.join(' '));s.fallback.runner.setAttribute('cx',q.x);s.fallback.runner.setAttribute('cy',q.y);s.fallback.halo.setAttribute('cx',q.x);s.fallback.halo.setAttribute('cy',q.y)
  }
  this.checkPoints(x.distance);this.drawChart(x.distance)
 }
 checkPoints(distance){
  this.coursePoints.forEach(cp=>{const d=Number(cp.distance_km)*1000;if(distance>=d&&!this.state.reached.has(cp.id)){this.state.reached.add(cp.id);this.state.holdUntil=performance.now()+Math.max(0,Number(cp.pause_seconds??1.5))*1000;this.showPoint(cp,true)}})
 }
 showPoint(cp,arrival){
  if(arrival&&cp.popup_enabled===false)return;
  const name=cp.name&&typeof cp.name==='object'?(cp.name[this.lang]||cp.name.th||cp.name.en):cp.name;
  const desc=cp.description&&typeof cp.description==='object'?(cp.description[this.lang]||cp.description.th||cp.description.en):cp.description;
  const cutoff=cp.cutoff_minutes!=null?'<p class="rr-route-cutoff">Cutoff · '+Math.floor(Number(cp.cutoff_minutes)/60)+'h '+(Number(cp.cutoff_minutes)%60)+'m</p>':'';
  this.toast.innerHTML=(cp.image_url?'<img src="'+escapeHtml(cp.image_url)+'" alt="">':'')+'<div><span>'+escapeHtml(cpLabel(cp,this.t))+' · '+Number(cp.distance_km).toFixed(Number(cp.distance_km)%1?1:0)+' '+escapeHtml(this.t.km)+'</span><strong>'+escapeHtml(name||this.t.arrived)+'</strong>'+cutoff+(desc?'<p>'+escapeHtml(desc)+'</p>':'')+'</div>';
  this.toast.hidden=false;this.toast.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{this.toast.classList.remove('show');setTimeout(()=>this.toast.hidden=true,250)},arrival?3300:5000)
 }
 toggle(){this.state.playing=!this.state.playing;this.root.querySelector('[data-a="play"]').innerHTML=this.state.playing?'❚❚ '+escapeHtml(this.t.pause):'▶ '+escapeHtml(this.t.play);if(this.state.playing){this.state.last=performance.now();this.loop(this.state.last)}}
 loop(now){if(!this.state.playing)return;const s=this.state;if(now<s.holdUntil){s.last=now;s.raf=requestAnimationFrame(t=>this.loop(t));return}const dt=Math.max(0,now-s.last);s.last=now;const duration=Math.max(10,Number(this.route.animation_duration_seconds||48))*1000;s.progress=clamp(s.progress+dt*s.speed/duration,0,1);this.update(true);if(s.progress>=1){s.playing=false;this.root.querySelector('[data-a="play"]').innerHTML='▶ '+escapeHtml(this.t.play);return}s.raf=requestAnimationFrame(t=>this.loop(t))}
 replay(){cancelAnimationFrame(this.state.raf);this.state.playing=false;this.state.progress=0;this.state.reached.clear();this.state.holdUntil=0;this.root.querySelector('[data-a="play"]').innerHTML='▶ '+escapeHtml(this.t.play);this.update(false);this.fit()}
 fit(){if(!this.state.points.length)return;if(!this.state.map)return;const b=new maplibregl.LngLatBounds();this.state.points.forEach(p=>b.extend([p.lon,p.lat]));this.state.follow=false;this.root.querySelector('[data-a="follow"]')?.classList.remove('is-on');this.state.map.fitBounds(b,{padding:window.innerWidth<700?44:70,pitch:this.state.is3D?36:0,bearing:this.state.is3D?-18:0,duration:700})}
 applyBaseLayerMode(){
  const map=this.state.map;
  if(!map)return;
  if(map.getLayer('imagery'))map.setLayoutProperty('imagery','visibility',this.state.topo?'visible':'none');
  if(map.getLayer('osm'))map.setLayoutProperty('osm','visibility',this.state.topo?'none':'visible');
  if(map.getLayer('terrain-hillshade'))map.setLayoutProperty('terrain-hillshade','visibility',this.state.topo?'visible':'none');
 }
 applyTerrainModel(){
  const map=this.state.map;
  if(!map)return;
  try{
   if(this.state.is3D&&map.getSource('terrain-dem')){
    map.setTerrain({source:'terrain-dem',exaggeration:1.28});
   }else{
    map.setTerrain(null);
   }
  }catch(err){console.warn('3D terrain unavailable',err)}
 }
 updateModeButtons(){
  const terrainBtn=this.root.querySelector('[data-a="terrain"]');
  const viewBtn=this.root.querySelector('[data-a="view"]');
  if(terrainBtn){
   terrainBtn.disabled=false;
   terrainBtn.classList.toggle('is-on',!!this.state.topo);
   terrainBtn.textContent=this.t.terrain+(this.state.topo?' ✓':'');
  }
  if(viewBtn){
   const noReal3D=!!this.state.fallback;
   viewBtn.disabled=noReal3D;
   viewBtn.classList.toggle('is-on',!!this.state.is3D&&!noReal3D);
   viewBtn.textContent=noReal3D?(this.lang==='th'?'3D ต้องใช้ WebGL':'3D needs WebGL'):(this.state.is3D?'3D':'2D');
   viewBtn.title=noReal3D?(this.lang==='th'?'อุปกรณ์นี้ไม่รองรับ 3D Terrain จริง จึงไม่แสดง 3D ปลอม':'Real 3D terrain requires WebGL'):'';
  }
 }
 toggleTerrain(){
  this.state.topo=!this.state.topo;
  if(this.state.map){
   this.applyBaseLayerMode();
   this.applyTerrainModel();
  }
  if(this.state.fallback){
   this.mapEl.classList.toggle('is-terrain',this.state.topo);
  }
  this.updateModeButtons();
 }
 toggleView(){
  if(this.state.fallback){
   this.state.is3D=false;
   this.updateModeButtons();
   return;
  }
  this.state.is3D=!this.state.is3D;
  if(this.state.map){
   this.applyTerrainModel();
   this.state.map.easeTo({pitch:this.state.is3D?62:0,bearing:this.state.is3D?-18:0,duration:650});
  }
  this.updateModeButtons();
 }
 drawChart(currentDistance=0){
  const c=this.canvas,ctx=c.getContext('2d'),box=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);if(box.width<10)return;c.width=box.width*dpr;c.height=box.height*dpr;ctx.scale(dpr,dpr);const w=box.width,h=box.height,pad=12,min=this.state.minElevation,max=this.state.maxElevation,span=Math.max(1,max-min),pts=this.state.points;
  ctx.clearRect(0,0,w,h);ctx.beginPath();pts.forEach((p,i)=>{const x=pad+(p.distance/this.state.totalDistance)*(w-pad*2),y=h-pad-((p.ele-min)/span)*(h-pad*2);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.lineWidth=2;ctx.strokeStyle='#d55adb';ctx.stroke();
  const x=pad+(currentDistance/this.state.totalDistance)*(w-pad*2);ctx.beginPath();ctx.moveTo(x,pad);ctx.lineTo(x,h-pad);ctx.strokeStyle='#ffb24d';ctx.lineWidth=1.5;ctx.stroke()
 }
 destroy(){cancelAnimationFrame(this.state.raf);clearTimeout(this.toastTimer);try{this.state.map?.remove()}catch(e){}INSTANCES.delete(this)}
}
window.RestartRouteAnimation={
 mount(root,route,points,opts){const x=new RouteAnimation(root,route,points,opts);INSTANCES.add(x);return x},
 destroyAll(){[...INSTANCES].forEach(x=>x.destroy())}
};
})();