/* Brick & Ivy: Owner-only map affordances on otherwise public listing pages.
 * Never requests map data without an existing signed-in session. The protected
 * endpoint performs live Discord Owner verification before returning pins.
 * No map locations are added to the public properties feed or HTML source.
 */
(async function(){
 "use strict";
 const cfg=window.BRICK_IVY_CONFIG||{};
 if(!cfg.discordAuthReady||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||"")||
    !/^(sb_publishable_|eyJ)/.test(cfg.publishableKey||""))return;
 const host=document.body?.dataset.page;
 if(!["properties","detail"].includes(host))return;
 try{
  const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm");
  const client=createClient(cfg.supabaseUrl,cfg.publishableKey,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)return;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),24000);
  let data;
  try{
   const response=await fetch(cfg.supabaseUrl.replace(/\/$/,"")+"/functions/v1/brickivy-property-map",{
    method:"POST",credentials:"omit",cache:"no-store",
    headers:{"Content-Type":"application/json","apikey":cfg.publishableKey,"Authorization":"Bearer "+session.access_token},
    body:JSON.stringify({action:"list"}),signal:controller.signal
   });
   if(!response.ok)return; // Realtors/visitors aren't allowed to see preview links.
   data=await response.json();
  }finally{clearTimeout(timeout)}
  if(data?.role!=="owner"||data.privatePreview!==true||!Array.isArray(data.properties))return;
  const properties=new Map(data.properties.filter(p=>p&&typeof p.id==="string").map(p=>[p.id,p]));
  function revealCardButtons(){
   document.querySelectorAll("[data-owner-map-link][hidden]").forEach(a=>{
    const id=new URL(a.href,location.href).searchParams.get("property");
    if(properties.has(id))a.hidden=false;
   });
  }
  function setupDetail(){
   const node=document.getElementById("privatePropertyMapPreview");
   if(!node||node.dataset.mapInitialized)return;
   const id=new URLSearchParams(location.search).get("id");
   const p=properties.get(id);
   if(!p)return;
   node.dataset.mapInitialized="true";node.hidden=false;
   const message=document.getElementById("propertyPrivateMapMessage");
   const canvas=document.getElementById("propertyPrivateMapCanvas");
   const coords=Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-8000&&p.x<=8000&&p.y>=-8000&&p.y<=9000;
   if(!coords){
    message.textContent="This property has not been placed on the private map yet. You can add its exact location from the map editor.";
    canvas.hidden=true;return;
   }
   message.textContent="Previewing this property's saved location. Select View on Map to see the full San Andreas map.";
   if(!window.L){
    message.textContent="Map preview is unavailable. Use View on Map to open the full editor.";
    canvas.hidden=true;return;
   }
   const L=window.L;
   const crs=L.extend({},L.CRS.Simple,{
    projection:L.Projection.LonLat,scale:zoom=>Math.pow(2,zoom),
    zoom:scale=>Math.log(scale)/Math.LN2,
    transformation:new L.Transformation(.02072,117.3,-.0205,172.8),infinite:true
   });
   const mini=L.map(canvas,{crs,minZoom:2,maxZoom:6,zoomControl:true,
    scrollWheelZoom:false,dragging:true,preferCanvas:true,attributionControl:true});
   const bounds=L.latLngBounds(mini.unproject([0,8192],5),mini.unproject([8192,0],5));
   L.imageOverlay("https://www.bragitoff.com/wp-content/uploads/2015/11/GTAV-HD-MAP-roadmap.jpg",bounds,{
    pane:"tilePane",attribution:"Map © Rockstar Games · Road image via Bragitoff"
   }).addTo(mini);
   mini.setMaxBounds(bounds.pad(.1));
   const status=["available","reserved","unavailable"].includes(p.status)?p.status:"unknown";
   const colors={available:"#25a265",reserved:"#f4b544",unavailable:"#d8545b",unknown:"#8298ab"};
   const point=L.latLng(p.y,p.x);
   L.circleMarker(point,{radius:10,color:"#fff",weight:3,fillColor:colors[status],fillOpacity:1})
    .bindTooltip(String(p.name||"Property"),{permanent:false,direction:"top"}).addTo(mini);
   mini.setView(point,5);
   requestAnimationFrame(()=>mini.invalidateSize());
  }
  revealCardButtons();
  setupDetail();
  const root=document.getElementById(host==="detail"?"detailContent":"resultsGrid");
  if(root){
   new MutationObserver(()=>{revealCardButtons();setupDetail()})
    .observe(root,{childList:true,subtree:true});
  }
 }catch(error){
  console.warn("Private property map preview is unavailable:",error);
 }
})();