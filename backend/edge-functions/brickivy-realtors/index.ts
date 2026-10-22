import { createClient } from "npm:@supabase/supabase-js@2.84.0";

/* Public read-only Brick & Ivy Realtor directory.
 * Deploy to the NEW Brick & Ivy Supabase project as "brickivy-realtors"
 * with verify_jwt=false. It exposes ONLY published, approved profile fields.
 * No service keys, Discord identifiers of other players, or private staff data.
 */
const json = (data: unknown, status=200) => new Response(JSON.stringify(data),{
  status,
  headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,OPTIONS",
    "Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info",
    "Cache-Control":"public,max-age=30,s-maxage=30"
  }
});
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return json({},200);
  if(req.method!=="GET")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL");
  const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!secret)return json({error:"Directory not configured"},503);
  try {
    const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.from("brickivy_realtors")
      .select("character_id,name,role_label,title,in_game_phone,discord_username,discord_user_id,photo_url,email,bio,published,display_order")
      .eq("published",true)
      .order("display_order",{ascending:true})
      .limit(100);
    if(error)throw error;
    // Explicit allowlist: don't return auth UUIDs, timestamps, update history or private player details.
    return json((data||[]).map(r=>({
      characterId:r.character_id,
      name:r.name,
      role:r.role_label,
      title:r.title,
      inGamePhone:r.in_game_phone,
      discordUsername:r.discord_username,
      discordId:r.discord_user_id,
      photo:r.photo_url,
      email:r.email,
      bio:r.bio,
      published:true,
      displayOrder:r.display_order
    })));
  }catch(error){
    console.error("Brick & Ivy directory unavailable",error instanceof Error?error.message:"unknown");
    return json({error:"Directory unavailable"},503);
  }
});
