const DATA_URL = 'data/properties.json';
const money = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const $ = (selector,root=document)=>root.querySelector(selector);
const $$ = (selector,root=document)=>Array.from(root.querySelectorAll(selector));
function esc(input){return String(input??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeImage(url){if(typeof url!=='string'||!url.trim())return '';try{const u=new URL(url,window.location.href);return u.protocol==='https:'||u.origin===location.origin?u.href:''}catch{return ''}}
function safeText(x){return String(x??'').trim();}
// OPFW interior codes; keep raw property_type values for filters and database keys.
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
 const code=safeText(type);
 return OPFW_INTERIORS[code]||code||'Property';
}
function interiorChoiceLabel(type){
 const code=safeText(type);
 return OPFW_INTERIORS[code]?'#'+code+' — '+OPFW_INTERIORS[code]:code;
}
function populatePropertyTypes(select,properties){
 if(!select)return;
 const prior=safeText(select.value);
 const types=[...new Set(properties.map(p=>safeText(p.type)).filter(Boolean))]
   .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
 select.innerHTML='<option value="">All property types</option>'+
  types.map(type=>'<option value="'+esc(type)+'">'+esc(interiorChoiceLabel(type))+'</option>').join('');
 // Keep a selected type only when it occurs in the live OPFW company feed.
 if(types.includes(prior))select.value=prior;
}

function normalStatus(p){const s=safeText(p.status).toLowerCase();return s==='unavailable'?'Unavailable':s==='reserved'?'Reserved':s==='available'?'Available':s==='pending'?'Pending':s==='sold'?'Sold':s==='listed'?'In portfolio':'For Sale'}
function listed(p){return p&&p.published===true&&['for-sale','pending','sold','listed','unavailable','available','reserved'].includes(safeText(p.status).toLowerCase());}
async function getProperties(){
 const cfg=window.BRICK_IVY_CONFIG||{};
 const hasBackend=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'');
 const endpoint=hasBackend?cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/brickivy-properties':DATA_URL;
 const res=await fetch(endpoint,{cache:'no-store',credentials:'omit'});
 if(!res.ok)throw new Error('Property feed unavailable (HTTP '+res.status+')');
 const data=await res.json();
 if(!Array.isArray(data))throw new Error('Unexpected property feed response');
 return data.filter(listed);
}
function statusOrder(p){return safeText(p.status).toLowerCase()==='unavailable'?1:0}
function blockOrder(a,b){
 const x=safeText(a.blockId),y=safeText(b.blockId);
 if(!x&&y)return 1;if(x&&!y)return -1;
 return x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'})
   ||safeText(a.address).localeCompare(safeText(b.address),undefined,{numeric:true,sensitivity:'base'})
   ||safeText(a.id).localeCompare(safeText(b.id),undefined,{numeric:true});
}
function availabilityOrder(a,b){return statusOrder(a)-statusOrder(b)||blockOrder(a,b)}
function storageText(p){
 const data=[];
 if(p.storageKg!==null&&p.storageKg!==undefined&&Number.isFinite(Number(p.storageKg)))data.push(Number(p.storageKg).toLocaleString()+' SU');
 if(p.storageSlots!==null&&p.storageSlots!==undefined&&Number.isSafeInteger(Number(p.storageSlots)))data.push(Number(p.storageSlots).toLocaleString()+' objects (furniture pieces)');
 return data.join(' · ');
}
function emptyMarkup(title='New listings are on the way.',body='Our team is preparing the latest Brick & Ivy properties. Check back soon, or reach out to a Realtor in Legendary Roleplay.'){return '<div class="empty-listings"><div><div class="eyebrow">Brick & Ivy properties</div><h3>'+esc(title)+'</h3><p>'+esc(body)+'</p></div><div class="empty-icon" aria-hidden="true">⌂</div></div>'}
function cardMarkup(p){
 const id=encodeURIComponent(safeText(p.id));
 const image=safeImage(p.coverImage||p.images?.[0]);
 const price=p.price===null||p.price===undefined||p.price===''?NaN:Number(p.price);
 const cost=Number.isFinite(price)?money.format(price):'Value on request';
 const label=normalStatus(p);
 const neighborhood=safeText(p.area||p.neighborhood||interiorName(p.type)||'San Andreas');
 const block=safeText(p.blockId),storage=storageText(p);
 return '<a class="property-card" href="property.html?id='+id+'" aria-label="View '+esc(p.name||'property')+'">'+
 '<div class="property-image">'+(image?'<img src="'+esc(image)+'" alt="'+esc(p.name||'Property photograph')+'" loading="lazy">':'<div class="property-logo-placeholder" aria-label="Brick &amp; Ivy logo placeholder"><img src="assets/brick-ivy-mark.svg" alt="" loading="lazy"><span>BRICK &amp; IVY</span><small>REAL ESTATE</small></div>')+
 '<span class="status-tag '+(safeText(p.status).toLowerCase()==='unavailable'?'is-unavailable':safeText(p.status).toLowerCase()==='reserved'?'is-reserved':safeText(p.status).toLowerCase()==='available'?'is-available':'')+'">'+esc(label)+'</span></div><div class="property-body">'+
 '<div class="property-topline"><span>'+esc(neighborhood)+'</span><span>View home ↗</span></div>'+
 '<div class="property-value-label">Weekly cost / property value</div><div class="property-price">'+cost+'</div><h3 class="property-title">'+esc(p.name||'Property')+'</h3>'+
 '<p class="property-address">'+esc(p.address||'Address available on request')+'</p>'+
 (block||storage?'<p class="property-card-facts">'+(block?'<span>Block '+esc(block)+'</span>':'')+(storage?'<span>Storage: '+esc(storage)+'</span>':'')+'</p>':'')+
 '<div class="property-bottom"><span>'+esc(interiorName(p.type))+'</span><span>See details <span aria-hidden="true">→</span></span></div></div></a>'
}
function setupNav(){const toggle=$('.menu-toggle'),nav=$('.primary-nav');if(toggle&&nav){toggle.addEventListener('click',()=>{const opened=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(opened));});$$('a',nav).forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false')}))}$$('[data-year]').forEach(el=>el.textContent=new Date().getFullYear())}
async function home(){const target=$('#featuredGrid');if(!target)return;
 try{
   const props=await getProperties();
   populatePropertyTypes($('#homeType'),props);
   const featured=props.filter(p=>p.featured===true);
   const show=(featured.length?featured:props).sort(availabilityOrder).slice(0,3);
   target.innerHTML=show.length?show.map(cardMarkup).join(''):emptyMarkup('No properties listed yet.','Brick & Ivy has no company properties in the live feed right now.');
 }catch(error){
   console.warn('Property feed unavailable:',error);
   target.innerHTML=emptyMarkup('Property listings are temporarily unavailable.','We could not reach our live property feed. Please check back shortly.');
 }
}
function filterItems(items,form){
 const values=new FormData(form);
 const area=safeText(values.get('area')).toLowerCase();
 const type=safeText(values.get('type')).toLowerCase();
 const max=Number(values.get('max')||0);
 const search=safeText(values.get('search')).toLowerCase();
 const sort=safeText(values.get('sort'));
 const filtered=items.filter(p=>{
 const hay=[p.name,p.address,p.neighborhood,p.type,interiorName(p.type)].map(safeText).join(' ').toLowerCase();
 const matchArea=!area||safeText(p.area).toLowerCase()===area;
 const matchType=!type||safeText(p.type).toLowerCase()===type;
 const price=p.price===null||p.price===undefined||p.price===''?NaN:Number(p.price);
 const matchPrice=!max||(Number.isFinite(price)&&price<=max);
 return matchArea&&matchType&&matchPrice&&(!search||hay.includes(search))
 });
 filtered.sort((a,b)=>{
   const statusDiff=statusOrder(a)-statusOrder(b);
   if(statusDiff)return statusDiff;
   if(sort==='price-low')return Number(a.price||0)-Number(b.price||0)||blockOrder(a,b);
   if(sort==='price-high')return Number(b.price||0)-Number(a.price||0)||blockOrder(a,b);
   return blockOrder(a,b);
 });
 return filtered
}
async function propertiesPage(){
 const form=$('#filters'),grid=$('#resultsGrid'),count=$('#resultsCount');if(!form||!grid)return;
 let all;
 try{all=await getProperties();}
 catch(error){
   console.warn('Live properties unavailable:',error);
   count.textContent='Unavailable';
   grid.innerHTML=emptyMarkup('Property feed is temporarily unavailable.','Our live property connection could not be reached. Please try refreshing the page later.');
   return;
 }
 // Both the homepage and Properties tab use the same live OPFW property types.
 populatePropertyTypes(form.elements.namedItem('type'),all);
 const params=new URLSearchParams(location.search);
 for(const name of ['area','type','max','search','sort']){const field=form.elements.namedItem(name);if(field&&params.has(name))field.value=params.get(name)}
 function render(){
 const matches=filterItems(all,form);
 count.textContent=matches.length===1?'1 property':matches.length+' properties';
 grid.innerHTML=matches.length?matches.map(cardMarkup).join(''):emptyMarkup(all.length?'No matches found.':'Properties are coming soon.',all.length?'Try adjusting your filters to find another home.':'Brick & Ivy currently has no company properties in its live feed.');
 }
 form.addEventListener('submit',e=>{e.preventDefault();const data=new FormData(form),url=new URL(location.href);url.search='';for(const [k,v] of data){if(safeText(v))url.searchParams.set(k,String(v))}history.replaceState(null,'',url);render()});
 $('#resetFilters')?.addEventListener('click',()=>{form.reset();history.replaceState(null,'',location.pathname);render()});
 render()
}
async function detailPage(){
 const container=$('#detailContent');if(!container)return;
 const id=new URLSearchParams(location.search).get('id');
 let props;
 try{props=await getProperties();}
 catch(error){
   console.warn('Property feed unavailable:',error);
   container.innerHTML='<div class="detail-empty"><h1 class="serif">Property details are temporarily unavailable.</h1><p>The live Brick & Ivy property feed could not be reached. Please try again shortly.</p><a href="properties.html" class="button outline">Back to properties →</a></div>';
   return;
 }
 const p=props.find(x=>safeText(x.id)===id);
 if(!p){container.innerHTML='<div class="detail-empty"><div class="eyebrow" style="justify-content:center">Brick & Ivy Real Estate</div><h2>We couldn’t find this property.</h2><p>The listing may not be published yet or is no longer available.</p><a href="properties.html" class="button dark" style="margin-top:18px">Browse properties <span aria-hidden="true">→</span></a></div>';return}
 document.title=safeText(p.name)+' | Brick & Ivy Real Estate';
 const imgs=Array.isArray(p.images)?p.images.map(safeImage).filter(Boolean):[];
 const cover=safeImage(p.coverImage)||imgs[0]||'';
 const galleryImages=cover?[cover,...imgs.filter(x=>x!==cover)]:imgs;
 const galleryMarkup=galleryImages.length?
  '<div class="property-photo-gallery">'+
   '<div class="property-photo-hero"><img id="propertyGalleryMain" src="'+esc(galleryImages[0])+'" alt="'+esc((p.name||'Property')+' photo 1')+'">'+
    (galleryImages.length>1?'<button class="property-photo-nav is-prev" type="button" data-photo-nav="-1" aria-label="Previous property photo">‹</button><button class="property-photo-nav is-next" type="button" data-photo-nav="1" aria-label="Next property photo">›</button>':'')+
   '</div>'+
   (galleryImages.length>1?'<div class="property-photo-controls"><span id="propertyGalleryCount">1 of '+galleryImages.length+' photos</span></div>'+
    '<div class="property-photo-strip" aria-label="Property photo thumbnails">'+
    galleryImages.map((image,i)=>'<button type="button" class="property-photo-thumb'+(i===0?' is-active':'')+'" data-photo-index="'+i+'" aria-label="View property photo '+(i+1)+'"><img src="'+esc(image)+'" alt="" loading="lazy"></button>').join('')+
    '</div>':'')+
  '</div>':
  '<div class="property-photo-gallery is-empty"><div class="property-logo-placeholder is-detail" aria-label="Brick &amp; Ivy logo placeholder"><img src="assets/brick-ivy-mark.svg" alt=""><span>BRICK &amp; IVY</span><small>REAL ESTATE</small></div></div>';
 const price=p.price===null||p.price===undefined||p.price===''?NaN:Number(p.price),priceText=Number.isFinite(price)?money.format(price):'Value on request';
 const interior=interiorName(p.type);
 const capacity=(value,suffix)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))
   ?'Not listed':Number(value).toLocaleString()+' '+suffix;
 const featureGrid='<div class="property-detail-features" aria-label="Property interior and capacity">'+
    '<div class="property-detail-feature is-interior"><span>Interior</span><strong>'+esc(interior)+'</strong></div>'+
    '<div class="property-detail-feature"><span>Storage Capacity</span><strong>'+esc(capacity(p.storageKg,'SU'))+'</strong></div>'+
    '<div class="property-detail-feature"><span>Furniture Objects</span><strong>'+esc(capacity(p.storageSlots,'pieces'))+'</strong></div>'+
    '</div>';
 const overview=safeText(p.description)||'Contact our Realtors to learn more about this property and its features.';
 const propertyStatus=safeText(p.status).toLowerCase();
 const contactText=propertyStatus==='unavailable'?'This property is currently unavailable. Our Realtors can help you find another home.':
  propertyStatus==='reserved'?'This property is reserved. Our Realtors can provide further information.':
  'Interested in this home? Our Realtors can help with details and arrange a viewing.';
 const contactMarkup='<div class="property-realtor-cta"><div><strong>Talk to a Brick &amp; Ivy Realtor</strong><p>'+esc(contactText)+'</p></div>'+
  '<a class="button dark" href="realtors.html">Meet Our Realtors <span aria-hidden="true">→</span></a></div>';
 container.innerHTML='<article class="detail-shell"><div class="eyebrow '+(safeText(p.status).toLowerCase()==='unavailable'?'detail-status-unavailable':'')+'">'+esc(normalStatus(p))+'</div><h1 class="detail-title">'+esc(p.name||'Property')+'</h1>'+
 '<div class="detail-meta">'+esc(p.address||'San Andreas')+
 (p.area?' · '+esc(p.area):'')+(p.blockId?' · Block '+esc(p.blockId):'')+'</div>'+
 '<div class="property-value-label">Weekly Rent</div><div class="detail-price">'+priceText+'</div>'+
 featureGrid+galleryMarkup+
 '<section class="property-overview-section"><h2 class="serif">Property Overview</h2><p class="detail-copy">'+esc(overview)+'</p></section>'+
 contactMarkup+'</article>';
 if(galleryImages.length>1){
  let active=0;
  const display=index=>{
   active=(index+galleryImages.length)%galleryImages.length;
   const main=$('#propertyGalleryMain',container);
   if(main){main.src=galleryImages[active];main.alt=(p.name||'Property')+' photo '+(active+1);}
   const count=$('#propertyGalleryCount',container);
   if(count)count.textContent=(active+1)+' of '+galleryImages.length+' photos';
   $('.property-photo-thumb',container).forEach((button,i)=>{
    button.classList.toggle('is-active',i===active);
    button.setAttribute('aria-pressed',String(i===active));
   });
  };
  container.addEventListener('click',event=>{
    const btn=event.target.closest('[data-photo-index],[data-photo-nav]');
    if(!btn)return;
    if(btn.hasAttribute('data-photo-index'))display(Number(btn.dataset.photoIndex));
    else display(active+Number(btn.dataset.photoNav));
  });
 }
}

function realtorInitials(name){
 const parts=safeText(name).split(/\s+/).filter(Boolean);
 return (parts.length>1?parts[0].charAt(0)+parts[parts.length-1].charAt(0):parts[0]?.slice(0,2)||'BI').toUpperCase()
}
function realtorContactRow(label,value,copy){
 if(!value)return '';
 return '<div class="realtor-contact-row"><span class="realtor-contact-label">'+esc(label)+'</span><span class="realtor-contact-value">'+esc(value)+'</span>'+
 (copy?'<button type="button" class="realtor-copy" data-copy="'+esc(value)+'" aria-label="Copy '+esc(label)+'">Copy</button>':'')+'</div>'
}
function realtorMarkup(person){
 const name=safeText(person.name);
 const role=safeText(person.role).toLowerCase()==='owner'?'Owner':'Realtor';
 const publicTitle=safeText(person.title)||'Realtor';
 const title=role==='Realtor'&&publicTitle.toLowerCase()==='owner'?'Realtor':publicTitle;
 const photo=safeImage(person.photo||person.mugshotUrl);
 const phone=safeText(person.inGamePhone);
 const username=safeText(person.discordUsername);
 const discordId=safeText(person.discordId);
 const hasDiscord=/^\d{17,20}$/.test(discordId);
 const email=safeText(person.email);
 const hasEmail=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)&&email.length<=254;
 const description=safeText(person.bio);
 const cid=Number(person.characterId);
 const hasCid=Number.isSafeInteger(cid)&&cid>0;
 const actions=[];
 if(hasDiscord)actions.push('<a class="button dark" href="https://discord.com/users/'+discordId+'" target="_blank" rel="noopener noreferrer" aria-label="View '+esc(name)+' on Discord">View Discord <span aria-hidden="true">↗</span></a>');
 if(hasEmail)actions.push('<a class="button outline" href="mailto:'+esc(email)+'" aria-label="Email '+esc(name)+'">Send email <span aria-hidden="true">↗</span></a>');
 const details=[
   realtorContactRow('In-game',phone,true),
   realtorContactRow('Discord',username,!hasDiscord),
   hasEmail?realtorContactRow('Email',email,false):''
 ].filter(Boolean).join('');
 return '<article class="realtor-card">'+
 '<div class="realtor-photo">'+(photo?'<img src="'+esc(photo)+'" alt="Portrait of '+esc(name)+'" loading="lazy">':'<div class="realtor-avatar" aria-label="Photo not supplied">'+esc(realtorInitials(name))+'</div>')+
 '<div class="realtor-role-badge">'+esc(role)+'</div></div>'+
 '<div class="realtor-body"><h3 class="realtor-name">'+esc(name)+'</h3><div class="realtor-subtitle">'+esc(title)+'</div>'+ 
 '<div class="realtor-availability" data-character-id="'+(hasCid?cid:'')+'"><span class="availability-dot" aria-hidden="true"></span><span class="availability-text" role="status">'+(hasCid?'Checking availability…':'Status unavailable')+'</span></div>'+
 (description?'<p class="realtor-bio">'+esc(description)+'</p>':'')+
 '<div class="realtor-details">'+(details||'<span class="realtor-contact-none">Public contact details not yet available.</span>')+'</div>'+
 (actions.length?'<div class="realtor-actions">'+actions.join('')+'</div>':'')+'</div></article>'
}

/*
 * The OPFW public /connections.json route identifies licenses and FiveM sources,
 * but not character IDs. Combine it with the public /players.json route filtered
 * to the visible Realtors' exact character IDs.
 * Never put a bearer token in this public GitHub Pages application.
 */
const LEGENDARY_PUBLIC_API='https://p323.fivem.opfw.me/op-framework';
const REALTOR_STATUS_POLL_MS=60000;
function apiDataArray(payload){
 const data=payload&&typeof payload==='object'&&'data' in payload?payload.data:payload;
 if(Array.isArray(data))return data;
 if(data&&Array.isArray(data.players))return data.players;
 throw new Error('Unexpected player status API response');
}
async function fetchPublicStatus(url){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),8500);
 try{
  const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Status API HTTP '+response.status);
  return apiDataArray(await response.json());
 }finally{clearTimeout(timeout)}
}
function setRealtorStatus(element,status){
 if(!element)return;
 element.dataset.status=status;
 const label=$('.availability-text',element);
 if(label)label.textContent=status==='available'?'Available':status==='unavailable'?'Unavailable':'Status unavailable';
 element.title=status==='available'?'Character currently connected to Legendary Roleplay':status==='unavailable'?'Character not currently connected to Legendary Roleplay':'Live server status could not be verified';
}
function sameConnection(player,connection){
 const a=safeText(player.licenseIdentifier),b=safeText(connection.licenseIdentifier);
 if(a&&b)return a===b;
 return Number.isSafeInteger(Number(player.source))&&Number(player.source)>0&&Number(player.source)===Number(connection.source);
}
async function refreshRealtorStatus(){
 const elements=Array.from(document.querySelectorAll("#realtorGrid [data-character-id]"));
 const lookup=new Map();
 for(const element of elements){
  const cid=Number(element.dataset.characterId);
  if(Number.isSafeInteger(cid)&&cid>0)lookup.set(cid,element);
  else setRealtorStatus(element,'unknown');
 }
 if(!lookup.size)return;
 try{
  const url=LEGENDARY_PUBLIC_API+'/players.json?characterId='+Array.from(lookup.keys()).join(',');
  const [players,connections]=await Promise.all([
   fetchPublicStatus(url),
   fetchPublicStatus(LEGENDARY_PUBLIC_API+'/connections.json')
  ]);
  // Both successful API responses are needed before making an offline claim.
  for(const [cid,element] of lookup){
   const online=players.some(player=>{
    if(Number(player?.character?.id)!==cid)return false;
    return connections.some(conn=>conn?.joined===true&&sameConnection(player,conn));
   });
   setRealtorStatus(element,online?'available':'unavailable');
  }
 }catch(error){
  console.warn('Brick & Ivy live Realtor status unavailable:',error);
  for(const element of lookup.values())setRealtorStatus(element,'unknown');
 }
}
function beginRealtorStatusChecks(){
 refreshRealtorStatus();
 setInterval(()=>{if(!document.hidden)refreshRealtorStatus()},REALTOR_STATUS_POLL_MS);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshRealtorStatus()});
}

function publicRealtorGroups(people){
 const sorted=[...people].sort((a,b)=>Number(a.displayOrder??999)-Number(b.displayOrder??999)||safeText(a.name).localeCompare(safeText(b.name)));
 const map=new Map(),groups=[];
 for(const person of sorted){
  const owner=safeText(person.role).toLowerCase()==='owner';
  const title=safeText(person.title)||'Realtor';
  const label=owner?'Owner':title.toLowerCase()==='owner'?'Realtor':title;
  const key=(owner?'owner:':'realtor:')+label.toLowerCase();
  if(!map.has(key)){
   const group={label,owner,people:[]};
   map.set(key,group);
   groups.push(group);
  }
  map.get(key).people.push(person);
 }
 return groups.filter(g=>g.owner).concat(groups.filter(g=>!g.owner));
}
function realtorGroupMarkup(people){
 return publicRealtorGroups(people).map((group,i)=>
  '<section class="realtor-position-section" aria-labelledby="position-heading-'+i+'">'+
  '<div class="realtor-position-heading"><div><div class="eyebrow">Brick & Ivy Team</div><h3 id="position-heading-'+i+'" class="serif">'+esc(group.label)+'</h3></div>'+
  '<span class="realtor-position-count">'+group.people.length+' '+(group.people.length===1?'team member':'team members')+'</span></div>'+
  '<div class="realtor-grid">'+group.people.map(realtorMarkup).join('')+'</div></section>'
 ).join('');
}
async function realtorDirectory(){
 const grid=$('#realtorGrid'),count=$('#realtorCount');if(!grid)return;
 try{
 const c=window.BRICK_IVY_CONFIG||{};
 const useBackend=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.supabaseUrl||'');
 const directoryUrl=useBackend?c.supabaseUrl.replace(/\/$/,'')+'/functions/v1/brickivy-realtors':'data/realtors.json';
 const response=await fetch(directoryUrl,{cache:'no-store',credentials:'omit'});
 if(!response.ok)throw Error('Could not load Realtor data');
 const items=await response.json();
 if(!Array.isArray(items))throw Error('Invalid Realtor directory');
 const publicProfiles=items.filter(p=>p&&p.published===true&&safeText(p.name)).sort((a,b)=>Number(a.displayOrder??999)-Number(b.displayOrder??999)||safeText(a.name).localeCompare(safeText(b.name)));
 if(count)count.textContent=publicProfiles.length?(publicProfiles.length===1?'1 team member':publicProfiles.length+' team members'):'Our team directory';
 grid.innerHTML=publicProfiles.length?realtorGroupMarkup(publicProfiles):
 '<div class="team-empty"><span class="team-empty-mark" aria-hidden="true">⌂</span><h3>Our team profiles are coming soon.</h3><p>Brick &amp; Ivy is preparing its public Realtor directory. Check back for our team members and their official in-game contact details.</p></div>';
 if(publicProfiles.length)beginRealtorStatusChecks();
 grid.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-copy]');
 if(!button||!grid.contains(button))return;
 const original=button.textContent;
 try{
 if(!navigator.clipboard?.writeText)throw Error('Clipboard unsupported');
 await navigator.clipboard.writeText(button.dataset.copy);
 button.textContent='Copied!';
 }catch{
 button.textContent='Select text';
 }
 setTimeout(()=>{button.textContent=original},1800);
 });
 }catch(err){
 console.warn('Unable to load Realtor directory:',err);
 grid.innerHTML='<div class="team-empty"><span class="team-empty-mark" aria-hidden="true">⌂</span><h3>Our team directory is temporarily unavailable.</h3><p>Please try again later.</p></div>';
 }finally{grid.setAttribute('aria-busy','false')}
}

document.addEventListener('DOMContentLoaded',()=>{setupNav();const page=document.body.dataset.page;if(page==='home')home();if(page==='properties')propertiesPage();if(page==='detail')detailPage();if(page==='realtors')realtorDirectory()});