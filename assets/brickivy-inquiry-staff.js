/* Brick & Ivy private inquiry inbox. Every request is authorized by brickivy-admin. */
const config=window.BRICK_IVY_CONFIG||{};
const el=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const statuses={new:"New",in_progress:"In progress",closed:"Closed"};
let client=null,inquiries=[],realtors=[],busy=false;
const info=message=>{el("inquiryStaffStatus").textContent=message};
async function api(action,extra={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error("Sign in with Discord to manage inquiries.");
 const response=await fetch(config.supabaseUrl+"/functions/v1/brickivy-admin",{
  method:"POST",credentials:"omit",
  headers:{"content-type":"application/json",apikey:config.publishableKey,authorization:"Bearer "+session.access_token},
  body:JSON.stringify({action,...extra})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||"The inquiry request failed.");
 return data;
}
function render(){
 const target=el("inquiryStaffList"),term=el("inquiryStaffSearch").value.toLowerCase().trim();
 const filter=el("inquiryStaffFilter").value;
 const matches=inquiries.filter(item=>(!filter||item.status===filter)&&
  (!term||[item.property_name,item.property_id,item.character_name,item.in_game_phone,item.message].some(v=>String(v||"").toLowerCase().includes(term))));
 for(const [key,id] of [["new","inquiryStatNew"],["in_progress","inquiryStatProgress"],["closed","inquiryStatClosed"]])
  el(id).textContent=inquiries.filter(item=>item.status===key).length;
 if(!matches.length){target.innerHTML='<div class="bi-inbox-empty">No inquiries match your filters.</div>';return;}
 target.innerHTML=matches.map(item=>{
  const state=statuses[item.status]||"New";
  const assignment='<option value="">Unassigned</option>'+realtors.map(r=>
   '<option value="'+escapeHtml(r.discordId)+'"'+(r.discordId===item.assigned_discord_id?' selected':'')+'>'+escapeHtml(r.name)+'</option>').join("");
  const options=Object.entries(statuses).map(([value,label])=>
   '<option value="'+value+'"'+(item.status===value?' selected':'')+'>'+label+'</option>').join("");
  const age=new Date(item.created_at).toLocaleString();
  return '<article class="bi-inbox-card" data-inquiry-id="'+escapeHtml(item.id)+'">'+
   '<div class="bi-inbox-top"><div><span class="eyebrow">PROPERTY INQUIRY · '+escapeHtml(age)+'</span>'+
   '<h2 class="serif">'+escapeHtml(item.property_name)+'</h2>'+
   '<a href="property.html?id='+encodeURIComponent(item.property_id)+'" target="_blank" rel="noopener noreferrer">Open property listing ↗</a></div>'+
   '<span class="bi-inbox-tag" data-status="'+escapeHtml(item.status)+'">'+escapeHtml(state)+'</span></div>'+
   '<div class="bi-inbox-contacts"><p><strong>Character</strong>'+escapeHtml(item.character_name)+'</p>'+
   '<p><strong>In-game phone</strong>'+escapeHtml(item.in_game_phone)+'</p>'+
   '<p><strong>Discord contact</strong>'+escapeHtml(item.discord_contact||"Not provided")+'</p></div>'+
   '<div class="bi-inbox-message"><strong>Visitor message</strong><p>'+escapeHtml(item.message)+'</p></div>'+
   '<div class="bi-inbox-actions"><label>Status<select data-inquiry-status>'+options+'</select></label>'+
   '<label>Assigned Realtor<select data-inquiry-assignee>'+assignment+'</select></label>'+
   '<label class="bi-inbox-note">Internal notes<textarea data-inquiry-note maxlength="2000" rows="3" placeholder="Private follow-up notes…">'+escapeHtml(item.internal_note||"")+'</textarea></label>'+
   '<button type="button" class="button dark" data-inquiry-save>Save changes →</button>'+
   '<small>Discord notification: '+escapeHtml(item.discord_notification||"pending")+'</small></div></article>';
 }).join("");
}
async function reload(){
 el("inquiryStaffContent").hidden=true;
 const {data:{session}}=await client.auth.getSession();
 el("inquiryStaffLogin").hidden=Boolean(session);
 el("inquiryStaffSession").hidden=!session;
 if(!session){info("Sign in with your Brick & Ivy Owner or authorized Realtor Discord account.");return}
 info("Verifying Discord permissions and loading inquiries…");
 try{
  const result=await api("listInquiries");
  inquiries=result.inquiries||[];realtors=result.realtors||[];
  el("inquiryStaffContent").hidden=false;
  el("inquiryDiscordTestArea").hidden=result.role!=="owner";
  el("inquiryDiscordTest").disabled=result.discordConfigured!==true;
  el("inquiryDiscordState").textContent=result.discordConfigured===false?
   "Discord webhook is not configured. Inquiries are still saved privately.":
   result.discordConfigured===true?"Discord webhook configured.":"Notifications are managed by the Owner.";
  info("Private inquiry inbox loaded. "+inquiries.length+" inquiries.");
  render();
 }catch(error){info(error.message||"Unable to open the inquiry inbox.")}
}
async function init(){
 try{
  const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm");
  client=createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  el("inquiryStaffSignIn").addEventListener("click",async()=>{
   const {error}=await client.auth.signInWithOAuth({provider:"discord",options:{redirectTo:location.origin+location.pathname}});
   if(error)info(error.message);
  });
  el("inquiryStaffSignOut").addEventListener("click",async()=>{await client.auth.signOut();inquiries=[];await reload()});
  el("inquiryStaffRefresh").addEventListener("click",reload);
  el("inquiryDiscordTest").addEventListener("click",async()=>{
   if(!confirm("Send a clearly labeled test message and Realtor role mention to the configured Discord channel?"))return;
   const button=el("inquiryDiscordTest");button.disabled=true;info("Sending Discord test…");
   try{const data=await api("testInquiryDiscord");info(data.message||"Discord test sent.");}
   catch(error){info(error.message||"Discord test could not be delivered.");}
   finally{button.disabled=false}
  });
  el("inquiryStaffSearch").addEventListener("input",render);
  el("inquiryStaffFilter").addEventListener("change",render);
  el("inquiryStaffList").addEventListener("click",async event=>{
   const button=event.target.closest("[data-inquiry-save]");
   if(!button||busy)return;
   const card=button.closest("[data-inquiry-id]");
   if(!card)return;
   busy=true;button.disabled=true;info("Saving inquiry…");
   try{
    const updated={id:card.dataset.inquiryId,status:card.querySelector("[data-inquiry-status]").value,
     assignedDiscordId:card.querySelector("[data-inquiry-assignee]").value,note:card.querySelector("[data-inquiry-note]").value};
    await api("updateInquiry",updated);
    info("Inquiry changes saved.");
    await reload();
   }catch(error){info(error.message||"Unable to save changes.");button.disabled=false}
   finally{busy=false}
  });
  await reload();
 }catch(error){info("Could not load inquiry management: "+(error.message||"Unknown error"))}
}
document.addEventListener("DOMContentLoaded",init);
