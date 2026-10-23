import {createClient} from "npm:@supabase/supabase-js@2.84.0";

/**
 * Public aggregate visitor counter.
 * Does not store IPs, geolocation, user agents, names or page history.
 * Browser-supplied random UUID is immediately hashed, never saved as-is.
 * The count approximates unique browsers, not unique individuals.
 */
const ORIGINS=new Set([
 "https://brickandivyhomes.com",
 "https://www.brickandivyhomes.com"
]);
const UID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOT=/bot\b|crawler|spider|slurp|googlebot|bingbot|duckduckbot|yandex|facebookexternalhit|discordbot|twitterbot|whatsapp|headlesschrome|lighthouse|uptimerobot|pingdom|python-requests/i;
const TABLE="brickivy_site_visitors";
const HEADERS={
 "Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff",
 "Vary":"Origin"
};
function result(body:unknown,status:number,origin:string){
 const headers={...HEADERS,...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{})};
 return new Response(JSON.stringify(body),{status,headers});
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 if(request.method==="OPTIONS"){
  if(!ORIGINS.has(origin))return result({error:"Forbidden"},403,origin);
  return new Response(null,{status:204,headers:{
   "Access-Control-Allow-Origin":origin,
   "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
   "Access-Control-Allow-Headers":"content-type",
   "Access-Control-Max-Age":"3600","Vary":"Origin"
  }});
 }
 if(origin&&!ORIGINS.has(origin))return result({error:"Forbidden"},403,origin);
 if(!["GET","POST"].includes(request.method))return result({error:"Method not allowed"},405,origin);
 // Only first-party browsers may register a visit. Read-only totals are public.
 if(request.method==="POST"&&!ORIGINS.has(origin))return result({error:"Origin required"},403,origin);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return result({error:"Visitor counter unavailable"},503,origin);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(request.method==="POST"&&!BOT.test(request.headers.get("user-agent")||"")){
   if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return result({error:"JSON required"},415,origin);
   if(Number(request.headers.get("content-length")||0)>512)
    return result({error:"Invalid request"},413,origin);
   const payload=await request.json().catch(()=>null);
   if(!payload||typeof payload!=="object"||Array.isArray(payload))
    return result({error:"Invalid request"},400,origin);
   const id=(payload as Record<string,unknown>).visitorId;
   if(typeof id!=="string"||!UID.test(id))
    return result({error:"Invalid visitor ID"},400,origin);
   const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("brickivy-visitor-v1:"+id.toLowerCase()));
   const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
   const {error}=await db.from(TABLE).upsert({visitor_hash:hash},
     {onConflict:"visitor_hash",ignoreDuplicates:true});
   if(error)throw Error("Could not register visitor");
  }
  const {count,error}=await db.from(TABLE).select("visitor_hash",{head:true,count:"exact"});
  if(error)throw Error("Could not load visitor count");
  return result({visitors:count??0},200,origin);
 }catch(error){
  console.error("Brick & Ivy counter request failed:",error instanceof Error?error.message:"unknown");
  return result({error:"Visitor counter is temporarily unavailable"},503,origin);
 }
});