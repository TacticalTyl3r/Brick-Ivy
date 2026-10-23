import {createClient} from "npm:@supabase/supabase-js@2.84.0";
const origin="https://brickandivyhomes.com";
const send=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":origin,"access-control-allow-headers":"content-type,authorization,apikey","access-control-allow-methods":"POST,OPTIONS"}});
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return send({});
 if(request.headers.get("origin")!==origin||request.method!=="POST")return send({error:"Forbidden"},403);
 const data=await request.json().catch(()=>null);
 if(!data||data.action!=="submit")return send({error:"Invalid request"},400);
 if(data.website)return send({success:true},200);
 const id=String(data.propertyId||"").trim(),name=String(data.characterName||"").trim(),phone=String(data.phone||"").trim(),message=String(data.message||"").trim();
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||name.length<2||name.length>80||phone.length<3||phone.length>35||message.length<10||message.length>1500)return send({error:"Invalid fields"},400);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=Deno.env.get("OPFW_REST_TOKEN");
 if(!url||!secret||!token)return send({error:"Service unavailable"},503);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:settings,error:sErr}=await db.from("brickivy_property_listing_settings").select("published").eq("property_id",id).maybeSingle();
 if(sErr||settings?.published===false)return send({error:"Property unavailable"},404);
 const endpoint=new URL("https://opfw.gg/api/rest/1973/stocks_company_properties");
 endpoint.searchParams.set("select","company_id,property_id,property_name,property_address");
 endpoint.searchParams.set("where","company_id=5");
 const upstream=await fetch(endpoint,{headers:{Authorization:"Bearer "+token,Accept:"application/json"}}).catch(()=>null);
 if(!upstream?.ok)return send({error:"Property verification unavailable"},503);
 const list=await upstream.json().catch(()=>({}));
 const property=Array.isArray(list.data)?list.data.find((p:any)=>Number(p.company_id)===5&&String(p.property_id)===id):null;
 if(!property)return send({error:"Property not found"},404);
 const sourceHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret+":"+(request.headers.get("cf-connecting-ip")||name+":"+phone))).then(b=>Array.from(new Uint8Array(b)).map(n=>n.toString(16).padStart(2,"0")).join(""));
 const {count,error:limitError}=await db.from("brickivy_property_inquiries").select("id",{count:"exact",head:true}).eq("source_hash",sourceHash).gte("created_at",new Date(Date.now()-3600000).toISOString());
 if(limitError)return send({error:"Unable to verify rate limit"},503);
 if((count||0)>=4)return send({error:"Please wait before sending another inquiry"},429);
 const {data:insert,error}=await db.from("brickivy_property_inquiries").insert({property_id:id,property_name:String(property.property_name||id).slice(0,160),property_address:String(property.property_address||"").slice(0,200),character_name:name,in_game_phone:phone,discord_contact:String(data.discordContact||"").slice(0,80),message,source_hash:sourceHash}).select("id").single();
 if(error||!insert)return send({error:"Could not save inquiry"},503);
 const webhook=(Deno.env.get("BRICKIVY_INQUIRY_DISCORD_WEBHOOK")||"").trim();
 let notification="not_configured";
 if(webhook){
  notification="failed";
  if(/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(webhook)){
   const roleIds=(Deno.env.get("BRICKIVY_INQUIRY_PING_ROLE_IDS")||"1502870035176357968").split(",").map(id=>id.trim()).filter(id=>/^\d{17,20}$/.test(id)).slice(0,5);
   const safe=(v:string)=>v.replace(/@/g,"＠").replace(/</g,"‹").replace(/>/g,"›");
   const payload={
    content:roleIds.map(id=>"<@&"+id+">").join(" ")||undefined,
    allowed_mentions:{parse:[],roles:roleIds},
    embeds:[{
      title:"New Brick & Ivy Property Inquiry",
      description:safe(message),
      color:2437942,
      url:"https://brickandivyhomes.com/property.html?id="+encodeURIComponent(id),
      fields:[
        {name:"Property",value:safe(String(property.property_name||id)).slice(0,240)},
        {name:"Character",value:safe(name),inline:true},
        {name:"In-game phone",value:safe(phone),inline:true},
        {name:"Discord contact",value:safe(String(data.discordContact||"Not provided")).slice(0,80),inline:true}
      ],
      footer:{text:"Private staff inquiry · follow up in the Brick & Ivy Staff Portal"}
    }]
   };
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
   try{
    const response=await fetch(webhook,{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify(payload),signal:controller.signal});
    notification=response.ok?"sent":"failed";
   }catch{notification="failed"}finally{clearTimeout(timer)}
  }
 }
 const {error:statusError}=await db.from("brickivy_property_inquiries").update({discord_notification:notification}).eq("id",insert.id);
 if(statusError)console.warn("Inquiry notification status could not be recorded");
 return send({success:true,reference:insert.id},201);
});
