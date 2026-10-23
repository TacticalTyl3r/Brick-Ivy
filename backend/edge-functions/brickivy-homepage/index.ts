import { createClient } from "npm:@supabase/supabase-js@2.84.0";

/** Brick & Ivy public homepage content + Owner-only draft/publish API. */
const GUILD_ID="1001110667580932168",OWNER_ROLE_ID="1502871124378259526";
const ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const DEFAULTS={
 heroEyebrow:"Welcome to Brick & Ivy Real Estate",
 heroLead:"Your next chapter",heroHighlight:"starts here.",
 heroDescription:"Thoughtfully selected spaces, personal guidance, and a place to belong. Discover real estate across San Andreas with the Brick & Ivy team.",
 heroImage:"https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1800&q=85",
 heroImageAlt:"Elegant contemporary home surrounded by greenery",heroCaption:"Imagery for illustration",
 heroPrimaryText:"Explore properties",heroSecondaryText:"Get to know us",
 searchTitle:"Find your place.",searchSubtitle:"Start your property search",
 collectionEyebrow:"The property collection",collectionLead:"A space to make",collectionHighlight:"your own.",
 collectionDescription:"Explore homes and properties offered by Brick & Ivy. Every published listing will appear here with pricing and photos.",
 neighborhoodsEyebrow:"Explore San Andreas",neighborhoodsLead:"Find your kind",neighborhoodsHighlight:"of place.",
 neighborhoodsDescription:"From the heart of the city to peaceful surroundings, there's a neighborhood for every way of life.",
 lsImage:"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",
 sandyImage:"https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=900&q=80",
 paletoImage:"https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=900&q=80",
 aboutEyebrow:"A more personal approach",aboutLead:"More than a home.",aboutHighlight:"A fresh start.",
 aboutDescription:"At Brick & Ivy, we believe finding a property should feel personal. Whether you're making your first move or searching for something new, our Realtors are here to help you find the right fit.",
 aboutImage:"https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1000&q=85",
 ctaEyebrow:"Brick & Ivy Real Estate",ctaLead:"The right place changes",ctaHighlight:"everything.",
 ctaDescription:"Ready to take a look? Explore our published properties or get in touch with a Brick & Ivy Realtor in Legendary Roleplay.",
 ctaButton:"Meet our Realtors",
 announcementText:"",announcementEnabled:false,
 showFeatured:true,showNeighborhoods:true,showAbout:true,showCta:true,
 homeTheme:"classic",primaryColor:"#244436",accentColor:"#b39a70",
 heroLayout:"split",featuredLayout:"three",neighborhoodLayout:"cards",aboutLayout:"image-left",
 sectionOrder:["featured","neighborhoods","about","contact"]
};
type Field=keyof typeof DEFAULTS;
const textKeys=Object.keys(DEFAULTS).filter(key=>typeof DEFAULTS[key as Field]==="string");
const imageKeys=new Set(["heroImage","lsImage","sandyImage","paletoImage","aboutImage"]);
const toggleKeys=Object.keys(DEFAULTS).filter(key=>typeof DEFAULTS[key as Field]==="boolean");
const enumFields:Record<string,string[]>={
 homeTheme:["classic","forest","coastal","slate","warm"],
 heroLayout:["split","stacked","image-focus"],
 featuredLayout:["three","two","compact"],
 neighborhoodLayout:["cards","compact"],
 aboutLayout:["image-left","image-right","text-first"]
};
const SECTIONS=["featured","neighborhoods","about","contact"];
function validOrder(value:unknown):value is string[]{
 return Array.isArray(value)&&value.length===SECTIONS.length&&
  value.every(x=>typeof x==="string")&&new Set(value).size===SECTIONS.length&&
  SECTIONS.every(x=>value.includes(x));
}
function clean(content:unknown):Record<string,string|boolean|string[]>{
 if(!content||typeof content!=="object"||Array.isArray(content))throw Error("Homepage content must be an object");
 const values=content as Record<string,unknown>,out:Record<string,string|boolean>={};
 if(Object.keys(values).some(k=>!(k in DEFAULTS)))throw Error("Unknown homepage field");
 for(const key of textKeys){
  const raw=values[key];
  if(typeof raw!=="string")throw Error("Invalid field: "+key);
  const value=raw.trim();
  const max=imageKeys.has(key)?2048:key.endsWith("Description")?1500:200;
  if(value.length>max)throw Error(key+" exceeds "+max+" characters");
  if(enumFields[key]&&!enumFields[key].includes(value))throw Error("Invalid homepage layout or theme: "+key);
  if(["primaryColor","accentColor"].includes(key)&&!/^#[0-9a-fA-F]{6}$/.test(value))throw Error("Use a six-digit hexadecimal color for "+key);
  if(imageKeys.has(key)){
   try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password)throw Error();}
   catch{throw Error("Images must be valid HTTPS URLs");}
  }
  if((!key.startsWith("announcement")&&!imageKeys.has(key))&&value.length===0){
   // Don't permit accidentally removing a mandatory heading/button label.
   if(!["heroCaption"].includes(key))throw Error(key+" cannot be empty");
  }
  out[key]=value;
 }
 for(const key of toggleKeys){
  if(typeof values[key]!=="boolean")throw Error("Invalid visibility field: "+key);
  out[key]=values[key] as boolean;
 }
 if(!validOrder(values.sectionOrder))throw Error("Section order must contain each editable section once");
 return {...out,sectionOrder:[...values.sectionOrder]};
}
const merge=(stored:unknown)=>{
 const fields={...DEFAULTS,sectionOrder:[...DEFAULTS.sectionOrder]} as Record<string,string|boolean|string[]>;
 if(stored&&typeof stored==="object"&&!Array.isArray(stored)){
  for(const key of Object.keys(DEFAULTS)){
   const value=(stored as Record<string,unknown>)[key];
   if(key==="sectionOrder"){
    if(validOrder(value))fields[key]=[...value];
   }else if(typeof value===typeof DEFAULTS[key as Field])fields[key]=value as string|boolean;
  }
 }
 return fields;
};
function reply(value:unknown,status=200,origin="",privateResponse=false){
 const headers:Record<string,string>={
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","Vary":"Origin","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info"
 };
 if(ORIGINS.has(origin))headers["Access-Control-Allow-Origin"]=origin;
 return new Response(JSON.stringify(value),{status,headers});
}
async function memberIsOwner(discordId:string,botToken:string){
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);
 try{
  const res=await fetch("https://discord.com/api/v10/guilds/"+GUILD_ID+"/members/"+discordId,{
   headers:{Authorization:"Bot "+botToken,Accept:"application/json"},signal:ctrl.signal
  });
  if(res.status===404)return false;
  if(!res.ok)throw Error("Discord role check unavailable");
  const data=await res.json();
  if(!Array.isArray(data.roles))throw Error("Unexpected Discord role response");
  return data.roles.includes(OWNER_ROLE_ID);
 }finally{clearTimeout(timeout)}
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"
 }});
 if(origin&&!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403,origin);
 if(!["GET","POST"].includes(req.method))return reply({error:"Method not allowed"},405,origin);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return reply({error:"Homepage backend unavailable"},503,origin);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(req.method==="GET"){
   const {data,error}=await db.from("brickivy_homepage_content")
    .select("published_content,published_at").eq("id",1).single();
   if(error)throw Error("Homepage lookup failed");
   return reply({content:merge(data.published_content),publishedAt:data.published_at},200,origin);
  }
  const jwt=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!jwt)return reply({error:"Sign in required"},401,origin);
  const {data:{user},error:authError}=await db.auth.getUser(jwt);
  if(authError||!user)return reply({error:"Invalid session"},401,origin);
  const {data:account,error:accountError}=await db.auth.admin.getUserById(user.id);
  if(accountError||!account?.user)return reply({error:"Account unavailable"},503,origin);
  const discord=account.user.identities?.find(x=>x.provider==="discord");
  const discordId=discord?.identity_data?.provider_id??discord?.id;
  if(typeof discordId!=="string"||!/^\d{17,20}$/.test(discordId))return reply({error:"Discord identity required"},403,origin);
  const bot=Deno.env.get("DISCORD_BOT_TOKEN");
  if(!bot)throw Error("Discord verification unavailable");
  if(!await memberIsOwner(discordId,bot))return reply({error:"Brick & Ivy Owner role required"},403,origin);
  const requestBody=await req.json();
  if(!requestBody||typeof requestBody!=="object"||Array.isArray(requestBody))return reply({error:"Invalid request"},400,origin);
  const body=requestBody as Record<string,unknown>;
  const action=body.action;
  const {data:current,error:readError}=await db.from("brickivy_homepage_content")
   .select("published_content,draft_content,revision,published_at").eq("id",1).single();
  if(readError||!current)throw Error("Homepage settings unavailable");
  if(action==="load"){
   return reply({draft:merge(current.draft_content),published:merge(current.published_content),
    revision:Number(current.revision),publishedAt:current.published_at},200,origin,true);
  }
  if(!["saveDraft","publish","resetDraft","restoreDefaults","restoreVersion"].includes(String(action)))
   return reply({error:"Unknown homepage action"},400,origin);
  const revision=body.revision;
  if(!Number.isSafeInteger(revision)||Number(revision)<0)return reply({error:"Invalid revision"},400,origin);
  if(Number(revision)!==Number(current.revision))return reply({error:"Homepage was edited in another session. Reload before saving."},409,origin);
  let nextDraft=current.draft_content,nextPublished=current.published_content;
  const update:Record<string,unknown>={revision:Number(revision)+1,updated_by:user.id,updated_at:new Date().toISOString()};
  if(action==="saveDraft"){
   try{nextDraft=clean(body.content);}catch(err){return reply({error:err instanceof Error?err.message:"Invalid content"},400,origin);}
   update.draft_content=nextDraft;
  }else if(action==="publish"){
   nextPublished=clean(merge(current.draft_content));
   update.published_content=nextPublished;
   update.published_at=new Date().toISOString();
  }else if(action==="resetDraft"){
   nextDraft=merge(current.published_content);
   update.draft_content=nextDraft;
  }else if(action==="restoreVersion"){
   const versionId=body.versionId;
   if(typeof versionId!=="number"||!Number.isSafeInteger(versionId)||versionId<1)
    return reply({error:"Select a valid published homepage version"},400,origin);
   const {data:historical,error:historyError}=await db.from("brickivy_homepage_audit")
    .select("id,action,after_content").eq("id",versionId).eq("action","publish").maybeSingle();
   if(historyError)throw Error("Could not read previous homepage version");
   if(!historical)return reply({error:"That published homepage version no longer exists"},404,origin);
   nextDraft=clean(merge(historical.after_content));
   update.draft_content=nextDraft;
  }else{
   nextDraft={...DEFAULTS,sectionOrder:[...DEFAULTS.sectionOrder]};
   update.draft_content=nextDraft;
  }
  const {data:changed,error:saveError}=await db.from("brickivy_homepage_content")
   .update(update).eq("id",1).eq("revision",Number(revision))
   .select("revision,published_at").maybeSingle();
  if(saveError)throw Error("Could not save homepage");
  if(!changed)return reply({error:"Homepage changed in another session. Reload before saving."},409,origin);
  const {error:auditError}=await db.from("brickivy_homepage_audit").insert({
   actor:user.id,action:action==="saveDraft"?"save_draft":action==="publish"?"publish":action==="restoreVersion"?"restore_draft":"reset_draft",
   before_content:action==="publish"?current.published_content:current.draft_content,
   after_content:action==="publish"?nextPublished:nextDraft
  });
  if(auditError)console.error("Homepage audit insert unavailable");
  return reply({success:true,revision:Number(changed.revision),draft:merge(nextDraft),
   published:merge(nextPublished),publishedAt:changed.published_at,auditRecorded:!auditError},200,origin,true);
 }catch(error){
  console.error("Brick & Ivy homepage request failed:",error instanceof Error?error.message:"unknown");
  return reply({error:"Homepage service unavailable. Check the Edge Function logs."},503,origin);
 }
});
