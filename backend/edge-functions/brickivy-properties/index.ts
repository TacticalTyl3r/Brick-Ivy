/*
 * Brick & Ivy public OPFW property feed.
 *
 * Readonly API V3: https://rest.opfw.net/{service}/{table}
 * Auth secret: OPFW_REST_TOKEN (Supabase Edge Function Secrets ONLY).
 * Public output contains only company 5 property ID, name, type, address and cost.
 * Renter IDs, company financials, the bearer token and the upstream SQL are never returned.
 *
 * This feed reflects Brick & Ivy company stock, NOT confirmed sale availability.
 * 'listed' is deliberately neutral until a separate listing editor is built.
 */
const OPFW_ENDPOINT = "https://rest.opfw.net/1973/stocks_company_properties";
const COMPANY_ID = 5;
const FIELDS = "company_id,property_id,property_name,property_type,property_address,property_cost";
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
    name,
    type:text(input.property_type,80)||"Property",
    address:text(input.property_address,200),
    price:safePrice(input.property_cost),
    status:"listed",
    published:true,
    featured:false,
    neighborhood:"",
    description:"",
    coverImage:"",
    images:[] as string[]
  };
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
    cached={items:listings,until:Date.now()+CACHE_TIME_MS};
    return listings;
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
