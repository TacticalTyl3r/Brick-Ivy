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
document.addEventListener('DOMContentLoaded',()=>{setupNav();const page=document.body.dataset.page;if(page==='home')home();if(page==='properties')propertiesPage();if(page==='detail')detailPage()});