import { createClient } from "npm:@supabase/supabase-js@2.84.0";
/*
 * Brick & Ivy public OPFW property feed.
 *
 * Readonly API: https://opfw.gg/api/rest/{service}/{table}
 * Auth secret: OPFW_REST_TOKEN (Supabase Edge Function Secrets ONLY).
 * Public output contains only company 5 property ID, name, type, address and cost.
 * Renter IDs, company financials, the bearer token and the upstream SQL are never returned.
 *
 * This feed reflects Brick & Ivy company stock, NOT confirmed sale availability.
 * Public badges: unavailable (rented) > reserved (staff) > available (no renter).
 * Unknown occupancy remains neutral; only safe status, block, area and storage
 * preset fields are exposed. Tenant details never enter the public response.
 */
const OPFW_ENDPOINT = "https://opfw.gg/api/rest/1973/stocks_company_properties";
const COMPANY_ID = 5;
const FIELDS = "company_id,block_id,property_id,property_name,property_type,property_address,property_cost";
const ORIGINS = new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const MAX_RECORDS = 1000;
const CACHE_TIME_MS = 60_000;
let cached: { items: unknown[]; until: number } | null = null;
let inflight: Promise<unknown[]> | null = null;

function reply(body: unknown, status=200, origin="", cache=false) {
  const headers: Record<string,string> = {
    "Content-Type":"application/json; charset=utf-8",
    "Vary":"Origin",
    "Access-Control-Allow-Methods":"GET,OPTIONS",
    "Access-Control-Allow-Headers":"apikey,authorization,content-type,x-client-info",
    "Cache-Control": cache ? "public, max-age=30, s-maxage=60" : "no-store",
    "X-Content-Type-Options":"nosniff"
  };
  if (ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body),{status,headers});
}
function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0,limit) : "";
}
function sourcePropertyType(value: unknown): string {
  // OPFW property_type may be numeric (interior code 1-11), or a string.
  // Preserve the raw code as text for the public interior-name lookup and
  // for the per-type storage preset key.
  if(typeof value==="number" && Number.isSafeInteger(value))return String(value);
  if(typeof value==="string")return value.trim().slice(0,80)||"Property";
  return "Property";
}
function safePrice(value: unknown): number|null {
  if (value===null || value===undefined || value==="") return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0&&n<=1_000_000_000_000?n:null;
}
function toListing(input: Record<string,unknown>) {
  // Important: a client-supplied filter is never used, and we also validate
  // the company ID on every returned record to prevent cross-company leaks.
  if (Number(input.company_id)!==COMPANY_ID) return null;
  const rawId=input.property_id;
  const id=typeof rawId==="number"&&Number.isSafeInteger(rawId)?String(rawId):
    typeof rawId==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(rawId)?rawId:"";
  const name=text(input.property_name,160);
  if (!id || !name) return null;
  return {
    id,
    blockId: (typeof input.block_id==="number"&&Number.isSafeInteger(input.block_id))?String(input.block_id):text(input.block_id,80),
    name,
    type:sourcePropertyType(input.property_type),
    address:text(input.property_address,200),
    price:safePrice(input.property_cost),
    status:"listed",
    area:"",
    storageKg:null as number|null,
    storageSlots:null as number|null,
    published:true,
    featured:false,
    neighborhood:"",
    description:"",
    coverImage:"",
    images:[] as string[]
  };
}
// Occupancy is looked up privately and separately from the regular public
// stock query, so missing/restricted rental columns cannot break all listings.
// No renter identity, income, or payment information is returned to visitors.
async function rentedPropertyIds(token:string,expectedIds:string[]):Promise<Set<string>|null> {
  const url=new URL(OPFW_ENDPOINT);
  url.searchParams.set("select","company_id,property_id,property_renter_cid");
  url.searchParams.set("where","company_id="+COMPANY_ID);
  const ctrl=new AbortController();
  const timeout=setTimeout(()=>ctrl.abort(),8000);
  try {
    const res=await fetch(url,{
      method:"GET",
      headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
      signal:ctrl.signal
    });
    if(!res.ok)return null;
    const payload:unknown=await res.json();
    const rows=(payload as {data?:unknown})?.data;
    if(!Array.isArray(rows)||rows.length>MAX_RECORDS)return null;
    const rented=new Set<string>();
    const seen=new Set<string>();
    for(const row of rows){
      if(!row||typeof row!=="object"||Array.isArray(row))return null;
      const r=row as Record<string,unknown>;
      if(Number(r.company_id)!==COMPANY_ID || !Object.prototype.hasOwnProperty.call(r,"property_renter_cid"))return null;
      const id=typeof r.property_id==="number"&&Number.isSafeInteger(r.property_id)?String(r.property_id):
        typeof r.property_id==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(r.property_id)?r.property_id:"";
      if(!id||seen.has(id))return null;
      seen.add(id);
      const cid=Number(r.property_renter_cid);
      if(r.property_renter_cid!==null&&r.property_renter_cid!==""&&!Number.isSafeInteger(cid))return null;
      if(r.property_renter_cid!==null && r.property_renter_cid!=="" && Number.isSafeInteger(cid) && cid>0){
        rented.add(id);
      }
    }
    // If the occupancy source is partial, don't mislabel omitted houses Available.
    if(seen.size!==expectedIds.length||expectedIds.some(id=>!seen.has(id)))return null;
    return rented;
  }catch{
    // Unknown occupancy must never be represented as definitely vacant.
    return null;
  }finally{clearTimeout(timeout)}
}
async function loadProperties(token:string):Promise<unknown[]> {
  if(cached && Date.now()<cached.until) return cached.items;
  if(inflight) return inflight;
  inflight=(async()=>{
    const url=new URL(OPFW_ENDPOINT);
    url.searchParams.set("select",FIELDS);
    url.searchParams.set("where","company_id="+COMPANY_ID);
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),12000);
    let response:Response;
    try{
      response=await fetch(url,{
        method:"GET",
        headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
        signal:ctrl.signal
      });
    }finally{clearTimeout(timeout)}
    if(!response.ok) {
      if(response.status===401||response.status===403) throw new Error("OPFW access denied");
      throw new Error("OPFW returned HTTP "+response.status);
    }
    const payload:unknown=await response.json();
    if(!payload || typeof payload!=="object" || !Array.isArray((payload as {data?:unknown}).data)){
      throw new Error("Unexpected OPFW response format");
    }
    const rows=(payload as {data:unknown[]}).data;
    if(rows.length>MAX_RECORDS) throw new Error("OPFW result exceeds the supported directory limit");
    // Fail closed if OPFW does not honor the required company filter.
    if(rows.some(r=>!r||typeof r!=="object"||Array.isArray(r)||Number((r as Record<string,unknown>).company_id)!==COMPANY_ID)){
      throw new Error("OPFW company filter returned an unexpected record");
    }
    const ids=new Set<string>();
    const listings=rows.map(r=>toListing(r as Record<string,unknown>)).filter((x):x is NonNullable<typeof x>=>x!==null)
      .filter(x=>{if(ids.has(x.id))return false;ids.add(x.id);return true})
      .sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    // Join only explicitly public website metadata. Private renter IDs, income
    // and payment information are never serialised into the response.
    if(listings.length){
      const dbUrl=Deno.env.get("SUPABASE_URL");
      const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if(!dbUrl||!serviceKey)throw new Error("Property pricing backend unavailable");
      const db=createClient(dbUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:overrides,error}=await db.from("brickivy_property_weekly_costs")
        .select("property_id,weekly_cost_override").in("property_id",listings.map(p=>p.id));
      if(error)throw new Error("Property pricing lookup failed");
      const [propertyMeta,storageMeta,photoMeta]=await Promise.all([
        db.from("brickivy_property_listing_settings").select("property_id,area,reserved,description,published,featured").in("property_id",listings.map(p=>p.id)),
        db.from("brickivy_property_type_storage").select("property_type,capacity_kg,capacity_slots")
          .in("property_type",[...new Set(listings.map(p=>p.type))]),
        db.from("brickivy_property_photos").select("property_id,object_key,is_cover,display_order,id")
          .in("property_id",listings.map(p=>p.id))
          .order("display_order",{ascending:true}).order("id",{ascending:true})
      ]);
      if(propertyMeta.error||storageMeta.error||photoMeta.error)throw new Error("Listing metadata lookup failed");
      const photoById=new Map<string,{url:string;cover:boolean}[]>();
      for(const row of photoMeta.data||[]){
        const id=String(row.property_id||""),key=String(row.object_key||"");
        if(!key.startsWith(id+"/")||!/^[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(key.slice(id.length+1)))continue;
        if(!listings.some(p=>p.id===id))continue;
        const url=db.storage.from("brickivy-property-photos").getPublicUrl(key).data.publicUrl;
        if(!photoById.has(id))photoById.set(id,[]);
        photoById.get(id)!.push({url,cover:row.is_cover===true});
      }
      const details=new Map((propertyMeta.data||[]).map(row=>[String(row.property_id),row]));
      const capacities=new Map((storageMeta.data||[]).map(row=>[String(row.property_type),row]));
      const prices=new Map((overrides||[]).map(row=>[String(row.property_id),row.weekly_cost_override]));
      for(const item of listings){
        const override=prices.get(item.id);
        if(override!==undefined && override!==null){
          const value=safePrice(override);
          if(value!==null)item.price=value;
        }
        const detail=details.get(item.id);
        item.area=detail?.area || "";
        item.description=typeof detail?.description==="string"?detail.description.trim().slice(0,3000):"";
        item.published=detail?.published!==false;
        item.featured=item.published&&detail?.featured===true;
        const storage=capacities.get(item.type);
        item.storageKg=storage?.capacity_kg===null||storage?.capacity_kg===undefined?null:safePrice(storage.capacity_kg);
        const slots=Number(storage?.capacity_slots);
        item.storageSlots=storage?.capacity_slots===null||storage?.capacity_slots===undefined||!Number.isSafeInteger(slots)||slots<0?null:slots;
        const photos=photoById.get(item.id)||[];
        item.images=photos.map(photo=>photo.url);
        item.coverImage=photos.find(photo=>photo.cover)?.url||item.images[0]||"";
      }
      // Set only the public availability badge. Tenant identity stays private.
      // If OPFW rental data cannot be read, retain neutral "In portfolio".
      const rented=await rentedPropertyIds(token,listings.map(item=>item.id));
      for(const item of listings){
        if(rented?.has(item.id))item.status="unavailable";
        else if(details.get(item.id)?.reserved===true)item.status="reserved";
        else if(rented!==null)item.status="available";
        // If OPFW rental data is unreadable, don't falsely call it available.
      }
    }
    // Hide Owner-unpublished homes at the API boundary, including direct-detail lookups.
    // Do not return their IDs, prices, photos or any other listing metadata publicly.
    const visibleListings=listings.filter(item=>item.published===true);
    cached={items:visibleListings,until:Date.now()+CACHE_TIME_MS};
    return visibleListings;
  })();
  try{return await inflight}finally{inflight=null}
}
Deno.serve(async(request:Request)=>{
  const origin=request.headers.get("origin")||"";
  if(request.method==="OPTIONS")return reply({},200,origin);
  if(request.method!=="GET")return reply({error:"Method not allowed"},405,origin);
  if(origin && !ORIGINS.has(origin))return reply({error:"Origin not allowed"},403,origin);
  const token=Deno.env.get("OPFW_REST_TOKEN");
  if(!token)return reply({error:"OPFW source not configured",code:"SOURCE_NOT_CONFIGURED"},503,origin);
  try{
    return reply(await loadProperties(token),200,origin,true);
  }catch(error){
    // Never log auth headers, tokens, raw OPFW responses or private records.
    console.error("Brick & Ivy OPFW feed failed:",error instanceof Error?error.message:"unknown");
    return reply({error:"The live property feed is temporarily unavailable",code:"UPSTREAM_UNAVAILABLE"},502,origin);
  }
});
