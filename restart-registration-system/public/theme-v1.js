(()=>{
'use strict';
const key='restart_ui_theme';
const media=window.matchMedia?.('(prefers-color-scheme: dark)');
function savedTheme(){try{const value=localStorage.getItem(key);return value==='dark'||value==='light'?value:null}catch{return null}}
let preference=savedTheme(),theme=preference||(media?.matches?'dark':'light');
const names={th:{light:'โหมดสว่าง',dark:'โหมดมืด'},en:{light:'Light mode',dark:'Dark mode'},zh:{light:'浅色模式',dark:'深色模式'},ja:{light:'ライトモード',dark:'ダークモード'},ru:{light:'Светлая тема',dark:'Тёмная тема'}};
function apply(){
 document.documentElement.dataset.uiTheme=theme;
 document.documentElement.style.colorScheme=theme;
 const button=document.getElementById('themeToggle');if(!button)return;
 const dark=theme==='dark',label=(names[window.RestartI18n?.language()]||names.th)[dark?'light':'dark'];
 button.setAttribute('aria-pressed',String(dark));
 button.setAttribute('aria-label',label);button.title=label;
 button.querySelector('.theme-icon').textContent=dark?'☀':'☾';
 button.querySelector('.theme-label').textContent=label;
}
function mount(){
 const actions=document.querySelector('.rr-public-actions');if(!actions)return;
 let button=document.getElementById('themeToggle');
 if(!button){button=document.createElement('button');button.id='themeToggle';actions.insertBefore(button,document.getElementById('langbar'))}
 button.type='button';button.className='theme-toggle';
 button.removeAttribute('data-ui-aria');
 button.innerHTML='<span class="theme-icon" aria-hidden="true"></span><span class="theme-label"></span>';
 button.onclick=()=>{
  preference=theme=theme==='dark'?'light':'dark';
  try{localStorage.setItem(key,theme)}catch{}
  apply();
 };
 apply();
}
window.RestartTheme={apply,mount,theme:()=>theme};
// Apply the preference in the head, before the first page paint.
apply();
document.addEventListener('DOMContentLoaded',()=>{
 mount();
 window.RestartI18n?.onChange(()=>apply());
});
media?.addEventListener?.('change',event=>{if(!preference){theme=event.matches?'dark':'light';apply()}});
window.addEventListener('storage',event=>{
 if(event.key!==key)return;
 preference=savedTheme();theme=preference||(media?.matches?'dark':'light');apply();
});
})();
