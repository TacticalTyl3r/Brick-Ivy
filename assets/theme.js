/* Brick & Ivy - persistent, accessible light/dark appearance across the site.
 * Apply immediately in the head to avoid a bright flash on page navigation.
 * No account, tracking, network request or privileged state is involved.
 */
(function(){
  'use strict';
  const storageKey='brickivy-color-mode';
  let stored='';
  try{stored=localStorage.getItem(storageKey)||'';}catch{}
  let dark=stored==='dark'||(stored!=='light'&&
    typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches);
  const root=document.documentElement;
  function apply(value){
    dark=Boolean(value);
    root.dataset.uiTheme=dark?'dark':'light';
    root.style.colorScheme=dark?'dark':'light';
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',dark?'#101b19':'#182d25');
    const button=document.getElementById('brickivyThemeToggle');
    if(button){
      button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
      button.setAttribute('title',dark?'Switch to light mode':'Switch to dark mode');
      button.setAttribute('aria-pressed',String(dark));
      button.dataset.mode=dark?'dark':'light';
      const text=button.querySelector('.theme-toggle-label');
      if(text)text.textContent=dark?'Light':'Dark';
      const pict=button.querySelector('.theme-toggle-symbol');
      if(pict)pict.textContent=dark?'☀':'☾';
    }
  }
  apply(dark);
  const query=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
  if(query){
    const listener=(event)=>{
      let choice='';
      try{choice=localStorage.getItem(storageKey)||'';}catch{}
      if(choice!=='dark'&&choice!=='light')apply(event.matches);
    };
    if(typeof query.addEventListener==='function')query.addEventListener('change',listener);
    else if(typeof query.addListener==='function')query.addListener(listener);
  }
  function init(){
    const header=document.querySelector('.header-actions');
    if(!header||document.getElementById('brickivyThemeToggle'))return;
    const button=document.createElement('button');
    button.type='button';
    button.id='brickivyThemeToggle';
    button.className='theme-toggle';
    button.innerHTML='<span class="theme-toggle-symbol" aria-hidden="true"></span><span class="theme-toggle-label"></span>';
    const menu=header.querySelector('.menu-toggle');
    if(menu)header.insertBefore(button,menu);
    else header.appendChild(button);
    button.addEventListener('click',()=>{
      apply(!dark);
      try{localStorage.setItem(storageKey,dark?'dark':'light');}catch{}
    });
    apply(dark);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();