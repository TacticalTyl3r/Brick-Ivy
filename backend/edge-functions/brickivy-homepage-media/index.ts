import { createClient } from "npm:@supabase/supabase-js@2.84.0";

/* Brick & Ivy Owner-only homepage photo uploader.
 * Uploaded images can be published or rolled back through the existing
 * homepage draft/version system. Retain old files for version history.
 */
const GUILD="1001110667580932168";
const OWNER="1502871124378259526";
const BUCKET="brickivy-homepage-media";
const ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const IMAGE_KEYS=new Set(["heroImage","lsImage","sandyImage","paletoImage","aboutImage"]);
const MAX_BYTES=5*1024*1024;
const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function reply(result:unknown,status:number,cors:Record<string,string>){
 return new Response(JSON.stringify(result),{status,headers:{...JSON_HEADERS,...cors}});
}
function sniff(bytes:Uint8Array):{ext:string;mime:string}|null{
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return{ext:"jpg",mime:"image/jpeg"};
 if(bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return{ext:"png",mime:"image/png"};
 if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==="RIFF"&&String.fromCharCode(...bytes.subarray(8,12))==="WEBP")
  return{ext:"webp",mime:"image/webp"};
 return null;
}
async function isOwner(discordId:string,botToken:string){
 const response=await fetch("https://discord.com/api/v10/guilds/"+GUILD+"/members/"+discordId,{
  headers:{Authorization:"Bot "+botToken,Accept:"application/json"},signal:AbortSignal.timeout(8000)
 });
 if(response.status===404)return false;
 if(!response.ok)throw Error("Unable to verify Discord Owner role");
 const result=await response.json();
 if(!Array.isArray(result.roles))throw Error("Discord roles unavailable");
 return result.roles.includes(OWNER);
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 const cors:Record<string,string>={
  "Vary":"Origin","Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info"
 };
 if(ORIGINS.has(origin))cors["Access-Control-Allow-Origin"]=origin;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(origin&&!ORIGINS.has(origin))return reply({error:"Origin not allowed"},403,cors);
 if(request.method!=="POST")return reply({error:"Method not allowed"},405,cors);
 const token=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return reply({error:"Sign in required"},401,cors);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const bot=Deno.env.get("DISCORD_BOT_TOKEN");
 if(!url||!secret||!bot)return reply({error:"Homepage photo storage is not configured"},503,cors);
 const length=Number(request.headers.get("content-length")||0);
 if(Number.isFinite(length)&&length>MAX_BYTES+65536)
  return reply({error:"The photo must be smaller than 5 MB. Please optimize it and try again."},413,cors);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return reply({error:"Your session has expired. Sign in again."},401,cors);
  const {data:account,error:accountError}=await db.auth.admin.getUserById(user.id);
  if(accountError||!account?.user)return reply({error:"Unable to verify the signed-in account"},503,cors);
  const discord=account.user.identities?.find(x=>x.provider==="discord");
  const discordId=discord?.identity_data?.provider_id??discord?.id;
  if(typeof discordId!=="string"||!/^\d{17,20}$/.test(discordId))
    return reply({error:"A verified Discord sign-in is required"},403,cors);
  if(!await isOwner(discordId,bot))return reply({error:"Only Brick & Ivy Owners may upload homepage images"},403,cors);
  if(!request.headers.get("content-type")?.includes("multipart/form-data"))
   return reply({error:"Choose an image to upload"},400,cors);
  const form=await request.formData();
  const key=String(form.get("imageKey")||"");
  if(!IMAGE_KEYS.has(key))return reply({error:"Unknown homepage image field"},400,cors);
  const candidate=form.get("file");
  if(!(candidate instanceof File))return reply({error:"Select a JPG, PNG or WebP image"},400,cors);
  if(candidate.size===0||candidate.size>MAX_BYTES)
   return reply({error:"Homepage images must be no larger than 5 MB"},413,cors);
  const bytes=new Uint8Array(await candidate.arrayBuffer());
  const recognized=sniff(bytes);
  if(!recognized||candidate.type!==recognized.mime)
   return reply({error:"Please upload a genuine JPG, PNG or WebP image"},400,cors);
  const keyPath="homepage/"+key+"/"+crypto.randomUUID()+"."+recognized.ext;
  const uploaded=await db.storage.from(BUCKET).upload(keyPath,bytes,{
   contentType:recognized.mime,cacheControl:"3600",upsert:false
  });
  if(uploaded.error){
   console.error("Brick & Ivy homepage image storage failed:",uploaded.error.message);
   return reply({error:"Storage rejected this image. Please try again."},502,cors);
  }
  return reply({
   success:true,imageKey:key,
   url:db.storage.from(BUCKET).getPublicUrl(keyPath).data.publicUrl,
   message:"Image uploaded. Save Draft and Publish to make it live."
  },200,cors);
 }catch(error){
  console.error("Brick & Ivy homepage image upload failed:",error instanceof Error?error.message:"Unknown error");
  return reply({error:"Photo upload failed. Please retry or use a smaller JPG, PNG or WebP."},503,cors);
 }
});