import { createClient } from "npm:@supabase/supabase-js@2.84.0";
/* Public images, private mutation. Never use browser-held Supabase service keys. */
const GUILD="1001110667580932168",OWNER="1502871124378259526",REALTOR="1502870035176357968";
const BUCKET="brickivy-property-photos";
const OPFW_URL="https://opfw.gg/api/rest/1973/stocks_company_properties";
const ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGES=24,MAX_BYTES=6*1024*1024;
type Photo={id:string;property_id:string;object_key:string;original_filename:string;display_order:number;is_cover:boolean};
const resp=(data:unknown,status=200,h:Record<string,string>={})=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...h}
});
const fileShape=(db:ReturnType<typeof createClient>,p:Photo)=>({
 id:p.id,propertyId:p.property_id,filename:p.original_filename,
 url:db.storage.from(BUCKET).getPublicUrl(p.object_key).data.publicUrl,
 order:p.display_order,cover:p.is_cover
});
async function companyProperty(token:string,propertyId:string){
 const url=new URL(OPFW_URL);
 url.searchParams.set("select","company_id,property_id");
 url.searchParams.set("where","company_id=5");
 const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),12000);
 try{
  const res=await fetch(url,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:ctrl.signal});
  if(!res.ok)throw Error("OPFW property lookup failed");
  const data=await res.json();
  if(!Array.isArray(data?.data)||data.data.length>1000)throw Error("Unexpected OPFW company properties");
  // Fail closed if the source returns any other company's records.
  if(data.data.some((p:Record<string,unknown>)=>Number(p.company_id)!==5))throw Error("Unexpected company record");
  return data.data.some((p:Record<string,unknown>)=>String(p.property_id)===propertyId);
 }finally{clearTimeout(t)}
}
function sniffImage(bytes:Uint8Array):{ext:string;mime:string}|null{
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return{ext:"jpg",mime:"image/jpeg"};
 if(bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return{ext:"png",mime:"image/png"};
 if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==="RIFF"&&String.fromCharCode(...bytes.subarray(8,12))==="WEBP")return{ext:"webp",mime:"image/webp"};
 return null;
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const cors:Record<string,string>={
  "Vary":"Origin","Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info"
 };
 if(ORIGINS.has(origin))cors["Access-Control-Allow-Origin"]=origin;
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(origin&&!ORIGINS.has(origin))return resp({error:"Origin not allowed"},403,cors);
 if(req.method!=="POST")return resp({error:"Method not allowed"},405,cors);
 const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return resp({error:"Sign in required"},401,cors);
 const dbUrl=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  bot=Deno.env.get("DISCORD_BOT_TOKEN"),opfw=Deno.env.get("OPFW_REST_TOKEN");
 if(!dbUrl||!key||!bot||!opfw)return resp({error:"Photo backend setup incomplete"},503,cors);
 const db=createClient(dbUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return resp({error:"Invalid session"},401,cors);
  const {data:account,error:lookupError}=await db.auth.admin.getUserById(user.id);
  if(lookupError||!account?.user)return resp({error:"Account unavailable"},503,cors);
  const discord=account.user.identities?.find(identity=>identity.provider==="discord");
  const did=discord?.identity_data?.provider_id??discord?.id;
  if(typeof did!=="string"||!/^\d{17,20}$/.test(did))return resp({error:"Discord sign-in required"},403,cors);
  const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),8000);
  let roles:string[]=[];
  try{
    const result=await fetch(`https://discord.com/api/v10/guilds/${GUILD}/members/${did}`,{
      headers:{Authorization:"Bot "+bot,Accept:"application/json"},signal:ctrl.signal
    });
    if(result.status!==404){
      if(!result.ok)throw Error("Discord membership lookup failed");
      const record=await result.json();
      if(!Array.isArray(record.roles))throw Error("Invalid guild member response");
      roles=record.roles.filter((r:unknown)=>typeof r==="string");
    }
  }finally{clearTimeout(t)}
  const owner=roles.includes(OWNER),staff=owner||roles.includes(REALTOR);
  if(!staff)return resp({error:"Brick & Ivy staff role required"},403,cors);
  let action="",propertyId="",file:File|null=null,body:Record<string,unknown>={};
  if(req.headers.get("content-type")?.includes("multipart/form-data")){
    const form=await req.formData();
    action=String(form.get("action")||"");propertyId=String(form.get("propertyId")||"");
    const part=form.get("file");if(part instanceof File)file=part;
  }else{
    const input=await req.json();
    if(!input||typeof input!=="object"||Array.isArray(input))return resp({error:"Invalid request"},400,cors);
    body=input as Record<string,unknown>;action=String(body.action||"");propertyId=String(body.propertyId||"");
  }
  if(!["list","upload","delete","cover","reorder"].includes(action))return resp({error:"Unsupported photo action"},400,cors);
  // Only a verified Realtor with an explicit Owner grant may mutate photos.
  // A missing permissions row always denies photo edits.
  if(action!=="list"&&!owner){
    const {data:permission,error:e}=await db.from("brickivy_realtor_permissions")
      .select("can_manage_photos").eq("discord_user_id",did).maybeSingle();
    if(e)throw Error("Unable to verify gallery permissions");
    if(permission?.can_manage_photos!==true)return resp({error:"Owner has not granted photo management access"},403,cors);
  }
  if(!ID.test(propertyId))return resp({error:"Invalid property ID"},400,cors);
  // Check actual OPFW company membership before listing or mutating files.
  if(!await companyProperty(opfw,propertyId))return resp({error:"Property is not in Brick & Ivy company stock"},404,cors);
  const read=()=>db.from("brickivy_property_photos")
    .select("id,property_id,object_key,original_filename,display_order,is_cover")
    .eq("property_id",propertyId).order("display_order",{ascending:true}).order("id",{ascending:true});
  const {data:current,error:readError}=await read();
  if(readError)throw Error("Unable to read gallery");
  const items=(current||[]) as Photo[];
  if(action==="list")return resp({photos:items.map(x=>fileShape(db,x)),maxImages:MAX_IMAGES,role:owner?"owner":"realtor"},200,cors);
  if(action==="upload"){
    if(!file)return resp({error:"Select a JPEG, PNG or WebP image"},400,cors);
    if(!file.size||file.size>MAX_BYTES)return resp({error:"Each image must be 6 MB or smaller"},400,cors);
    if(items.length>=MAX_IMAGES)return resp({error:"This property has reached its 24-photo limit"},409,cors);
    const bytes=new Uint8Array(await file.arrayBuffer()),signature=sniffImage(bytes);
    if(!signature||signature.mime!==file.type)return resp({error:"Only genuine JPEG, PNG and WebP images are supported"},400,cors);
    const storagePath=propertyId+"/"+crypto.randomUUID()+"."+signature.ext;
    const result=await db.storage.from(BUCKET).upload(storagePath,bytes,{
      contentType:signature.mime,cacheControl:"3600",upsert:false
    });
    if(result.error)throw Error("Unable to upload property image");
    const isFirst=items.length===0;
    const maxOrder=Math.max(-1,...items.map(x=>Number(x.display_order)||0));
    const {error:writeError}=await db.from("brickivy_property_photos").insert({
      property_id:propertyId,object_key:storagePath,original_filename:file.name.slice(0,150),
      display_order:maxOrder+1,is_cover:isFirst,created_by:user.id
    });
    if(writeError){
      await db.storage.from(BUCKET).remove([storagePath]);
      throw Error("Unable to save photo details");
    }
  }else if(action==="delete"){
    const id=String(body.photoId||"");if(!UUID.test(id))return resp({error:"Invalid photo ID"},400,cors);
    const photo=items.find(x=>x.id===id);if(!photo)return resp({error:"Photo not found"},404,cors);
    const removed=await db.storage.from(BUCKET).remove([photo.object_key]);
    if(removed.error)throw Error("Unable to remove stored image");
    const {error:e}=await db.from("brickivy_property_photos").delete().eq("id",photo.id).eq("property_id",propertyId);
    if(e)throw Error("Unable to delete photo record");
    if(photo.is_cover){
      const remaining=items.filter(x=>x.id!==id);
      if(remaining.length){
        const {error:coverError}=await db.from("brickivy_property_photos").update({is_cover:true})
          .eq("id",remaining[0].id).eq("property_id",propertyId);
        if(coverError)throw Error("Cover selection could not be updated");
      }
    }
  }else if(action==="cover"){
    const id=String(body.photoId||"");
    if(!UUID.test(id)||!items.some(x=>x.id===id))return resp({error:"Photo not found"},404,cors);
    const cleared=await db.from("brickivy_property_photos").update({is_cover:false}).eq("property_id",propertyId);
    if(cleared.error)throw Error("Unable to clear previous cover");
    const chosen=await db.from("brickivy_property_photos").update({is_cover:true})
      .eq("property_id",propertyId).eq("id",id);
    if(chosen.error)throw Error("Unable to set cover photo");
  }else if(action==="reorder"){
    const ids=body.ids;
    if(!Array.isArray(ids)||ids.length!==items.length||new Set(ids).size!==items.length||
      !ids.every(v=>typeof v==="string"&&items.some(x=>x.id===v))){
      return resp({error:"Gallery changed. Refresh before reordering"},409,cors);
    }
    // Preserve covers; update only relative order.
    for(let i=0;i<ids.length;i++){
      const updated=await db.from("brickivy_property_photos").update({display_order:i}).eq("id",ids[i]).eq("property_id",propertyId);
      if(updated.error)throw Error("Unable to reorder gallery");
    }
  }
  const {data:updated,error:finalError}=await read();
  if(finalError)throw Error("Unable to reload gallery");
  return resp({success:true,photos:(updated||[]).map(x=>fileShape(db,x as Photo)),refreshSeconds:90},200,cors);
 }catch(error){
  console.error("Brick & Ivy photo API failed:",error instanceof Error?error.message:"unknown");
  return resp({error:"Could not complete the photo request. Check the private function logs."},503,cors);
 }
});
