/* Brick & Ivy Owner-only audit timeline and safe homepage version restoration */
const cfg=window.BRICK_IVY_CONFIG||{};
const byId=id=>document.getElementById(id);
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={
 save_draft:'Homepage draft saved',publish:'Homepage published',reset_draft:'Draft reset',restore_draft:'Historical version restored to draft',
 set_published:'Publication changed',set_featured:'Featured status changed',set_area:'Property region changed',
 set_reserved:'Reservation changed',set_reservation:'Reservation changed',set_storage:'Storage capacity changed',
 set_description:'Property overview updated',weekly_cost:'Weekly rent override changed',permissions:'Realtor permissions updated'
};
const friendly={
 can_edit_area:'Edit area',can_manage_reservations:'Reservations',can_edit_description:'Edit descriptions',
 can_set_prices:'Weekly prices',can_manage_storage:'Storage',can_publish:'Publish homes',
 can_feature:'Feature homes',can_manage_photos:'Property images',can_view_financials:'Financial snapshot'
};
let client=null,events=[],actors={},restoring=false;
function tell(message){const node=byId('historyStatus');if(node)node.textContent=message;}
async function api(fn,action,extra={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error('Sign in again to continue.');
 const response=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/'+fn,{
  method:'POST',credentials:'omit',headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
  body:JSON.stringify({action,...extra})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Request failed');
 return data;
}
const timeText=value=>{
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Unknown time':date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
};
function displayValue(value){
 if(value===null||value===undefined)return 'Not set';
 if(typeof value==='boolean')return value?'Enabled':'Disabled';
 if(typeof value==='string')return value.length>115?value.slice(0,112)+'…':value;
 return JSON.stringify(value).slice(0,120);
}
function filtered(){
 const type=byId('historyType')?.value||'',search=(byId('historySearch')?.value||'').trim().toLowerCase();
 return events.filter(event=>{
  if(type&&type!==event.type)return false;
  const text=[event.subject,event.action,event.type,actors[event.actor],event.actor,
   ...(event.changes||[]).map(x=>x.field)].join(' ').toLowerCase();
  return !search||text.includes(search);
 });
}
function render(){
 const list=byId('historyEventList');if(!list)return;
 const results=filtered();
 list.innerHTML=results.length?results.map(event=>{
  const name=actors[event.actor]||((event.actor||'').slice(0,8)||'Unknown staff');
  const changeCount=(event.changes||[]).length;
  const changed=changeCount?'<ul class="audit-detail-list">'+event.changes.map(d=>
    '<li><strong>'+escapeText(friendly[d.field]||d.field)+'</strong><span>'+
    escapeText(displayValue(d.from))+' <span aria-hidden="true">→</span> '+escapeText(displayValue(d.to))+'</span></li>'
  ).join('')+'</ul>':'<p>No content field changes were recorded.</p>';
  const restore=event.type==='homepage'&&event.restoreVersionId?
   '<button type="button" class="button outline audit-restore" data-home-restore="'+event.restoreVersionId+'">Restore this version to draft ↗</button>':'';
  return '<article class="audit-event">'+
   '<div class="audit-event-info"><span class="audit-category audit-category-'+escapeText(event.type)+'">'+escapeText(event.type)+'</span>'+
   '<span>'+escapeText(timeText(event.time))+'</span></div>'+
   '<h3>'+escapeText(labels[event.action]||event.action)+'</h3>'+
   '<p class="audit-event-subject">'+escapeText(event.subject)+' · By '+escapeText(name)+'</p>'+
   '<details class="audit-event-details"><summary>View changes'+(changeCount?' ('+changeCount+')':'')+'</summary>'+
   changed+'</details>'+restore+'</article>';
 }).join(''):'<div class="audit-event audit-empty">No changes match your filters.</div>';
 const summary=byId('historyCount');
 if(summary)summary.textContent=results.length+' of '+events.length+' recent changes';
}
async function load(){
 const gate=byId('historyGate'),login=byId('historyLogin'),sessionPanel=byId('historySession');
 const {data:{session}}=await client.auth.getSession();
 login.hidden=Boolean(session);sessionPanel.hidden=!session;gate.hidden=true;
 if(!session){tell('Sign in with your Brick & Ivy Owner Discord account to see change history.');return;}
 tell('Checking Owner access and loading private history…');
 try{
  const result=await api('brickivy-history','list');
  events=result.events||[];actors=result.actors||{};render();gate.hidden=false;
  tell('Owner access verified. '+events.length+' recent changes loaded.');
 }catch(error){tell(error.message||'Unable to load change history');}
}
async function restore(versionId){
 if(restoring)return;
 if(!Number.isSafeInteger(versionId)||versionId<1)return;
 if(!confirm('Restore this published homepage version to your PRIVATE draft? The live homepage will NOT change until you publish it in Homepage Editor.'))return;
 restoring=true;
 const status=byId('historyRestoreStatus');
 if(status)status.textContent='Preparing historical homepage draft…';
 try{
  const current=await api('brickivy-homepage','load');
  const outcome=await api('brickivy-homepage','restoreVersion',{revision:current.revision,versionId});
  if(status)status.textContent='Version restored to your private draft. Open Homepage Editor to preview and publish it.';
  if(outcome.auditRecorded===false&&status)status.textContent+=' The history log was unavailable.';
  await load();
 }catch(error){if(status)status.textContent=error.message||'Could not restore this version.';}
 finally{restoring=false}
}
async function init(){
 if(!cfg.supabaseUrl||!cfg.publishableKey){tell('Site configuration is unavailable.');return;}
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm');
  client=createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  byId('historySignIn')?.addEventListener('click',async()=>{
   const {error}=await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo:location.origin+location.pathname}});
   if(error)tell(error.message);
  });
  byId('historySignOut')?.addEventListener('click',async()=>{await client.auth.signOut();events=[];actors={};await load()});
  byId('historyRefresh')?.addEventListener('click',load);
  byId('historyType')?.addEventListener('change',render);
  byId('historySearch')?.addEventListener('input',render);
  byId('historyEventList')?.addEventListener('click',event=>{
   const btn=event.target.closest('[data-home-restore]');
   if(btn)restore(Number(btn.dataset.homeRestore));
  });
  await load();
 }catch(error){tell('History page initialization failed: '+(error.message||'Unknown'));}
}
document.addEventListener('DOMContentLoaded',init);
