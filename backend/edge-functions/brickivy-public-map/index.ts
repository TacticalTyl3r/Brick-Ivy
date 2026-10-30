import {createClient} from "npm:@supabase/supabase-js@2.84.0";

/* Public READ-ONLY map of explicitly placed, currently published homes.
 * Uses the existing public listing feed as the only source of map eligibility:
 * hidden/unpublished/removed company properties cannot appear. The underlying
 * pin table remains private (RLS, service_role only). No edits or renter data.
 */
const ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const MAX_ROWS=1200;
const HEADER_BASE={"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=30","Vary":"Origin","X-Content-Type-Options":"nosniff"};
function reply(body:unknown,status=200,origin=""){
 const headers={...HEADER_BASE,...ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}};
 return new Response(JSON.stringify(body),{status,headers});
}
const safe=(value:unknown,n:number)=>typeof value==="string"?value.trim().slice(0,n):"";
function gameCoordinate(x:unknown,y:unknown){
 return typeof x==="number"&&typeof y==="number"&&Number.isFinite(x)&&Number.isFinite(y)&&x>=-8000&&x<=8000&&y>=-8000&&y<=9000;
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "Vary":"Origin",...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"apikey,content-type,x-client-info",
 }});
 if(request.method!=="GET")return reply({error:"Map locations are read-only"},405,origin);
 if(origin&&!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403,origin);
 const base=Deno.env.get("SUPABASE_URL")||"";
 const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(base)||!secret)
  return reply({error:"Map is temporarily unavailable"},503,origin);
 try{
  // Reuse the public properties feed's status, company scope, and publish
  // rules, rather than introducing a second independent visibility rule.
  const response=await fetch(base.replace(/\/$/,"")+"/functions/v1/brickivy-properties",{
   headers:{"Accept":"application/json"},signal:AbortSignal.timeout(16500)
  });
  if(!response.ok)throw Error("Public listing feed unavailable");
  const listings=await response.json();
  if(!Array.isArray(listings)||listings.length>MAX_ROWS)throw Error("Invalid public listing feed");
  const allowlisted=new Map<string,Record<string,unknown>>();
  for(const raw of listings){
   if(!raw||typeof raw!=="object"||Array.isArray(raw))continue;
   const p=raw as Record<string,unknown>;
   const id=String(p.id??"").trim();
   if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)||p.published!==true)continue;
   allowlisted.set(id,p);
  }
  if(!allowlisted.size)return reply({properties:[],count:0},200,origin);
  const db=createClient(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.from("brickivy_property_map_locations")
   .select("property_id,x,y").in("property_id",[...allowlisted.keys()]);
  if(error)throw Error("Private map lookup failed");
  const properties=(data||[]).flatMap(location=>{
   const id=String(location.property_id),listing=allowlisted.get(id);
   if(!listing||!gameCoordinate(location.x,location.y))return [];
   const state=safe(listing.status,20).toLowerCase();
   const status=["available","reserved","unavailable"].includes(state)?state:"unknown";
   const price=typeof listing.price==="number"&&Number.isFinite(listing.price)?listing.price:null;
   return [{
    id,name:safe(listing.name,160)||"Property #"+id,
    address:safe(listing.address,200),area:safe(listing.area,80),
    blockId:safe(String(listing.blockId??""),80),status,price,
    x:location.x,y:location.y
   }];
  });
  return reply({properties,count:properties.length},200,origin);
 }catch(error){
  console.error("Brick & Ivy public map failed:",error instanceof Error?error.message:"Unknown error");
  return reply({error:"Property map is temporarily unavailable"},503,origin);
 }
});