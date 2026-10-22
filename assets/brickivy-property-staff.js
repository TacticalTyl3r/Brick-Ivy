/* Private Brick & Ivy property manager. Only verified Discord staff can load.
 * Supabase JWT is passed to the Edge Function; no OPFW token reaches the client.
 */
const config=window.BRICK_IVY_CONFIG||{};
const byId=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=v=>v===null||v===undefined||v===''?null:Number(v);
const usd=v=>{const n=numeric(v);return n!==null&&Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'Not reported'};
let supabase=null,roster=[],role=null,rentalAvailable=false,busy=false;
function toggle(id,value){const el=byId(id);if(el)el.hidden=!value}
function status(text){const el=byId('propertyStaffStatus');if(el)el.textContent=text}
function feedback(text){const el=byId('propertyStaffFeedback');if(el)el.textContent=text}
function payDate(value){
 if(value===null||value===undefined||value==='')return 'Not recorded';
 const v=String(value).trim();
 if(/^\d{10,13}$/.test(v)){
   const n=Number(v),dt=new Date(v.length===10?n*1000:n);
   if(!Number.isNaN(dt.getTime()))return dt.toLocaleString();
 }
 const dt=new Date(v);
 if(!Number.isNaN(dt.getTime()))return dt.toLocaleString();
 return v.slice(0,80);
}
async function api(action,other={}){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)throw Error('Your sign-in session expired. Sign in again.');
 const res=await fetch(config.supabaseUrl+'/functions/v1/brickivy-property-staff',{
   method:'POST',credentials:'omit',
   headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:'Bearer '+session.access_token},
   body:JSON.stringify({action,...other})
 });
 const result=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(result.error||'Unable to complete request');
 return result;
}
function propertyCard(p){
 const isOwner=role==='owner';
 const rented=p.rented===true,unknown=p.rented===null;
 const rentalClass=unknown?'is-unknown':rented?'is-rented':'is-vacant';
 const rentalLabel=unknown?'Rental details unavailable':rented?'Currently rented':'No renter on record';
 const hasOverride=p.weeklyCostOverride!==null&&p.weeklyCostOverride!==undefined;
 const total=hasOverride?p.weeklyCostOverride:p.sourceWeeklyCost;
 const rentalRows=unknown?
   '<p class="property-private-subtle">The OPFW rental fields could not be read. No occupancy status can be confirmed.</p>':
   '<div class="property-private-meta">'+
   '<div><span>Renter character</span><strong>'+safe(p.renterName|| (p.renterCharacterId?'CID '+p.renterCharacterId:'None'))+'</strong>'+
     (p.renterName&&p.renterCharacterId?'<small>CID '+safe(p.renterCharacterId)+'</small>':'')+'</div>'+
   '<div><span>OPFW property income</span><strong>'+usd(p.propertyIncome)+'</strong></div>'+
   '<div><span>Last payment</span><strong>'+safe(payDate(p.lastPayment))+'</strong></div></div>';
 const ownerEditor=isOwner?
   '<form class="property-private-editor" data-price-form="'+safe(p.id)+'">'+
   '<div class="field"><label>Override weekly rent price ($)</label>'+
   '<input type="number" inputmode="decimal" min="0" max="9999999999.99" step="0.01" data-cost-input="'+safe(p.id)+'" '+
   'value="'+(hasOverride?safe(p.weeklyCostOverride):'')+'" placeholder="'+(p.sourceWeeklyCost===null?'Enter a value':safe(p.sourceWeeklyCost))+'"></div>'+
   '<div class="property-private-editor-actions"><button class="button dark" type="submit">Save value</button>'+
   '<button class="button outline" type="button" data-reset-price="'+safe(p.id)+'" '+(!hasOverride?'disabled':'')+'>Use OPFW value</button></div>'+
   '<small>Affects the Brick &amp; Ivy website only. This does not change the in-game weekly charge.</small>'+
   '</form>':'<p class="property-private-subtle">Only an Owner can change website weekly values.</p>';
 return '<article class="property-private-card">'+
   '<header class="property-private-card-head"><div><span class="eyebrow">Property #'+safe(p.id)+'</span>'+
   '<h3>'+safe(p.name||'Unnamed property')+'</h3><p>'+safe(p.address||'Address not supplied')+'</p></div>'+
   '<span class="property-private-rental-tag '+rentalClass+'">'+safe(rentalLabel)+'</span></header>'+
   '<div class="property-private-cost-grid"><div><span>Weekly maintenance cost</span><strong>'+usd(p.sourceWeeklyCost)+'</strong></div>'+
   '<div><span>Weekly rent price</span><strong>'+usd(total)+'</strong>'+
   (hasOverride?'<small>Owner override active</small>':'<small>Using OPFW value</small>')+'</div></div>'+
   '<div class="property-private-rental-details"><h4>Private rental information</h4>'+rentalRows+'</div>'+
   ownerEditor+'</article>';
}
function render(){
 const target=byId('propertyStaffGrid');
 if(!target)return;
 const search=byId('propertyStaffSearch')?.value?.toLowerCase().trim()||'';
 const filter=byId('propertyStaffFilter')?.value||'';
 const matches=roster.filter(p=>{
   const hay=[p.name,p.address,p.id,p.type].join(' ').toLowerCase();
   return (!search||hay.includes(search))&&(!filter||(filter==='rented'&&p.rented===true)||(filter==='vacant'&&p.rented===false));
 });
 if(!roster.length){
   target.innerHTML='<div class="manage-panel">No properties were returned for Brick &amp; Ivy company ID 5.</div>';
 }else{
   target.innerHTML=matches.length?matches.map(propertyCard).join(''):
    '<div class="manage-panel">No properties match your current filters.</div>';
 }
 const count=byId('propertyManagerCount');
 if(count)count.textContent=matches.length+' of '+roster.length+' properties';
}
async function load(){
 if(busy)return;
 busy=true;feedback('Loading the latest company records…');
 const button=byId('propertyStaffRefresh');
 if(button)button.disabled=true;
 try{
   const result=await api('list');
   role=result.role;
   rentalAvailable=result.rentalAvailable===true;
   roster=Array.isArray(result.properties)?result.properties:[];
   toggle('propertyStaffContent',true);
   toggle('propertyStaffRentalWarning',!rentalAvailable);
   status(role==='owner'?'Signed in as Owner — value editing enabled.':'Signed in as Realtor — private rental details (read-only).');
   feedback(roster.length+' company properties loaded. Website values may take up to 90 seconds to refresh after a save.');
   render();
 }catch(error){feedback(error.message||'Unable to load property records');toggle('propertyStaffContent',false);status(error.message||'Access denied')}
 finally{busy=false;if(button)button.disabled=false}
}
async function saveCost(id,value){
 if(busy||role!=='owner')return;
 busy=true;
 const panel=byId('propertyStaffGrid'),button=byId('propertyStaffRefresh');
 if(panel)panel.setAttribute('aria-busy','true');
 if(button)button.disabled=true;
 feedback('Saving the website weekly value…');
 try{
   const result=await api('saveWeeklyCost',{propertyId:id,weeklyCost:value});
   const person=roster.find(x=>x.id===id);
   if(person){person.weeklyCostOverride=result.weeklyCostOverride;person.weeklyCost=result.weeklyCostOverride??person.sourceWeeklyCost;}
   feedback('Saved. '+(value===null?'Using the OPFW value again.':'The custom weekly value is now set.')+' Public pages can take up to 90 seconds to refresh.');
   render();
   if(result.auditRecorded===false)feedback('Value saved. However, the change history could not be written; notify an Owner.');
 }catch(err){feedback(err.message||'Unable to save weekly value')}
 finally{busy=false;if(panel)panel.setAttribute('aria-busy','false');if(button)button.disabled=false}
}
async function account(){
 toggle('propertyStaffContent',false);
 const {data:{session}}=await supabase.auth.getSession();
 toggle('propertyStaffLogin',!session);
 toggle('propertyStaffSession',Boolean(session));
 if(!session){role=null;status('Sign in with Discord to view private Brick & Ivy rental details.');return;}
 await load();
}
async function setup(){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl||'')||!config.publishableKey){
   status('The staff property connection is not configured.');return;
 }
 try{
   const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm');
   supabase=createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   byId('propertyStaffSignIn')?.addEventListener('click',async()=>{
     status('Opening Discord sign-in…');
     const {error}=await supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo:location.origin+location.pathname}});
     if(error)status(error.message);
   });
   byId('propertyStaffSignOut')?.addEventListener('click',async()=>{await supabase.auth.signOut();roster=[];await account()});
   byId('propertyStaffRefresh')?.addEventListener('click',load);
   byId('propertyStaffSearch')?.addEventListener('input',render);
   byId('propertyStaffFilter')?.addEventListener('change',render);
   byId('propertyStaffGrid')?.addEventListener('submit',async event=>{
     const form=event.target.closest('[data-price-form]');if(!form)return;
     event.preventDefault();
     if(role!=='owner'||busy)return;
     const id=form.dataset.priceForm;
     const input=form.querySelector('[data-cost-input]');
     if(!input||!input.value.trim()){feedback('Enter a value, or use the button to restore the original OPFW value.');return;}
     if(!input.reportValidity())return;
     await saveCost(id,input.value.trim());
   });
   byId('propertyStaffGrid')?.addEventListener('click',async event=>{
     const reset=event.target.closest('[data-reset-price]');
     if(reset&&role==='owner'&&!busy)await saveCost(reset.dataset.resetPrice,null);
   });
   await account();
 }catch(error){status('Property management could not load: '+(error.message||'Unknown error'))}
}
document.addEventListener('DOMContentLoaded',setup);