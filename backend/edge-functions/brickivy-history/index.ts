import { createClient } from "npm:@supabase/supabase-js@2.84.0";
/* Brick & Ivy Owner history: private, read-only audit aggregation.
 * Writes and homepage restores are handled by their existing vetted functions.
 */
const GUILD="1001110667580932168",OWNER="1502871124378259526";
const ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const reply=(content:unknown,status=200,origin="")=>new Response(JSON.stringify(content),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Vary":"Origin",
 ...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{})
}});
async function requireOwner(db:ReturnType<typeof createClient>,jwt:string,bot:string){
 const {data:{user},error}=await db.auth.getUser(jwt);
 if(error||!user)return null;
 const {data:account,error:e}=await db.auth.admin.getUserById(user.id);
 if(e||!account?.user)return null;
 const identity=account.user.identities?.find(i=>i.provider==="discord");
 const id=identity?.identity_data?.provider_id??identity?.id;
 if(typeof id!=="string"||!/^\d{17,20}$/.test(id))return null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const res=await fetch("https://discord.com/api/v10/guilds/"+GUILD+"/members/"+id,{
   headers:{Authorization:"Bot "+bot,Accept:"application/json"},signal:controller.signal
  });
  if(res.status===404)return null;
  if(!res.ok)throw Error("Discord role check failed");
  const member=await res.json();
  return Array.isArray(member.roles)&&member.roles.includes(OWNER)?user:null;
 }finally{clearTimeout(timer)}
}
function diffs(before:unknown,after:unknown){
 const a=before&&typeof before==="object"&&!Array.isArray(before)?before as Record<string,unknown>:{};
 const b=after&&typeof after==="object"&&!Array.isArray(after)?after as Record<string,unknown>:{};
 const keys=[...new Set([...Object.keys(a),...Object.keys(b)])];
 return keys.filter(key=>JSON.stringify(a[key])!==JSON.stringify(b[key])).slice(0,20).map(key=>({
  field:key,from:a[key]??null,to:b[key]??null
 }));
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
 "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"}});
 if(origin&&!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403,origin);
 if(req.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 const bearer=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!bearer)return reply({error:"Sign in required"},401,origin);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),bot=Deno.env.get("DISCORD_BOT_TOKEN");
 if(!url||!key||!bot)return reply({error:"History backend unavailable"},503,origin);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const verified=await requireOwner(db,bearer,bot);
  if(!verified)return reply({error:"Brick & Ivy Owner role required"},403,origin);
  const body=await req.json().catch(()=>({}));
  if(!body||typeof body!=="object"||body.action!=="list")return reply({error:"Unsupported history action"},400,origin);
  // Return a bounded recent history; do not expose unrestricted database access.
  const PAGE_LIMIT=100;
  const [homes,properties,prices,permissions]=await Promise.all([
   db.from("brickivy_homepage_audit")
    .select("id,actor,action,before_content,after_content,created_at")
    .order("created_at",{ascending:false}).limit(PAGE_LIMIT),
   db.from("brickivy_property_listing_audit")
    .select("id,actor,property_id,property_type,action,previous,updated,changed_at")
    .order("changed_at",{ascending:false}).limit(PAGE_LIMIT),
   db.from("brickivy_property_weekly_cost_audit")
    .select("id,property_id,previous_weekly_cost,new_weekly_cost,changed_by,changed_at")
    .order("changed_at",{ascending:false}).limit(PAGE_LIMIT),
   db.from("brickivy_realtor_permission_audit")
    .select("id,discord_user_id,actor,previous,updated,changed_at")
    .order("changed_at",{ascending:false}).limit(PAGE_LIMIT)
  ]);
  if(homes.error||properties.error||prices.error||permissions.error)throw Error("Could not load audit history");
  const events=[
   ...(homes.data||[]).map(r=>({
    id:String(r.id),type:"homepage",action:r.action,time:r.created_at,actor:r.actor,
    subject:"Homepage",restoreVersionId:r.action==="publish"?Number(r.id):null,
    changes:diffs(r.before_content,r.after_content)
   })),
   ...(properties.data||[]).map(r=>({
    id:String(r.id),type:"property",action:r.action,time:r.changed_at,actor:r.actor,
    subject:r.property_id?"Property "+r.property_id:"Interior "+r.property_type,
    changes:diffs(r.previous,r.updated)
   })),
   ...(prices.data||[]).map(r=>({
    id:String(r.id),type:"pricing",action:"weekly_cost",time:r.changed_at,actor:r.changed_by,
    subject:"Property "+r.property_id,
    changes:[{field:"Weekly rent override",from:r.previous_weekly_cost,to:r.new_weekly_cost}]
   })),
   ...(permissions.data||[]).map(r=>({
    id:String(r.id),type:"permissions",action:"permissions",time:r.changed_at,actor:r.actor,
    subject:"Realtor Discord "+r.discord_user_id,
    changes:diffs(r.previous,r.updated)
   }))
  ].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,250);
  const actorIds=[...new Set(events.map(e=>e.actor).filter((x):x is string=>typeof x==="string"))].slice(0,30);
  const labels:Record<string,string>={};
  await Promise.all(actorIds.map(async id=>{
   try{
    const {data:{user},error}=await db.auth.admin.getUserById(id);
    if(error||!user)return;
    const identity=user.identities?.find(i=>i.provider==="discord");
    const display=identity?.identity_data?.full_name||identity?.identity_data?.name||
      user.user_metadata?.full_name||user.user_metadata?.name;
    if(typeof display==="string"&&display.trim())labels[id]=display.trim().slice(0,90);
   }catch{}
  }));
  return reply({events,actors:labels,count:events.length,limit:250},200,origin);
 }catch(error){
  console.error("Brick & Ivy history failed",error instanceof Error?error.message:"unknown");
  return reply({error:"History unavailable. Check the private function logs."},503,origin);
 }
});