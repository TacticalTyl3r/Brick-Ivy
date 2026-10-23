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
async function sendInquiryAsBot(payload:unknown):Promise<{sent:boolean;configured:boolean;reason:string}>{
 const token=(Deno.env.get("DISCORD_BOT_TOKEN")||"").trim();
 const configuredChannel=(Deno.env.get("BRICKIVY_INQUIRY_DISCORD_CHANNEL_ID")||"").trim();
 const webhook=(Deno.env.get("BRICKIVY_INQUIRY_DISCORD_WEBHOOK")||"").trim();
 if(!token||(!configuredChannel&&!webhook))return {sent:false,configured:false,reason:"Bot token or notification channel is not configured"};
 let channelId="";
 try{
  if(configuredChannel){
   if(!/^\d{17,20}$/.test(configuredChannel))
    return {sent:false,configured:false,reason:"Invalid Discord channel ID configuration"};
   const response=await fetch("https://discord.com/api/v10/channels/"+configuredChannel,{
    headers:{Authorization:"Bot "+token,Accept:"application/json"},signal:AbortSignal.timeout(6500)
   });
   if(!response.ok)return {sent:false,configured:true,reason:"Bot cannot access notification channel (HTTP "+response.status+")"};
   const channel=await response.json();
   if(String(channel.guild_id)!=="1001110667580932168")
    return {sent:false,configured:true,reason:"Notification channel is outside Brick & Ivy Discord"};
   channelId=configuredChannel;
  }else{
   if(!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(webhook))
    return {sent:false,configured:false,reason:"Invalid saved webhook URL"};
   // This GET reads metadata only; it does not create a webhook-authored message.
   const response=await fetch(webhook,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(6500)});
   if(!response.ok)return {sent:false,configured:true,reason:"Cannot resolve saved webhook channel (HTTP "+response.status+")"};
   const detail=await response.json();
   if(String(detail.guild_id)!=="1001110667580932168"||! /^\d{17,20}$/.test(String(detail.channel_id||"")))
    return {sent:false,configured:true,reason:"Saved webhook does not point to a Brick & Ivy server channel"};
   channelId=String(detail.channel_id);
  }
  const sent=await fetch("https://discord.com/api/v10/channels/"+channelId+"/messages",{
   method:"POST",headers:{Authorization:"Bot "+token,"Content-Type":"application/json"},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(6500)
  });
  if(!sent.ok)return {sent:false,configured:true,reason:"Discord bot message rejected (HTTP "+sent.status+")"};
  return {sent:true,configured:true,reason:"Sent by the Brick & Ivy Discord bot"};
 }catch{
  return {sent:false,configured:true,reason:"Discord bot delivery could not be completed"};
 }
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

    // Inquiries have their own independent Realtor grant. Do not broaden other Owner-only actions.
    if (action === "listInquiries" || action === "updateInquiry") {
      if (!isOwner) {
        const {data:grant,error:grantError}=await admin.from("brickivy_realtor_permissions")
          .select("can_manage_inquiries").eq("discord_user_id",providerId).maybeSingle();
        if(grantError)throw Error("Unable to check inquiry access");
        if(grant?.can_manage_inquiries !== true)
          return json({error:"Inquiry management permission required"},403,cors);
      }
      if (action === "listInquiries") {
        const [inbox,realtors]=await Promise.all([
          admin.from("brickivy_property_inquiries")
            .select("id,property_id,property_name,property_address,character_name,in_game_phone,discord_contact,message,status,internal_note,assigned_discord_id,discord_notification,created_at,updated_at")
            .order("created_at",{ascending:false}).limit(150),
          admin.from("brickivy_realtors")
            .select("name,discord_user_id,role_label").eq("published",true)
        ]);
        if(inbox.error||realtors.error)throw Error("Unable to load inquiries");
        return json({inquiries:inbox.data||[],realtors:(realtors.data||[])
          .filter(r=>r.role_label==="Realtor" && /^\\d{17,20}$/.test(r.discord_user_id||""))
          .map(r=>({name:r.name,discordId:r.discord_user_id})),
          role:isOwner?"owner":"realtor",
          ...(isOwner?{discordConfigured:Boolean(Deno.env.get("DISCORD_BOT_TOKEN") &&
           (Deno.env.get("BRICKIVY_INQUIRY_DISCORD_WEBHOOK") ||
            Deno.env.get("BRICKIVY_INQUIRY_DISCORD_CHANNEL_ID"))),discordSender:"Brick & Ivy App"}:{})
        },200,cors);
      }
      const inquiryId=string(body.id,36);
      const status=string(body.status,30),note=body.note,assignee=string(body.assignedDiscordId,20);
      if(!uuid.test(inquiryId)||!["new","in_progress","closed"].includes(status)
        ||typeof note!=="string"||note.length>2000
        ||(assignee && !/^\\d{17,20}$/.test(assignee)))
        return json({error:"Invalid inquiry update"},400,cors);
      if(assignee){
        const {data:matches,error:matchError}=await admin.from("brickivy_realtors")
          .select("id").eq("discord_user_id",assignee).eq("role_label","Realtor").eq("published",true).limit(1);
        if(matchError||!matches?.length)return json({error:"Assign a published team Realtor"},400,cors);
      }
      const {data:before,error:beforeError}=await admin.from("brickivy_property_inquiries")
        .select("status").eq("id",inquiryId).maybeSingle();
      if(beforeError)throw Error("Unable to load selected inquiry");
      if(!before)return json({error:"Inquiry not found"},404,cors);
      const {error:updateError}=await admin.from("brickivy_property_inquiries")
        .update({status,internal_note:note.trim(),assigned_discord_id:assignee||null,
          updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",inquiryId);
      if(updateError)throw Error("Unable to save inquiry");
      const {error:auditError}=await admin.from("brickivy_inquiry_activity")
        .insert({inquiry_id:inquiryId,actor:user.id,previous_status:before.status,new_status:status});
      if(auditError)console.warn("Inquiry activity audit unavailable");
      return json({success:true,auditRecorded:!auditError},200,cors);
    }
    if (!isOwner) return json({error:"Owner role required"},403,cors);
    if (action === "testInquiryDiscord") {
      const ids=(Deno.env.get("BRICKIVY_INQUIRY_PING_ROLE_IDS")||REALTOR_ROLE_ID)
        .split(",").map(x=>x.trim()).filter(x=>/^\d{17,20}$/.test(x)).slice(0,5);
      const payload={
        content:"**[TEST] Brick & Ivy App · Property Inquiry Notifications**\n"+
          ids.map(x=>"<@&"+x+">").join(" ")+"\n"+
          "This notification was sent by the Brick & Ivy Discord bot. No customer inquiry was created.",
        allowed_mentions:{parse:[],roles:ids}
      };
      const result=await sendInquiryAsBot(payload);
      if(!result.sent)return json({error:result.reason},result.configured?502:503,cors);
      return json({success:true,message:"Test sent through the Brick & Ivy Discord App (bot)."},200,cors);
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
