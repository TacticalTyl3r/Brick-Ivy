/* Brick & Ivy visitor total (public, no cookies or personal details).
 * Browser-local random UUID is reused; only its SHA-256 hash is stored by the
 * protected backend. New browsers/devices count separately.
 */
(function(){
 "use strict";
 const total=document.querySelector("[data-visitor-total]");
 if(!total)return;
 const PUBLIC_PAGES=new Set(["home","properties","detail","realtors"]);
 const endpoint="https://rcbbnzqmfvapwuqmpmhk.supabase.co/functions/v1/brickivy-visitors";
 const key="brickivy-visitor-id-v1";
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 async function load(){
  let id="";
  // Do not create a new pseudo-visitor on every refresh if local storage is
  // blocked: simply request the read-only total instead.
  if(PUBLIC_PAGES.has(document.body?.dataset.page)&&crypto?.randomUUID){
   try{
    const stored=localStorage.getItem(key)||"";
    id=UUID.test(stored)?stored:crypto.randomUUID();
    if(!UUID.test(stored))localStorage.setItem(key,id);
   }catch{id="";}
  }
  try{
   const response=await fetch(endpoint,{
    method:id?"POST":"GET",mode:"cors",credentials:"omit",cache:"no-store",
    ...(id?{headers:{"Content-Type":"application/json"},body:JSON.stringify({visitorId:id})}:{})
   });
   if(!response.ok)throw Error("Could not load visitor total");
   const data=await response.json();
   if(!Number.isSafeInteger(data.visitors)||data.visitors<0)throw Error("Invalid visitor total");
   total.textContent=new Intl.NumberFormat("en-US").format(data.visitors);
  }catch{
   total.textContent="—";
   total.closest(".footer-visitor-counter")?.setAttribute("title","Visitor total temporarily unavailable");
  }
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",load,{once:true});
 else void load();
})();