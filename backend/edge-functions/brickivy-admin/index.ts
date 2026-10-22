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
    if (!isOwner) return json({error:"Owner role required"},403,cors);
    if (action === "list") {
      const {data,error:e} = await admin.from("brickivy_realtors").select(FIELDS).order("display_order",{ascending:true});
      if (e) throw e;
      return json({realtors:(data||[]).map(toPublicShape)},200,cors);
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
        const {data:existing,error:fetchError} = await admin.from("brickivy_realtors").select("id,role_label").eq("id",id).single();
        if (fetchError || !existing) return json({error:"Realtor profile not found"},404,cors);
        const {data,error:e} = await admin.from("brickivy_realtors")
          .update({...payload,updated_by:user.id,updated_at:new Date().toISOString()})
          .eq("id",id).select(FIELDS).single();
        if (e) return json({error:e.code==="23505"?"Character ID already in use":"Unable to update Realtor"},e.code==="23505"?409:500,cors);
        return json({realtor:toPublicShape(data)},200,cors);
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
        .select("id,role_label").eq("id",body.id).single();
      if (fetchError || !existing) return json({error:"Realtor profile not found"},404,cors);
      if (existing.role_label === "Owner") return json({error:"Owner profile cannot be deleted here"},403,cors);
      const {error:e} = await admin.from("brickivy_realtors").delete().eq("id",body.id);
      if (e) throw e;
      return json({success:true},200,cors);
    }
    return json({error:"Unsupported action"},400,cors);
  }catch(error){
    console.error("Brick & Ivy admin request failed:",error instanceof Error ? error.message : "unknown");
    return json({error:"Unable to complete request"},503,cors);
  }
});
