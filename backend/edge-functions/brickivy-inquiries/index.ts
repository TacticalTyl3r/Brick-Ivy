import {createClient} from "npm:@supabase/supabase-js@2.84.0";
const origins=new Set(["https://brickandivyhomes.com","https://www.brickandivyhomes.com"]);
const send=(data:unknown,status=200,origin="")=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store",...(origins.has(origin)?{"access-control-allow-origin":origin}:{}),"access-control-allow-headers":"content-type,authorization,apikey","access-control-allow-methods":"POST,OPTIONS","vary":"Origin"}});

/** Send as the existing Brick & Ivy Discord bot, never as the webhook identity.
 * The saved webhook is used ONLY to discover its channel when no channel ID is configured.
 */
/** Sends through Discord's bot API; webhook URL is metadata-only channel discovery. */
async function sendInquiryAsBot(payload:unknown):Promise<{sent:boolean;configured:boolean;reason:string;botName?:string}>{
 const token=(Deno.env.get("DISCORD_BOT_TOKEN")||"").trim();
 const configuredChannel=(Deno.env.get("BRICKIVY_INQUIRY_DISCORD_CHANNEL_ID")||"").trim();
 const webhook=(Deno.env.get("BRICKIVY_INQUIRY_DISCORD_WEBHOOK")||"").trim();
 if(!token)return {sent:false,configured:false,reason:"The Brick & Ivy Discord bot token is not configured"};
 if(!configuredChannel&&!webhook)return {sent:false,configured:false,reason:"No notification channel or webhook has been configured"};
 const base="https://discord.com/api/v10";
 try{
  const meRes=await fetch(base+"/users/@me",{
    headers:{Authorization:"Bot "+token,Accept:"application/json"},signal:AbortSignal.timeout(7000)
  });
  if(!meRes.ok)return {sent:false,configured:true,reason:"The Discord bot token was rejected (HTTP "+meRes.status+")"};
  const me=await meRes.json();
  const botName=String(me.global_name||me.username||"Discord bot").slice(0,80);
  if(me.bot!==true)return {sent:false,configured:true,reason:"Configured token does not represent a Discord bot"};
  let channelId=configuredChannel;
  if(!channelId){
   if(!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(webhook))
    return {sent:false,configured:true,reason:"Saved notification webhook has an invalid URL",botName};
   const lookup=await fetch(webhook,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(7000)});
   if(!lookup.ok)return {sent:false,configured:true,reason:"Could not read existing webhook channel (HTTP "+lookup.status+"). Set BRICKIVY_INQUIRY_DISCORD_CHANNEL_ID instead.",botName};
   const detail=await lookup.json();
   channelId=String(detail.channel_id||"");
   // Webhook.guild_id is optional: verify the actual channel via Bot authentication below.
   if(detail.guild_id&&String(detail.guild_id)!=="1001110667580932168")
    return {sent:false,configured:true,reason:"Saved webhook points to a different Discord server",botName};
  }
  if(!/^\d{17,20}$/.test(channelId))
   return {sent:false,configured:true,reason:"The notification channel ID could not be resolved",botName};
  const channelResponse=await fetch(base+"/channels/"+channelId,{
   headers:{Authorization:"Bot "+token,Accept:"application/json"},signal:AbortSignal.timeout(7000)
  });
  if(!channelResponse.ok){
   const hint=channelResponse.status===403?"Bot is denied access to the notification channel":channelResponse.status===404?"Bot cannot see the notification channel":"Discord channel lookup failed";
   return {sent:false,configured:true,reason:hint+" (HTTP "+channelResponse.status+"). Check View Channel permission.",botName};
  }
  const channel=await channelResponse.json();
  if(String(channel.guild_id)!=="1001110667580932168")
   return {sent:false,configured:true,reason:"Target channel is not inside the Brick & Ivy Discord server",botName};
  const post=await fetch(base+"/channels/"+channelId+"/messages",{
   method:"POST",headers:{Authorization:"Bot "+token,"Content-Type":"application/json"},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(7000)
  });
  if(!post.ok){
   let code="";
   try{const detail=await post.json();if(Number.isInteger(detail.code))code=" (Discord error "+detail.code+")"}catch{}
   const hint=post.status===403?"The bot cannot send messages to this channel; grant Send Messages and Embed Links":
    post.status===401?"Bot token is invalid":post.status===429?"Discord temporarily rate limited the bot":"Discord rejected the bot message";
   return {sent:false,configured:true,reason:hint+" (HTTP "+post.status+")"+code,botName};
  }
  return {sent:true,configured:true,reason:"Message delivered through Discord bot API",botName};
 }catch(error){
  const name=error instanceof Error?error.name:"unknown";
  return {sent:false,configured:true,reason:"Discord request did not complete ("+name+")."};
 }
}
/** Owner-only, non-posting check. Never expose token, webhook URL, IDs or payload. */
async function diagnoseInquiryBot():Promise<{bot:string;status:string;detail:string}>{
 const token=(Deno.env.get("DISCORD_BOT_TOKEN")||"").trim();
 if(!token)return {bot:"Unknown",status:"not_configured",detail:"DISCORD_BOT_TOKEN is missing from Supabase secrets"};
 try{
  const res=await fetch("https://discord.com/api/v10/users/@me",{
    headers:{Authorization:"Bot "+token,Accept:"application/json"},signal:AbortSignal.timeout(7000)
  });
  if(!res.ok)return {bot:"Unknown",status:"token_error",detail:"Discord rejected the configured bot token (HTTP "+res.status+")"};
  const user=await res.json();const bot=String(user.global_name||user.username||"Unknown").slice(0,80);
  const channel=(Deno.env.get("BRICKIVY_INQUIRY_DISCORD_CHANNEL_ID")||"").trim();
  const webhook=(Deno.env.get("BRICKIVY_INQUIRY_DISCORD_WEBHOOK")||"").trim();
  if(!channel&&!webhook)return {bot,status:"no_channel",detail:"Set a channel ID or webhook secret for inquiry notifications"};
  // Check channel access and Discord author without posting a message.
  const result=await sendInquiryAsBotDiagnosticChannel(token,channel,webhook);
  return {bot,...result};
 }catch(error){return {bot:"Unknown",status:"error",detail:"Bot diagnostic timed out or Discord was unreachable"}}
}
async function sendInquiryAsBotDiagnosticChannel(token:string,selected:string,webhook:string):Promise<{status:string;detail:string}>{
 let channelId=selected;
 if(!channelId){
  if(!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(webhook))
   return {status:"invalid_webhook",detail:"Webhook URL is invalid. Configure BRICKIVY_INQUIRY_DISCORD_CHANNEL_ID instead"};
  const resolved=await fetch(webhook,{signal:AbortSignal.timeout(7000)});
  if(!resolved.ok)return {status:"webhook_error",detail:"Webhook channel lookup failed (HTTP "+resolved.status+"). Configure a channel ID instead"};
  const item=await resolved.json();
  channelId=String(item.channel_id||"");
  if(item.guild_id&&String(item.guild_id)!=="1001110667580932168")
   return {status:"wrong_server",detail:"Webhook belongs to a different Discord server"};
 }
 if(!/^\d{17,20}$/.test(channelId))return {status:"invalid_channel",detail:"Invalid Discord notification channel ID"};
 const channel=await fetch("https://discord.com/api/v10/channels/"+channelId,{
  headers:{Authorization:"Bot "+token},signal:AbortSignal.timeout(7000)
 });
 if(!channel.ok)return {status:"no_access",detail:"Bot cannot view notification channel (HTTP "+channel.status+"). Grant View Channel"};
 const details=await channel.json();
 if(String(details.guild_id)!=="1001110667580932168")
  return {status:"wrong_server",detail:"Notification channel is not in the Brick & Ivy server"};
 return {status:"channel_accessible",detail:"Bot credentials and channel visibility verified. Next test Send Messages and Embed Links."};
}

/** Use the same sanitized, cached public feed as the website so overrides and
 * availability badges match what visitors see. Never expose private renter data.
 * Failure of this enrichment must not prevent a saved inquiry or Discord alert.
 */
async function getInquiryListingDetails(supabaseUrl:string,propertyId:string):Promise<{weeklyRent:string;availability:string}>{
 const fallback={weeklyRent:"Check property listing",availability:"Not verified — check listing"};
 try{
  const res=await fetch(supabaseUrl.replace(/[/]$/,"")+"/functions/v1/brickivy-properties",{
   headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)
  });
  if(!res.ok)return fallback;
  const rows=await res.json();
  if(!Array.isArray(rows))return fallback;
  const record=rows.find((p:unknown)=>p&&typeof p==="object"&&!Array.isArray(p)
   &&(p as Record<string,unknown>).published===true
   &&String((p as Record<string,unknown>).id)===propertyId) as Record<string,unknown>|undefined;
  if(!record)return fallback;
  const raw=record.price;
  const price=raw===null||raw===undefined||raw===""?NaN:Number(raw);
  const weeklyRent=Number.isFinite(price)&&price>=0&&price<=1_000_000_000_000
   ?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(price)+" / week"
   :"Value on request";
  // Match the public site's normalStatus(). Never guess that an unreadable
  // OPFW renter field means a property is available.
  const labels:Record<string,string>={
   available:"Available",reserved:"Reserved",
   unavailable:"Unavailable (rented)",
   listed:"In portfolio — occupancy not verified"
  };
  const availability=labels[String(record.status||"").toLowerCase()]||"Not verified — check listing";
  return {weeklyRent,availability};
 }catch{
  return fallback;
 }
}

Deno.serve(async request=>{
 const requestingOrigin=request.headers.get("origin")||"";
 const reply=(data:unknown,status=200)=>send(data,status,requestingOrigin);
 if(request.method==="OPTIONS")return reply({});
 if(!origins.has(requestingOrigin)||request.method!=="POST")return reply({error:"Forbidden"},403);
 const data=await request.json().catch(()=>null);
 if(!data||data.action!=="submit")return reply({error:"Invalid request"},400);
 if(data.website)return reply({success:true},200);
 const id=String(data.propertyId||"").trim(),name=String(data.characterName||"").trim(),phone=String(data.phone||"").trim(),message=String(data.message||"").trim();
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||name.length<2||name.length>80||phone.length<3||phone.length>35||message.length<10||message.length>1500)return reply({error:"Invalid fields"},400);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=Deno.env.get("OPFW_REST_TOKEN");
 if(!url||!secret||!token)return reply({error:"Service unavailable"},503);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:settings,error:sErr}=await db.from("brickivy_property_listing_settings").select("published").eq("property_id",id).maybeSingle();
 if(sErr||settings?.published===false)return reply({error:"Property unavailable"},404);
 const endpoint=new URL("https://opfw.gg/api/rest/1973/stocks_company_properties");
 endpoint.searchParams.set("select","company_id,property_id,property_name,property_address");
 endpoint.searchParams.set("where","company_id=5");
 const upstream=await fetch(endpoint,{headers:{Authorization:"Bearer "+token,Accept:"application/json"}}).catch(()=>null);
 if(!upstream?.ok)return reply({error:"Property verification unavailable"},503);
 const list=await upstream.json().catch(()=>({}));
 const property=Array.isArray(list.data)?list.data.find((p:any)=>Number(p.company_id)===5&&String(p.property_id)===id):null;
 if(!property)return reply({error:"Property not found"},404);
 const sourceHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret+":"+(request.headers.get("cf-connecting-ip")||name+":"+phone))).then(b=>Array.from(new Uint8Array(b)).map(n=>n.toString(16).padStart(2,"0")).join(""));
 const {count,error:limitError}=await db.from("brickivy_property_inquiries").select("id",{count:"exact",head:true}).eq("source_hash",sourceHash).gte("created_at",new Date(Date.now()-3600000).toISOString());
 if(limitError)return reply({error:"Unable to verify rate limit"},503);
 if((count||0)>=4)return reply({error:"Please wait before sending another inquiry"},429);
 const {data:insert,error}=await db.from("brickivy_property_inquiries").insert({property_id:id,property_name:String(property.property_name||id).slice(0,160),property_address:String(property.property_address||"").slice(0,200),character_name:name,in_game_phone:phone,discord_contact:String(data.discordContact||"").slice(0,80),message,source_hash:sourceHash}).select("id").single();
 if(error||!insert)return reply({error:"Could not save inquiry"},503);

 const safe=(v:string)=>v.replace(/@/g,"＠").replace(/</g,"‹").replace(/>/g,"›");
 // A new inquiry pings only the Realtor role in the Brick & Ivy guild.
 // Never accept a role ID or mention target from the public inquiry form.
 const REALTOR_ROLE_ID="1502870035176357968";
 const {weeklyRent,availability}=await getInquiryListingDetails(url,id);
 const listingUrl="https://brickandivyhomes.com/property.html?id="+encodeURIComponent(id);
 const inquiryPayload={
  // Explicitly allow only the trusted Brick & Ivy Realtor role to ping.
  content:"🏡 **New housing inquiry for Brick & Ivy!** <@&"+REALTOR_ROLE_ID+">",
  allowed_mentions:{parse:[],roles:[REALTOR_ROLE_ID]},
  embeds:[{
   author:{name:"BRICK & IVY  ·  REAL ESTATE"},
   title:"🏡 New Property Inquiry",
   url:listingUrl,
   description:"**Inquiry Message**\n"+safe(message),
   color:0x285640,
   fields:[
    {name:"Property",value:safe(String(property.property_name||id)).slice(0,240),inline:true},
    {name:"Property ID",value:safe(id),inline:true},
    {name:"Address",value:safe(String(property.property_address||"Not provided")).slice(0,240)},
    {name:"Weekly Rent",value:weeklyRent,inline:true},
    {name:"Availability",value:availability,inline:true},
    {name:"Character",value:safe(name),inline:true},
    {name:"In-game phone",value:safe(phone),inline:true},
    {name:"Discord contact",value:safe(String(data.discordContact||"Not provided")).slice(0,80),inline:true}
   ],
   footer:{text:"BRICK & IVY • New inquiry • Assign in Staff Portal"},
   timestamp:new Date().toISOString()
  }]
 };
 const delivery=await sendInquiryAsBot(inquiryPayload);
 const notification=delivery.sent?"sent":delivery.configured?"failed":"not_configured";
 if(!delivery.sent)console.warn("Brick & Ivy inquiry bot:",delivery.reason);

 const {error:statusError}=await db.from("brickivy_property_inquiries").update({discord_notification:notification}).eq("id",insert.id);
 if(statusError)console.warn("Inquiry notification status could not be recorded");
 return reply({success:true,reference:insert.id},201);
});
