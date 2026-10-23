/* Private Brick & Ivy property manager. Only verified Discord staff can load.
 * Supabase JWT is passed to the Edge Function; no OPFW token reaches the client.
 */
const config=window.BRICK_IVY_CONFIG||{};
const byId=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=v=>v===null||v===undefined||v===''?null:Number(v);
// Keep OPFW property_type codes as saved keys; change labels only.
const OPFW_INTERIORS=Object.freeze({
 '1':'Motel',
 '2':"Trevor's Trailer",
 '3':'Janitor Apartment',
 '4':'Low-End Apartment',
 '5':"Lester's House",
 '6':"Franklin's House",
 '7':'Mid-End Apartment',
 '8':"Trevor's Beach House",
 '9':"Michael's Mansion",
 '10':"Franklin's Mansion",
 '11':'High-End Apartment'
});
function interiorName(type){
 const code=String(type??'').trim();
 return OPFW_INTERIORS[code]||code||'Unknown interior';
}
function interiorHeading(type){
 const code=String(type??'').trim();
 return OPFW_INTERIORS[code]?'Interior #'+code+' — '+OPFW_INTERIORS[code]:'OPFW interior '+(code||'Unknown');
}
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

let supabase=null,roster=[],storageTypes=[],role=null,rentalAvailable=false,busy=false,finance=null;
let permissions={};
const allowed=key=>role==='owner'||permissions[key]===true;
const galleries=new Map(),openedGalleries=new Set(),loadedGalleries=new Set();
function syncPhotoCount(propertyId,photos){
 const property=roster.find(p=>String(p.id)===String(propertyId));
 if(property&&Array.isArray(photos))property.photoCount=photos.length;
}
function photoBadge(p){
 const count=Number(p.photoCount);
 if(!Number.isInteger(count)||count<0)return '<span class="property-photo-count is-unknown">Photos unavailable</span>';
 return '<span class="property-photo-count '+(count?'has-photos':'no-photos')+'">'+
   (count?count+' photo'+(count===1?'':'s'):'No photos')+'</span>';
}
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

function validPhotoUrl(link){
 try{
  const u=new URL(link);
  return u.protocol==='https:'&&u.origin===new URL(config.supabaseUrl).origin&&
    u.pathname.startsWith('/storage/v1/object/public/brickivy-property-photos/')?u.href:'';
 }catch{return ''}
}
async function photosApi(action,propertyId,payload={}){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)throw Error('Your sign-in session expired. Sign in again.');
 const upload=action==='upload';
 const body=upload?payload:JSON.stringify({action,propertyId,...payload});
 const res=await fetch(config.supabaseUrl+'/functions/v1/brickivy-property-photos',{
  method:'POST',credentials:'omit',
  headers:upload?{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token}:
    {'Content-Type':'application/json',apikey:config.publishableKey,Authorization:'Bearer '+session.access_token},
  body
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||'Unable to manage property photos');
 return data;
}
function galleryMarkup(propertyId){
 const isOwner=allowed('can_manage_photos'),expanded=openedGalleries.has(propertyId);
 if(!expanded)return '<div class="property-gallery-disclosure"><button type="button" class="button outline" data-gallery-toggle="'+safe(propertyId)+'">Manage photos ▸</button></div>';
 const photos=galleries.get(propertyId)||[];
 const loaded=loadedGalleries.has(propertyId);
 let markup='<section class="property-gallery-manager"><div class="property-gallery-heading"><h4>Property photos <small>'+
   (loaded?photos.length+'/24':'Loading…')+'</small></h4><button class="button outline" type="button" data-gallery-toggle="'+safe(propertyId)+'">Close</button></div>';
 if(isOwner){
  markup+='<label class="property-gallery-picker">+ Add photos (JPEG, PNG or WebP)'+
   '<input type="file" data-gallery-upload="'+safe(propertyId)+'" accept="image/jpeg,image/png,image/webp" multiple>'+
   '</label><small>Up to 24 photos per property; 6 MB each. Select several images at once.</small>';
 }
 if(loaded&&!photos.length)markup+='<p class="property-private-subtle">No property photos yet. Upload pictures to build the public gallery.</p>';
 if(loaded&&photos.length){
  markup+='<div class="property-gallery-thumbs">';
  photos.forEach((p,i)=>{
   const src=validPhotoUrl(p.url);
   markup+='<div class="property-gallery-photo">'+(src?'<img src="'+safe(src)+'" alt="'+safe(p.filename||'Property photo')+'" loading="lazy">':'')+
    '<div class="property-gallery-photo-label">'+(p.cover?'Cover photo':'Photo '+(i+1))+'</div>';
   if(isOwner)markup+='<div class="property-gallery-photo-actions">'+
    '<button type="button" data-photo-cover="'+safe(p.id)+'" data-photo-property="'+safe(propertyId)+'" '+(p.cover?'disabled':'')+'>Set cover</button>'+
    '<button type="button" data-photo-move="'+safe(p.id)+'" data-photo-property="'+safe(propertyId)+'" data-photo-direction="-1" '+(i===0?'disabled':'')+'>↑</button>'+
    '<button type="button" data-photo-move="'+safe(p.id)+'" data-photo-property="'+safe(propertyId)+'" data-photo-direction="1" '+(i===photos.length-1?'disabled':'')+'>↓</button>'+
    '<button type="button" class="is-delete" data-photo-delete="'+safe(p.id)+'" data-photo-property="'+safe(propertyId)+'">Remove</button></div>';
   markup+='</div>';
  });
  markup+='</div>';
 }
 markup+='</section>';return markup;
}
async function toggleGallery(id){
 if(openedGalleries.has(id)){openedGalleries.delete(id);render();return;}
 openedGalleries.add(id);render();
 if(!loadedGalleries.has(id)){
  try{
   feedback('Loading property photos…');
   const data=await photosApi('list',id);
   galleries.set(id,data.photos||[]);loadedGalleries.add(id);
   syncPhotoCount(id,data.photos||[]);
   feedback('Photos loaded.');
  }catch(e){feedback(e.message||'Photo gallery unavailable');openedGalleries.delete(id);}
  render();
 }
}
async function mutateGallery(action,propertyId,payload={}){
 if(busy)return;
 busy=true;const grid=byId('propertyStaffGrid');grid?.setAttribute('aria-busy','true');
 try{
  const data=await photosApi(action,propertyId,payload);
  galleries.set(propertyId,data.photos||[]);loadedGalleries.add(propertyId);
  syncPhotoCount(propertyId,data.photos||[]);
  feedback(action==='upload'?'Image uploaded.':'Property photos updated. Public listings may take approximately 90 seconds to refresh.');
 }catch(e){feedback(e.message||'Unable to change photos');}
 finally{busy=false;grid?.setAttribute('aria-busy','false');render();}
}
function propertyCard(p){
 const isOwner=role==='owner';
 const rented=p.rented===true,unknown=p.rented===null;
 const rentalClass=unknown?'is-unknown':rented?'is-rented':'is-vacant';
 const rentalLabel=unknown?'Rental details unavailable':rented?'Currently rented':p.reserved?'Reserved':'No renter on record';
 const isPublished=p.published!==false, isFeatured=isPublished&&p.featured===true;
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
   '<div><strong>Block '+safe(p.blockId||'Not recorded')+'</strong><small>'+safe(p.area||'Area unassigned')+' · '+safe(interiorHeading(p.type))+'</small></div>'+
   '<div><span class="property-management-label">Public status</span>'+
   '<strong>'+(rented?'Unavailable':p.reserved?'Reserved':unknown?'In portfolio':'Available')+'</strong></div>'+
   '<div><span class="property-management-label">Storage preset</span>'+
   '<strong>'+([p.storageKg!==null&&p.storageKg!==undefined?Number(p.storageKg)+' SU':'',p.storageSlots!==null&&p.storageSlots!==undefined?Number(p.storageSlots).toLocaleString()+' objects (furniture pieces)':''].filter(Boolean).join(' · ')||'Not configured')+'</strong></div>'+
   (allowed('can_edit_area')?'<label class="field"><span>Region</span><select data-property-area="'+safe(p.id)+'">'+regionOptions+'</select></label>':'')+
   '<button type="button" class="button outline property-reserve-button" data-toggle-reserve="'+safe(p.id)+'" '+
   (!allowed('can_manage_reservations')||(rented&&!p.reserved)?'disabled title="Permission required or property already rented"':'')+'>'+
   (p.reserved?'Remove reservation':'Mark Reserved')+'</button></div>';
 const publishTools='<section class="property-publishing-panel'+(isPublished?'':' is-hidden')+'">'+
   '<div class="property-publishing-info"><div><span class="property-management-label">Website visibility</span>'+
   '<strong>'+(isPublished?'Published':'Unpublished')+'</strong>'+
   '<small>'+(isPublished?'Visible in the public property directory':'Hidden from the homepage, directory and detail pages')+'</small></div>'+
   '<div><span class="property-management-label">Homepage feature</span>'+
   '<strong>'+(isFeatured?'Featured':'Not featured')+'</strong>'+
   '<small>'+(isFeatured?'Prioritized in the homepage collection':'Not prioritized on the homepage')+'</small></div></div>'+
   (allowed('can_publish')||allowed('can_feature')?'<div class="property-publishing-actions">'+
    (allowed('can_publish')?'<button type="button" class="button '+(isPublished?'outline':'dark')+'" data-publish-property="'+safe(p.id)+'">'+(isPublished?'Unpublish property':'Publish property')+'</button>':'')+
    (allowed('can_feature')?'<button type="button" class="button '+(isFeatured?'outline':'dark')+'" data-feature-property="'+safe(p.id)+'" '+(!isPublished?'disabled title="Publish this property first"':'')+'>'+
    (isFeatured?'Remove featured':'Feature on homepage')+'</button>':'')+'</div>':'')+
   (isPublished?'<a class="property-public-preview" href="property.html?id='+encodeURIComponent(String(p.id))+'" target="_blank" rel="noopener noreferrer">View public listing ↗</a>':'')+
   '</section>';
 const currentDescription=String(p.description||'');
 const overviewEditor=allowed('can_edit_description')?
   '<details class="property-overview-editor"><summary>Edit public property overview'+(currentDescription?' · Custom description saved':'')+'</summary>'+
   '<form data-description-form="'+safe(p.id)+'">'+
   '<label for="overview-'+safe(p.id)+'">Describe this property for visitors</label>'+
   '<textarea id="overview-'+safe(p.id)+'" data-description-input maxlength="3000" rows="5" placeholder="Describe the interior, rooms, amenities, location, and what makes this home special.">'+safe(currentDescription)+'</textarea>'+
   '<div class="property-overview-actions"><small>Public on the property detail page · Maximum 3,000 characters</small>'+
   '<button type="submit" class="button dark">Save overview</button></div>'+
   '</form></details>':
   (currentDescription?'<div class="property-overview-readonly"><span>Public property overview</span><p>'+safe(currentDescription)+'</p></div>':'');
 const ownerEditor=allowed('can_set_prices')?
   '<form class="property-private-editor" data-price-form="'+safe(p.id)+'">'+
   '<div class="field"><label>Override weekly rent price ($)</label>'+
   '<input type="number" inputmode="decimal" min="0" max="9999999999.99" step="0.01" data-cost-input="'+safe(p.id)+'" '+
   'value="'+(hasOverride?safe(p.weeklyCostOverride):'')+'" placeholder="'+(p.sourceWeeklyCost===null?'Enter a value':safe(p.sourceWeeklyCost))+'"></div>'+
   '<div class="property-private-editor-actions"><button class="button dark" type="submit">Save value</button>'+
   '<button class="button outline" type="button" data-reset-price="'+safe(p.id)+'" '+(!hasOverride?'disabled':'')+'>Use OPFW value</button></div>'+
   '<small>Affects the Brick &amp; Ivy website only. This does not change the in-game weekly charge.</small>'+
   '</form>':'<p class="property-private-subtle">Weekly rent editing requires Owner permission.</p>';
 return '<article class="property-private-card">'+
   '<header class="property-private-card-head"><div><span class="eyebrow">Property #'+safe(p.id)+'</span>'+
   '<h3>'+safe(p.name||'Unnamed property')+'</h3><p>'+safe(p.address||'Address not supplied')+'</p></div>'+
   '<div class="property-private-card-tags">'+photoBadge(p)+
   '<span class="property-private-rental-tag '+rentalClass+'">'+safe(rentalLabel)+'</span></div></header>'+
   publishTools+occupancyTools+
   '<div class="property-private-cost-grid"><div><span>Weekly maintenance cost</span><strong>'+usd(p.sourceWeeklyCost)+'</strong></div>'+
   '<div><span>Weekly rent price</span><strong>'+usd(total)+'</strong>'+
   (hasOverride?'<small>Owner override active</small>':'<small>Using OPFW value</small>')+'</div></div>'+
   '<div class="property-private-rental-details"><h4>Private rental information</h4>'+rentalRows+'</div>'+
   overviewEditor+galleryMarkup(p.id)+ownerEditor+'</article>';
}
function render(){
 const target=byId('propertyStaffGrid');
 if(!target)return;
 const search=byId('propertyStaffSearch')?.value?.toLowerCase().trim()||'';
 const filter=byId('propertyStaffFilter')?.value||'';
 const visibility=byId('propertyStaffVisibility')?.value||'';
 const matches=roster.filter(p=>{
   const hay=[p.name,p.address,p.id,p.type,interiorName(p.type),p.blockId,p.area].join(' ').toLowerCase();
   const published=p.published!==false;
   const visibleMatch=!visibility||(visibility==='published'&&published)||(visibility==='unpublished'&&!published)||(visibility==='featured'&&published&&p.featured===true);
   return visibleMatch&&(!search||hay.includes(search))&&(!filter||(filter==='rented'&&p.rented===true)||(filter==='vacant'&&p.rented===false));
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
 if(count){
   const published=roster.filter(p=>p.published!==false).length;
   const featured=roster.filter(p=>p.published!==false&&p.featured===true).length;
   count.textContent=matches.length+' of '+roster.length+' properties · '+published+' published · '+featured+' featured';
 }
}
function renderStorage(){
 const panel=byId('propertyTypeStoragePanel'),el=byId('propertyTypeStorageList');
 if(!panel||!el)return;
 panel.hidden=false;
 el.innerHTML=storageTypes.length?storageTypes.slice().sort((a,b)=>{
  const left=String(a.type??''),right=String(b.type??'');
  return left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'});
 }).map(entry=>{
   const su=entry.capacityKg===null||entry.capacityKg===undefined?'':String(entry.capacityKg);
   const objects=entry.capacitySlots===null||entry.capacitySlots===undefined?'':String(entry.capacitySlots);
   const owned=Number.isSafeInteger(Number(entry.propertyCount))?Number(entry.propertyCount):0;
   const ownership=owned>0?owned+' '+(owned===1?'property':'properties')+' in inventory':'Not currently in inventory';
   const configured=entry.capacityKg!==null&&entry.capacityKg!==undefined||entry.capacitySlots!==null&&entry.capacitySlots!==undefined;
   return '<form class="property-storage-type" data-storage-type="'+safe(entry.type)+'">'+
     '<div><h3>'+safe(interiorHeading(entry.type))+'</h3>'+
     '<small>'+safe(ownership)+' · '+(configured?'Preset configured':'Preset not set')+'</small>'+
     '<small>Applies automatically to all properties with this interior, including future acquisitions.</small></div>'+
     '<label class="field"><span>Storage weight (SU)</span><input type="number" min="0" step="0.01" max="9999999999.99" name="weight" value="'+safe(su)+'" placeholder="Not set" '+(allowed('can_manage_storage')?'':'disabled')+'></label>'+
     '<label class="field"><span>Objects (furniture pieces)</span><input type="number" min="0" step="1" max="1000000" name="objects" value="'+safe(objects)+'" placeholder="Not set" '+(allowed('can_manage_storage')?'':'disabled')+'></label>'+
     (allowed('can_manage_storage')?'<button class="button dark" type="submit">Save storage</button>':'')+'</form>';
 }).join(''):'<p>Unable to load the interior storage presets. Refresh the page and try again.</p>';
}
function renderFinance(){
 const panel=byId('brickivyOwnerFinancials');
 if(!panel)return;
 panel.hidden=!allowed('can_view_financials');
 if(!allowed('can_view_financials')){
  for(const field of ['financeProperties','financeRented','financeVacant','financePublished','financeFeatured',
   'financeRevenue','financeMaintenance','financeNet']){
   const node=byId(field);if(node)node.textContent='—';
  }
  return;
 }
 const f=finance;
 const set=(id,value)=>{const node=byId(id);if(node)node.textContent=value;};
 set('financeProperties',f?String(f.totalProperties):'—');
 set('financeRented',f?(f.rented===null?'Unknown':String(f.rented)):'—');
 set('financeVacant',f?(f.vacant===null?'Unknown':String(f.vacant)):'—');
 set('financePublished',f?String(f.published):'—');
 set('financeFeatured',f?String(f.featured):'—');
 set('financeRevenue',f&&f.rentalRevenue!==null?usd(f.rentalRevenue):'Unavailable');
 set('financeMaintenance',f&&f.maintenance!==null?usd(f.maintenance):'Unavailable');
 set('financeNet',f&&f.netWeeklyIncome!==null?incomeDisplay(f.netWeeklyIncome):'Unavailable');
 const net=byId('financeNet');
 if(net)net.className='finance-net '+(f&&f.netWeeklyIncome!==null?(f.netWeeklyIncome<0?'is-negative':'is-positive'):'');
 set('financeExplanation',!f?'Owner financial data is unavailable.':
  !f.complete?'Cannot calculate a reliable weekly net: '+(
    !rentalAvailable?'OPFW rental occupancy is unavailable.':
    (f.missingMaintenance?'Missing maintenance for '+f.missingMaintenance+' properties. ':'')+
    (f.missingRent?'Missing rent for '+f.missingRent+' rented properties.':'')
  ):
  'Projected weekly net = rent from '+f.rented+' rented properties − maintenance for all '+f.totalProperties+' company properties, including vacant and unpublished homes. Not an actual payment ledger.');
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
   }else if(action==='setDescription'){
     const current=roster.find(x=>x.id===data.propertyId);
     if(current)current.description=result.description||'';
   }else if(action==='setPublished'||action==='setFeatured'){
     const current=roster.find(x=>x.id===data.propertyId);
     if(current){current.published=result.published;current.featured=result.featured;}
   }else{
     const current=roster.find(x=>x.id===data.propertyId);
     if(current){current.area=result.area;current.reserved=result.reserved;}
   }
   if(allowed('can_view_financials')&&(action==='setPublished'||action==='setFeatured')){
     const refreshed=await api('list');finance=refreshed.financialSummary||null;renderFinance();
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
   permissions=result.permissions||{};
   finance=allowed('can_view_financials')?result.financialSummary:null;
   rentalAvailable=result.rentalAvailable===true;
   roster=Array.isArray(result.properties)?result.properties:[];
   galleries.clear();loadedGalleries.clear();openedGalleries.clear();
   storageTypes=Array.isArray(result.propertyTypes)?result.propertyTypes:[];
   toggle('propertyStaffContent',true);
   toggle('propertyStaffRentalWarning',!rentalAvailable);
   status(role==='owner'?'Signed in as Owner — financial dashboard and all editing tools available.':'Signed in as Realtor — your Owner-approved editing permissions are active.');
   feedback(roster.length+' company properties loaded. Website values may take up to 90 seconds to refresh after a save.');
   render();
   renderStorage();
   renderFinance();
 }catch(error){feedback(error.message||'Unable to load property records');toggle('propertyStaffContent',false);status(error.message||'Access denied')}
 finally{busy=false;if(button)button.disabled=false}
}
async function saveCost(id,value){
 if(busy||!allowed('can_set_prices'))return;
 busy=true;
 const panel=byId('propertyStaffGrid'),button=byId('propertyStaffRefresh');
 if(panel)panel.setAttribute('aria-busy','true');
 if(button)button.disabled=true;
 feedback('Saving the website weekly value…');
 try{
   const result=await api('saveWeeklyCost',{propertyId:id,weeklyCost:value});
   const person=roster.find(x=>x.id===id);
   if(person){person.weeklyCostOverride=result.weeklyCostOverride;person.weeklyCost=result.weeklyCostOverride??person.sourceWeeklyCost;}
   if(allowed('can_view_financials')){const refreshed=await api('list');finance=refreshed.financialSummary||null;renderFinance();}
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
 if(!session){role=null;permissions={};finance=null;renderFinance();status('Sign in with Discord to view private Brick & Ivy rental details.');return;}
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
   byId('propertyStaffVisibility')?.addEventListener('change',render);
   byId('propertyStaffGrid')?.addEventListener('submit',async event=>{
     const overview=event.target.closest('[data-description-form]');
     if(overview){
       event.preventDefault();
       if(!allowed('can_edit_description')||busy)return;
       const text=overview.querySelector('[data-description-input]');
       if(!text||!text.reportValidity())return;
       await saveSetting('setDescription',{propertyId:overview.dataset.descriptionForm,description:text.value});
       return;
     }
     const form=event.target.closest('[data-price-form]');if(!form)return;
     event.preventDefault();
     if(!allowed('can_set_prices')||busy)return;
     const id=form.dataset.priceForm;
     const input=form.querySelector('[data-cost-input]');
     if(!input||!input.value.trim()){feedback('Enter a value, or use the button to restore the original OPFW value.');return;}
     if(!input.reportValidity())return;
     await saveCost(id,input.value.trim());
   });
   byId('propertyStaffGrid')?.addEventListener('click',async event=>{
     const publish=event.target.closest('[data-publish-property]');
     if(publish&&allowed('can_publish')&&!busy){
       const id=publish.dataset.publishProperty,p=roster.find(x=>x.id===id);
       if(p){
         const next=p.published===false;
         if(next||confirm('Unpublish this property? It will disappear from the public website and any active property links will stop working.')){
           await saveSetting('setPublished',{propertyId:id,published:next});
         }
       }
       return;
     }
     const feature=event.target.closest('[data-feature-property]');
     if(feature&&allowed('can_feature')&&!busy){
       const id=feature.dataset.featureProperty,p=roster.find(x=>x.id===id);
       if(p&&p.published!==false){
         await saveSetting('setFeatured',{propertyId:id,featured:!(p.featured===true)});
       }
       return;
     }
     const gallery=event.target.closest('[data-gallery-toggle]');
     if(gallery){if(!busy)await toggleGallery(gallery.dataset.galleryToggle);return;}
     const cover=event.target.closest('[data-photo-cover]');
     if(cover&&allowed('can_manage_photos')){await mutateGallery('cover',cover.dataset.photoProperty,{photoId:cover.dataset.photoCover});return;}
     const remove=event.target.closest('[data-photo-delete]');
     if(remove&&allowed('can_manage_photos')){
       if(confirm('Remove this property photo? It will no longer appear publicly.'))
         await mutateGallery('delete',remove.dataset.photoProperty,{photoId:remove.dataset.photoDelete});
       return;
     }
     const move=event.target.closest('[data-photo-move]');
     if(move&&allowed('can_manage_photos')&&!busy){
       const propertyId=move.dataset.photoProperty,arr=galleries.get(propertyId)||[];
       const index=arr.findIndex(p=>p.id===move.dataset.photoMove),next=index+Number(move.dataset.photoDirection);
       if(index>=0&&next>=0&&next<arr.length){
         const reordered=arr.map(p=>p.id),[item]=reordered.splice(index,1);
         reordered.splice(next,0,item);
         await mutateGallery('reorder',propertyId,{ids:reordered});
       }
       return;
     }
     const reserve=event.target.closest('[data-toggle-reserve]');
     if(reserve&&!busy){
       const current=roster.find(p=>p.id===reserve.dataset.toggleReserve);
       if(current && allowed('can_manage_reservations'))
         await saveSetting('setReservation',{propertyId:current.id,reserved:!current.reserved});
       return;
     }
     const reset=event.target.closest('[data-reset-price]');
     if(reset&&allowed('can_set_prices')&&!busy)await saveCost(reset.dataset.resetPrice,null);
   });
   byId('propertyStaffGrid')?.addEventListener('change',async event=>{
     const uploader=event.target.closest('[data-gallery-upload]');
     if(uploader&&allowed('can_manage_photos')&&!busy){
       const propertyId=uploader.dataset.galleryUpload,files=[...uploader.files||[]];
       if(!files.length)return;
       if(files.some(file=>file.size>6*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){
         feedback('Each file must be a JPEG, PNG or WebP of 6 MB or less.');return;
       }
       const existing=(galleries.get(propertyId)||[]).length;
       if(existing+files.length>24){feedback('A property can have up to 24 photos.');return;}
       busy=true;byId('propertyStaffGrid')?.setAttribute('aria-busy','true');
       let added=0;
       try{
         for(const file of files){
           feedback('Uploading photo '+(added+1)+' of '+files.length+'…');
           const form=new FormData();
           form.append('action','upload');form.append('propertyId',propertyId);form.append('file',file);
           const data=await photosApi('upload',propertyId,form);
           galleries.set(propertyId,data.photos||[]);loadedGalleries.add(propertyId);
           syncPhotoCount(propertyId,data.photos||[]);added++;
         }
         feedback(added+' photo'+(added===1?'':'s')+' uploaded. The public property gallery may take up to 90 seconds to refresh.');
       }catch(e){feedback(added+' uploaded; '+(e.message||'some photos could not be uploaded'));}
       finally{busy=false;byId('propertyStaffGrid')?.setAttribute('aria-busy','false');render();}
       return;
     }
     const area=event.target.closest('[data-property-area]');
     if(area&&allowed('can_edit_area')&&!busy)await saveSetting('setArea',{propertyId:area.dataset.propertyArea,area:area.value});
   });
   byId('propertyTypeStorageList')?.addEventListener('submit',async event=>{
     const form=event.target.closest('[data-storage-type]');
     if(!form)return;
     event.preventDefault();
     if(busy||!allowed('can_manage_storage')||!form.reportValidity())return;
     const su=form.elements.namedItem('weight').value.trim();
     const objects=form.elements.namedItem('objects').value.trim();
     await saveSetting('setStorage',{propertyType:form.dataset.storageType,capacityKg:su||null,capacitySlots:objects||null});
   });
   await account();
 }catch(error){status('Property management could not load: '+(error.message||'Unknown error'))}
}
document.addEventListener('DOMContentLoaded',setup);