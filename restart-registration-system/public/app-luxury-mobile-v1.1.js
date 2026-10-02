const db=supabase.createClient(RESTART_REG_CONFIG.SUPABASE_URL,RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY);
const app=document.getElementById('app');const qs=new URLSearchParams(location.search);const slug=qs.get('event');const registerMode=qs.get('register')==='1';let lang=localStorage.getItem('restart_lang')||'th';let E=null,C=[],P=[],F=[],S=[],PM=[],IP=[],IS=[],SHOW=null,MEDIA=[],ROUTES=[];
let uiTheme=localStorage.getItem('restart_ui_theme')||((window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light');
function applyUiTheme(){
  document.documentElement.dataset.uiTheme=uiTheme;
  const b=document.getElementById('themeToggle');
  if(!b)return;
  const dark=uiTheme==='dark';
  b.setAttribute('aria-pressed',String(dark));
  const icon=b.querySelector('.theme-icon'),label=b.querySelector('.theme-label');
  if(icon)icon.textContent=dark?'☀':'☾';
  if(label)label.textContent=dark?'Light':'Dark';
}
function initThemeToggle(){
  let b=document.getElementById('themeToggle');
  if(!b){
    const top=document.querySelector('.rr-top');
    if(top){
      let actions=top.querySelector('.rr-public-actions');
      if(!actions){
        const lang=document.getElementById('langbar');
        actions=document.createElement('div');
        actions.className='rr-public-actions';
        if(lang&&lang.parentNode===top){top.insertBefore(actions,lang);actions.appendChild(lang)}
        else top.appendChild(actions);
      }
      b=document.createElement('button');
      b.id='themeToggle';b.className='theme-toggle';b.type='button';
      b.setAttribute('aria-label','เปลี่ยนโหมดสี');
      b.innerHTML='<span class="theme-icon" aria-hidden="true">☾</span><span class="theme-label">Dark</span>';
      actions.insertBefore(b,actions.firstChild);
    }
  }
  applyUiTheme();
  b=document.getElementById('themeToggle');
  if(b)b.onclick=()=>{
    uiTheme=uiTheme==='dark'?'light':'dark';
    localStorage.setItem('restart_ui_theme',uiTheme);
    applyUiTheme();
  };
}

const dict={th:{apply:'สมัครแข่งขัน',choose:'เลือกรุ่นการแข่งขัน',package:'เลือก Package',personal:'ข้อมูลผู้สมัคร',insurance:'ผู้รับผลประโยชน์',payment:'การชำระเงิน',submit:'ส่งใบสมัคร',full:'ชำระเต็มจำนวน',install:'ผ่อนชำระ',copy:'คัดลอก',upload:'อัปโหลดสลิป',addbene:'+ เพิ่มผู้รับผลประโยชน์'},en:{apply:'Register',choose:'Competition category',package:'Package',personal:'Participant information',insurance:'Beneficiaries',payment:'Payment',submit:'Submit registration',full:'Pay in full',install:'Installments',copy:'Copy',upload:'Upload slip',addbene:'+ Add beneficiary'},zh:{apply:'报名',choose:'比赛组别',package:'套餐',personal:'参赛者信息',insurance:'受益人',payment:'付款',submit:'提交报名',full:'全额付款',install:'分期付款',copy:'复制',upload:'上传付款凭证',addbene:'+ 添加受益人'},ja:{apply:'参加申込',choose:'競技カテゴリー',package:'パッケージ',personal:'参加者情報',insurance:'受取人',payment:'支払い',submit:'申込を送信',full:'一括払い',install:'分割払い',copy:'コピー',upload:'支払証明をアップロード',addbene:'+ 受取人を追加'},ru:{apply:'Регистрация',choose:'Категория',package:'Пакет',personal:'Данные участника',insurance:'Получатели',payment:'Оплата',submit:'Отправить заявку',full:'Полная оплата',install:'Рассрочка',copy:'Копировать',upload:'Загрузить квитанцию',addbene:'+ Добавить получателя'}};
const D=()=>dict[lang]||dict.en;const byId=id=>document.getElementById(id);const val=id=>(byId(id)?.value||'').trim();const baseFieldAliases=new Set(['title','prefix','first_name','last_name','birth_date','age','gender','id_document','phone','blood_group','shirt_size','address','emergency_phone','emergency_relation']);const baseMeta=(...keys)=>F.find(f=>keys.includes(f.field_key))||null;const optionTags=(meta,fallback=[])=>{const opts=meta?.options?.length?meta.options:fallback;return opts.map(o=>{const value=typeof o==='object'?(o.value??tr(o.label||o)):o;const label=typeof o==='object'?tr(o.label||o):o;return '<option value="'+esc(value)+'">'+esc(label)+'</option>'}).join('')};const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));const tr=v=>typeof v==='object'?(v?.[lang]||v?.en||v?.th||Object.values(v||{})[0]||''):v||'';const money=v=>Number(v||0).toLocaleString(undefined,{maximumFractionDigits:2});
function langs(){const ls=E?.languages||['th','en','zh','ja','ru'];langbar.innerHTML=ls.map(x=>'<button class="'+(x===lang?'active':'')+'" data-l="'+x+'">'+x.toUpperCase()+'</button>').join('');langbar.onclick=e=>{const b=e.target.closest('[data-l]');if(!b)return;lang=b.dataset.l;localStorage.setItem('restart_lang',lang);if(registerMode&&E?.status==='OPEN')render();else renderEventPreview()}}
async function init(){
  initThemeToggle();
  if(!slug)return listEvents();
  const{data:e,error}=await db.from('restart_events').select('*').eq('slug',slug).maybeSingle();
  if(error||!e){
    history.replaceState({},'',location.pathname);
    return listEvents();
  }
  E=e;const eid=e.id;
  const results=await Promise.all([
    db.from('restart_race_categories').select('*').eq('event_id',eid).eq('is_active',true).order('sort_order'),
    db.from('restart_packages').select('*').eq('event_id',eid).eq('is_active',true).order('sort_order'),
    db.from('restart_form_fields').select('*').eq('event_id',eid).eq('is_active',true).order('sort_order'),
    db.from('restart_form_sections').select('*').eq('event_id',eid).eq('is_active',true).order('sort_order'),
    db.from('restart_payment_methods').select('*').eq('event_id',eid).eq('is_enabled',true).order('sort_order'),
    db.from('restart_installment_plans').select('*').eq('event_id',eid).eq('is_active',true).order('priority',{ascending:false}),
    db.from('restart_installment_steps').select('*'),
    db.from('restart_event_showcase').select('*').eq('event_id',eid).maybeSingle(),
    db.from('restart_event_media').select('*').eq('event_id',eid).eq('is_active',true).order('sort_order'),
    db.from('restart_event_routes').select('*,restart_route_categories(category_id,restart_race_categories!restart_route_categories_category_id_fkey(name,distance_km)),restart_route_points(*)').eq('event_id',eid).eq('is_active',true).order('sort_order')
  ]);
  const firstError=results.find(x=>x.error&&x.status!==406)?.error;
  if(firstError)console.warn(firstError);
  C=results[0].data||[];P=results[1].data||[];F=results[2].data||[];S=results[3].data||[];
  PM=results[4].data||[];IP=results[5].data||[];IS=results[6].data||[];
  SHOW=results[7].data||null;MEDIA=results[8].data||[];ROUTES=results[9].data||[];
  langs();
  if(registerMode&&E.status==='OPEN')render();
  else renderEventPreview();
}
function eventDateParts(value){
  if(!value)return{day:'—',month:'',year:''};
  const d=new Date(value+'T00:00:00');
  if(Number.isNaN(d.getTime()))return{day:'—',month:'',year:''};
  const locale=lang==='th'?'th-TH':lang==='zh'?'zh-CN':lang==='ja'?'ja-JP':lang==='ru'?'ru-RU':'en-GB';
  return{
    day:new Intl.DateTimeFormat(locale,{day:'2-digit'}).format(d),
    month:new Intl.DateTimeFormat(locale,{month:'short'}).format(d).replace('.',''),
    year:new Intl.DateTimeFormat(locale,{year:'numeric'}).format(d)
  };
}
function eventLandingCopy(){
  const x={
    th:{eyebrow:'RESTART · CURATED RACE EXPERIENCES',title:'ค้นหาเส้นชัยครั้งต่อไปของคุณ',desc:'การแข่งขันที่คัดสรรมาเพื่อประสบการณ์ที่มากกว่าการวิ่ง — เลือก Event ที่ใช่ แล้วเริ่มต้นเรื่องราวบทใหม่ของคุณ',featured:'FEATURED EVENT',open:'เปิดรับสมัครแล้ว',published:'เร็ว ๆ นี้',view:'ดูรายละเอียดและสมัคร',events:'UPCOMING EVENTS',empty:'ยังไม่มี Event ที่เปิดให้เข้าชมในขณะนี้'},
    en:{eyebrow:'RESTART · CURATED RACE EXPERIENCES',title:'Find your next finish line',desc:'Curated race experiences designed to be more than a run. Discover your next event and begin a new chapter.',featured:'FEATURED EVENT',open:'Registration Open',published:'Coming Soon',view:'View event & register',events:'UPCOMING EVENTS',empty:'No events are currently available.'},
    zh:{eyebrow:'RESTART · CURATED RACE EXPERIENCES',title:'寻找你的下一条终点线',desc:'精心策划的不只是比赛，而是一段值得记住的体验。选择你的下一场活动，开启新的篇章。',featured:'FEATURED EVENT',open:'开放报名',published:'即将开放',view:'查看活动并报名',events:'UPCOMING EVENTS',empty:'目前暂无可查看的活动。'},
    ja:{eyebrow:'RESTART · CURATED RACE EXPERIENCES',title:'次のフィニッシュラインへ',desc:'走るだけではない、記憶に残るレース体験を。次のイベントを見つけ、新しい物語を始めましょう。',featured:'FEATURED EVENT',open:'受付中',published:'近日公開',view:'イベントを見る・申し込む',events:'UPCOMING EVENTS',empty:'現在公開中のイベントはありません。'},
    ru:{eyebrow:'RESTART · CURATED RACE EXPERIENCES',title:'Найдите свой следующий финиш',desc:'Отобранные спортивные события — больше, чем просто забег. Выберите следующий старт и начните новую главу.',featured:'FEATURED EVENT',open:'Регистрация открыта',published:'Скоро',view:'О событии и регистрация',events:'UPCOMING EVENTS',empty:'Сейчас нет доступных событий.'}
  };return x[lang]||x.en;
}
function eventStatusLabel(status,copy){
  if(status==='OPEN')return copy.open;
  if(status==='PUBLISHED')return copy.published;
  if(status==='CLOSED')return lang==='th'?'ปิดรับสมัครแล้ว':lang==='zh'?'报名已关闭':lang==='ja'?'受付終了':lang==='ru'?'Регистрация закрыта':'Registration Closed';
  return copy.published;
}
function eventLandingLanguages(){
  const labels={th:'TH',en:'EN',zh:'中文',ja:'日本語',ru:'RU'};
  langbar.innerHTML=['th','en','zh','ja','ru'].map(l=>'<button type="button" data-landing-lang="'+l+'" class="'+(lang===l?'active':'')+'">'+labels[l]+'</button>').join('');
  langbar.querySelectorAll('[data-landing-lang]').forEach(b=>b.onclick=()=>{
    lang=b.dataset.landingLang;localStorage.setItem('restart_lang',lang);listEvents();
  });
}
function eventVisual(e){
  const banner=e.banner_url?esc(e.banner_url):'';
  const logo=e.logo_url?'<img class="event-card-logo" src="'+esc(e.logo_url)+'" alt="">':'';
  return '<div class="event-card-media '+(!banner?'event-card-media-fallback':'')+'" '+(banner?'style="background-image:url(\''+banner.replaceAll("'","%27")+'\')"':'')+'>'+
    '<div class="event-card-scrim"></div>'+logo+'</div>';
}
function eventCard(e,index,copy){
  const date=eventDateParts(e.event_date_start);
  const status=eventStatusLabel(e.status,copy);
  const featured=index===0;
  const desc=String(e.description||'').trim();
  return '<a class="event-showcase-card '+(featured?'is-featured':'')+'" href="?event='+encodeURIComponent(e.slug)+'">'+
    eventVisual(e)+
    '<div class="event-card-content">'+
      '<div class="event-card-topline"><span class="event-status '+(e.status==='OPEN'?'is-open':'')+'">'+esc(status)+'</span>'+(featured?'<span class="event-featured-label">'+esc(copy.featured)+'</span>':'')+'</div>'+
      '<div class="event-card-main">'+
        '<div class="event-date-block"><strong>'+esc(date.day)+'</strong><span>'+esc(date.month)+'</span><small>'+esc(date.year)+'</small></div>'+
        '<div class="event-card-copy"><h2>'+esc(e.name)+'</h2>'+
          (desc?'<p>'+esc(desc.length>170?desc.slice(0,167)+'…':desc)+'</p>':'')+
          '<div class="event-meta">'+
            (e.location_name?'<span class="event-meta-item"><span class="event-meta-icon">⌖</span>'+esc(e.location_name)+'</span>':'')+
            '<span class="event-meta-item"><span class="event-meta-icon">↗</span>'+esc(copy.view)+'</span>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</a>';
}
async function listEvents(){
  eventLandingLanguages();
  const copy=eventLandingCopy();
  const{data,error}=await db.from('restart_events').select('*').in('status',['PUBLISHED','OPEN']).order('event_date_start',{ascending:true});
  if(error)return app.innerHTML='<section class="rr-card rr-empty">'+esc(error.message)+'</section>';
  const events=data||[];
  document.body.classList.add('event-landing-page');
  app.classList.add('event-landing-wrap');
  app.innerHTML=
    '<section class="event-landing-hero">'+
      '<div class="event-landing-orbit orbit-one"></div><div class="event-landing-orbit orbit-two"></div>'+
      '<div class="event-landing-kicker">'+esc(copy.eyebrow)+'</div>'+
      '<h1>'+esc(copy.title)+'</h1>'+
      '<p>'+esc(copy.desc)+'</p>'+
      '<div class="event-landing-signature"><span></span><b>RESTART</b><span></span></div>'+
    '</section>'+
    '<section class="event-collection">'+
      '<div class="event-collection-head"><div><span class="event-section-kicker">RESTART COLLECTION</span><h2>'+esc(copy.events)+'</h2></div><div class="event-count">'+String(events.length).padStart(2,'0')+'</div></div>'+
      (events.length?'<div class="event-showcase-grid">'+events.map((e,i)=>eventCard(e,i,copy)).join('')+'</div>':'<div class="event-premium-empty">'+esc(copy.empty)+'</div>')+
    '</section>'+
    '<footer class="event-landing-footer"><span>RESTART</span><small>MOVE · DISCOVER · BEGIN AGAIN</small></footer>';
}
function previewCopy(){
  const x={
    th:{back:'กลับหน้ารวม Event',register:'สมัครการแข่งขัน',coming:'เร็ว ๆ นี้',closed:'ปิดรับสมัครแล้ว',overview:'เกี่ยวกับการแข่งขัน',raceInfo:'ระยะและรุ่นการแข่งขัน',distance:'ระยะ',category:'รุ่น',start:'เวลา Start',cutoff:'Cutoff',duration:'เวลาคาดหมาย',elevation:'Elevation Gain',price:'ค่าสมัคร',age:'อายุ',open:'เปิดรับสมัครแล้ว',kit:'Race Collection',shirt:'เสื้อแข่งขัน',medal:'เหรียญ Finisher',trophy:'ถ้วยรางวัล',map:'แผนที่เส้นทาง',gallery:'บรรยากาศงาน',highlights:'Highlights',inclusions:'สิ่งที่นักวิ่งได้รับ',awards:'รางวัลและถ้วย',course:'รายละเอียดเส้นทาง',rules:'กติกาสำคัญ',venue:'สถานที่และการเดินทาง',packages:'Package',registration:'ช่วงรับสมัคร',categories:'รุ่นการแข่งขัน',from:'เริ่มต้น',contact:'ติดต่อผู้จัด',days:'วันแข่งขัน',gender:'เพศ',capacity:'จำนวนรับ',early:'Early Bird',gender:'เพศ',capacity:'จำนวนรับ',early:'Early Bird'},
    en:{back:'All Events',register:'Register Now',coming:'Coming Soon',closed:'Registration Closed',overview:'About the Event',raceInfo:'Distances & Categories',distance:'Distance',category:'Category',start:'Start Time',cutoff:'Cutoff',duration:'Expected Time',elevation:'Elevation Gain',price:'Entry Fee',age:'Age',open:'Registration Open',kit:'Race Collection',shirt:'Race Shirt',medal:'Finisher Medal',trophy:'Trophy',map:'Course Map',gallery:'Event Gallery',highlights:'Highlights',inclusions:'Runner Entitlements',awards:'Awards & Trophies',course:'Course Details',rules:'Important Rules',venue:'Venue & Travel',packages:'Packages',registration:'Registration Period',categories:'Categories',from:'From',contact:'Contact',days:'Race Day',gender:'Gender',capacity:'Capacity',early:'Early Bird',gender:'Gender',capacity:'Capacity',early:'Early Bird'},
    zh:{back:'返回活动列表',register:'立即报名',coming:'即将开放',closed:'报名已关闭',overview:'赛事介绍',raceInfo:'距离与组别',distance:'距离',category:'组别',start:'起跑时间',cutoff:'关门时间',duration:'预计用时',elevation:'累计爬升',price:'报名费',age:'年龄',open:'开放报名',kit:'赛事纪念品',shirt:'赛事服',medal:'完赛奖牌',trophy:'奖杯',map:'路线图',gallery:'赛事图库',highlights:'亮点',inclusions:'参赛权益',awards:'奖项与奖杯',course:'路线说明',rules:'重要规则',venue:'地点与交通',packages:'套餐',registration:'报名时间',categories:'竞赛组别',from:'起价',contact:'联系方式',days:'比赛日',gender:'性别',capacity:'名额',early:'Early Bird',gender:'性别',capacity:'名额',early:'Early Bird'},
    ja:{back:'イベント一覧',register:'申し込む',coming:'近日公開',closed:'受付終了',overview:'イベント概要',raceInfo:'距離・カテゴリー',distance:'距離',category:'カテゴリー',start:'スタート',cutoff:'制限時間',duration:'目安時間',elevation:'獲得標高',price:'参加費',age:'年齢',open:'受付中',kit:'Race Collection',shirt:'大会シャツ',medal:'フィニッシャーメダル',trophy:'トロフィー',map:'コースマップ',gallery:'ギャラリー',highlights:'ハイライト',inclusions:'参加特典',awards:'表彰・トロフィー',course:'コース詳細',rules:'重要ルール',venue:'会場・アクセス',packages:'パッケージ',registration:'受付期間',categories:'カテゴリー',from:'〜',contact:'お問い合わせ',days:'開催日',gender:'性別',capacity:'定員',early:'Early Bird',gender:'性別',capacity:'定員',early:'Early Bird'},
    ru:{back:'Все события',register:'Зарегистрироваться',coming:'Скоро',closed:'Регистрация закрыта',overview:'О событии',raceInfo:'Дистанции и категории',distance:'Дистанция',category:'Категория',start:'Старт',cutoff:'Cutoff',duration:'Ожидаемое время',elevation:'Набор высоты',price:'Взнос',age:'Возраст',open:'Регистрация открыта',kit:'Race Collection',shirt:'Футболка',medal:'Медаль финишера',trophy:'Кубок',map:'Карта трассы',gallery:'Галерея',highlights:'Highlights',inclusions:'Что входит',awards:'Награды',course:'Описание трассы',rules:'Правила',venue:'Место и проезд',packages:'Пакеты',registration:'Период регистрации',categories:'Категории',from:'От',contact:'Контакты',days:'День забега',gender:'Пол',capacity:'Лимит',early:'Early Bird',gender:'Пол',capacity:'Лимит',early:'Early Bird'}
  };return x[lang]||x.en
}
function fmtPreviewDate(v){
  if(!v)return'—';
  const d=new Date(v.length===10?v+'T00:00:00':v);
  if(Number.isNaN(d.getTime()))return esc(v);
  const locale=lang==='th'?'th-TH':lang==='zh'?'zh-CN':lang==='ja'?'ja-JP':lang==='ru'?'ru-RU':'en-GB';
  return new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',year:'numeric'}).format(d);
}
function fmtClock(v){return v?String(v).slice(0,5):'—'}
function fmtDuration(v){
  const n=Number(v||0);if(!n)return'—';
  const h=Math.floor(n/60),m=n%60;
  if(lang==='th')return h?(h+' ชม.'+(m?' '+m+' นาที':'')):(m+' นาที');
  return h?(h+'h'+(m?' '+m+'m':'')):(m+'m');
}
function previewMedia(type){return MEDIA.filter(m=>m.media_type===type)}
function firstPreviewMedia(type){return previewMedia(type)[0]?.url||''}
function previewText(v){return tr(v)||''}
function previewList(v){return Array.isArray(v)?v.filter(Boolean):[]}
function previewMediaCard(url,label,wide=false){
  if(!url)return'';
  return '<article class="preview-media-card '+(wide?'is-wide':'')+'"><img src="'+esc(url)+'" alt="'+esc(label)+'"><div class="preview-media-caption">'+esc(label)+'</div></article>';
}
function previewGenderLabel(v){
  if(v==='MALE')return lang==='th'?'ชาย':lang==='zh'?'男':lang==='ja'?'男性':lang==='ru'?'Мужчины':'Male';
  if(v==='FEMALE')return lang==='th'?'หญิง':lang==='zh'?'女':lang==='ja'?'女性':lang==='ru'?'Женщины':'Female';
  return lang==='th'?'ไม่จำกัด':lang==='zh'?'不限':lang==='ja'?'制限なし':lang==='ru'?'Без ограничений':'Any';
}
function previewEarlyBird(c){
  const f=E.feature_flags||{};
  if(!f.early_bird||c.early_bird_price_thb==null)return'';
  return '฿'+money(c.early_bird_price_thb);
}
function raceCategoryCard(c,p){
  const age=(c.min_age!=null||c.max_age!=null)?((c.min_age??'—')+'–'+(c.max_age??'∞')):'—';
  return '<article class="preview-race-card">'+
    '<div class="preview-race-distance">'+(c.distance_km!=null?esc(c.distance_km)+' <small>KM</small>':'—')+'</div>'+
    '<div class="preview-race-name">'+esc(tr(c.name))+'</div>'+
    '<div class="preview-race-grid">'+
      '<div><span>'+esc(p.start)+'</span><b>'+esc(fmtClock(c.start_time))+'</b></div>'+
      '<div><span>'+esc(p.cutoff)+'</span><b>'+esc(fmtDuration(c.cutoff_minutes))+'</b></div>'+
      '<div><span>'+esc(p.duration)+'</span><b>'+esc(fmtDuration(c.expected_duration_minutes))+'</b></div>'+
      '<div><span>'+esc(p.price)+'</span><b>฿'+money(currentCatPrice(c))+'</b></div>'+
      '<div><span>'+esc(p.age)+'</span><b>'+esc(age)+'</b></div>'+
      '<div><span>'+esc(p.gender)+'</span><b>'+esc(previewGenderLabel(c.gender_rule))+'</b></div>'+
      '<div><span>'+esc(p.capacity)+'</span><b>'+(c.capacity!=null?esc(c.capacity):'—')+'</b></div>'+
      '<div><span>'+esc(p.elevation)+'</span><b>'+(c.elevation_gain_m!=null?esc(c.elevation_gain_m)+' m':'—')+'</b></div>'+
      (previewEarlyBird(c)?'<div><span>'+esc(p.early)+'</span><b>'+esc(previewEarlyBird(c))+'</b></div>':'')+
    '</div>'+
  '</article>';
}
function infoListSection(title,items,cls=''){
  const arr=previewList(items);if(!arr.length)return'';
  return '<section class="preview-section '+cls+'"><div class="preview-section-kicker">RESTART</div><h2>'+esc(title)+'</h2><div class="preview-bullet-grid">'+arr.map((x,i)=>'<div class="preview-bullet"><span>'+String(i+1).padStart(2,'0')+'</span><p>'+esc(x)+'</p></div>').join('')+'</div></section>';
}
function textSection(title,body,cls=''){
  const value=previewText(body);if(!value)return'';
  return '<section class="preview-section '+cls+'"><div class="preview-section-kicker">RESTART</div><h2>'+esc(title)+'</h2><div class="preview-prose">'+esc(value).replace(/\n/g,'<br>')+'</div></section>';
}
function renderRouteAnimationSection(p,flags){
  if(flags.route_animation===false||!ROUTES.length)return'';
  return '<section class="preview-section preview-route-section" id="routeSection"><div class="preview-section-kicker">GPX · ROUTE EXPERIENCE</div><div class="preview-section-head"><h2>'+(lang==='th'?'เส้นทางการแข่งขัน':lang==='zh'?'比赛路线':lang==='ja'?'コースアニメーション':lang==='ru'?'Анимация маршрута':'Route Animation')+'</h2><span>'+ROUTES.length+' GPX</span></div>'+
    ROUTES.map(r=>'<div class="rr-route-block" id="route_animation_'+r.id+'"></div>').join('')+
  '</section>';
}
async function ensureRouteAnimationDeps(){
  if(!ROUTES.length)return false;
  if(!document.querySelector('link[data-restart-route-css]')){
    const l=document.createElement('link');l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/gh/restartbykeita-sudo/restart@ccc38c55670e37110dc7dedd5555b820bcf41449/restart-registration-system/public/route-animation-real-v1.css';l.dataset.restartRouteCss='1';document.head.appendChild(l);
  }
  if(!window.maplibregl){
    try{
      if(!document.querySelector('link[data-maplibre-css]')){
        const l=document.createElement('link');l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.css';l.dataset.maplibreCss='1';document.head.appendChild(l);
      }
      await new Promise((resolve,reject)=>{
        let sc=document.querySelector('script[data-maplibre-js]');
        if(sc){if(window.maplibregl)return resolve();sc.addEventListener('load',resolve,{once:true});sc.addEventListener('error',reject,{once:true});return}
        sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.js';sc.dataset.maplibreJs='1';sc.onload=resolve;sc.onerror=()=>reject(new Error('MapLibre load failed'));document.head.appendChild(sc);
      });
    }catch(e){console.warn('MapLibre unavailable; SVG route fallback will be used',e)}
  }
  if(!window.RestartRouteAnimation){
    await new Promise((resolve,reject)=>{
      let sc=document.querySelector('script[data-restart-route-js]');
      if(sc){if(window.RestartRouteAnimation)return resolve();sc.addEventListener('load',resolve,{once:true});sc.addEventListener('error',reject,{once:true});return}
      sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/gh/restartbykeita-sudo/restart@ccc38c55670e37110dc7dedd5555b820bcf41449/restart-registration-system/public/route-animation-real-v1.js';sc.dataset.restartRouteJs='1';sc.onload=resolve;sc.onerror=()=>reject(new Error('Route module load failed'));document.head.appendChild(sc);
    });
  }
  return !!window.RestartRouteAnimation;
}
async function mountPreviewRoutes(){
  try{if(!await ensureRouteAnimationDeps())return}catch(e){console.warn(e);return}
  if(!window.RestartRouteAnimation)return;
  window.RestartRouteAnimation.destroyAll?.();
  ROUTES.forEach(r=>{
    const el=document.getElementById('route_animation_'+r.id);if(!el)return;
    const pts=(r.restart_route_points||[]).filter(x=>x.is_active!==false).sort((a,b)=>Number(a.distance_km)-Number(b.distance_km));
    window.RestartRouteAnimation.mount(el,r,pts,{lang});
  });
}
function previewRouteButtonText(available){
  const x={
    th:{view:'ดูเส้นทาง Animation',empty:'ยังไม่มีเส้นทาง'},
    en:{view:'View route animation',empty:'Route not available yet'},
    zh:{view:'查看路线动画',empty:'暂无路线'},
    ja:{view:'コースアニメーションを見る',empty:'コース未登録'},
    ru:{view:'Смотреть анимацию маршрута',empty:'Маршрут пока не добавлен'}
  };
  const t=x[lang]||x.en;
  return available?t.view:t.empty;
}
function renderEventPreview(){
  window.RestartRouteAnimation?.destroyAll?.();
  document.body.classList.remove('event-landing-page');
  document.body.classList.add('event-preview-page');
  app.classList.remove('event-landing-wrap');
  app.classList.add('event-preview-wrap');
  const p=previewCopy(), flags=E.feature_flags||{};
  const bg=firstPreviewMedia('BACKGROUND')||E.banner_url||firstPreviewMedia('BANNER');
  const shirt=firstPreviewMedia('SHIRT'),medal=firstPreviewMedia('MEDAL'),trophy=firstPreviewMedia('TROPHY'),map=firstPreviewMedia('COURSE_MAP');
  const gallery=[...previewMedia('AWARD'),...previewMedia('GALLERY')];
  const prices=C.map(currentCatPrice).filter(v=>Number.isFinite(Number(v))).map(Number);
  const minPrice=prices.length?Math.min(...prices):0,maxPrice=prices.length?Math.max(...prices):0;
  const distances=[...new Set(C.map(c=>c.distance_km).filter(v=>v!=null).map(Number))].sort((a,b)=>a-b);
  const status=E.status==='OPEN'?p.open:E.status==='CLOSED'?p.closed:p.coming;
  const canRegister=E.status==='OPEN';
  const hasRouteAnimation=flags.route_animation!==false&&ROUTES.length>0;
  const routeButton=hasRouteAnimation
    ?'<a class="preview-route-btn" href="#routeSection"><span class="preview-route-icon">⌖</span>'+esc(previewRouteButtonText(true))+' <span>↓</span></a>'
    :'<span class="preview-route-btn is-disabled"><span class="preview-route-icon">⌖</span>'+esc(previewRouteButtonText(false))+'</span>';
  const heroStyle=bg?' style="background-image:linear-gradient(90deg,rgba(7,8,11,.88),rgba(7,8,11,.42)),url(\''+esc(bg).replaceAll("'","%27")+'\')"':'';
  const mediaCards=[
    previewMediaCard(shirt,p.shirt),previewMediaCard(medal,p.medal),previewMediaCard(trophy,p.trophy),
    previewMediaCard(map,p.map,true),...gallery.map((m,i)=>previewMediaCard(m.url,p.gallery+' '+(i+1)))
  ].filter(Boolean).join('');
  const packageHtml=P.length?'<section class="preview-section"><div class="preview-section-kicker">OPTIONS</div><h2>'+esc(p.packages)+'</h2><div class="preview-package-grid">'+P.map(x=>'<article class="preview-package"><div><b>'+esc(tr(x.name))+'</b><p>'+esc(tr(x.description)||'')+'</p></div><strong>'+(x.price_mode==='ADD'?'+ ':'')+'฿'+money(x.price_value_thb)+'</strong></article>').join('')+'</div></section>':'';
  app.innerHTML=
    '<div class="preview-back-row"><a class="preview-back" href="?">← '+esc(p.back)+'</a></div>'+
    '<section class="preview-hero"'+heroStyle+'>'+
      '<div class="preview-hero-overlay"></div>'+
      '<div class="preview-hero-content">'+
        (E.logo_url?'<img class="preview-event-logo" src="'+esc(E.logo_url)+'" alt="">':'')+
        '<div class="preview-status '+(canRegister?'is-open':'')+'">'+esc(status)+'</div>'+
        (previewText(SHOW?.tagline)?'<div class="preview-tagline">'+esc(previewText(SHOW.tagline))+'</div>':'')+
        '<h1>'+esc(E.name)+'</h1>'+
        '<p>'+esc(previewText(SHOW?.overview)||E.description||'')+'</p>'+
        '<div class="preview-hero-meta">'+
          '<div><span>'+esc(p.days)+'</span><b>'+esc(fmtPreviewDate(E.event_date_start))+'</b></div>'+
          '<div><span>'+esc(p.venue)+'</span><b>'+esc(E.location_name||previewText(SHOW?.venue_details)||'—')+'</b></div>'+
          '<div><span>'+esc(p.categories)+'</span><b>'+C.length+'</b></div>'+
          '<div><span>'+esc(p.distance)+'</span><b>'+(distances.length?distances.join(' / ')+' KM':'—')+'</b></div>'+
          '<div><span>'+esc(p.price)+'</span><b>'+(prices.length?(minPrice===maxPrice?'฿'+money(minPrice):'฿'+money(minPrice)+' – ฿'+money(maxPrice)):'—')+'</b></div>'+
          (E.capacity!=null?'<div><span>'+esc(p.capacity)+'</span><b>'+esc(E.capacity)+'</b></div>':'')+
        '</div>'+
        '<div class="preview-hero-actions">'+
          (canRegister?'<a class="preview-register-btn" href="?event='+encodeURIComponent(E.slug)+'&register=1">'+esc(p.register)+' <span>↗</span></a>':'<span class="preview-register-btn is-disabled">'+esc(status)+'</span>')+
          routeButton+
        '</div>'+
      '</div>'+
    '</section>'+renderRouteAnimationSection(p,flags)+
    (C.length?'<section class="preview-section"><div class="preview-section-kicker">RACE INFORMATION</div><div class="preview-section-head"><h2>'+esc(p.raceInfo)+'</h2><span>'+C.length+' '+esc(p.categories)+'</span></div><div class="preview-race-cards">'+C.map(c=>raceCategoryCard(c,p)).join('')+'</div></section>':'')+
    (flags.showcase_media!==false&&mediaCards?'<section class="preview-section preview-collection-section"><div class="preview-section-kicker">COLLECTION</div><h2>'+esc(p.kit)+'</h2><div class="preview-media-grid">'+mediaCards+'</div></section>':'')+
    infoListSection(p.highlights,SHOW?.highlights,'preview-highlight-section')+
    infoListSection(p.inclusions,SHOW?.inclusions)+
    textSection(p.awards,SHOW?.awards_text)+
    textSection(p.course,SHOW?.course_notes)+
    (map?'':'')+
    infoListSection(p.rules,SHOW?.rules)+
    textSection(p.venue,SHOW?.venue_details)+
    packageHtml+
    '<section class="preview-section preview-registration-window"><div class="preview-section-kicker">REGISTRATION</div><h2>'+esc(p.registration)+'</h2><div class="preview-window-grid"><div><span>OPEN</span><b>'+esc(fmtPreviewDate(E.registration_opens_at||''))+'</b></div><div><span>CLOSE</span><b>'+esc(fmtPreviewDate(E.registration_closes_at||''))+'</b></div></div></section>'+
    textSection(p.contact,SHOW?.contact_details)+
    '<div class="preview-final-cta"><div><span>RESTART</span><h2>'+esc(E.name)+'</h2></div>'+(canRegister?'<a class="preview-register-btn" href="?event='+encodeURIComponent(E.slug)+'&register=1">'+esc(p.register)+' <span>↗</span></a>':'<span class="preview-register-btn is-disabled">'+esc(status)+'</span>')+'</div>';
  requestAnimationFrame(()=>mountPreviewRoutes());
}
function render(){window.RestartRouteAnimation?.destroyAll?.();document.body.classList.remove('event-landing-page','event-preview-page');app.classList.remove('event-landing-wrap','event-preview-wrap');const th=E.theme||{};document.documentElement.style.setProperty('--primary',th.primary||'#6d4aff');const flags=E.feature_flags||{};const catOpts=C.map(c=>'<option value="'+c.id+'">'+esc(tr(c.name))+' · ฿'+money(currentCatPrice(c))+'</option>').join('');const categoryWrap=flags.competition_categories!==false?'<section class="rr-card"><h3>'+D().choose+'</h3><label>'+D().choose+'<select id="categorySel" required><option value="">—</option>'+catOpts+'</select></label></section>':'';const packageWrap=flags.packages?'<section class="rr-card"><h3>'+D().package+'</h3><label>'+D().package+'<select id="packageSel"><option value="">—</option></select></label></section>':'';let payModes='';if(flags.full_payment!==false)payModes+='<label style="display:flex;align-items:center;gap:8px"><input style="width:auto" type="radio" name="paymode" value="FULL" '+(!flags.installments?'checked':'')+'> '+D().full+'</label>';if(flags.installments)payModes+='<label style="display:flex;align-items:center;gap:8px"><input style="width:auto" type="radio" name="paymode" value="INSTALLMENT" '+(flags.full_payment===false?'checked':'')+'> '+D().install+'</label>';app.innerHTML='<section class="hero" style="--hero-primary:'+(th.primary||'#6d4aff')+';--hero-secondary:'+(th.secondary||'#e96d96')+';--hero-text:'+(th.text||'#fff')+'">'+(flags.logo!==false&&E.logo_url?'<img class="logo" src="'+esc(E.logo_url)+'">':'')+'<h1>'+esc(E.name)+'</h1><p>'+esc(E.description||'')+'</p><div>'+esc(E.location_name||'')+' · '+esc(E.event_date_start||'')+'</div>'+(flags.banner!==false&&E.banner_url?'<img class="banner" src="'+esc(E.banner_url)+'">':'')+'</section><form id="regForm">'+categoryWrap+packageWrap+(flags.basic_info!==false?'<section class="rr-card"><h3>'+D().personal+'</h3><div class="grid2">'+baseFields()+'</div>'+customFields()+'</section>':customFields())+(flags.insurance?insuranceHTML():'')+'<section class="rr-card"><h3>'+D().payment+'</h3><div id="priceBox" class="price">฿0</div><div class="row" style="margin:12px 0">'+payModes+'</div><div id="scheduleBox"></div><div id="methodsBox"></div>'+(flags.slip_upload?'<label style="margin-top:12px">'+D().upload+'<input id="slipFile" type="file" accept="image/*,application/pdf" required></label>':'')+'</section><section class="rr-card"><button class="btn primary" style="width:100%;padding:14px" type="submit">'+D().submit+'</button></section></form>';if(byId('categorySel'))byId('categorySel').onchange=()=>{refreshPackages();syncPaymentModes();refreshPrice()};document.querySelectorAll('[name=paymode]').forEach(x=>x.onchange=refreshPrice);if(byId('packageSel'))byId('packageSel').onchange=refreshPrice;byId('regForm').onsubmit=submit;if(byId('birthDate'))byId('birthDate').onchange=calcAge;calcAge();refreshPackages();syncPaymentModes();refreshPrice()}
function calcAge(){if(!window.birthDate||!birthDate.value||!window.age)return;const b=new Date(birthDate.value+'T00:00:00'),ref=E?.event_date_start?new Date(E.event_date_start+'T00:00:00'):new Date();let y=ref.getFullYear()-b.getFullYear();const m=ref.getMonth()-b.getMonth();if(m<0||(m===0&&ref.getDate()<b.getDate()))y--;age.value=Math.max(0,y)}
function currentCatPrice(c){const f=E.feature_flags||{};const n=new Date(),a=c.early_bird_starts_at?new Date(c.early_bird_starts_at):null,b=c.early_bird_ends_at?new Date(c.early_bird_ends_at):null;if(f.early_bird&&c.early_bird_price_thb!=null&&(!a||n>=a)&&(!b||n<=b))return Number(c.early_bird_price_thb);return Number(c.base_price_thb||0)}
function baseFields(){const fs=E.field_settings||{};const on=k=>fs[k]?.enabled!==false,req=k=>fs[k]?.required?' required':'';const rows=[];const titleMeta=baseMeta('title','prefix'),shirtMeta=baseMeta('shirt_size'),bloodMeta=baseMeta('blood_group');if(on('title'))rows.push('<label>คำนำหน้า<select id="title"'+req('title')+'><option value="">—</option>'+optionTags(titleMeta,[{value:'mr',label:{th:'นาย',en:'Mr.',zh:'先生',ja:'Mr.',ru:'Г-н'}},{value:'ms',label:{th:'นางสาว',en:'Ms.',zh:'女士',ja:'Ms.',ru:'Г-жа'}},{value:'mrs',label:{th:'นาง',en:'Mrs.',zh:'女士',ja:'Mrs.',ru:'Г-жа'}}])+'</select></label>');if(on('first_name'))rows.push('<label>ชื่อ<input id="firstName"'+req('first_name')+'></label>');if(on('last_name'))rows.push('<label>นามสกุล<input id="lastName"'+req('last_name')+'></label>');if(on('birth_date'))rows.push('<label>วันเกิด<input id="birthDate" type="date"'+req('birth_date')+'></label>');if(on('age'))rows.push('<label>อายุ<input id="age" readonly placeholder="คำนวณอัตโนมัติ"></label>');if(on('gender'))rows.push('<label>เพศ<select id="gender"'+req('gender')+'><option value="">—</option><option value="MALE">ชาย</option><option value="FEMALE">หญิง</option><option value="OTHER">อื่นๆ</option></select></label>');if(on('id_document'))rows.push('<label>เลขบัตรประชาชน / Passport<input id="idDoc"'+req('id_document')+'></label>');if(on('phone'))rows.push('<label>เบอร์โทรศัพท์<input id="phone" type="tel"'+req('phone')+'></label>');if(on('blood_group'))rows.push('<label>กรุ๊ปเลือด<select id="blood"'+req('blood_group')+'><option value="">—</option>'+optionTags(bloodMeta,['A','B','AB','O'])+'</select></label>');if(on('shirt_size')&&(E.feature_flags||{}).shirts!==false){if(shirtMeta?.options?.length)rows.push('<label>ขนาดเสื้อ<select id="shirt"'+req('shirt_size')+'><option value="">—</option>'+optionTags(shirtMeta)+'</select></label>');else rows.push('<label>ขนาดเสื้อ<input id="shirt"'+req('shirt_size')+'></label>')}if(on('address'))rows.push('<label style="grid-column:1/-1">ที่อยู่<textarea id="address" rows="3"'+req('address')+'></textarea></label>');if(on('emergency_phone'))rows.push('<label>เบอร์โทรฉุกเฉิน<input id="emergencyPhone" type="tel"'+req('emergency_phone')+'></label>');if(on('emergency_relation'))rows.push('<label>ความสัมพันธ์ผู้ติดต่อฉุกเฉิน<input id="emergencyRelation"'+req('emergency_relation')+'></label>');return rows.join('')}
function customFields(){return S.map(s=>{const fs=F.filter(f=>f.section_id===s.id&&!baseFieldAliases.has(String(f.field_key||'').toLowerCase()));if(!fs.length)return'';return '<div style="margin-top:18px"><h3>'+esc(tr(s.label))+'</h3><div class="grid2">'+fs.map(fieldHTML).join('')+'</div></div>'}).join('')}
function fieldHTML(f){const id='f_'+f.id;const req=f.is_required?'required':'';const lab=esc(tr(f.label));if(f.field_type==='textarea')return '<label>'+lab+'<textarea id="'+id+'" data-field="'+esc(f.field_key)+'" '+req+'></textarea></label>';if(f.field_type==='select'||f.field_type==='radio')return '<label>'+lab+'<select id="'+id+'" data-field="'+esc(f.field_key)+'" '+req+'><option value="">—</option>'+((f.options||[]).map(o=>'<option value="'+esc(typeof o==='object'?o.value:o)+'">'+esc(typeof o==='object'?tr(o.label||o):o)+'</option>').join(''))+'</select></label>';return '<label>'+lab+'<input id="'+id+'" data-field="'+esc(f.field_key)+'" type="'+(['number','date','tel'].includes(f.field_type)?f.field_type:'text')+'" '+req+'></label>'}
function insuranceHTML(){return '<section class="rr-card"><div class="row space"><h3>'+D().insurance+'</h3><button class="btn soft" type="button" id="addBene">'+D().addbene+'</button></div><div id="beneList"></div><div class="row space" style="margin-top:10px"><span class="muted">Total</span><strong id="beneTotal">0%</strong></div></section>'}
function refreshPackages(){const sel=byId('packageSel');if(!sel)return;const cid=byId('categorySel')?.value||'';sel.innerHTML='<option value="">—</option>'+P.filter(p=>!p.category_id||p.category_id===cid).map(p=>'<option value="'+p.id+'">'+esc(tr(p.name))+' · '+(p.price_mode==='ADD'?'+':'')+'฿'+money(p.price_value_thb)+'</option>').join('')}
function totalPrice(){const cid=byId('categorySel')?.value||'';const c=C.find(x=>x.id===cid);let v=c?currentCatPrice(c):0;const p=P.find(x=>x.id===(byId('packageSel')?.value||''));if(p)v=p.price_mode==='REPLACE'?Number(p.price_value_thb):v+Number(p.price_value_thb);return v}
function syncPaymentModes(){const flags=E.feature_flags||{};const cat=C.find(c=>c.id===(byId('categorySel')?.value||''));const fullAllowed=flags.full_payment!==false&&cat?.full_payment_enabled!==false;const installmentAllowed=!!flags.installments&&cat?.installment_enabled!==false;const full=document.querySelector('[name=paymode][value=FULL]');const ins=document.querySelector('[name=paymode][value=INSTALLMENT]');if(full)full.closest('label').style.display=fullAllowed?'flex':'none';if(ins)ins.closest('label').style.display=installmentAllowed?'flex':'none';if(full?.checked&&!fullAllowed)full.checked=false;if(ins?.checked&&!installmentAllowed)ins.checked=false;if(!document.querySelector('[name=paymode]:checked')){if(full&&fullAllowed)full.checked=true;else if(ins&&installmentAllowed)ins.checked=true}if(byId('scheduleBox')&&!fullAllowed&&!installmentAllowed)byId('scheduleBox').innerHTML='<div class="badge warn">รุ่นนี้ยังไม่ได้เปิดรูปแบบการชำระเงิน</div>'}
function makeSchedule(){const total=totalPrice();const flags=E.feature_flags||{};const cid=byId('categorySel')?.value||'',pid=byId('packageSel')?.value||null;const cat=C.find(c=>c.id===cid);const fallback=(flags.full_payment!==false&&cat?.full_payment_enabled!==false)?'FULL':((flags.installments&&cat?.installment_enabled!==false)?'INSTALLMENT':'FULL');const mode=document.querySelector('[name=paymode]:checked')?.value||fallback;if(mode==='FULL'){if(flags.full_payment===false||cat?.full_payment_enabled===false)throw new Error('รุ่นนี้ไม่เปิดให้ชำระเต็มจำนวน');return[{installment_no:1,amount_due_thb:total,due_at:null}]}if(!flags.installments||cat?.installment_enabled===false)throw new Error('รุ่นนี้ไม่เปิดให้ผ่อนชำระ');let plan=IP.filter(p=>(!p.category_id||p.category_id===cid)&&(!p.package_id||p.package_id===pid)).sort((a,b)=>b.priority-a.priority)[0];if(!plan){const first=Math.min(3000,total),rest=total-first,each=Math.floor((rest/2)*100)/100;return[{installment_no:1,amount_due_thb:first,due_at:null},{installment_no:2,amount_due_thb:each,due_at:null},{installment_no:3,amount_due_thb:Math.round((total-first-each)*100)/100,due_at:null}]}
const steps=IS.filter(s=>s.plan_id===plan.id).sort((a,b)=>a.installment_no-b.installment_no);let fixed=steps.reduce((s,x)=>s+(x.amount_mode==='FIXED'?Number(x.amount_value||0):0),0),autos=steps.filter(x=>x.amount_mode!=='FIXED'),remaining=total-fixed,autoBase=autos.length?Math.floor((remaining/autos.length)*100)/100:0,used=0;return steps.map(s=>{let amt;if(s.amount_mode==='FIXED')amt=Number(s.amount_value||0);else{const ai=autos.findIndex(x=>x.id===s.id);amt=ai===autos.length-1?Math.round((remaining-used)*100)/100:autoBase;used+=amt}return{installment_no:s.installment_no,amount_due_thb:amt,due_at:s.due_at||null}})}
function paymentLabels(){
  const x={
    th:{promptpay:'PromptPay',bank:'โอนผ่านธนาคาร',recipient:'ชื่อรับเงิน',promptpayId:'PromptPay ID',promptpayType:'ประเภท PromptPay',bankName:'ธนาคาร',accountName:'ชื่อบัญชี',accountNo:'เลขบัญชี',phone:'เบอร์โทรศัพท์',national:'เลขบัตรประชาชน / เลขผู้เสียภาษี',ewallet:'E-Wallet ID'},
    en:{promptpay:'PromptPay',bank:'Bank Transfer',recipient:'Recipient',promptpayId:'PromptPay ID',promptpayType:'PromptPay Type',bankName:'Bank',accountName:'Account Name',accountNo:'Account Number',phone:'Phone Number',national:'National ID / Tax ID',ewallet:'E-Wallet ID'},
    zh:{promptpay:'PromptPay',bank:'银行转账',recipient:'收款人',promptpayId:'PromptPay ID',promptpayType:'PromptPay 类型',bankName:'银行',accountName:'账户名称',accountNo:'账号',phone:'手机号码',national:'身份证 / 税号',ewallet:'电子钱包 ID'},
    ja:{promptpay:'PromptPay',bank:'銀行振込',recipient:'受取人',promptpayId:'PromptPay ID',promptpayType:'PromptPay 種別',bankName:'銀行',accountName:'口座名義',accountNo:'口座番号',phone:'電話番号',national:'国民ID / 税ID',ewallet:'E-Wallet ID'},
    ru:{promptpay:'PromptPay',bank:'Банковский перевод',recipient:'Получатель',promptpayId:'PromptPay ID',promptpayType:'Тип PromptPay',bankName:'Банк',accountName:'Имя счёта',accountNo:'Номер счёта',phone:'Номер телефона',national:'National ID / Tax ID',ewallet:'E-Wallet ID'}
  };return x[lang]||x.en
}
function ppTypeLabel(type,t){return type==='NATIONAL_ID'?t.national:type==='EWALLET'?t.ewallet:t.phone}
function paymentMethodHTML(m,i){
  const t=paymentLabels(),isPP=m.kind==='PROMPTPAY';
  if(isPP){
    const recipient=m.account_name||m.label||'';
    return '<div class="paybox payment-method-card promptpay-card">'+
      '<div class="payment-card-head"><span class="payment-badge promptpay-badge">PROMPTPAY</span><strong>'+esc(t.promptpay)+'</strong></div>'+
      '<div class="payment-info-grid">'+
        '<div class="payment-info-row"><span>'+esc(t.recipient)+'</span><b>'+esc(recipient||'-')+'</b></div>'+
        '<div class="payment-info-row"><span>'+esc(t.promptpayId)+'</span><b class="payment-mono">'+esc(m.promptpay_id||'-')+'</b></div>'+
        '<div class="payment-info-row"><span>'+esc(t.promptpayType)+'</span><b>'+esc(ppTypeLabel(m.promptpay_type,t))+'</b></div>'+
      '</div>'+
      '<div class="payment-copy-row"><button type="button" class="btn sm soft copy" data-copy="'+esc(m.promptpay_id||'')+'">'+D().copy+' '+esc(t.promptpayId)+'</button></div>'+
      (m.qr_enabled&&((E.feature_flags||{}).payment_qr!==false)?'<div class="payment-qr-wrap"><div id="qr_'+i+'" class="payment-qr"></div></div>':'')+
    '</div>';
  }
  return '<div class="paybox payment-method-card bank-card">'+
    '<div class="payment-card-head"><span class="payment-badge bank-badge">BANK</span><strong>'+esc(t.bank)+'</strong></div>'+
    '<div class="payment-info-grid">'+
      '<div class="payment-info-row"><span>'+esc(t.bankName)+'</span><b>'+esc(m.bank_name||'-')+'</b></div>'+
      '<div class="payment-info-row"><span>'+esc(t.accountName)+'</span><b>'+esc(m.account_name||m.label||'-')+'</b></div>'+
      '<div class="payment-info-row"><span>'+esc(t.accountNo)+'</span><b class="payment-mono">'+esc(m.account_number||'-')+'</b></div>'+
    '</div>'+
    '<div class="payment-copy-row"><button type="button" class="btn sm soft copy" data-copy="'+esc(m.account_number||'')+'">'+D().copy+' '+esc(t.accountNo)+'</button></div>'+
  '</div>';
}
function refreshPrice(){if(!byId('priceBox'))return;const flags=E.feature_flags||{};const total=totalPrice();byId('priceBox').textContent='฿'+money(total);let sc=[];try{sc=makeSchedule();byId('scheduleBox').innerHTML=sc.map(x=>'<span class="badge" style="margin:4px">งวด '+x.installment_no+' · ฿'+money(x.amount_due_thb)+'</span>').join('')}catch(e){byId('scheduleBox').innerHTML='<div class="badge warn">'+esc(e.message)+'</div>'}const methods=PM.filter(m=>(m.kind!=='PROMPTPAY'||flags.promptpay!==false)&&(m.kind!=='BANK'||flags.bank_transfer!==false));byId('methodsBox').innerHTML=methods.map(paymentMethodHTML).join('');methods.forEach((m,i)=>{if(m.kind==='PROMPTPAY'&&m.qr_enabled&&flags.payment_qr!==false&&m.promptpay_id&&byId('qr_'+i)){try{new QRCode(byId('qr_'+i),{text:promptpayPayload(m.promptpay_id,sc[0]?.amount_due_thb||total,m.promptpay_type),width:220,height:220})}catch(e){}}});document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const text=b.dataset.copy;if(!text)return;const ok=()=>Swal.fire({icon:'success',title:D().copy,timer:800,showConfirmButton:false});if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(ok).catch(()=>{fallbackCopy(text);ok()});else{fallbackCopy(text);ok()}})}
function fallbackCopy(text){const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove()}
function addBene(){const box=document.createElement('div');box.className='bene';box.innerHTML='<div class="grid2"><label>ชื่อผู้รับผลประโยชน์<input data-b="name" required></label><label>เลขบัตรประชาชน / Passport<input data-b="id" required></label><label>เบอร์โทร<input data-b="phone"></label><label>ความสัมพันธ์<input data-b="rel" required></label><label>เปอร์เซ็นต์<input data-b="pct" type="number" min="0.01" max="100" step=".01" required></label><label style="grid-column:1/-1">ที่อยู่<textarea data-b="address"></textarea></label></div><button type="button" class="btn sm danger" data-remove>ลบ</button>';beneList.append(box);box.querySelector('[data-remove]').onclick=()=>{box.remove();sumBene()};box.querySelector('[data-b=pct]').oninput=sumBene;sumBene()}
function sumBene(){if(!window.beneTotal)return;const s=[...document.querySelectorAll('[data-b=pct]')].reduce((a,x)=>a+Number(x.value||0),0);beneTotal.textContent=(Math.round(s*100)/100)+'%'}
document.addEventListener('click',e=>{if(e.target?.id==='addBene')addBene()});
async function submit(e){e.preventDefault();try{const flags=E.feature_flags||{};const categoryId=byId('categorySel')?.value||null;if(flags.competition_categories!==false&&!categoryId)throw new Error('Please choose category');if(flags.insurance){const sum=[...document.querySelectorAll('[data-b=pct]')].reduce((a,x)=>a+Number(x.value||0),0);if(flags.beneficiary_total_100!==false&&Math.abs(sum-100)>.001)throw new Error('Beneficiary total must be 100%')}
Swal.fire({title:'กำลังส่งใบสมัคร…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});const uid=crypto.randomUUID();let slip=null;const slipInput=byId('slipFile');if(flags.slip_upload&&slipInput?.files?.[0]){const file=slipInput.files[0],ext=(file.name.split('.').pop()||'jpg').toLowerCase();slip=uid+'/slip-'+Date.now()+'.'+ext;const{error}=await db.storage.from('restart-slips').upload(slip,file);if(error)throw error}
const answers={};document.querySelectorAll('[data-field]').forEach(x=>answers[x.dataset.field]=x.value);const beneficiaries=flags.insurance?[...document.querySelectorAll('.bene')].map(x=>({full_name:x.querySelector('[data-b=name]').value.trim(),address:x.querySelector('[data-b=address]').value.trim(),id_document:x.querySelector('[data-b=id]').value.trim(),phone:x.querySelector('[data-b=phone]').value.trim(),relationship:x.querySelector('[data-b=rel]').value.trim(),percentage:Number(x.querySelector('[data-b=pct]').value)})):[];const idDocument=val('idDoc');const payload={event_id:E.id,category_id:categoryId,package_id:byId('packageSel')?.value||null,language:lang,payment_mode:document.querySelector('[name=paymode]:checked')?.value||((flags.installments&&flags.full_payment===false)?'INSTALLMENT':'FULL'),total_amount_thb:totalPrice(),slip_path:slip,schedule:makeSchedule(),runners:[{runner_index:1,first_name:val('firstName')||null,last_name:val('lastName')||null,id_document:idDocument||null,id_normalized:idDocument?idDocument.replace(/[^a-z0-9]/gi,'').toUpperCase():null,phone:val('phone')||null,birth_date:val('birthDate')||null,gender:val('gender')||null,shirt_size:val('shirt')||null,blood_group:val('blood')||null,title:val('title')||null,address:val('address')||null,emergency_phone:val('emergencyPhone')||null,emergency_relation:val('emergencyRelation')||null,answers,beneficiaries}]};const{data,error}=await db.rpc('restart_create_registration',{p_payload:payload});if(error)throw error;Swal.fire({icon:'success',title:'สมัครสำเร็จ',html:'เลขที่สมัคร <b>'+esc(data.registration_code)+'</b><br>ยอด ฿'+money(data.total_amount_thb),confirmButtonText:'ตกลง'}).then(()=>location.reload())}catch(err){Swal.fire('สมัครไม่สำเร็จ',err.message||String(err),'error')}}
function promptpayPayload(id,amount,type){const digits=String(id).replace(/\D/g,'');const target=type||((digits.length===13)?'NATIONAL_ID':'PHONE');let aid=digits,tag='01';if(target==='PHONE'){aid=digits.length===10?'0066'+digits.substring(1):digits;tag='01'}else if(target==='NATIONAL_ID'){tag='02'}else if(target==='EWALLET'){tag='03'}const tlv=(i,v)=>i+String(v.length).padStart(2,'0')+v;const merchant=tlv('00','A000000677010111')+tlv(tag,aid);let p=tlv('00','01')+tlv('01','12')+tlv('29',merchant)+tlv('53','764')+(amount?tlv('54',Number(amount).toFixed(2)):'')+tlv('58','TH')+tlv('62',tlv('07','RESTART'))+'6304';const crc=(s)=>{let c=0xffff;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xffff:(c<<1)&0xffff}return c.toString(16).toUpperCase().padStart(4,'0')};return p+crc(p)}
init().catch(e=>app.innerHTML='<section class="rr-card rr-empty">'+esc(e.message)+'</section>');
document.addEventListener('invalid',e=>{
  if(!e.target.closest||!e.target.closest('#regForm'))return;
  requestAnimationFrame(()=>{
    const card=e.target.closest('.rr-card');
    if(card)card.scrollIntoView({behavior:'smooth',block:'center'});
  });
},true);
