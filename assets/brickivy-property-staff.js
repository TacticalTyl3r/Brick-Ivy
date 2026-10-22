/* Private Brick & Ivy property manager. Only verified Discord staff can load.
 * Supabase JWT is passed to the Edge Function; no OPFW token reaches the client.
 */
const config=window.BRICK_IVY_CONFIG||{};
const byId=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=v=>v===null||v===undefined||v===''?null:Number(v);
const usd=v=>{const n=numeric(v);return n!==null&&Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'Not reported'};
function weeklyIncome(rentPrice,maintenanceCost){
 const rent=numeric(rentPrice),maintenance=numeric(maintenanceCost);
 if(!Number.isFinite(rent)||!Number.isFinite(maintenance))return null;
 return Math.round((rent-maintenance)*100)/100;
}
function incomeDisplay(value){
 if(value===null)return 'Not reported';
 if(value>0)return '+'+usd(value);
 if(value<0)return '-'+usd(Math.abs(value));
 return usd(0);
}

let supabase=null,roster=[],storageTypes=[],role=null,rentalAvailable=false,busy=false;
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
 const rentalLabel=unknown?'Rental details unavailable':rented?'Currently rented':p.reserved?'Reserved':'No renter on record';
 const hasOverride=p.weeklyCostOverride!==null&&p.weeklyCostOverride!==undefined;
 const total=hasOverride?p.weeklyCostOverride:p.sourceWeeklyCost;
 const income=weeklyIncome(total,p.sourceWeeklyCost);
 const incomeClass=income===null?'is-unknown':income>0?'is-positive':income<0?'is-negative':'is-zero';
 const incomeRow='<div><span>Brick &amp; Ivy Income</span>'+
   '<strong class="property-private-income '+incomeClass+'">'+safe(incomeDisplay(income))+'</strong>'+
   '<small>Weekly rent price − weekly maintenance cost</small></div>';
 const rentalRows=unknown?
   '<p class="property-private-subtle">The OPFW rental fields could not be read. No occupancy status can be confirmed.</p>'+
   '<div class="property-private-meta">'+incomeRow+'</div>':
   '<div class="property-private-meta">'+
   '<div><span>Renter character</span><strong>'+safe(p.renterName|| (p.renterCharacterId?'CID '+p.renterCharacterId:'None'))+'</strong>'+
     (p.renterName&&p.renterCharacterId?'<small>CID '+safe(p.renterCharacterId)+'</small>':'')+'</div>'+
   incomeRow+
   '<div><span>Last payment</span><strong>'+safe(payDate(p.lastPayment))+'</strong></div></div>';
 const regionOptions=['','Los Santos','Sandy Shores','Paleto Bay']
   .map(area=>'<option value="'+safe(area)+'" '+(p.area===area?'selected':'')+'>'+safe(area||'Unassigned')+'</option>').join('');
 const occupancyTools='<div class="property-listing-controls">'+
   '<div><strong>Block '+safe(p.blockId||'Not recorded')+'</strong><small>'+safe(p.area||'Area unassigned')+' · '+safe(p.type||'Property')+'</small></div>'+
   '<div><span class="property-management-label">Public status</span>'+
   '<strong>'+(rented?'Unavailable':p.reserved?'Reserved':unknown?'In portfolio':'Available')+'</strong></div>'+
   '<div><span class="property-management-label">Storage preset</span>'+
   '<strong>'+([p.storageKg!==null&&p.storageKg!==undefined?Number(p.storageKg)+' kg':'',p.storageSlots!==null&&p.storageSlots!==undefined?Number(p.storageSlots)+' slots':''].filter(Boolean).join(' · ')||'Not configured')+'</strong></div>'+
   (isOwner?'<label class="field"><span>Region</span><select data-property-area="'+safe(p.id)+'">'+regionOptions+'</select></label>':'')+
   '<button type="button" class="button outline property-reserve-button" data-toggle-reserve="'+safe(p.id)+'" '+
   (rented&&!p.reserved?'disabled title="This property is already rented"':'')+'>'+
   (p.reserved?'Remove reservation':'Mark Reserved')+'</button></div>';
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
   occupancyTools+
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
   const hay=[p.name,p.address,p.id,p.type,p.blockId,p.area].join(' ').toLowerCase();
   return (!search||hay.includes(search))&&(!filter||(filter==='rented'&&p.rented===true)||(filter==='vacant'&&p.rented===false));
 });
 if(!roster.length){
   target.innerHTML='<div class="manage-panel">No properties were returned for Brick &amp; Ivy company ID 5.</div>';
 }else{
   target.innerHTML=matches.length?matches.sort((a,b)=>
      String(a.blockId??'').localeCompare(String(b.blockId??''),undefined,{numeric:true,sensitivity:'base'})
      ||String(a.address??'').localeCompare(String(b.address??''),undefined,{numeric:true})
    ).map(propertyCard).join(''):
    '<div class="manage-panel">No properties match your current filters.</div>';
 }
 const count=byId('propertyManagerCount');
 if(count)count.textContent=matches.length+' of '+roster.length+' properties';
}
function renderStorage(){
 const panel=byId('propertyTypeStoragePanel'),el=byId('propertyTypeStorageList');
 if(!panel||!el)return;
 panel.hidden=false;
 el.innerHTML=storageTypes.length?storageTypes.map(entry=>{
   const kg=entry.capacityKg===null||entry.capacityKg===undefined?'':String(entry.capacityKg);
   const slots=entry.capacitySlots===null||entry.capacitySlots===undefined?'':String(entry.capacitySlots);
   return '<form class="property-storage-type" data-storage-type="'+safe(entry.type)+'">'+
     '<div><h3>'+safe(entry.type)+'</h3><small>Applies to every property with this OPFW type</small></div>'+
     '<label class="field"><span>Storage weight (kg)</span><input type="number" min="0" step="0.01" max="9999999999.99" name="weight" value="'+safe(kg)+'" placeholder="Not set" '+(role==='owner'?'':'disabled')+'></label>'+
     '<label class="field"><span>Storage slots</span><input type="number" min="0" step="1" max="1000000" name="slots" value="'+safe(slots)+'" placeholder="Not set" '+(role==='owner'?'':'disabled')+'></label>'+
     (role==='owner'?'<button class="button dark" type="submit">Save storage</button>':'')+'</form>';
 }).join(''):'<p>No property types were returned from OPFW.</p>';
}
async function saveSetting(action,data){
 if(busy)return;
 busy=true;feedback('Saving property settings…');
 const grid=byId('propertyStaffGrid'),storage=byId('propertyTypeStorageList');
 if(grid)grid.setAttribute('aria-busy','true');
 if(storage)storage.setAttribute('aria-busy','true');
 try{
   const result=await api(action,data);
   if(action==='setStorage'){
     const current=storageTypes.find(x=>x.type===data.propertyType);
     if(current){current.capacityKg=result.capacityKg;current.capacitySlots=result.capacitySlots;}
     for(const p of roster)if(p.type===data.propertyType){p.storageKg=result.capacityKg;p.storageSlots=result.capacitySlots;}
   }else{
     const current=roster.find(x=>x.id===data.propertyId);
     if(current){current.area=result.area;current.reserved=result.reserved;}
   }
   feedback('Saved. Updated public listings should reflect this change within approximately 90 seconds.'+
    (result.auditRecorded===false?' Change history was not recorded; notify the Owner.':''));
   render();renderStorage();
 }catch(error){
   feedback(error.message||'Unable to save property settings');
   // Restore server values in the case of a partially completed request.
   try{
     const latest=await api('list');
     roster=latest.properties||[];
     storageTypes=latest.propertyTypes||[];
     render();renderStorage();
   }catch{}
 }finally{
   busy=false;
   grid?.setAttribute('aria-busy','false');
   storage?.setAttribute('aria-busy','false');
 }
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
   storageTypes=Array.isArray(result.propertyTypes)?result.propertyTypes:[];
   toggle('propertyStaffContent',true);
   toggle('propertyStaffRentalWarning',!rentalAvailable);
   status(role==='owner'?'Signed in as Owner — editing and reservation tools enabled.':'Signed in as Realtor — rental details and reservations enabled.');
   feedback(roster.length+' company properties loaded. Website values may take up to 90 seconds to refresh after a save.');
   render();
   renderStorage();
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
     const reserve=event.target.closest('[data-toggle-reserve]');
     if(reserve&&!busy){
       const current=roster.find(p=>p.id===reserve.dataset.toggleReserve);
       if(current && (role==='owner'||role==='realtor'))
         await saveSetting('setReservation',{propertyId:current.id,reserved:!current.reserved});
       return;
     }
     const reset=event.target.closest('[data-reset-price]');
     if(reset&&role==='owner'&&!busy)await saveCost(reset.dataset.resetPrice,null);
   });
   byId('propertyStaffGrid')?.addEventListener('change',async event=>{
     const area=event.target.closest('[data-property-area]');
     if(area&&role==='owner'&&!busy)await saveSetting('setArea',{propertyId:area.dataset.propertyArea,area:area.value});
   });
   byId('propertyTypeStorageList')?.addEventListener('submit',async event=>{
     const form=event.target.closest('[data-storage-type]');
     if(!form)return;
     event.preventDefault();
     if(busy||role!=='owner'||!form.reportValidity())return;
     const kg=form.elements.namedItem('weight').value.trim();
     const slots=form.elements.namedItem('slots').value.trim();
     await saveSetting('setStorage',{propertyType:form.dataset.storageType,capacityKg:kg||null,capacitySlots:slots||null});
   });
   await account();
 }catch(error){status('Property management could not load: '+(error.message||'Unknown error'))}
}
document.addEventListener('DOMContentLoaded',setup);