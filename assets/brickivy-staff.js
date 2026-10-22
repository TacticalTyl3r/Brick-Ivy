/* Brick & Ivy staff sign-in and protected Realtor editing.
 * Requires dedicated Supabase project, Discord provider and Edge Functions.
 * Discord Owner role is checked server-side for each management request.
 */
const cfg = window.BRICK_IVY_CONFIG || {};
const element = id => document.getElementById(id);
let supabase = null;
let currentRole = null;
let roster = [];
let editingId = null;

function message(txt) { const el=element('staffMessage');if(el)el.textContent=txt; }
function safe(v) {return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));}
function show(el,visible) {if(el)el.hidden=!visible;}
function isConfigured() {return cfg.discordAuthReady === true && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'')&&/^(sb_publishable_|eyJ)/.test(cfg.publishableKey||'');}
async function api(action,extra={}) {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw Error('Please sign in again.');
  const response=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/brickivy-admin',{
    method:'POST',credentials:'omit',
    headers:{
      'Content-Type':'application/json',
      apikey:cfg.publishableKey,
      Authorization:'Bearer '+session.access_token
    },
    body:JSON.stringify({action,...extra})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Request failed. Try again.');
  return result;
}
async function checkRole() {
  const {data:{session}}=await supabase.auth.getSession();
  show(element('staffLogin'),!session);
  show(element('staffSession'),Boolean(session));
  show(element('staffOwnerContent'),false);
  show(element('staffTeamContent'),false);
  show(element('staffManagementContent'),false);
  if(!session){currentRole=null;message('Sign in with Discord to continue.');return;}
  message('Checking your Brick & Ivy Discord permissions…');
  try {
    const me=await api('me');
    currentRole=me.role;
    message(currentRole==='owner'?'Signed in as Brick & Ivy Owner.':currentRole==='realtor'?'Signed in as a Brick & Ivy Realtor.':'Access restricted.');
    show(element('staffOwnerContent'),currentRole==='owner');
    show(element('staffTeamContent'),currentRole==='realtor');
    if(currentRole==='owner'&&element('staffManagementContent')){
      await loadRoster();
      show(element('staffManagementContent'),true);
    }
  }catch(error){
    currentRole=null;
    message(error.message||'Discord role verification failed.');
  }
}
async function loadRoster(){
  const data=await api('list');
  roster=Array.isArray(data.realtors)?data.realtors:[];
  renderRoster();
}
function renderRoster(){
  const el=element('managementRoster');
  if(!el)return;
  const selected=[...roster].sort((a,b)=>Number(a.displayOrder??999)-Number(b.displayOrder??999));
  element('managementCount').textContent=selected.length+' '+(selected.length===1?'profile':'profiles');
  el.innerHTML=selected.map(r=>'<div class="manage-person"><span class="manage-person-avatar" aria-hidden="true">'+safe((r.name||'BI').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase())+'</span><span class="manage-person-details"><strong>'+safe(r.name)+'</strong><span>CID '+safe(r.characterId)+' · '+safe(r.role)+'</span></span><span class="manage-public-label '+(r.published?'is-published':'')+'">'+(r.published?'Public':'Hidden')+'</span><button type="button" class="realtor-copy" data-edit="'+safe(r.id)+'">Edit</button>'+(r.role==='Owner'?'':'<button type="button" class="realtor-copy" data-remove="'+safe(r.id)+'">Remove</button>')+'</div>').join('')||'<p class="manage-empty">No team members yet.</p>';
}
function fillForm(r){
  const f=element('manageRealtorForm');if(!f)return;
  editingId=r.id;
  for(const key of ['name','characterId','inGamePhone','discordUsername','discordId','title','photo','email','bio']){
    if(f.elements[key])f.elements[key].value=r[key]??'';
  }
  f.elements.published.checked=r.published===true;
  element('formHeading').textContent='Edit Realtor';
  element('saveRealtorButton').textContent='Save changes →';
  element('cancelRealtorEdit').hidden=false;
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function resetForm(){
  editingId=null;
  element('manageRealtorForm')?.reset();
  element('formHeading').textContent='Add a Realtor';
  element('saveRealtorButton').textContent='Add Realtor →';
  element('cancelRealtorEdit').hidden=true;
}
function formEntry(){
  const f=element('manageRealtorForm');
  const data=new FormData(f);
  const id=editingId;
  const n=Number(data.get('characterId'));
  if(!Number.isSafeInteger(n)||n<1)throw Error('Enter a valid Character ID.');
  const photo=String(data.get('photo')||'').trim();
  if(photo&&!photo.startsWith('https://')&&!photo.startsWith('assets/realtors/'))throw Error('Photo must be an HTTPS address.');
  return {
    ...(id?{id}:{}),
    name:String(data.get('name')||'').trim(),
    characterId:n,
    inGamePhone:String(data.get('inGamePhone')||'').trim(),
    discordUsername:String(data.get('discordUsername')||'').trim(),
    discordId:String(data.get('discordId')||'').trim(),
    title:String(data.get('title')||'').trim(),
    photo,
    email:String(data.get('email')||'').trim(),
    bio:String(data.get('bio')||'').trim(),
    published:data.get('published')==='on',
    displayOrder:editingId?(roster.find(x=>x.id===id)?.displayOrder??100):roster.length+1
  };
}
async function discordProviderAvailable(){
  try {
    const response=await fetch(cfg.supabaseUrl+'/auth/v1/settings',{
      headers:{apikey:cfg.publishableKey,Accept:'application/json'},cache:'no-store',credentials:'omit'
    });
    if(!response.ok)return null;
    const settings=await response.json();
    return typeof settings?.external?.discord==='boolean'?settings.external.discord:null;
  }catch{return null}
}

async function setup(){
  const login=element('staffSignIn');
  const logout=element('staffSignOut');
  const form=element('manageRealtorForm');
  if(!isConfigured()){
    show(element('staffLogin'),false);
    show(element('staffSession'),false);
    show(element('staffOwnerContent'),false);
    show(element('staffTeamContent'),false);
    show(element('staffManagementContent'),false);
    message('Discord login is awaiting the dedicated Brick & Ivy Supabase project and OAuth setup. No credentials or staff roles are exposed here.');
    return;
  }
  const providerEnabled=await discordProviderAvailable();
  if(providerEnabled===false){
    show(element('staffLogin'),false);
    show(element('staffSession'),false);
    show(element('staffOwnerContent'),false);
    show(element('staffTeamContent'),false);
    show(element('staffManagementContent'),false);
    message('Supabase Auth still reports Discord as disabled, even if its dashboard toggle appears on. Recheck the saved Discord provider settings in the Brick & Ivy Supabase project, then refresh this page.');
    return;
  }
  try {
    const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm');
    supabase=createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    login?.addEventListener('click',async()=>{
      message('Opening Discord sign-in…');
      const {error}=await supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo:location.origin+location.pathname}});
      if(error)message(error.message);
    });
    logout?.addEventListener('click',async()=>{await supabase.auth.signOut();await checkRole()});
    await checkRole();
    if(form){
      form.addEventListener('submit',async e=>{
        e.preventDefault();
        if(currentRole!=='owner')return;
        if(!form.reportValidity())return;
        const button=element('saveRealtorButton');
        button.disabled=true;
        try{
          await api('save',{realtor:formEntry()});
          await loadRoster();resetForm();element('formStatus').textContent='Realtor saved successfully.';
        }catch(err){element('formStatus').textContent=err.message||'Unable to save Realtor.';}
        finally{button.disabled=false}
      });
      element('cancelRealtorEdit')?.addEventListener('click',resetForm);
      element('managementRoster')?.addEventListener('click',async e=>{
        const edit=e.target.closest('[data-edit]');
        const remove=e.target.closest('[data-remove]');
        if(edit){const r=roster.find(x=>x.id===edit.dataset.edit);if(r)fillForm(r);return;}
        if(remove){
          const r=roster.find(x=>x.id===remove.dataset.remove);
          if(!r||r.role==='Owner')return;
          if(!confirm('Remove '+r.name+' from the public Realtor directory?'))return;
          try {await api('delete',{id:r.id});await loadRoster();resetForm();}
          catch(err){element('formStatus').textContent=err.message||'Unable to remove Realtor.';}
        }
      });
    }
  }catch(err){message('Sign-in setup could not load: '+(err.message||'Unknown issue'));}
}
document.addEventListener('DOMContentLoaded',setup);
