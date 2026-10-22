import { createClient } from "npm:@supabase/supabase-js@2.84.0";

/** Brick & Ivy — public directory backed by protected Supabase and OPFW APIs.
 * Only published, Owner-approved Realtor profiles are displayed.
 * OPFW character records enrich authorized profiles with mugshot/phone.
 * Online status checks run server-side; a failed check is UNKNOWN, not offline.
 * Never expose OPFW REST token, license identifiers or unrelated players.
 */
const OPFW_CHARACTERS="https://opfw.gg/api/rest/1973/characters";
const OPFW_PLAYERS="https://p323.fivem.opfw.me/op-framework/players.json";
const RELEVANT_ORIGINS=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
type DirectoryRecord={
 character_id:number|string;
 name:string;role_label:string;title:string;in_game_phone:string;
 discord_username:string;discord_user_id:string;photo_url:string;
 email:string;bio:string;published:boolean;display_order:number;
};
type CharacterRow={
 character_id?:number|string;first_name?:string;last_name?:string;
 phone_number?:string;mugshot_url?:string;license_identifier?:string;
};
const text=(v:unknown,max=255)=>typeof v==="string"?v.trim().slice(0,max):"";
const goodCid=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0&&Number(v)<2147483647;
const safePhoto=(v:unknown)=>{
 const raw=text(v,2048);
 if(raw.startsWith("assets/realtors/")&&/^[\w./-]+$/.test(raw)&&!raw.includes(".."))return raw;
 try{const url=new URL(raw);return url.protocol==="https:"?url.href:"";}catch{return"";}
};
const headers=(origin:string)=>({
 "Content-Type":"application/json; charset=utf-8",
 "Access-Control-Allow-Origin":RELEVANT_ORIGINS.has(origin)?origin:"*",
 "Access-Control-Allow-Methods":"GET,OPTIONS",
 "Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info",
 "Cache-Control":"public,max-age=15,s-maxage=30",
 "Vary":"Origin",
 "X-Content-Type-Options":"nosniff"
});
const json=(data:unknown,status=200,origin="")=>
 new Response(JSON.stringify(data),{status,headers:headers(origin)});

async function characterData(token:string,cids:number[]):Promise<Map<number,CharacterRow>>{
 const endpoint=new URL(OPFW_CHARACTERS);
 endpoint.searchParams.set("select","character_id,first_name,last_name,phone_number,mugshot_url");
 endpoint.searchParams.set("where","character_id="+cids.join("|"));
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),7500);
 try{
  const response=await fetch(endpoint.toString(),{
   headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:ctrl.signal
  });
  if(!response.ok)throw Error("OPFW characters HTTP "+response.status);
  const payload=await response.json();
  if(!payload||!Array.isArray(payload.data)||payload.data.length>cids.length)
   throw Error("Unexpected OPFW character response");
  const allowed=new Set(cids),byCid=new Map<number,CharacterRow>();
  for(const row of payload.data){
   const id=Number(row?.character_id);
   if(allowed.has(id))byCid.set(id,row);
  }
  return byCid;
 }finally{clearTimeout(timer)}
}
function playersFrom(payload:unknown):Record<string,unknown>[]{
 const outer=payload as {data?:unknown;players?:unknown}|null;
 const source=outer&&typeof outer==="object"&&"data" in outer?outer.data:payload;
 const nested=source as {players?:unknown}|null;
 const arr=Array.isArray(source)?source:nested&&Array.isArray(nested.players)?nested.players:null;
 if(!arr||arr.length>1024)throw Error("Unexpected players API response");
 return arr.filter(x=>x&&typeof x==="object");
}
async function onlineCids(cids:number[]):Promise<Set<number>>{
 const endpoint=new URL(OPFW_PLAYERS);
 endpoint.searchParams.set("characterId",cids.join(","));
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),7500);
 try{
  const result=await fetch(endpoint.toString(),{headers:{Accept:"application/json"},signal:ctrl.signal});
  if(!result.ok)throw Error("OPFW players HTTP "+result.status);
  const rows=playersFrom(await result.json());
  const allowed=new Set(cids),online=new Set<number>();
  for(const row of rows){
   const character=row.character as {id?:unknown}|undefined;
   const cid=Number(character?.id);
   if(allowed.has(cid))online.add(cid);
  }
  return online;
 }finally{clearTimeout(timer)}
}

Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return json({},200,origin);
 if(req.method!=="GET")return json({error:"Method not allowed"},405,origin);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return json({error:"Directory not configured"},503,origin);
 try{
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.from("brickivy_realtors")
   .select("character_id,name,role_label,title,in_game_phone,discord_username,discord_user_id,photo_url,email,bio,published,display_order")
   .eq("published",true).order("display_order",{ascending:true}).limit(100);
  if(error)throw Error("Directory query failed");
  const profiles=(data||[]) as DirectoryRecord[];
  const cids=[...new Set(profiles.map(p=>Number(p.character_id)).filter(goodCid))];
  let details=new Map<number,CharacterRow>(),online:Set<number>|null=null;
  if(cids.length){
   const token=Deno.env.get("OPFW_REST_TOKEN");
   const [characters,players]=await Promise.allSettled([
    token?characterData(token,cids):Promise.resolve(new Map<number,CharacterRow>()),
    onlineCids(cids)
   ]);
   if(characters.status==="fulfilled")details=characters.value;
   else console.warn("Brick & Ivy character enrichment temporarily unavailable:",characters.reason instanceof Error?characters.reason.message:"unknown");
   if(players.status==="fulfilled")online=players.value;
   else console.warn("Brick & Ivy online status temporarily unavailable:",players.reason instanceof Error?players.reason.message:"unknown");
  }
  return json(profiles.map(r=>{
   const cid=Number(r.character_id),character=details.get(cid);
   const sourcePhone=text(character?.phone_number,35);
   const mugshot=safePhoto(character?.mugshot_url);
   return {
    characterId:r.character_id,
    name:r.name,
    role:r.role_label,
    title:r.title,
    inGamePhone:text(r.in_game_phone,35)||sourcePhone,
    discordUsername:r.discord_username,
    discordId:r.discord_user_id,
    photo:safePhoto(r.photo_url),
    mugshotUrl:mugshot,
    email:r.email,
    bio:r.bio,
    published:true,
    displayOrder:r.display_order,
    onlineStatus:online===null?"unknown":online.has(cid)?"available":"unavailable"
   };
  }),200,origin);
 }catch(error){
  console.error("Brick & Ivy public Realtor directory failed:",error instanceof Error?error.message:"unknown");
  return json({error:"Directory temporarily unavailable"},503,origin);
 }
});
