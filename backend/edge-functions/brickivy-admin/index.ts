import { createClient } from "npm:@supabase/supabase-js@2.84.0";

/*
 * Brick & Ivy — protected Owner-only management endpoint.
 * Deploy to a NEW Supabase project as "brickivy-admin" with verify_jwt=true.
 * Secrets stay in Edge Function environment, NEVER in GitHub Pages.
 *
 * Secrets: DISCORD_BOT_TOKEN (bot present in Brick & Ivy's Discord guild).
 * Supabase Edge Functions also supply SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
const GUILD_ID = "1001110667580932168";
const OWNER_ROLE_ID = "1502871124378259526";
const REALTOR_ROLE_ID = "1502870035176357968";
const ORIGINS = new Set([
  "https://brickandivyhomes.com",
  "https://www.brickandivyhomes.com"
]);
const FIELDS = "id,character_id,name,role_label,title,in_game_phone,discord_username,discord_user_id,photo_url,email,bio,published,display_order,updated_at";
const PERMISSION_FIELDS=[
 "can_edit_area","can_manage_reservations","can_edit_description","can_set_prices",
 "can_manage_storage","can_publish","can_feature","can_manage_photos","can_view_financials","can_manage_inquiries"
] as const;
const DEFAULT_PERMISSIONS={
 can_edit_area:false,can_manage_reservations:true,can_edit_description:false,
 can_set_prices:false,can_manage_storage:false,can_publish:false,
 can_feature:false,can_manage_photos:false,can_view_financials:false,can_manage_inquiries:false
};

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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status, headers: {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...headers}
  });
const string = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const validId = (v: unknown) => typeof v === "string" && uuid.test(v);
const validCID = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) > 0 && Number(v) <= 2147483647;
const toPublicShape = (r: Record<string, unknown>) => ({
  id: r.id,
  characterId: r.character_id,
  name: r.name,
  role: r.role_label,
  title: r.title,
  inGamePhone: r.in_game_phone,
  discordUsername: r.discord_username,
  discordId: r.discord_user_id,
  photo: r.photo_url,
  email: r.email,
  bio: r.bio,
  published: r.published,
  displayOrder: r.display_order,
  updatedAt: r.updated_at
});

async function membership(discordUserId: string, botToken: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}`,
      {
        headers: {Authorization: `Bot ${botToken}`, Accept: "application/json"},
        signal: controller.signal
      }
    );
    if (response.status === 404) return [];
    if (!response.ok) throw new Error("Discord role check unavailable");
    const member = await response.json();
    if (!Array.isArray(member.roles)) throw new Error("Unexpected Discord guild response");
    return member.roles.filter((role: unknown) => typeof role === "string");
  } finally { clearTimeout(timer); }
}
function parseBody(body: Record<string, unknown>) {
  if (!validCID(body.characterId)) throw new Error("Enter a valid CID");
  const name = string(body.name, 80);
  if (!name) throw new Error("A character name is required");
  const discordId = string(body.discordId, 20);
  if (discordId && !/^\d{17,20}$/.test(discordId)) throw new Error("Invalid Discord user ID");
  const photo = string(body.photo, 2048);
  if (photo && !(/^https:\/\//i.test(photo) || /^assets\/realtors\/[\w./-]+$/.test(photo))) {
    throw new Error("Photo must use HTTPS or an approved local image path");
  }
  const email = string(body.email, 254);
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error("Invalid email address");
  const displayOrder = body.displayOrder === undefined ? 100 : Number(body.displayOrder);
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000) throw new Error("Invalid display order");
  return {
    character_id: Number(body.characterId),
    name,
    title: string(body.title, 80) || "Realtor",
    in_game_phone: string(body.inGamePhone, 35),
    discord_username: string(body.discordUsername, 70),
    discord_user_id: discordId,
    photo_url: photo,
    email,
    bio: string(body.bio, 500),
    published: body.published === true,
    display_order: displayOrder
  };
}

Deno.serve(async request => {
  const origin = request.headers.get("origin") || "";
  const cors: Record<string,string> = {
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
  if (ORIGINS.has(origin)) cors["Access-Control-Allow-Origin"] = origin;
  if (request.method === "OPTIONS") return new Response(null, {status:204, headers:cors});
  if (origin && !ORIGINS.has(origin)) return json({error:"Origin not allowed"},403,cors);
  if (request.method !== "POST") return json({error:"Method not allowed"},405,cors);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!url || !serviceKey || !botToken) return json({error:"Backend setup incomplete"},503,cors);

  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({error:"Sign in required"},401,cors);
  const admin = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const {data:{user},error} = await admin.auth.getUser(bearer);
    if (error || !user) return json({error:"Invalid session"},401,cors);
    // Read Discord identity from Supabase Auth's verified identities, NOT user_metadata.
    const {data:account,error:lookupError} = await admin.auth.admin.getUserById(user.id);
    if (lookupError || !account?.user) return json({error:"Account lookup unavailable"},503,cors);
    const discord = account.user.identities?.find(identity => identity.provider === "discord");
    const providerId = discord?.identity_data?.provider_id ?? discord?.id;
    if (typeof providerId !== "string" || !/^\d{17,20}$/.test(providerId)) {
      return json({error:"Sign in with Discord to access Brick & Ivy"},403,cors);
    }
    // Guild role membership is checked live on EVERY request, including saves.
    const roles = await membership(providerId,botToken);
    const isOwner = roles.includes(OWNER_ROLE_ID);
    const isRealtor = isOwner || roles.includes(REALTOR_ROLE_ID);
    if (!isRealtor) return json({error:"Brick & Ivy staff membership required"},403,cors);

    const body: Record<string, unknown> = await request.json();
    const action = body.action;
    if (action === "me") return json({role:isOwner?"owner":"realtor",displayName:account.user.user_metadata?.full_name || "Team member"},200,cors);

    // All inquiry actions are checked against live Discord guild roles, plus
    // explicit per-Realtor permissions; never expose private inquiry tables.
    if (["listInquiries","claimInquiry","updateInquiry","inquiryActivity","inquirySummary","inquiryAnalytics"].includes(String(action))) {
      if (!isOwner) {
        const {data:grant,error:grantError}=await admin.from("brickivy_realtor_permissions")
          .select("can_manage_inquiries").eq("discord_user_id",providerId).maybeSingle();
        if(grantError)throw Error("Unable to check inquiry access");
        if(grant?.can_manage_inquiries!==true)return json({error:"Inquiry management permission required"},403,cors);
      }
      const validStatuses=["new","in_progress","contacted","awaiting_customer","closed"];
      const inboxFields="id,property_id,property_name,property_address,character_name,in_game_phone,discord_contact,message,status,internal_note,assigned_discord_id,discord_notification,created_at,updated_at,claimed_at,contacted_at,closed_at";
      const now=new Date().toISOString();
      const [team,analytics]=await Promise.all([
        admin.from("brickivy_realtors").select("name,discord_user_id,role_label,published").order("display_order",{ascending:true}),
        admin.rpc("brickivy_inquiry_analytics")
      ]);
      if(team.error||analytics.error)throw Error("Unable to load inquiry dashboard data");
      const realtorNames=new Map((team.data||[]).filter(r=>/^\d{17,20}$/.test(r.discord_user_id||""))
        .map(r=>[r.discord_user_id,r.role_label==="Owner"?"Owner · "+r.name:r.name]));
      const realtors=(team.data||[]).filter(r=>r.role_label==="Realtor"&&r.published===true&&/^\d{17,20}$/.test(r.discord_user_id||""))
        .map(r=>({name:r.name,discordId:r.discord_user_id}));
      const metrics=analytics.data||{};
      if(action==="inquirySummary"){
        const {data:recent,error:recentError}=await admin.from("brickivy_property_inquiries")
          .select("id,property_name,status,assigned_discord_id,created_at").order("created_at",{ascending:false}).limit(4);
        if(recentError)throw Error("Could not load latest inquiries");
        return json({metrics,recent:recent||[]},200,cors);
      }
      if(action==="inquiryAnalytics"){
        const {data:activity,error:activityError}=await admin.from("brickivy_inquiry_activity")
          .select("inquiry_id,event_type,actor_discord_id,previous_status,new_status,old_assignee,new_assignee,note_changed,created_at")
          .order("created_at",{ascending:false}).limit(35);
        if(activityError)throw Error("Could not load recent inquiry activity");
        return json({metrics,recentActivity:activity||[],names:Object.fromEntries(realtorNames)},200,cors);
      }
      if(action==="listInquiries"){
        const {data:inquiries,error:e}=await admin.from("brickivy_property_inquiries")
          .select(inboxFields).order("created_at",{ascending:false}).limit(150);
        if(e)throw Error("Unable to load inquiries");
        return json({inquiries:inquiries||[],realtors,metrics,
          currentDiscordId:providerId,names:Object.fromEntries(realtorNames),
          role:isOwner?"owner":"realtor",
          ...(isOwner?{discordConfigured:Boolean(Deno.env.get("DISCORD_BOT_TOKEN")&&
           (Deno.env.get("BRICKIVY_INQUIRY_DISCORD_WEBHOOK")||
            Deno.env.get("BRICKIVY_INQUIRY_DISCORD_CHANNEL_ID"))),discordSender:"Brick & Ivy App"}:{})
        },200,cors);
      }
      const inquiryId=string(body.id,36);
      if(!uuid.test(inquiryId))return json({error:"Invalid inquiry ID"},400,cors);
      if(action==="inquiryActivity"){
        const {data:history,error:e}=await admin.from("brickivy_inquiry_activity")
          .select("event_type,actor_discord_id,previous_status,new_status,old_assignee,new_assignee,note_changed,created_at")
          .eq("inquiry_id",inquiryId).order("created_at",{ascending:false}).limit(80);
        if(e)throw Error("Unable to load inquiry activity");
        return json({history:history||[],names:Object.fromEntries(realtorNames)},200,cors);
      }
      const {data:before,error:beforeError}=await admin.from("brickivy_property_inquiries")
        .select("id,property_id,property_name,character_name,status,assigned_discord_id,internal_note,updated_at,claimed_at,contacted_at,closed_at")
        .eq("id",inquiryId).maybeSingle();
      if(beforeError)throw Error("Unable to load selected inquiry");
      if(!before)return json({error:"Inquiry not found"},404,cors);
      if(action==="claimInquiry"){
        if(before.status==="closed")return json({error:"Reopen this inquiry before claiming it"},409,cors);
        const assignee=providerId;
        // Atomic conditional update: only the first claimant wins.
        const {data:claimed,error:claimError}=await admin.from("brickivy_property_inquiries")
          .update({assigned_discord_id:assignee,claimed_at:before.claimed_at||now,
            status:before.status==="new"?"in_progress":before.status,
            updated_at:now,updated_by:user.id})
          .eq("id",inquiryId).is("assigned_discord_id",null).neq("status","closed")
          .select("id").maybeSingle();
        if(claimError)throw Error("Unable to claim this inquiry");
        if(!claimed)return json({error:"This inquiry was already claimed. Refresh your inbox."},409,cors);
        const {error:auditError}=await admin.from("brickivy_inquiry_activity").insert({
          inquiry_id:inquiryId,actor:user.id,actor_discord_id:providerId,
          event_type:"claimed",previous_status:before.status,
          new_status:before.status==="new"?"in_progress":before.status,
          old_assignee:null,new_assignee:assignee
        });
        if(auditError)console.warn("Claim activity could not be recorded");
        // Claiming an inquiry may post an update, but never pings the claimant.
        // Direct @mentions are reserved for a deliberate assignment to a Realtor.
        const delivery=await sendInquiryAsBot({
          allowed_mentions:{parse:[]},
          embeds:[{
            author:{name:"BRICK & IVY · REAL ESTATE"},
            title:"🏡 Property Inquiry Claimed",
            url:"https://brickandivyhomes.com/property.html?id="+encodeURIComponent(before.property_id),
            description:"A member of the Brick & Ivy team has claimed this inquiry.",
            color:0x285640,
            fields:[
              {name:"Property",value:String(before.property_name).replace(/[@<>]/g,"").slice(0,160),inline:true},
              {name:"Customer",value:String(before.character_name).replace(/[@<>]/g,"").slice(0,80),inline:true},
              {name:"Claimed by",value:String(realtorNames.get(providerId)||"Brick & Ivy staff").replace(/[@<>]/g,"").slice(0,80)}
            ],
            footer:{text:"BRICK & IVY • Inquiry workflow • No pings"},
            timestamp:now
          }]
        });
        return json({success:true,auditRecorded:!auditError,notification:delivery.sent?"sent":"failed"},200,cors);
      }
      const status=string(body.status,30);
      if(!validStatuses.includes(status)||typeof body.note!=="string"||body.note.length>2000)
        return json({error:"Invalid inquiry status or internal notes"},400,cors);
      const note=body.note.trim(),assignee=string(body.assignedDiscordId,20);
      if(assignee&&!/^\d{17,20}$/.test(assignee))
        return json({error:"Invalid assigned Realtor"},400,cors);
      if(assignee&&!realtors.some(r=>r.discordId===assignee))
        return json({error:"Assigned Realtor must be a published team member"},400,cors);
      if(assignee!==before.assigned_discord_id&&assignee){
        const {data:targetGrant,error:targetGrantError}=await admin.from("brickivy_realtor_permissions")
          .select("can_manage_inquiries").eq("discord_user_id",assignee).maybeSingle();
        if(targetGrantError)throw Error("Unable to verify assignee inquiry permission");
        if(targetGrant?.can_manage_inquiries!==true)
          return json({error:"Grant this Realtor Manage property inquiries permission before assigning them"},400,cors);
        const targetRoles=await membership(assignee,botToken);
        if(!targetRoles.includes(REALTOR_ROLE_ID)&&!targetRoles.includes(OWNER_ROLE_ID))
          return json({error:"Assigned Realtor is not currently in Brick & Ivy Discord"},400,cors);
      }
      const changedStatus=before.status!==status,changedAssignee=(before.assigned_discord_id||"")!==assignee,
        changedNote=before.internal_note!==note;
      if(!changedStatus&&!changedAssignee&&!changedNote)return json({success:true,unchanged:true},200,cors);
      const next:any={status,internal_note:note,assigned_discord_id:assignee||null,
        updated_at:now,updated_by:user.id};
      if(assignee&&!before.claimed_at)next.claimed_at=now;
      if(["contacted","awaiting_customer"].includes(status)&&!before.contacted_at)next.contacted_at=now;
      if(status==="closed")next.closed_at=before.closed_at||now;
      else if(before.status==="closed")next.closed_at=null;
      const {data:updated,error:updateError}=await admin.from("brickivy_property_inquiries")
        .update(next).eq("id",inquiryId).eq("updated_at",before.updated_at)
        .select("id").maybeSingle();
      if(updateError)throw Error("Unable to update inquiry");
      if(!updated)return json({error:"This inquiry was changed by someone else. Refresh and retry."},409,cors);
      const eventType=changedAssignee?(assignee?"assigned":"unassigned"):
        changedStatus?"status_changed":changedNote?"note_updated":"updated";
      const {error:auditError}=await admin.from("brickivy_inquiry_activity").insert({
        inquiry_id:inquiryId,actor:user.id,actor_discord_id:providerId,
        event_type:eventType,previous_status:before.status,new_status:status,
        old_assignee:before.assigned_discord_id,new_assignee:assignee||null,note_changed:changedNote
      });
      if(auditError)console.warn("Inquiry change activity could not be recorded");
      let notification:"none"|"sent"|"failed"="none";
      if(changedAssignee&&assignee){
        const safeProperty=String(before.property_name).replace(/[@<>]/g,"").slice(0,150);
        const target=assignee;
        const result=await sendInquiryAsBot({
          content:"<@"+target+">",
          allowed_mentions:{parse:[],users:[target]},
          embeds:[{title:"🏡 Property Inquiry Assigned",
            description:"**"+safeProperty+"** has been assigned to you.\n\nOpen the Brick & Ivy Staff Portal to follow up.",
            color:0x285640,
            fields:[{name:"Customer",value:String(before.character_name).replace(/[@<>]/g,"").slice(0,80)},
              {name:"Status",value:status.replaceAll("_"," ")}],
            footer:{text:"BRICK & IVY • Staff workflow"},timestamp:now}]
        });
        notification=result.sent?"sent":"failed";
        if(!result.sent)console.warn("Brick & Ivy inquiry assignment notification failed:",result.reason);
      }
      // Lifecycle notifications are separate, embed-only and never ping anyone.
      // Only transitions to these three statuses create lifecycle posts.
      let statusNotification:"none"|"sent"|"failed"="none";
      if(changedStatus&&["contacted","awaiting_customer","closed"].includes(status)){
        const statusInfo:Record<string,{title:string;message:string;color:number;label:string}>={
          contacted:{
            title:"📞 Customer Contacted",
            message:"A Realtor has contacted the customer about this property.",
            color:0x3498DB,
            label:"Contacted"
          },
          awaiting_customer:{
            title:"⏳ Awaiting Customer",
            message:"The team is now waiting for the customer to respond.",
            color:0xF1C40F,
            label:"Awaiting Customer"
          },
          closed:{
            title:"✅ Inquiry Closed",
            message:"This property inquiry has been marked as closed.",
            color:0x2ECC71,
            label:"Closed"
          }
        };
        const chosen=statusInfo[status];
        const clean=(value:unknown,max:number)=>String(value??"")
          .replace(/@/g,"＠").replace(/</g,"‹").replace(/>/g,"›").slice(0,max);
        const outcome=await sendInquiryAsBot({
          allowed_mentions:{parse:[]},
          embeds:[{
            author:{name:"BRICK & IVY · REAL ESTATE"},
            title:chosen.title,
            url:"https://brickandivyhomes.com/property.html?id="+encodeURIComponent(before.property_id),
            description:chosen.message,
            color:chosen.color,
            fields:[
              {name:"Property",value:clean(before.property_name,160),inline:true},
              {name:"Customer",value:clean(before.character_name,80),inline:true},
              {name:"Previous Status",value:clean(validStatuses.includes(before.status)?before.status.replaceAll("_"," "):"Unknown",70),inline:true},
              {name:"Current Status",value:chosen.label,inline:true},
              {name:"Updated by",value:clean(realtorNames.get(providerId)||"Brick & Ivy staff",80),inline:true}
            ],
            footer:{text:"BRICK & IVY • Inquiry status update • No pings"},
            timestamp:now
          }]
        });
        statusNotification=outcome.sent?"sent":"failed";
        if(!outcome.sent)console.warn("Brick & Ivy inquiry status notification failed:",outcome.reason);
      }
      return json({success:true,auditRecorded:!auditError,notification,statusNotification},200,cors);
    }
    if (!isOwner) return json({error:"Owner role required"},403,cors);
    if (action === "diagnoseInquiryDiscord") {
      const diagnostic=await diagnoseInquiryBot();
      return json({success:true,...diagnostic},200,cors);
    }
    if (action === "testInquiryDiscord") {
      const payload={
        // This test checks embed delivery without pinging any roles or users.
        allowed_mentions:{parse:[]},
        embeds:[{
          author:{name:"BRICK & IVY  ·  REAL ESTATE"},
          title:"🏡 Notification Test",
          description:"**The Brick & Ivy App is ready to deliver property inquiries.**\n\nThis is a test notification sent by the Discord bot. No customer inquiry has been created.",
          color:0x285640,
          fields:[
            {name:"Notification",value:"Property inquiries",inline:true},
            {name:"Delivery",value:"Brick & Ivy Discord App",inline:true},
            {name:"Status",value:"✅ Test message",inline:true}
          ],
          footer:{text:"BRICK & IVY  •  Staff Notifications  •  Test Only"},
          timestamp:new Date().toISOString()
        }]
      };
      const result=await sendInquiryAsBot(payload);
      if(!result.sent)return json({error:result.reason},result.configured?502:503,cors);
      return json({success:true,message:"Discord test sent by "+(result.botName||"the configured bot")+".",botName:result.botName},200,cors);
    }
    if (action === "listPermissions") {
      const [roster,grants]=await Promise.all([
        admin.from("brickivy_realtors").select("id,name,title,role_label,character_id,discord_user_id").order("display_order",{ascending:true}),
        admin.from("brickivy_realtor_permissions").select("discord_user_id,"+PERMISSION_FIELDS.join(","))
      ]);
      if(roster.error||grants.error)throw Error("Could not load Realtor permission settings");
      const byDiscordId=new Map((grants.data||[]).map(g=>[g.discord_user_id,g]));
      return json({realtors:(roster.data||[]).filter(r=>r.role_label!=="Owner").map(r=>({
        id:r.id,name:r.name,title:r.title,characterId:r.character_id,discordId:r.discord_user_id,
        permissions:{...DEFAULT_PERMISSIONS,...(byDiscordId.get(r.discord_user_id)||{})}
      }))},200,cors);
    }
    if (action === "savePermissions") {
      const discordId=string(body.discordId,20);
      if(!/^\d{17,20}$/.test(discordId))return json({error:"This Realtor needs a valid Discord user ID on their profile"},400,cors);
      const selected=body.permissions;
      if(!selected||typeof selected!=="object"||Array.isArray(selected))return json({error:"Invalid permissions"},400,cors);
      const fields=selected as Record<string,unknown>;
      if(Object.keys(fields).length!==PERMISSION_FIELDS.length
        || !PERMISSION_FIELDS.every(field=>typeof fields[field]==="boolean"))return json({error:"Choose every permission before saving"},400,cors);
      const {data:matches,error:rosterError}=await admin.from("brickivy_realtors")
        .select("id,role_label").eq("discord_user_id",discordId);
      if(rosterError)throw Error("Could not verify Realtor roster");
      if(!matches?.some(r=>r.role_label==="Realtor")||matches.some(r=>r.role_label==="Owner")){
        return json({error:"This Discord account is not an assigned Brick & Ivy Realtor"},403,cors);
      }
      // Require the target to still hold the Realtor guild role before granting privileges.
      const targetRoles=await membership(discordId,botToken);
      if(!targetRoles.includes(REALTOR_ROLE_ID)&&!targetRoles.includes(OWNER_ROLE_ID)){
        return json({error:"This account must have the Brick & Ivy Realtor Discord role"},403,cors);
      }
      const {data:old,error:oldError}=await admin.from("brickivy_realtor_permissions")
        .select(PERMISSION_FIELDS.join(",")).eq("discord_user_id",discordId).maybeSingle();
      if(oldError)throw Error("Unable to read current permissions");
      const incoming=Object.fromEntries(PERMISSION_FIELDS.map(field=>[field,fields[field]]));
      const {error:writeError}=await admin.from("brickivy_realtor_permissions")
        .upsert({discord_user_id:discordId,...incoming,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:"discord_user_id"});
      if(writeError)throw Error("Unable to save Realtor permissions");
      const {error:auditError}=await admin.from("brickivy_realtor_permission_audit")
        .insert({discord_user_id:discordId,actor:user.id,previous:{...DEFAULT_PERMISSIONS,...old},updated:incoming});
      if(auditError)console.error("Realtor permission audit insert failed");
      return json({success:true,discordId,permissions:incoming,auditRecorded:!auditError},200,cors);
    }
    if (action === "list") {
      const {data,error:e} = await admin.from("brickivy_realtors").select(FIELDS).order("display_order",{ascending:true});
      if (e) throw e;
      return json({realtors:(data||[]).map(toPublicShape)},200,cors);
    }
    if (action === "reorder") {
      // Changing the public display order does not grant a Discord role.
      // Require a complete, unique snapshot so a stale tab cannot silently
      // overwrite a Realtor that was recently added or removed.
      const ids = body.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100
          || !ids.every(validId) || new Set(ids).size !== ids.length) {
        return json({error:"Invalid reorder request"},400,cors);
      }
      const {data:existing,error:readError} = await admin
        .from("brickivy_realtors").select("id,role_label,title");
      if (readError) throw readError;
      const records = existing || [];
      const byId = new Map(records.map(r => [r.id, r]));
      if (ids.length !== records.length || ids.some(id => !byId.has(id))) {
        return json({error:"The roster changed. Refresh and try again."},409,cors);
      }
      // The Owner section always stays at the top. Group members by their
      // public position, but never derive authentication privileges from it.
      const position = (r: {role_label:string,title:string}) =>
        r.role_label === "Owner" ? "owner" : "realtor:"+((r.title || "Realtor").trim().toLowerCase() || "realtor");
      const ownerCount=records.filter(r => r.role_label === "Owner").length;
      if (ids.slice(0,ownerCount).some(id => byId.get(id)?.role_label !== "Owner")
       || ids.slice(ownerCount).some(id => byId.get(id)?.role_label === "Owner")) {
        return json({error:"Owners must remain first"},400,cors);
      }
      const seenPositions=new Set<string>();
      let lastPosition="";
      for(const id of ids){
        const key=position(byId.get(id)!);
        if(key!==lastPosition){
          if(seenPositions.has(key))return json({error:"Keep positions grouped together"},400,cors);
          seenPositions.add(key);
          lastPosition=key;
        }
      }
      // Save order on existing records only: role_label, CID and contact data
      // remain untouched. Keep positions spaced for future insertions.
      for(let i=0;i<ids.length;i++){
        const {error:e}=await admin.from("brickivy_realtors")
          .update({display_order:(i+1)*10,updated_at:new Date().toISOString(),updated_by:user.id})
          .eq("id",ids[i]);
        if(e)throw e;
      }
      const {data:updated,error:listError}=await admin.from("brickivy_realtors")
        .select(FIELDS).order("display_order",{ascending:true});
      if(listError)throw listError;
      return json({realtors:(updated||[]).map(toPublicShape)},200,cors);
    }
    if (action === "save") {
      const value = body.realtor;
      if (!value || typeof value !== "object" || Array.isArray(value)) return json({error:"Invalid Realtor profile"},400,cors);
      const entry = value as Record<string,unknown>;
      let payload: ReturnType<typeof parseBody>;
      try {payload = parseBody(entry);}catch (e) {return json({error:e instanceof Error ? e.message:"Invalid data"},400,cors);}
      const id = entry.id;
      if (id) {
        if (!validId(id)) return json({error:"Invalid profile ID"},400,cors);
        const {data:existing,error:fetchError} = await admin.from("brickivy_realtors").select("id,role_label,discord_user_id").eq("id",id).single();
        if (fetchError || !existing) return json({error:"Realtor profile not found"},404,cors);
        if (existing.role_label !== "Owner" && payload.title.toLowerCase() === "owner") {
          return json({error:"Owner is a reserved position"},400,cors);
        }
        const {data,error:e} = await admin.from("brickivy_realtors")
          .update({...payload,updated_by:user.id,updated_at:new Date().toISOString()})
          .eq("id",id).select(FIELDS).single();
        if (e) return json({error:e.code==="23505"?"Character ID already in use":"Unable to update Realtor"},e.code==="23505"?409:500,cors);
        // Reassigning a profile's Discord identity must not transfer privileges to another user.
        if(existing.role_label!=="Owner" && existing.discord_user_id && existing.discord_user_id!==payload.discord_user_id){
          const {error:clearError}=await admin.from("brickivy_realtor_permissions")
            .delete().eq("discord_user_id",existing.discord_user_id);
          if(clearError)console.error("Old Realtor permission cleanup failed");
        }
        return json({realtor:toPublicShape(data)},200,cors);
      }
      if (payload.title.toLowerCase() === "owner") {
        return json({error:"Owner is a reserved position"},400,cors);
      }
      const {data,error:e} = await admin.from("brickivy_realtors")
        .insert({...payload,role_label:"Realtor",updated_by:user.id})
        .select(FIELDS).single();
      if (e) return json({error:e.code==="23505"?"Character ID already in use":"Unable to add Realtor"},e.code==="23505"?409:500,cors);
      return json({realtor:toPublicShape(data)},201,cors);
    }
    if (action === "delete") {
      if (!validId(body.id)) return json({error:"Invalid profile ID"},400,cors);
      const {data:existing,error:fetchError} = await admin.from("brickivy_realtors")
        .select("id,role_label,discord_user_id").eq("id",body.id).single();
      if (fetchError || !existing) return json({error:"Realtor profile not found"},404,cors);
      if (existing.role_label === "Owner") return json({error:"Owner profile cannot be deleted here"},403,cors);
      const {error:e} = await admin.from("brickivy_realtors").delete().eq("id",body.id);
      if (e) throw e;
      if(existing.discord_user_id){
        const {error:removeError}=await admin.from("brickivy_realtor_permissions")
          .delete().eq("discord_user_id",existing.discord_user_id);
        if(removeError)console.error("Realtor permission cleanup failed");
      }
      return json({success:true},200,cors);
    }
    return json({error:"Unsupported action"},400,cors);
  }catch(error){
    console.error("Brick & Ivy admin request failed:",error instanceof Error ? error.message : "unknown");
    return json({error:"Unable to complete request"},503,cors);
  }
});
