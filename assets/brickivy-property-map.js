/* Brick & Ivy Owner-only property map.
 * Access is enforced by the Edge Function, NOT by hiding HTML in the browser.
 * Pin coordinates are private staging data until a separate publication feature.
 */
const cfg=window.BRICK_IVY_CONFIG||{};
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=(v)=>Number.isFinite(v)?new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(v):"—";
let client=null,items=[],map=null,markers=null,previewMarker=null,selectedId=null,draft=null,working=false;
let tileLayer=null,mapStyle="atlas",requestedFocusHandled=false;
const STYLE_TILES=Object.freeze({
 atlas:{url:"https://cdn.fivedock.dev/o/fivedock/maps/styleatlas/{z}/{x}/{y}.jpg",attribution:"Map © Rockstar Games · Tiles © FiveDock",className:"map-layer-atlas"},
 satellite:{url:"https://viruxe.github.io/gtav-map-tiles/satelite/{z}/{x}-{y}.webp",attribution:"Map © Rockstar Games · Satellite tiles © VIRUXE",className:"map-layer-satellite"},
 road:{url:"https://viruxe.github.io/gtav-map-tiles/atlas/{z}/{x}-{y}.webp",attribution:"Map © Rockstar Games · Atlas tiles © VIRUXE (road emphasis)",className:"map-layer-road"}
});
const STATUS_COLORS=Object.freeze({available:"#25a265",reserved:"#f4b544",unavailable:"#d8545b",unknown:"#8298ab"});
const STATUS_LABELS=Object.freeze({available:"Available",reserved:"Reserved",unavailable:"Unavailable",unknown:"Status unknown"});
const verifiedStatus=p=>Object.hasOwn(STATUS_LABELS,p?.status)?p.status:"unknown";
const toLatLng=(x,y)=>window.L.latLng(y,x);
const isCoordinate=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=-8000&&x<=8000&&y>=-8000&&y<=9000;
const hasPin=p=>p&&isCoordinate(p.x,p.y);
const current=()=>items.find(p=>p.id===selectedId)||null;
function info(message,state="info"){
 const el=$("mapEditorFeedback");el.textContent=message;el.dataset.state=state;
}
function status(message){$("mapStatus").textContent=message}
function setBusy(value){
 working=value;
 for(const id of ["mapRefresh","mapSave","mapRemove","mapLocate"]){
  const btn=$(id);if(btn)btn.disabled=value||(["mapSave","mapRemove","mapLocate"].includes(id)&&!current());
 }
 $("mapSearch").disabled=value;$("mapFilter").disabled=value;$("mapArea").disabled=value;
}
async function api(action,data={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error("Your session has expired. Sign in with Discord again.");
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),24000);
 try{
  const res=await fetch(cfg.supabaseUrl.replace(/\/$/,"")+"/functions/v1/brickivy-property-map",{
   method:"POST",credentials:"omit",cache:"no-store",
   headers:{"Content-Type":"application/json",apikey:cfg.publishableKey,Authorization:"Bearer "+session.access_token},
   body:JSON.stringify({action,...data}),signal:controller.signal
  });
  const output=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(output.error||"Private map request failed.");
  return output;
 }finally{clearTimeout(timeout)}
}
function filtered(){
 const term=$("mapSearch").value.trim().toLowerCase(),area=$("mapArea").value,filter=$("mapFilter").value;
 return items.filter(p=>(!area||p.area===area)&&(!term||[p.name,p.address,p.blockId,p.id].join(" ").toLowerCase().includes(term))
 &&(filter==="all"||filter==="placed"&&hasPin(p)||filter==="unplaced"&&!hasPin(p)||filter==="published"&&p.published===true||Object.hasOwn(STATUS_LABELS,filter)&&verifiedStatus(p)===filter))
 .sort((a,b)=>Number(hasPin(b))-Number(hasPin(a))||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
function counts(){
 $("mapTotal").textContent=money(items.length);
 const placed=items.filter(hasPin).length;
 $("mapPlaced").textContent=money(placed);
 $("mapUnplaced").textContent=money(items.length-placed);
}
function propertyLabel(p){return p.address||"Block "+(p.blockId||"—")+" · Property #"+p.id}
function renderList(){
 const container=$("mapPropertyList"),data=filtered();
 container.innerHTML=data.length?data.map(p=>'<button type="button" class="map-property-choice'+(hasPin(p)?" is-placed":"")+'" data-map-property="'+esc(p.id)+'" aria-pressed="'+String(selectedId===p.id)+'">'+
  '<span class="map-choice-dot" aria-hidden="true">'+(hasPin(p)?"✓":"＋")+'</span><span class="map-choice-body"><strong>'+esc(p.name)+'</strong>'+
  '<small>'+esc(propertyLabel(p))+'</small><em class="map-status-text status-'+verifiedStatus(p)+'">'+STATUS_LABELS[verifiedStatus(p)]+'</em><em> · '+(hasPin(p)?"Pin placed":"Needs location")+' · '+(p.published?"Published":"Hidden")+'</em></span></button>').join(""):
  '<div class="map-list-empty">No properties match these filters.</div>';
}
function renderMarkers(){
 if(!markers||!map)return;
 markers.clearLayers();
 for(const p of items){
  if(!hasPin(p))continue;
  const chosen=p.id===selectedId;
  const circle=window.L.circleMarker(toLatLng(p.x,p.y),{
   radius:chosen?9:6,color:"#fff",weight:chosen?3:2,
   fillColor:STATUS_COLORS[verifiedStatus(p)],fillOpacity:1
  }).bindTooltip(esc(p.name)+" · "+STATUS_LABELS[verifiedStatus(p)]+(p.published?"":" · Unpublished")+" · #"+esc(p.id),{direction:"top"});
  circle.on("click",event=>{window.L.DomEvent.stopPropagation(event);choose(p.id);});
  circle.addTo(markers);
 }
 if(previewMarker){map.removeLayer(previewMarker);previewMarker=null}
 if(current()&&draft&&isCoordinate(draft.x,draft.y)){
  previewMarker=window.L.circleMarker(toLatLng(draft.x,draft.y),{
   radius:10,color:"#fff",weight:3,dashArray:"4 3",
   fillColor:"#e1a453",fillOpacity:.95
  }).bindTooltip("Unsaved location · "+esc(current().name),{direction:"top"}).addTo(map);
 }
}
function renderEditor(){
 const p=current(),has=hasPin(p);
 $("mapEditorHeading").textContent=p?p.name:"Select a property to begin.";
 $("mapEditorMeta").textContent=p?
  (propertyLabel(p)+" · "+STATUS_LABELS[verifiedStatus(p)]+" · "+(p.published?"Published":"Not published")+(p.area?" · "+p.area:"")):
  "Properties without coordinates will remain off the map.";
 $("mapEditorState").textContent=!p?"No selection":draft?"Unsaved change":has?"Location saved":"No location";
 $("mapEditorState").className="map-state-tag"+(draft?" is-dirty":has?" is-placed":"");
 for(const id of ["mapX","mapY"])$(id).disabled=!p||working;
 $("mapX").value=p?(draft?.x??p.x??""):"";
 $("mapY").value=p?(draft?.y??p.y??""):"";
 $("mapLocate").disabled=!p||working;
 $("mapSave").disabled=!p||working;
 $("mapRemove").disabled=!p||working||!has;
 $("mapInteractionHint").textContent=p?
  "Selected: "+p.name+" · Click anywhere on the map to preview a new location":
  "Select a property in the left panel to place a map pin.";
}
function render(){counts();renderList();renderEditor();renderMarkers()}
function choose(id){
 const p=items.find(p=>p.id===id);if(!p)return;
 if(draft&&selectedId!==id&&!window.confirm("You have an unsaved map location. Discard it and select another property?"))return;
 selectedId=id;draft=null;render();
 if(hasPin(p))map?.flyTo(toLatLng(p.x,p.y),Math.max(map.getZoom(),5),{duration:.55});
 info(hasPin(p)?"Saved pin loaded. Click the map or enter coordinates to adjust it.":"Click the map to place "+p.name+", or enter its game X/Y coordinates.");
}
function preview(x,y,panto=true){
 if(!current()){info("Choose a property first.","error");return}
 if(!isCoordinate(x,y)){info("Use valid X (−8000 to 8000) and Y (−8000 to 9000) coordinates.","error");return}
 draft={x:Math.round(x*100)/100,y:Math.round(y*100)/100};
 renderEditor();renderMarkers();
 if(panto)map.panTo(toLatLng(draft.x,draft.y),{animate:true});
 info("Location preview ready. Click Save location to keep this pin.");
}
function coordsFromForm(){
 const xText=$("mapX").value.trim(),yText=$("mapY").value.trim();
 if(!xText||!yText)throw Error("Enter both X and Y coordinates, or click the map.");
 const x=Number(xText),y=Number(yText);
 if(!isCoordinate(x,y))throw Error("Coordinates must be inside the San Andreas map bounds.");
 return {x,y};
}
function switchMapStyle(name){
 if(!map||!Object.hasOwn(STYLE_TILES,name))return;
 const style=STYLE_TILES[name],bounds=map._brickivyWorldBounds;
 const next=window.L.tileLayer(style.url,{
  tileSize:256,minZoom:0,maxZoom:6,maxNativeZoom:5,noWrap:true,bounds,
  className:style.className,attribution:style.attribution,keepBuffer:2
 });
 // Retain current base tiles until the first tile of the new layer is ready.
 let swapped=false;
 function activate(){
  if(swapped||!map||!map.hasLayer(next))return;
  swapped=true;
  if(tileLayer&&map.hasLayer(tileLayer))map.removeLayer(tileLayer);
  tileLayer=next;
  $("mapTileAttribution").textContent=style.attribution;
 }
 next.once("tileload",activate);
 next.once("load",activate);
 next.addTo(map);
 if(!tileLayer)activate();
 // Map tile sources are remote. Report failures without clearing saved pins.
 next.on("tileerror",()=>{
  if(!swapped)$("mapTileAttribution").textContent="Map imagery is unavailable; try another style.";
 });
 mapStyle=name;
 try{localStorage.setItem("brickivy-private-map-style",name)}catch{}
}
function showAllPins(){
 if(!map)return;
 const positions=items.filter(hasPin).map(p=>toLatLng(p.x,p.y));
 if(!positions.length){
  info("No properties have map coordinates yet. Select a home to place its first pin.");
  map.setView(toLatLng(0,1550),3);return;
 }
 map.fitBounds(window.L.latLngBounds(positions).pad(.2),{maxZoom:5,padding:[35,35]});
 info("Showing "+positions.length+" saved property locations across San Andreas.");
}
function initMap(){
 if(map)return;
 if(!window.L)throw Error("Map library did not load. Check your connection and refresh.");
 const L=window.L;
 const CRS=L.extend({},L.CRS.Simple,{
  projection:L.Projection.LonLat,
  scale:zoom=>Math.pow(2,zoom),zoom:scale=>Math.log(scale)/Math.LN2,
  transformation:new L.Transformation(.02072,117.3,-.0205,172.8),infinite:true
 });
 map=L.map("propertyMap",{crs:CRS,minZoom:2,maxZoom:6,zoomControl:true,preferCanvas:true,attributionControl:true});
 const z=5,size=8192;
 const bounds=L.latLngBounds(map.unproject([0,size],z),map.unproject([size,0],z));
 // All three styles keep the same GTA world coordinates and saved pins.
 // The Road view emphasizes high-contrast roads in the Atlas tiles.
 map._brickivyWorldBounds=bounds;
 switchMapStyle(mapStyle);
 map.setMaxBounds(bounds.pad(.1));
 markers=L.layerGroup().addTo(map);
 map.setView(toLatLng(0,1550),3);
 map.on("click",event=>{
  if(!current()){info("Select a property in the list before placing a pin.","error");return}
  preview(event.latlng.lng,event.latlng.lat,false);
 });
 window.requestAnimationFrame(()=>map.invalidateSize());
}
async function reload(){
 if(working)return;setBusy(true);status("Loading Brick & Ivy properties…");
 try{
  const result=await api("list");
  if(result.role!=="owner"||result.privatePreview!==true||!Array.isArray(result.properties))
   throw Error("Private Owner verification failed.");
  items=result.properties.filter(p=>p&&typeof p.id==="string");
  $("mapPrivateContent").hidden=false;
  initMap();
  if(!items.some(p=>p.id===selectedId)){selectedId=null;draft=null}
  render();status("Owner access verified. This property map is private and not published.");
  if(!requestedFocusHandled){
   requestedFocusHandled=true;
   const target=new URLSearchParams(location.search).get("property");
   if(target&&items.some(p=>p.id===target)){choose(target);$("mapPropertyList").querySelector('[data-map-property="'+CSS.escape(target)+'"]')?.scrollIntoView({block:"nearest"});}
   else if(new URLSearchParams(location.search).get("view")==="all")showAllPins();
  }
  info("Choose a property and click the map to place its location.");
 }catch(error){
  $("mapPrivateContent").hidden=true;
  status(error.message||"Unable to load the private map.");
 }finally{setBusy(false);if(!$("mapPrivateContent").hidden)renderEditor()}
}
async function save(){
 const p=current();if(!p||working)return;
 try{
  const coord=coordsFromForm();
  setBusy(true);info("Saving private property location…");
  const result=await api("save",{propertyId:p.id,x:coord.x,y:coord.y});
  if(!result.success)throw Error("Location was not saved.");
  p.x=result.x;p.y=result.y;p.updatedAt=result.updatedAt;
  draft=null;render();
  info("Saved privately. This pin is not shown on the public website.","success");
 }catch(error){info(error.message||"Unable to save location.","error")}
 finally{setBusy(false);renderEditor()}
}
async function remove(){
 const p=current();if(!p||working||!hasPin(p))return;
 if(!window.confirm("Remove the saved map pin for "+p.name+"? The property listing will not be affected."))return;
 try{
  setBusy(true);info("Removing private map pin…");
  const result=await api("remove",{propertyId:p.id});
  if(!result.success)throw Error("The pin could not be removed.");
  p.x=null;p.y=null;p.updatedAt=null;draft=null;render();
  info("Pin removed. No public listing was changed.","success");
 }catch(error){info(error.message||"Could not remove pin.","error")}
 finally{setBusy(false);renderEditor()}
}
async function authChanged(){
 const {data:{session}}=await client.auth.getSession();
 $("mapLogin").hidden=Boolean(session);
 $("mapSession").hidden=!session;
 if(!session){
  $("mapPrivateContent").hidden=true;
  selectedId=null;draft=null;items=[];
  if(map){map.remove();map=null;markers=null;previewMarker=null}
  status("Sign in with a Brick & Ivy Owner Discord account to view the private map.");
  return;
 }
 await reload();
}
async function start(){
 try{
  if(!cfg.discordAuthReady||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||"")||
   !/^(sb_publishable_|eyJ)/.test(cfg.publishableKey||""))throw Error("Discord login is not configured.");
  const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm");
  client=createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  $("mapSignIn").addEventListener("click",async()=>{
   const {error}=await client.auth.signInWithOAuth({provider:"discord",options:{redirectTo:location.origin+location.pathname}});
   if(error)status(error.message);
  });
  $("mapSignOut").addEventListener("click",async()=>{await client.auth.signOut();await authChanged()});
  try{
   const stored=localStorage.getItem("brickivy-private-map-style");
   if(Object.hasOwn(STYLE_TILES,stored))mapStyle=stored;
  }catch{}
  $("mapStyle").value=mapStyle;
  $("mapStyle").addEventListener("change",event=>switchMapStyle(event.target.value));
  $("mapShowAll").addEventListener("click",showAllPins);
  $("mapRefresh").addEventListener("click",reload);
  $("mapSearch").addEventListener("input",renderList);
  $("mapArea").addEventListener("change",renderList);
  $("mapFilter").addEventListener("change",renderList);
  $("mapPropertyList").addEventListener("click",event=>{
   const button=event.target.closest("[data-map-property]");
   if(button)choose(button.dataset.mapProperty);
  });
  $("mapLocate").addEventListener("click",()=>{
   try{const coord=coordsFromForm();preview(coord.x,coord.y)}catch(e){info(e.message,"error")}
  });
  $("mapSave").addEventListener("click",save);
  $("mapRemove").addEventListener("click",remove);
  $("mapX").addEventListener("input",()=>{if(current())info("Coordinates edited. Preview pin or Save location to apply.")});
  $("mapY").addEventListener("input",()=>{if(current())info("Coordinates edited. Preview pin or Save location to apply.")});
  await authChanged();
 }catch(error){status(error.message||"Could not start private map");$("mapLogin").hidden=true}
}
start();