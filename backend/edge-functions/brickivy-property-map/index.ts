import {createClient} from "npm:@supabase/supabase-js@2.84.0";

/* Brick & Ivy private Owner-only GTA V property pin staging.
 * NEVER expose the map location table through the public properties feed.
 * Roles are checked live through the Brick & Ivy Discord guild.
 */
const GUILD="1001110667580932168";
const OWNER="1502871124378259526";
const ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const STOCK="https://opfw.gg/api/rest/1973/stocks_company_properties";
const COMPANY=5;
const MAX_PROPERTIES=1200;
const PID=/^[A-Za-z0-9_-]{1,80}$/;
const NO_CACHE={"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff","Vary":"Origin"};
function respond(payload:unknown,status:number,cors:Record<string,string>){
 return new Response(JSON.stringify(payload),{status,headers:{...NO_CACHE,...cors}});
}
function propId(value:unknown):string{
 const id=typeof value==="number"&&Number.isSafeInteger(value)?String(value):
 typeof value==="string"?value.trim():"";
 return PID.test(id)?id:"";
}
function safe(v:unknown,max:number):string{return typeof v==="string"?v.trim().slice(0,max):""}
function validCoordinate(n:unknown,min:number,max:number):n is number{
 return typeof n==="number"&&Number.isFinite(n)&&n>=min&&n<=max;
}
async function verifyOwner(db:ReturnType<typeof createClient>,jwt:string,botToken:string){
 const {data:{user},error}=await db.auth.getUser(jwt);
 if(error||!user)throw {status:401,message:"Sign in with Discord to access the private map."};
 const {data:account,error:accountError}=await db.auth.admin.getUserById(user.id);
 if(accountError||!account?.user)throw {status:503,message:"Could not verify signed-in staff account."};
 const identity=account.user.identities?.find(i=>i.provider==="discord");
 const discordId=identity?.identity_data?.provider_id??identity?.id;
 if(typeof discordId!=="string"||!/^\d{17,20}$/.test(discordId))
  throw {status:403,message:"A verified Discord staff sign-in is required."};
 const response=await fetch("https://discord.com/api/v10/guilds/"+GUILD+"/members/"+discordId,{
  headers:{Authorization:"Bot "+botToken,Accept:"application/json"},
  signal:AbortSignal.timeout(8500)
 });
 if(response.status===404)throw {status:403,message:"You are not in the Brick & Ivy Discord server."};
 if(!response.ok)throw {status:503,message:"Unable to verify current Discord roles. Retry shortly."};
 const guild=await response.json();
 if(!Array.isArray(guild.roles)||!guild.roles.includes(OWNER))
  throw {status:403,message:"The map is in Owner-only preview mode."};
 return user.id;
}
async function stock(token:string){
 const url=new URL(STOCK);
 url.searchParams.set("select","company_id,block_id,property_id,property_name,property_address");
 url.searchParams.set("where","company_id="+COMPANY);
 const response=await fetch(url,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(14000)});
 if(!response.ok)throw Error("Property source could not be reached");
 const payload=await response.json();
 if(!Array.isArray(payload?.data)||payload.data.length>MAX_PROPERTIES)throw Error("Invalid property portfolio");
 const seen=new Set<string>();
 const rows=[];
 for(const value of payload.data){
  if(!value||typeof value!=="object"||Number(value.company_id)!==COMPANY)throw Error("Invalid company property source");
  const id=propId(value.property_id);
  if(!id||seen.has(id))continue;
  seen.add(id);
  rows.push({id,name:safe(value.property_name,160)||"Property #"+id,
   address:safe(value.property_address,200),blockId:safe(String(value.block_id??""),80)});
 }
 return rows;
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 const cors:Record<string,string>={
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
 };
 if(ORIGINS.has(origin))cors["Access-Control-Allow-Origin"]=origin;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,Vary:"Origin"}});
 if(origin&&!ORIGINS.has(origin))return respond({error:"Origin not allowed"},403,cors);
 if(request.method!=="POST")return respond({error:"Method not allowed"},405,cors);
 const token=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return respond({error:"Discord sign-in required"},401,cors);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const bot=Deno.env.get("DISCORD_BOT_TOKEN"),opfw=Deno.env.get("OPFW_REST_TOKEN");
 if(!url||!secret||!bot||!opfw)return respond({error:"Private map service is not configured"},503,cors);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const actor=await verifyOwner(db,token,bot);
  const input=await request.json().catch(()=>null);
  if(!input||typeof input!=="object"||Array.isArray(input))
   return respond({error:"Invalid map request"},400,cors);
  const action=String(input.action||"");
  if(!["list","save","remove"].includes(action))return respond({error:"Unknown map action"},400,cors);
  // Validate against the actual company 5 portfolio. Never accept an arbitrary
  // property ID from a client as sufficient authorization to modify a pin.
  const portfolio=await stock(opfw);
  const ids=portfolio.map(p=>p.id);
  if(action==="list"){
   const [points,metadata]=await Promise.all([
    db.from("brickivy_property_map_locations").select("property_id,x,y,updated_at"),
    ids.length?db.from("brickivy_property_listing_settings")
      .select("property_id,area,published,featured,reserved").in("property_id",ids):
      Promise.resolve({data:[],error:null})
   ]);
   if(points.error||metadata.error)throw Error("Map metadata lookup failed");
   const locations=new Map((points.data||[]).map(p=>[String(p.property_id),p]));
   const settings=new Map((metadata.data||[]).map(p=>[String(p.property_id),p]));
   return respond({role:"owner",privatePreview:true,properties:portfolio.map(p=>{
    const point=locations.get(p.id),meta=settings.get(p.id);
    return {...p,area:safe(meta?.area,70),published:meta?.published!==false,
     featured:meta?.featured===true,reserved:meta?.reserved===true,
     x:typeof point?.x==="number"?point.x:null,
     y:typeof point?.y==="number"?point.y:null,
     updatedAt:point?.updated_at||null};
   })},200,cors);
  }
  const id=propId(input.propertyId);
  if(!id||!ids.includes(id))return respond({error:"Property is not in the Brick & Ivy portfolio"},404,cors);
  if(action==="remove"){
   const removed=await db.from("brickivy_property_map_locations").delete().eq("property_id",id);
   if(removed.error)throw Error("Could not remove map pin");
   return respond({success:true,propertyId:id,removed:true},200,cors);
  }
  if(!validCoordinate(input.x,-8000,8000)||!validCoordinate(input.y,-8000,9000))
   return respond({error:"Enter valid GTA X (-8000 to 8000) and Y (-8000 to 9000) coordinates"},400,cors);
  const rounded=(v:number)=>Math.round(v*100)/100;
  const point={property_id:id,x:rounded(input.x),y:rounded(input.y),updated_at:new Date().toISOString(),updated_by:actor};
  const saved=await db.from("brickivy_property_map_locations").upsert(point,{onConflict:"property_id"});
  if(saved.error)throw Error("Could not save map location");
  return respond({success:true,propertyId:id,x:point.x,y:point.y,updatedAt:point.updated_at},200,cors);
 }catch(error){
  const err=error as {status?:number;message?:string};
  if(typeof err.status==="number"&&err.status>=400&&err.status<600)return respond({error:err.message||"Access denied"},err.status,cors);
  console.error("Brick & Ivy private map request failed:",error instanceof Error?error.message:"unknown");
  return respond({error:"Map service is temporarily unavailable"},503,cors);
 }
});