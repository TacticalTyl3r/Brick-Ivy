const DATA_URL = 'data/properties.json';
const money = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const $ = (selector,root=document)=>root.querySelector(selector);
const $$ = (selector,root=document)=>Array.from(root.querySelectorAll(selector));
function esc(input){return String(input??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeImage(url){if(typeof url!=='string'||!url.trim())return '';try{const u=new URL(url,window.location.href);return u.protocol==='https:'||u.origin===location.origin?u.href:''}catch{return ''}}
function safeText(x){return String(x??'').trim();}
function normalStatus(p){const s=safeText(p.status).toLowerCase();return s==='pending'?'Pending':s==='sold'?'Sold':'For Sale'}
function listed(p){return p&&p.published===true&&['for-sale','pending','sold'].includes(safeText(p.status).toLowerCase());}
async function getProperties(){try{const res=await fetch(DATA_URL,{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json();return Array.isArray(data)?data.filter(listed):[];}catch(error){console.warn('Property feed not available:',error);return []}}
function emptyMarkup(title='New listings are on the way.',body='Our team is preparing the latest Brick & Ivy properties. Check back soon, or reach out to a Realtor in Legendary Roleplay.'){return '<div class="empty-listings"><div><div class="eyebrow">Brick & Ivy properties</div><h3>'+esc(title)+'</h3><p>'+esc(body)+'</p></div><div class="empty-icon" aria-hidden="true">⌂</div></div>'}
function cardMarkup(p){
 const id=encodeURIComponent(safeText(p.id));
 const image=safeImage(p.coverImage||p.images?.[0]);
 const price=Number(p.price);
 const cost=Number.isFinite(price)?money.format(price):'Contact for price';
 const label=normalStatus(p);
 const neighborhood=safeText(p.neighborhood||p.type||'San Andreas');
 return '<a class="property-card" href="property.html?id='+id+'" aria-label="View '+esc(p.name||'property')+'">'+
 '<div class="property-image">'+(image?'<img src="'+esc(image)+'" alt="'+esc(p.name||'Property photograph')+'" loading="lazy">':'<div class="fallback-graphic" aria-hidden="true">Brick & Ivy</div>')+
 '<span class="status-tag">'+esc(label)+'</span></div><div class="property-body">'+
 '<div class="property-topline"><span>'+esc(neighborhood)+'</span><span>View home ↗</span></div>'+
 '<div class="property-price">'+cost+'</div><h3 class="property-title">'+esc(p.name||'Property')+'</h3>'+
 '<p class="property-address">'+esc(p.address||'Address available on request')+'</p>'+
 '<div class="property-bottom"><span>'+esc(p.type||'Property')+'</span><span>See details <span aria-hidden="true">→</span></span></div></div></a>'
}
function setupNav(){const toggle=$('.menu-toggle'),nav=$('.primary-nav');if(toggle&&nav){toggle.addEventListener('click',()=>{const opened=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(opened));});$$('a',nav).forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false')}))}$$('[data-year]').forEach(el=>el.textContent=new Date().getFullYear())}
async function home(){const target=$('#featuredGrid');if(!target)return;const props=await getProperties();const featured=props.filter(p=>p.featured===true);const show=(featured.length?featured:props).slice(0,3);target.innerHTML=show.length?show.map(cardMarkup).join(''):emptyMarkup();}
function filterItems(items,form){
 const values=new FormData(form);
 const area=safeText(values.get('area')).toLowerCase();
 const type=safeText(values.get('type')).toLowerCase();
 const max=Number(values.get('max')||0);
 const search=safeText(values.get('search')).toLowerCase();
 const sort=safeText(values.get('sort'));
 const filtered=items.filter(p=>{
 const hay=[p.name,p.address,p.neighborhood,p.type].map(safeText).join(' ').toLowerCase();
 const matchArea=!area||hay.includes(area);
 const matchType=!type||safeText(p.type).toLowerCase().includes(type);
 const price=Number(p.price);
 const matchPrice=!max||(Number.isFinite(price)&&price<=max);
 return matchArea&&matchType&&matchPrice&&(!search||hay.includes(search))
 });
 filtered.sort((a,b)=>{
 if(sort==='price-low')return Number(a.price||0)-Number(b.price||0);
 if(sort==='price-high')return Number(b.price||0)-Number(a.price||0);
 return Number(b.featured===true)-Number(a.featured===true)
 });
 return filtered
}
async function propertiesPage(){
 const form=$('#filters'),grid=$('#resultsGrid'),count=$('#resultsCount');if(!form||!grid)return;
 const all=await getProperties();
 const params=new URLSearchParams(location.search);
 for(const name of ['area','type','max','search','sort']){const field=form.elements.namedItem(name);if(field&&params.has(name))field.value=params.get(name)}
 function render(){
 const matches=filterItems(all,form);
 count.textContent=matches.length===1?'1 property':matches.length+' properties';
 grid.innerHTML=matches.length?matches.map(cardMarkup).join(''):emptyMarkup(all.length?'No matches found.':'Properties are coming soon.',all.length?'Try adjusting your filters to find another home.':'Brick & Ivy has not published any listings yet. Published properties will appear here automatically when the site is connected to our listing system.');
 }
 form.addEventListener('submit',e=>{e.preventDefault();const data=new FormData(form),url=new URL(location.href);url.search='';for(const [k,v] of data){if(safeText(v))url.searchParams.set(k,String(v))}history.replaceState(null,'',url);render()});
 $('#resetFilters')?.addEventListener('click',()=>{form.reset();history.replaceState(null,'',location.pathname);render()});
 render()
}
async function detailPage(){
 const container=$('#detailContent');if(!container)return;
 const id=new URLSearchParams(location.search).get('id');
 const props=await getProperties();
 const p=props.find(x=>safeText(x.id)===id);
 if(!p){container.innerHTML='<div class="detail-empty"><div class="eyebrow" style="justify-content:center">Brick & Ivy Real Estate</div><h2>We couldn’t find this property.</h2><p>The listing may not be published yet or is no longer available.</p><a href="properties.html" class="button dark" style="margin-top:18px">Browse properties <span aria-hidden="true">→</span></a></div>';return}
 document.title=safeText(p.name)+' | Brick & Ivy Real Estate';
 const imgs=Array.isArray(p.images)?p.images.map(safeImage).filter(Boolean):[];
 const cover=safeImage(p.coverImage)||imgs[0]||'';
 const others=imgs.filter(x=>x!==cover).slice(0,2);
 const photo=(src,alt)=>src?'<img src="'+esc(src)+'" alt="'+esc(alt)+'">':'<div class="fallback-graphic" style="height:100%" aria-hidden="true">Brick & Ivy</div>';
 const price=Number(p.price),priceText=Number.isFinite(price)?money.format(price):'Contact for price';
 container.innerHTML='<article class="detail-shell"><div class="eyebrow">'+esc(normalStatus(p))+'</div><h1 class="detail-title">'+esc(p.name||'Property')+'</h1>'+
 '<div class="detail-meta">'+esc(p.address||'San Andreas')+'</div><div class="detail-price">'+priceText+'</div>'+
 '<div class="detail-gallery"><div>'+photo(cover,p.name||'Property cover photograph')+'</div><div class="detail-thumbs"><div>'+photo(others[0],(p.name||'Property')+' photograph 2')+'</div><div>'+photo(others[1],(p.name||'Property')+' photograph 3')+'</div></div></div>'+
 '<h2 class="serif" style="font-size:29px">Property overview</h2><p class="detail-copy">'+esc(p.description||'Contact Brick & Ivy for additional information about this property.')+'</p>'+
 '<div class="property-bottom" style="margin-top:38px"><span>'+esc(p.type||'Residential property')+'</span><span>'+esc(p.neighborhood||'San Andreas')+'</span></div>'+
 '<div style="margin-top:36px;padding:24px;background:#eef1e9"><strong>Interested in this property?</strong><p style="margin:8px 0 0;color:#677569;font-size:13px">Connect with a Brick & Ivy Realtor in Legendary Roleplay for details or to arrange a viewing.</p></div></article>'
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
 const title=safeText(person.title)||'Realtor';
 const role=safeText(person.role).toLowerCase()==='owner'?'Owner':'Realtor';
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
  const label=owner?'Owner':safeText(person.title)||'Realtor';
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