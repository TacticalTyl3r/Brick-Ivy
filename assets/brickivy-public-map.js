/* Brick & Ivy public read-only property map.
 * Only already-published homes with saved pins arrive from brickivy-public-map.
 * Owners edit pins separately at manage-map.html (Discord role-gated).
 */
(function(){
 "use strict";
 const cfg=window.BRICK_IVY_CONFIG||{};
 const BASE="https://rcbbnzqmfvapwuqmpmhk.supabase.co/functions/v1/brickivy-public-map";
 const TILES={
  atlas:{url:"https://cdn.fivedock.dev/o/fivedock/maps/styleatlas/{z}/{x}/{y}.jpg",name:"Atlas",attr:"Map © Rockstar Games · Atlas © FiveDock"},
  satellite:{url:"https://viruxe.github.io/gtav-map-tiles/satelite/{z}/{x}-{y}.webp",name:"Satellite",attr:"Map © Rockstar Games · Satellite © VIRUXE"},
  road:{url:"https://www.bragitoff.com/wp-content/uploads/2015/11/GTAV-HD-MAP-roadmap.jpg",name:"Road",attr:"Map © Rockstar Games · Road image via Bragitoff",image:true}
 };
 const COLORS={available:"#25a265",reserved:"#f4b544",unavailable:"#d8545b",unknown:"#8298ab"};
 const LABELS={available:"Available",reserved:"Reserved",unavailable:"Unavailable",unknown:"Status unavailable"};
 const KEY="brickivy-public-map-style-v1";
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 const status=p=>Object.hasOwn(COLORS,p.status)?p.status:"unknown";
 const isPin=p=>typeof p.x==="number"&&typeof p.y==="number"&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-8000&&p.x<=8000&&p.y>=-8000&&p.y<=9000;
 const urlFor=p=>"map.html?property="+encodeURIComponent(p.id);
 const detailFor=p=>"property.html?id="+encodeURIComponent(p.id);
 let currentStyle="atlas",publicProperties=[],loaded=false;
 try{const v=localStorage.getItem(KEY);if(Object.hasOwn(TILES,v))currentStyle=v}catch{}
 function storeStyle(value){currentStyle=value;try{localStorage.setItem(KEY,value)}catch{}}
 function leafletMap(target,options={}){
  const L=window.L;
  if(!L)return null;
  const CRS=L.extend({},L.CRS.Simple,{
   projection:L.Projection.LonLat,
   scale:z=>Math.pow(2,z),zoom:s=>Math.log(s)/Math.LN2,
   transformation:new L.Transformation(.02072,117.3,-.0205,172.8),infinite:true
  });
  const map=L.map(target,{crs:CRS,minZoom:2,maxZoom:6,zoomControl:true,
   scrollWheelZoom:options.mini!==true,preferCanvas:true});
  const bounds=L.latLngBounds(map.unproject([0,8192],5),map.unproject([8192,0],5));
  map.setMaxBounds(bounds.pad(.08));
  let layer=null,styleCounter=0;
  function setStyle(kind){
   if(!Object.hasOwn(TILES,kind))return;
   const model=TILES[kind],request=++styleCounter;
   const fresh=model.image?L.imageOverlay(model.url,bounds,{pane:"tilePane",attribution:model.attr}):
    L.tileLayer(model.url,{tileSize:256,minZoom:0,maxZoom:6,maxNativeZoom:5,
     noWrap:true,bounds,attribution:model.attr,keepBuffer:2});
   let activated=false;
   const activate=()=>{
    if(request!==styleCounter||activated)return;
    activated=true;
    if(layer&&map.hasLayer(layer))map.removeLayer(layer);
    layer=fresh;
   };
   fresh.once("load",activate);
   if(!model.image)fresh.once("tileload",activate);
   fresh.addTo(map);
   if(!layer)activate();
   fresh.on(model.image?"error":"tileerror",()=>{
    if(request===styleCounter&&!activated)map.fire("brickivy:tileerror");
   });
   storeStyle(kind);
  }
  setStyle(currentStyle);
  return {map,L,setStyle,point:p=>L.latLng(p.y,p.x)};
 }
 function focusIcon(p){
  const s=status(p);
  return window.L.divIcon({className:"bi-public-focus-icon",
   html:'<span class="bi-focus-ripple"></span><span class="bi-focus-pin" style="--pin:'+COLORS[s]+'"><span>⌂</span></span><span class="bi-focus-crosshair"></span>',
   iconSize:[64,64],iconAnchor:[32,32],tooltipAnchor:[28,-16]});
 }
 function populateButtons(){
  // Both the featured home cards and filtered Properties results rerender.
  document.querySelectorAll("[data-public-map-link][hidden]").forEach(anchor=>{
   const id=new URL(anchor.href,location.href).searchParams.get("property");
   if(publicProperties.some(p=>p.id===id))anchor.hidden=false;
  });
 }
 function beginCardButtons(){
  populateButtons();
  for(const id of ["featuredGrid","resultsGrid"]){
   const root=$(id);if(!root)continue;
   new MutationObserver(populateButtons).observe(root,{childList:true});
  }
 }
 function homeMap(){
  const target=$("publicPropertyMap");
  if(!target)return;
  const label=$("publicMapMessage"),details=$("publicMapSelected"),
   search=$("publicMapSearch"),filter=$("publicMapFilter"),style=$("publicMapStyle");
  if(!publicProperties.length){label.textContent="Property locations are being added. Check back soon.";return}
  const kit=leafletMap(target);if(!kit){label.textContent="Map failed to load. Please refresh.";return}
  const {map,L,point}=kit;
  let chosen=null;
  const pins=L.layerGroup().addTo(map);
  const allowed=()=>publicProperties.filter(p=>{
   const term=(search?.value||"").trim().toLowerCase(),v=filter?.value||"all";
   return (!term||[p.name,p.address,p.area,p.blockId].join(" ").toLowerCase().includes(term))&&(v==="all"||status(p)===v);
  });
  function render(){
   pins.clearLayers();
   const visible=allowed(),byId=new Map(visible.map(p=>[p.id,p]));
   if(chosen&&!byId.has(chosen))chosen=null;
   for(const p of visible){
    if(p.id===chosen)continue;
    const marker=L.circleMarker(point(p),{
     radius:7,weight:2,color:"#fff",fillColor:COLORS[status(p)],fillOpacity:.82,opacity:.85
    }).bindTooltip(esc(p.name)+" · "+LABELS[status(p)],{direction:"top"});
    marker.on("click",()=>select(p.id));marker.addTo(pins);
   }
   const picked=chosen?byId.get(chosen):null;
   if(picked){
    L.marker(point(picked),{icon:focusIcon(picked),zIndexOffset:10000})
     .bindTooltip("★ "+esc(picked.name),{permanent:true,direction:"right",offset:[12,-20],
       className:"bi-public-selected-tooltip"}).addTo(pins);
    details.hidden=false;
    details.innerHTML='<div class="bi-map-picked"><span class="bi-map-picked-kicker">SELECTED PROPERTY</span><strong>'+esc(picked.name)+'</strong>'+
     '<p>'+esc(picked.address||picked.area||"San Andreas")+'</p>'+
     '<span class="bi-public-status status-'+status(picked)+'">'+LABELS[status(picked)]+'</span>'+
     '<div><a href="'+detailFor(picked)+'">View Property Details →</a></div></div>';
   }else{details.hidden=true;details.innerHTML=""}
   label.textContent=visible.length+" mapped "+(visible.length===1?"property":"properties")+
    (picked?" · Selected: "+picked.name:" · Select a pin to explore");
  }
  function select(id,move=true){
   const p=publicProperties.find(p=>p.id===id);
   if(!p)return;
   chosen=id;render();
   if(move)map.flyTo(point(p),5,{duration:.6});
   const query=new URL(location.href);query.searchParams.set("property",p.id);
   history.replaceState(null,"",query);
  }
  function showAll(){
   chosen=null;
   if(search)search.value="";
   if(filter)filter.value="all";
   const query=new URL(location.href);query.searchParams.delete("property");
   history.replaceState(null,"",query);
   render();
   const area=L.latLngBounds(publicProperties.map(point));
   map.fitBounds(area.pad(.14),{padding:[35,35],maxZoom:5});
  }
  style.value=currentStyle;
  style.addEventListener("change",e=>kit.setStyle(e.target.value));
  search?.addEventListener("input",render);
  filter?.addEventListener("change",render);
  $("publicMapShowAll")?.addEventListener("click",showAll);
  const wanted=new URLSearchParams(location.search).get("property");
  const focused=wanted&&publicProperties.find(p=>p.id===wanted);
  if(focused)select(focused.id);else showAll();
  map.on("brickivy:tileerror",()=>{label.textContent="Map images could not load. Try another map style."});
  requestAnimationFrame(()=>map.invalidateSize());
 }
 function detailMini(){
  const section=$("privatePropertyMapPreview");
  if(!section||section.dataset.mapInitialized)return;
  const wanted=new URLSearchParams(location.search).get("id");
  const selected=publicProperties.find(p=>p.id===wanted);
  if(!selected)return;
  section.dataset.mapInitialized="yes";
  section.hidden=false;
  const message=$("propertyPrivateMapMessage"),canvas=$("propertyPrivateMapCanvas");
  const button=$("propertyPrivateMapLink");
  if(button){button.href=urlFor(selected);button.textContent="View on Full Map ↗"}
  const style=$("propertyMiniMapStyle");
  if(!window.L){message.textContent="Map preview unavailable. Use View on Full Map.";canvas.hidden=true;return}
  const kit=leafletMap(canvas,{mini:true});if(!kit){canvas.hidden=true;return}
  const {map,L,point}=kit;
  const chosen=L.marker(point(selected),{icon:focusIcon(selected),zIndexOffset:10000})
   .bindTooltip("★ "+esc(selected.name),{permanent:true,direction:"right",offset:[12,-20],className:"bi-public-selected-tooltip"}).addTo(map);
  // Nearby homes are visible, but deliberately smaller and less prominent.
  for(const p of publicProperties){
   if(p.id===selected.id)continue;
   const distance=Math.hypot(p.x-selected.x,p.y-selected.y);
   if(distance>1300)continue;
   const other=L.circleMarker(point(p),{radius:4,color:"#fff",weight:1.5,
    fillColor:COLORS[status(p)],fillOpacity:.65});
   other.bindTooltip(esc(p.name),{direction:"top"});
   other.on("click",()=>{location.href=urlFor(p)});
   other.addTo(map);
  }
  style.value=currentStyle;
  style.addEventListener("change",e=>kit.setStyle(e.target.value));
  map.setView(point(selected),5);
  message.textContent="Highlighted: "+selected.name+" · "+LABELS[status(selected)]+
   ". Smaller pins show nearby homes.";
  requestAnimationFrame(()=>map.invalidateSize());
 }
 function waitDetail(){
  detailMini();
  const root=$("detailContent");if(!root)return;
  new MutationObserver(detailMini).observe(root,{childList:true});
 }
 async function start(){
  if(!["home","properties","detail","map"].includes(document.body.dataset.page))return;
  const page=document.body.dataset.page;
  try{
   const response=await fetch(BASE,{method:"GET",cache:"no-store",credentials:"omit",headers:{Accept:"application/json"}});
   if(!response.ok)throw Error("Public map service unavailable");
   const data=await response.json();
   if(!Array.isArray(data?.properties))throw Error("Invalid map data");
   publicProperties=data.properties.filter(p=>p&&typeof p.id==="string"&&isPin(p));
   loaded=true;
   if(page==="map")homeMap();
   if(page==="detail")waitDetail();
   if(page==="properties"||page==="home")beginCardButtons();
  }catch(e){
   const msg=$("publicMapMessage");
   if(msg)msg.textContent="Property map is temporarily unavailable. Please try again later.";
   console.warn("Brick & Ivy public map unavailable:",e);
  }
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
 else void start();
})();