import { createClient } from "npm:@supabase/supabase-js@2.84.0";

/* Brick & Ivy private property financial and rental view.
 * Auth: Supabase Discord OAuth + live guild role membership checked for EVERY request.
 * Owners may override website weekly property values, Realtors have READ ONLY access.
 * No private fields appear in the public brickivy-properties function.
 */
const GUILD_ID="1001110667580932168";
const OWNER_ROLE_ID="1502871124378259526";
const REALTOR_ROLE_ID="1502870035176357968";
const COMPANY_ID=5;
const OPFW_ENDPOINT="https://opfw.gg/api/rest/1973/stocks_company_properties";
const BASIC="company_id,block_id,property_id,property_name,property_type,property_address,property_cost";
const RENTAL=",property_income,property_renter_cid,property_last_pay";
const ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
// OPFW standard interior IDs are 1–11. Presets may be configured before Brick & Ivy owns one.
const STANDARD_INTERIOR_CODES=Array.from({length:11},(_,index)=>String(index+1));
const DEFAULT_PERMISSIONS={
 can_edit_area:false,can_manage_reservations:true,can_edit_description:false,
 can_set_prices:false,can_manage_storage:false,can_publish:false,
 can_feature:false,can_manage_photos:false,can_view_financials:false
};
const OWNER_PERMISSIONS=Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(k=>[k,true]));
const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
const response=(body:unknown,status=200,cors:Record<string,string>={})=>
  new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...cors}});
const str=(v:unknown,n=160)=>String(v??"").trim().slice(0,n);
function nonnegative(v:unknown):number|null{
  if(v===null||v===undefined||v==="")return null;
  const num=Number(v);
  return Number.isFinite(num)&&num>=0&&num<=9999999999.99?num:null;
}
function pid(value:unknown):string{
  const id=typeof value==="string"?value:typeof value==="number"&&Number.isSafeInteger(value)?String(value):"";
  return idPattern.test(id)?id:"";
}
async function guildRoles(discordUserId:string,botToken:string):Promise<string[]>{
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),8000);
  try{
    const res=await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}`,{
      headers:{Authorization:"Bot "+botToken,Accept:"application/json"},signal:ctrl.signal
    });
    if(res.status===404)return [];
    if(!res.ok)throw new Error("Discord role lookup failed");
    const data=await res.json();
    if(!Array.isArray(data.roles))throw new Error("Unexpected guild member response");
    return data.roles.filter((x:unknown)=>typeof x==="string");
  }finally{clearTimeout(timer)}
}
async function opfw(token:string,fields:string){
  const url=new URL(OPFW_ENDPOINT);
  url.searchParams.set("select",fields);
  url.searchParams.set("where","company_id="+COMPANY_ID);
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  let res:Response;
  try{res=await fetch(url,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:ctrl.signal})}
  finally{clearTimeout(timer)}
  if(!res.ok){
    // Do not show upstream content; it may contain private data.
    const err=new Error("OPFW request failed") as Error & {status?:number};
    err.status=res.status;
    throw err;
  }
  const payload=await res.json();
  if(!payload||!Array.isArray(payload.data))throw new Error("Unexpected OPFW payload");
  if(payload.data.length>1000)throw new Error("OPFW response limit exceeded");
  if(payload.data.some((r:unknown)=>!r||typeof r!=="object"||Array.isArray(r)||(r as Record<string,unknown>).company_id===undefined||Number((r as Record<string,unknown>).company_id)!==COMPANY_ID)){
    throw new Error("Invalid company filter in OPFW response");
  }
  return payload.data as Record<string,unknown>[];
}
async function stock(token:string){
  try{
    return {rows:await opfw(token,BASIC+RENTAL),rentalAvailable:true};
  }catch(e){
    // Tokens may be field-restricted. Never pretend a rental is vacant when
    // rental details are unavailable.
    if((e as {status?:number}).status===400||(e as {status?:number}).status===403){
      return {rows:await opfw(token,BASIC),rentalAvailable:false};
    }
    throw e;
  }
}
async function renterNames(token:string,rows:Record<string,unknown>[]):Promise<Map<number,string>>{
  const cids=[...new Set(rows.map(r=>Number(r.property_renter_cid))
    .filter(cid=>Number.isSafeInteger(cid)&&cid>0))].slice(0,300);
  if(!cids.length)return new Map();
  const url=new URL("https://opfw.gg/api/rest/1973/characters");
  url.searchParams.set("select","character_id,first_name,last_name");
  url.searchParams.set("where","character_id="+cids.join("|"));
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
  try{
    const res=await fetch(url,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:ctrl.signal});
    if(!res.ok)return new Map();
    const body=await res.json();
    if(!body||!Array.isArray(body.data)||body.data.length>cids.length)return new Map();
    const allow=new Set(cids),names=new Map<number,string>();
    for(const r of body.data){
      const cid=Number(r?.character_id);
      if(!allow.has(cid))continue;
      const name=[str(r?.first_name,70),str(r?.last_name,70)].filter(Boolean).join(" ");
      if(name)names.set(cid,name);
    }
    return names;
  }catch{return new Map()}
  finally{clearTimeout(timer)}
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  const cors:Record<string,string>={
    "Vary":"Origin","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
  if(ORIGINS.has(origin))cors["Access-Control-Allow-Origin"]=origin;
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(origin&&!ORIGINS.has(origin))return response({error:"Origin not allowed"},403,cors);
  if(req.method!=="POST")return response({error:"Method not allowed"},405,cors);
  const jwt=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!jwt)return response({error:"Sign in required"},401,cors);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    bot=Deno.env.get("DISCORD_BOT_TOKEN"),opfwToken=Deno.env.get("OPFW_REST_TOKEN");
  if(!url||!service||!bot||!opfwToken)return response({error:"Backend setup incomplete"},503,cors);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const {data:{user},error:authError}=await db.auth.getUser(jwt);
    if(authError||!user)return response({error:"Invalid session"},401,cors);
    const {data:account,error:lookupError}=await db.auth.admin.getUserById(user.id);
    if(lookupError||!account?.user)return response({error:"Account lookup failed"},503,cors);
    const discord=account.user.identities?.find(i=>i.provider==="discord");
    const providerId=discord?.identity_data?.provider_id??discord?.id;
    if(typeof providerId!=="string"||!/^[0-9]{17,20}$/.test(providerId)){
      return response({error:"Discord sign-in required"},403,cors);
    }
    const roles=await guildRoles(providerId,bot);
    const owner=roles.includes(OWNER_ROLE_ID),realtor=owner||roles.includes(REALTOR_ROLE_ID);
    if(!realtor)return response({error:"Brick & Ivy staff role required"},403,cors);
    // Permissions are attached to the server-verified Discord identity, never
    // client metadata, a public Realtor title, or a client-supplied role.
    let permissions={...DEFAULT_PERMISSIONS};
    if(owner)permissions={...OWNER_PERMISSIONS} as typeof DEFAULT_PERMISSIONS;
    else {
      const {data:record,error:e}=await db.from("brickivy_realtor_permissions")
        .select(Object.keys(DEFAULT_PERMISSIONS).join(",")).eq("discord_user_id",providerId).maybeSingle();
      if(e)throw Error("Unable to verify Realtor permissions");
      permissions={...DEFAULT_PERMISSIONS,...(record||{})};
    }
    const input=await req.json();
    if(!input||typeof input!=="object"||Array.isArray(input))return response({error:"Invalid request"},400,cors);
    const action=(input as Record<string,unknown>).action;
    if(!["list","saveWeeklyCost","setArea","setReservation","setStorage","setDescription","setPublished","setFeatured"].includes(String(action)))return response({error:"Unsupported action"},400,cors);
    const actions:Record<string,keyof typeof DEFAULT_PERMISSIONS>={
      saveWeeklyCost:"can_set_prices",setArea:"can_edit_area",setReservation:"can_manage_reservations",
      setStorage:"can_manage_storage",setDescription:"can_edit_description",
      setPublished:"can_publish",setFeatured:"can_feature"
    };
    const required=actions[String(action)];
    if(required && !permissions[required])return response({error:"Permission denied for this action"},403,cors);
    // Each staff request fetches an up-to-date OPFW company snapshot.
    const {rows,rentalAvailable}=await stock(opfwToken);
    const properties=rows.filter(r=>pid(r.property_id)!=="");
    const inputData=input as Record<string,unknown>;
    if(action==="setPublished"||action==="setFeatured"){
      const propertyId=pid(inputData.propertyId);
      if(!propertyId||!properties.some(row=>pid(row.property_id)===propertyId)){
        return response({error:"This property is not currently in Brick & Ivy's company stock"},404,cors);
      }
      const targetValue=action==="setPublished"?inputData.published:inputData.featured;
      if(typeof targetValue!=="boolean"){
        return response({error:"Choose a valid publishing or featured setting"},400,cors);
      }
      const {data:before,error:readError}=await db.from("brickivy_property_listing_settings")
        .select("area,reserved,description,published,featured").eq("property_id",propertyId).maybeSingle();
      if(readError)throw new Error("Unable to load current publishing settings");
      const previous={published:before?.published!==false,featured:before?.featured===true};
      let published=previous.published,featured=previous.featured;
      if(action==="setPublished"){
        published=targetValue;
        if(!published)featured=false;
      }else{
        if(targetValue&&!published)return response({error:"Publish this property before featuring it"},409,cors);
        featured=targetValue;
      }
      const {error:writeError}=await db.from("brickivy_property_listing_settings").upsert({
        property_id:propertyId,area:before?.area||"",reserved:before?.reserved===true,
        description:before?.description||"",published,featured,
        updated_at:new Date().toISOString(),updated_by:user.id
      },{onConflict:"property_id"});
      if(writeError)throw new Error("Unable to save website publishing settings");
      const {error:auditError}=await db.from("brickivy_property_listing_audit").insert({
        actor:user.id,property_id:propertyId,
        action:action==="setPublished"?"set_published":"set_featured",
        previous,updated:{published,featured}
      });
      if(auditError)console.error("Brick & Ivy publishing audit failed");
      return response({success:true,propertyId,published,featured,
        auditRecorded:!auditError,publicFeedRefreshSeconds:120},200,cors);
    }
    if(action==="setDescription"){
      const propertyId=pid(inputData.propertyId);
      if(!propertyId||!properties.some(row=>pid(row.property_id)===propertyId)){
        return response({error:"This property is not currently in Brick & Ivy's company stock"},404,cors);
      }
      if(typeof inputData.description!=="string")return response({error:"Enter a valid property overview"},400,cors);
      const description=inputData.description.trim().replace(/\r\n?/g,"\n");
      if(description.length>3000)return response({error:"Property overviews must be 3,000 characters or fewer"},400,cors);
      const {data:before,error:readError}=await db.from("brickivy_property_listing_settings")
        .select("area,reserved,description,published,featured").eq("property_id",propertyId).maybeSingle();
      if(readError)throw new Error("Unable to read property overview");
      const previousDescription=before?.description||"";
      const {error:writeError}=await db.from("brickivy_property_listing_settings").upsert({
        property_id:propertyId,area:before?.area||"",reserved:before?.reserved===true,
        description,published:before?.published!==false,featured:before?.featured===true,
        updated_at:new Date().toISOString(),updated_by:user.id
      },{onConflict:"property_id"});
      if(writeError)throw new Error("Unable to save property overview");
      const {error:auditError}=await db.from("brickivy_property_listing_audit").insert({
        actor:user.id,property_id:propertyId,action:"set_description",
        previous:{description:previousDescription},updated:{description}
      });
      if(auditError)console.error("Brick & Ivy property overview audit failed");
      return response({success:true,propertyId,description,auditRecorded:!auditError,publicFeedRefreshSeconds:90},200,cors);
    }
    if(action==="setArea"||action==="setReservation"){
      const propertyId=pid(inputData.propertyId);
      const target=properties.find(row=>pid(row.property_id)===propertyId);
      if(!target)return response({error:"This property is not currently in Brick & Ivy's company stock"},404,cors);
      const {data:before,error:readError}=await db.from("brickivy_property_listing_settings")
        .select("area,reserved,description,published,featured").eq("property_id",propertyId).maybeSingle();
      if(readError)throw new Error("Unable to load listing settings");
      let area=before?.area||"", reserved=before?.reserved===true;
      const previous={area,reserved};
      if(action==="setArea"){
        if(typeof inputData.area!=="string"||!["","Los Santos","Sandy Shores","Paleto Bay"].includes(inputData.area)){
          return response({error:"Choose Los Santos, Sandy Shores, Paleto Bay, or Unassigned"},400,cors);
        }
        area=inputData.area;
      }else{
        if(typeof inputData.reserved!=="boolean")return response({error:"Choose a valid reservation status"},400,cors);
        const occupied=Number(target.property_renter_cid);
        if(rentalAvailable&&inputData.reserved===true&&target.property_renter_cid!==null
          &&target.property_renter_cid!==""&&Number.isSafeInteger(occupied)&&occupied>0){
          return response({error:"A rented property cannot be marked Reserved"},409,cors);
        }
        reserved=inputData.reserved;
      }
      const {error:writeError}=await db.from("brickivy_property_listing_settings").upsert({
        property_id:propertyId,area,reserved,description:before?.description||"",
        published:before?.published!==false,featured:before?.featured===true,
        updated_at:new Date().toISOString(),updated_by:user.id
      },{onConflict:"property_id"});
      if(writeError)throw new Error("Unable to save property setting");
      const {error:auditError}=await db.from("brickivy_property_listing_audit").insert({
        actor:user.id,property_id:propertyId,action:action==="setArea"?"set_area":"set_reserved",
        previous,updated:{area,reserved}
      });
      if(auditError)console.error("Brick & Ivy listing setting audit failed");
      return response({success:true,propertyId,area,reserved,auditRecorded:!auditError,publicFeedRefreshSeconds:90},200,cors);
    }
    if(action==="setStorage"){
      const type=typeof inputData.propertyType==="string"?inputData.propertyType.trim():"";
      if(!type||type.length>80||!(STANDARD_INTERIOR_CODES.includes(type)||properties.some(p=>str(p.property_type,80)===type))){
        return response({error:"Choose one of the 11 standard OPFW interiors or an interior used by your company"},400,cors);
      }
      const weight=inputData.capacityKg,slots=inputData.capacitySlots;
      const cleared=(v:unknown)=>v===null||v==="";
      const validWeight=cleared(weight)?null:Number(weight);
      const validSlots=cleared(slots)?null:Number(slots);
      if((validWeight!==null&&(!Number.isFinite(validWeight)||validWeight<0||validWeight>9999999999.99
       ||Math.abs(Math.round(validWeight*100)-validWeight*100)>0.000001))
        ||(validSlots!==null&&(!Number.isSafeInteger(validSlots)||validSlots<0||validSlots>1000000))){
        return response({error:"Use a valid storage weight in SU and a whole-number furniture object limit, or leave them blank"},400,cors);
      }
      const {data:before,error:readError}=await db.from("brickivy_property_type_storage")
        .select("capacity_kg,capacity_slots").eq("property_type",type).maybeSingle();
      if(readError)throw new Error("Unable to read storage setting");
      const {error:writeError}=await db.from("brickivy_property_type_storage").upsert({
        property_type:type,capacity_kg:validWeight,capacity_slots:validSlots,
        updated_at:new Date().toISOString(),updated_by:user.id
      },{onConflict:"property_type"});
      if(writeError)throw new Error("Unable to save storage capacities");
      const {error:auditError}=await db.from("brickivy_property_listing_audit").insert({
        actor:user.id,property_type:type,action:"set_storage",
        previous:{capacityKg:before?.capacity_kg??null,capacitySlots:before?.capacity_slots??null},
        updated:{capacityKg:validWeight,capacitySlots:validSlots}
      });
      if(auditError)console.error("Brick & Ivy storage audit failed");
      return response({success:true,propertyType:type,capacityKg:validWeight,capacitySlots:validSlots,
        publicFeedRefreshSeconds:90,auditRecorded:!auditError},200,cors);
    }
    if(action==="saveWeeklyCost"){
      const body=input as Record<string,unknown>;
      const propertyId=pid(body.propertyId);
      if(!propertyId||!properties.some(r=>pid(r.property_id)===propertyId)){
        return response({error:"Property is not in the current Brick & Ivy company feed"},404,cors);
      }
      const clearing=body.weeklyCost===null;
      const proposed=body.weeklyCost;
      if(!clearing&&(typeof proposed!=="string"&&typeof proposed!=="number")){
        return response({error:"Enter a valid weekly amount or reset it"},400,cors);
      }
      const amount=clearing?null:Number(proposed);
      if(!clearing&&(!Number.isFinite(amount)||amount<0||amount>9999999999.99||Math.abs(Math.round(amount*100)-amount*100)>0.000001)){
        return response({error:"Weekly cost must be between $0 and $9,999,999,999.99 with up to two decimals"},400,cors);
      }
      const {data:before,error:previousError}=await db.from("brickivy_property_weekly_costs")
        .select("weekly_cost_override").eq("property_id",propertyId).maybeSingle();
      if(previousError)throw new Error("Could not read current property value");
      const previous=before?.weekly_cost_override===null||before?.weekly_cost_override===undefined?null:Number(before.weekly_cost_override);
      const {error:saveError}=await db.from("brickivy_property_weekly_costs")
        .upsert({property_id:propertyId,weekly_cost_override:amount,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"property_id"});
      if(saveError)throw new Error("Could not save weekly cost");
      const {error:auditError}=await db.from("brickivy_property_weekly_cost_audit")
        .insert({property_id:propertyId,previous_weekly_cost:previous,new_weekly_cost:amount,changed_by:user.id});
      if(auditError)console.error("Brick & Ivy property cost audit insert failed");
      // The public property endpoint caches its feed for up to 60 seconds.
      return response({success:true,propertyId,weeklyCostOverride:amount,publicFeedRefreshSeconds:90,auditRecorded:!auditError},200,cors);
    }
    const ids=properties.map(r=>pid(r.property_id));
    let overrides:Record<string,unknown>[]=[];
    if(ids.length){
      const {data,error}=await db.from("brickivy_property_weekly_costs")
        .select("property_id,weekly_cost_override").in("property_id",ids);
      if(error)throw new Error("Unable to load property value overrides");
      overrides=data||[];
    }
    const [listingMeta,storageMeta]=await Promise.all([
      ids.length?db.from("brickivy_property_listing_settings")
        .select("property_id,area,reserved,description,published,featured").in("property_id",ids):
        Promise.resolve({data:[],error:null}),
      db.from("brickivy_property_type_storage").select("property_type,capacity_kg,capacity_slots")
        .in("property_type",[...new Set([...STANDARD_INTERIOR_CODES,...properties.map(x=>str(x.property_type,80))])])
    ]);
    if(listingMeta.error||storageMeta.error)throw new Error("Unable to load listing settings");
    const settings=new Map((listingMeta.data||[]).map(row=>[String(row.property_id),row]));
    const storedTypes=new Map((storageMeta.data||[]).map(row=>[String(row.property_type),row]));
    const propertyTypes=[...new Set([...STANDARD_INTERIOR_CODES,...properties.map(row=>str(row.property_type,80)).filter(Boolean)])]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
    const amounts=new Map(overrides.map(x=>[String(x.property_id),x.weekly_cost_override]));
    // Names are optional. A field-restricted OPFW token may not allow the characters table.
    // Never return player names outside authenticated staff responses.
    const names=rentalAvailable?await renterNames(opfwToken,properties):new Map<number,string>();
    const propertyRows=properties.map(r=>{
      const propertyId=pid(r.property_id),raw=nonnegative(r.property_cost),stored=amounts.get(propertyId);
      const override=stored===null||stored===undefined?null:nonnegative(stored);
      const renter=rentalAvailable?Number(r.property_renter_cid):NaN;
      const renterCID=Number.isSafeInteger(renter)&&renter>0?renter:null;
      return {
        id:propertyId,blockId:str(r.block_id,80),name:str(r.property_name),address:str(r.property_address,200),
        type:str(r.property_type,80),area:settings.get(propertyId)?.area||"",
        description:str(settings.get(propertyId)?.description,3000),
        published:settings.get(propertyId)?.published!==false,
        featured:settings.get(propertyId)?.featured===true,
        reserved:settings.get(propertyId)?.reserved===true,
        storageKg:storedTypes.get(str(r.property_type,80))?.capacity_kg??null,
        storageSlots:storedTypes.get(str(r.property_type,80))?.capacity_slots??null,
        sourceWeeklyCost:raw,weeklyCostOverride:override,
        weeklyCost:override??raw,
        rented:rentalAvailable?renterCID!==null:null,
        renterCharacterId:rentalAvailable?renterCID:null,
        renterName:rentalAvailable&&renterCID!==null?names.get(renterCID)||null:null,
        propertyIncome:rentalAvailable?nonnegative(r.property_income):null,
        lastPayment:rentalAvailable?str(r.property_last_pay,80)||null:null
      };
    });
    // Income = weekly rent from rented homes only - OPFW maintenance for
    // EVERY property, including vacant, reserved and hidden homes.
    // All math is calculated in integer cents. Never show a fake $0 net when
    // OPFW occupancy, rent or maintenance data is unavailable.
    const toCents=(n:number)=>Math.round(n*100);
    const maintenanceKnown=propertyRows.every(p=>p.sourceWeeklyCost!==null);
    const rentsKnown=rentalAvailable&&propertyRows.filter(p=>p.rented===true).every(p=>p.weeklyCost!==null);
    const complete=maintenanceKnown&&rentsKnown;
    const finance=(owner||permissions.can_view_financials===true)?{
      totalProperties:propertyRows.length,
      rented:rentalAvailable?propertyRows.filter(p=>p.rented===true).length:null,
      vacant:rentalAvailable?propertyRows.filter(p=>p.rented===false).length:null,
      reserved:propertyRows.filter(p=>p.reserved).length,
      published:propertyRows.filter(p=>p.published).length,
      featured:propertyRows.filter(p=>p.published&&p.featured).length,
      complete,
      rentalRevenue:complete?propertyRows.filter(p=>p.rented).reduce((sum,p)=>sum+toCents(p.weeklyCost!),0)/100:null,
      maintenance:maintenanceKnown?propertyRows.reduce((sum,p)=>sum+toCents(p.sourceWeeklyCost!),0)/100:null,
      netWeeklyIncome:complete?(
        propertyRows.filter(p=>p.rented).reduce((sum,p)=>sum+toCents(p.weeklyCost!),0)-
        propertyRows.reduce((sum,p)=>sum+toCents(p.sourceWeeklyCost!),0)
      )/100:null,
      missingMaintenance:propertyRows.filter(p=>p.sourceWeeklyCost===null).length,
      missingRent:rentalAvailable?propertyRows.filter(p=>p.rented&&p.weeklyCost===null).length:null

    }:null;
    return response({role:owner?"owner":"realtor",permissions,rentalAvailable,
      financialSummary:finance,
      propertyTypes:propertyTypes.map(type=>({
        type,capacityKg:storedTypes.get(type)?.capacity_kg??null,
        capacitySlots:storedTypes.get(type)?.capacity_slots??null,
        propertyCount:properties.filter(p=>str(p.property_type,80)===type).length
      })),
      properties:propertyRows},200,cors);
  }catch(e){
    console.error("Brick & Ivy private property request failed:",e instanceof Error?e.message:"unknown");
    return response({error:"Unable to load private property information. Check the staff Edge Function logs."},503,cors);
  }
});