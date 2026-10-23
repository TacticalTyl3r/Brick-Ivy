import { createClient } from "npm:@supabase/supabase-js@2.84.0";
/** Brick & Ivy Homepage Media: public image delivery, Owner-only write/list/delete. */
const GUILD="1001110667580932168",OWNER="1502871124378259526";
const BUCKET="brickivy-homepage-media",MAX_BYTES=5*1024*1024,MAX_FILES=120;
const ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const IMAGE_FIELDS=["heroImage","lsImage","sandyImage","paletoImage","aboutImage"];
const KEY=/^images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const reply=(obj:unknown,status=200,origin="")=>new Response(JSON.stringify(obj),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "Vary":"Origin","X-Content-Type-Options":"nosniff",
  ...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{})
}});
const shape=(db:ReturnType<typeof createClient>,r:Record<string,unknown>)=>({
 id:r.id,objectKey:r.object_key,filename:r.filename,mime:r.mime_type,size:r.size_bytes,
 createdAt:r.created_at,url:db.storage.from(BUCKET).getPublicUrl(String(r.object_key)).data.publicUrl
});
function signature(bytes:Uint8Array):{mime:string;ext:string}|null{
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return{mime:"image/jpeg",ext:"jpg"};
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))return{mime:"image/png",ext:"png"};
 if(bytes.length>=12&&[82,73,70,70].every((x,i)=>bytes[i]===x)&&[87,69,66,80].every((x,i)=>bytes[i+8]===x))return{mime:"image/webp",ext:"webp"};
 return null;
}
async function verifyOwner(db:ReturnType<typeof createClient>,jwt:string,bot:string){
 const {data:{user},error}=await db.auth.getUser(jwt);
 if(error||!user)return null;
 const {data:account,error:accountError}=await db.auth.admin.getUserById(user.id);
 if(accountError||!account?.user)return null;
 const discord=account.user.identities?.find(i=>i.provider==="discord");
 const discordId=discord?.identity_data?.provider_id??discord?.id;
 if(typeof discordId!=="string"||!/^\d{17,20}$/.test(discordId))return null;
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8000);
 try{
  const check=await fetch("https://discord.com/api/v10/guilds/"+GUILD+"/members/"+discordId,{
    headers:{Authorization:"Bot "+bot,Accept:"application/json"},signal:ctrl.signal
  });
  if(check.status===404)return null;
  if(!check.ok)throw Error("Discord role service unavailable");
  const member=await check.json();
  return Array.isArray(member.roles)&&member.roles.includes(OWNER)?user:null;
 }finally{clearTimeout(timer)}
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"
 }});
 if(origin&&!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403,origin);
 if(request.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 const jwt=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!jwt)return reply({error:"Sign in required"},401,origin);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),bot=Deno.env.get("DISCORD_BOT_TOKEN");
 if(!url||!key||!bot)return reply({error:"Media backend not configured"},503,origin);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const user=await verifyOwner(db,jwt,bot);
  if(!user)return reply({error:"Only a verified Brick & Ivy Owner may manage homepage images"},403,origin);
  const contentType=request.headers.get("content-type")||"";
  let action="",file:File|null=null,objectKey="";
  if(contentType.includes("multipart/form-data")){
   const form=await request.formData();action=String(form.get("action")||"");
   const candidate=form.get("file");if(candidate instanceof File)file=candidate;
  }else{
   if(!contentType.includes("application/json"))return reply({error:"Unsupported request"},415,origin);
   const body=await request.json();
   if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Invalid request"},400,origin);
   action=String(body.action||"");objectKey=String(body.objectKey||"");
  }
  if(!["list","upload","delete"].includes(action))return reply({error:"Unsupported action"},400,origin);
  const list=()=>db.from("brickivy_homepage_media")
    .select("id,object_key,filename,mime_type,size_bytes,created_at")
    .order("created_at",{ascending:false}).limit(MAX_FILES);
  if(action==="list"){
   const {data,error}=await list();
   if(error)throw Error("Could not read image library");
   return reply({images:(data||[]).map(row=>shape(db,row)),limit:MAX_FILES,maxBytes:MAX_BYTES},200,origin);
  }
  if(action==="upload"){
   if(!file||file.size<1||file.size>MAX_BYTES)return reply({error:"Choose an image no larger than 5 MB"},400,origin);
   const bytes=new Uint8Array(await file.arrayBuffer()),type=signature(bytes);
   if(!type||file.type!==type.mime)return reply({error:"Only verified JPEG, PNG or WebP files are accepted"},400,origin);
   const {count,error:countError}=await db.from("brickivy_homepage_media").select("*",{count:"exact",head:true});
   if(countError)throw Error("Could not check media library size");
   if((count||0)>=MAX_FILES)return reply({error:"Media library is full. Remove unused images before uploading."},409,origin);
   const key="images/"+crypto.randomUUID()+"."+type.ext;
   const uploaded=await db.storage.from(BUCKET).upload(key,bytes,{
    contentType:type.mime,cacheControl:"3600",upsert:false
   });
   if(uploaded.error)throw Error("Could not upload image");
   const {data, error}=await db.from("brickivy_homepage_media").insert({
    object_key:key,filename:(file.name.trim()||"Homepage image").slice(0,160),
    mime_type:type.mime,size_bytes:bytes.length,uploaded_by:user.id
   }).select("id,object_key,filename,mime_type,size_bytes,created_at").single();
   if(error){
    await db.storage.from(BUCKET).remove([key]);
    throw Error("Could not register uploaded image");
   }
   return reply({success:true,image:shape(db,data)},201,origin);
  }
  if(!KEY.test(objectKey))return reply({error:"Invalid image path"},400,origin);
  const {data:entry,error:recordError}=await db.from("brickivy_homepage_media")
    .select("id,object_key").eq("object_key",objectKey).maybeSingle();
  if(recordError)throw Error("Media record lookup failed");
  if(!entry)return reply({error:"Image not found"},404,origin);
  const {data:content,error:readError}=await db.from("brickivy_homepage_content")
    .select("published_content,draft_content").eq("id",1).single();
  if(readError||!content)throw Error("Homepage reference check failed");
  const imgUrl=db.storage.from(BUCKET).getPublicUrl(objectKey).data.publicUrl;
  for(const saved of [content.published_content,content.draft_content]){
   if(saved&&typeof saved==="object"&&IMAGE_FIELDS.some(field=>(saved as Record<string,unknown>)[field]===imgUrl)){
    return reply({error:"Image is used by the published homepage or a saved draft. Replace it and save/publish before deleting."},409,origin);
   }
  }
  // First remove database record then storage file; if storage deletion fails,
  // re-register metadata so Owners can retry.
  const removed=await db.storage.from(BUCKET).remove([objectKey]);
  if(removed.error)throw Error("Could not remove image");
  const {error:deleteError}=await db.from("brickivy_homepage_media").delete().eq("id",entry.id);
  if(deleteError)throw Error("Image removed, but media registry cleanup failed");
  return reply({success:true},200,origin);
 }catch(error){
  console.error("Brick & Ivy homepage media failed:",error instanceof Error?error.message:"unknown");
  return reply({error:"Media request failed. Check the private function logs."},503,origin);
 }
});