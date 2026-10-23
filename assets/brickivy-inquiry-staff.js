/* Brick & Ivy private inquiry management, analytics and Realtor workflow. */
const config=window.BRICK_IVY_CONFIG||{};
const el=id=>document.getElementById(id);
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const statuses={new:"New",in_progress:"In progress",contacted:"Contacted",awaiting_customer:"Awaiting customer",closed:"Closed"};
const n=val=>Number(val||0).toLocaleString("en-US");
const followupHours=item=>{
 if(!["new","in_progress"].includes(item.status)||item.contacted_at)return 0;
 const started=Date.parse(item.created_at);
 return Number.isFinite(started)?Math.max(0,(Date.now()-started)/3600000):0;
};
let client=null,inquiries=[],realtors=[],names={},metrics={},currentDiscordId="",role="",busy=false;
const info=msg=>{el("inquiryStaffStatus").textContent=msg;};
async function api(action,extra={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error("Sign in with Discord to manage inquiries.");
 const response=await fetch(config.supabaseUrl+"/functions/v1/brickivy-admin",{
  method:"POST",credentials:"omit",headers:{"content-type":"application/json",
   apikey:config.publishableKey,authorization:"Bearer "+session.access_token},
  body:JSON.stringify({action,...extra})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||"Inquiry request failed.");
 return data;
}
function renderStats(){
 // Aggregate totals come from server-side SQL; the inbox itself shows the 150 newest.
 const totals=[["inquiryStatNew","new"],["inquiryStatProgress","inProgress"],
  ["inquiryStatContacted","contacted"],["inquiryStatAwaiting","awaitingCustomer"],
  ["inquiryStatClosed","closed"],["inquiryStatUnassigned","unassignedOpen"],
  ["inquiryStatNeedsAttention","needsAttention24h"],["inquiryStatUrgent","urgent48h"]];
 for(const [id,key] of totals){const target=el(id);if(target)target.textContent=n(metrics[key]);}
}
function render(){
 const target=el("inquiryStaffList");if(!target)return;
 const term=el("inquiryStaffSearch").value.toLowerCase().trim();
 const filter=el("inquiryStaffFilter").value;
 const mine=el("inquiryStaffMine")?.checked;
 const unassigned=el("inquiryStaffUnassigned")?.checked;
 const attention=el("inquiryStaffNeedsAttention")?.checked;
 const items=inquiries.filter(item=>(!filter||item.status===filter)
  &&(!mine||item.assigned_discord_id===currentDiscordId)
  &&(!unassigned||(!item.assigned_discord_id&&item.status!=="closed"))
  &&(!attention||followupHours(item)>=24)
  &&(!term||[item.property_name,item.property_id,item.character_name,item.in_game_phone,item.message,item.discord_contact]
    .some(v=>String(v||"").toLowerCase().includes(term))));
 renderStats();
 if(!items.length){target.innerHTML='<div class="bi-inbox-empty">No inquiries match the selected filters.</div>';return;}
 target.innerHTML=items.map(item=>{
  const age=new Date(item.created_at).toLocaleString();
  const assignee=item.assigned_discord_id;
  const assigned=assignee?names[assignee]||"Assigned Realtor":"Unassigned";
  const assignment='<option value="">Unassigned</option>'+realtors.map(r=>
   '<option value="'+safe(r.discordId)+'"'+(r.discordId===assignee?' selected':'')+'>'+safe(r.name)+'</option>').join("");
  const options=Object.entries(statuses).map(([value,label])=>
   '<option value="'+value+'"'+(item.status===value?' selected':'')+'>'+label+'</option>').join("");
  const status=String(item.status||"new");
  const canClaim=!assignee&&status!=="closed";
  const wait=followupHours(item);
  const due=wait>=48?'<span class="bi-followup-tag is-urgent">Urgent · No contact for 48+ hours</span>':
    wait>=24?'<span class="bi-followup-tag">Attention needed · No contact for 24+ hours</span>':'';
  const retryable=role==="owner"&&["failed","not_configured"].includes(item.discord_notification);
  const sinceRetry=item.discord_last_retry_at?Date.now()-Date.parse(item.discord_last_retry_at):Infinity;
  const retryBlocked=sinceRetry<60000;
  return '<article class="bi-inbox-card" data-inquiry-id="'+safe(item.id)+'">'+
   '<div class="bi-inbox-top"><div><span class="eyebrow">INQUIRY · '+safe(age)+'</span>'+
   '<h2 class="serif">'+safe(item.property_name)+'</h2>'+due+
   '<a href="property.html?id='+encodeURIComponent(item.property_id)+'" target="_blank" rel="noopener noreferrer">Open listing ↗</a></div>'+
   '<span class="bi-inbox-tag" data-status="'+safe(status)+'">'+safe(statuses[status]||status)+'</span></div>'+
   '<p class="bi-inbox-assigned"><strong>Assigned to:</strong> '+safe(assigned)+
   (canClaim?' <button type="button" class="button dark" data-inquiry-claim>Claim inquiry</button>':'')+'</p>'+
   '<div class="bi-inbox-contacts"><p><strong>Character</strong>'+safe(item.character_name)+'</p>'+
   '<p><strong>In-game phone</strong>'+safe(item.in_game_phone)+'</p>'+
   '<p><strong>Discord contact</strong>'+safe(item.discord_contact||"Not provided")+'</p></div>'+
   '<div class="bi-inbox-message"><strong>Visitor message</strong><p>'+safe(item.message)+'</p></div>'+
   '<div class="bi-inbox-actions"><label>Status<select data-inquiry-status>'+options+'</select></label>'+
   '<label>Assigned Realtor<select data-inquiry-assignee>'+assignment+'</select></label>'+
   '<label class="bi-inbox-note">Private follow-up notes<textarea data-inquiry-note maxlength="2000" rows="3" placeholder="Call result, next steps or appointment details…">'+safe(item.internal_note||"")+'</textarea></label>'+
   '<button type="button" class="button dark" data-inquiry-save>Save inquiry →</button>'+
   '<button type="button" class="button outline" data-history-toggle>View activity history</button>'+
   '<div class="bi-inbox-template"><label>Copy a customer response<select data-response-template>'+
   '<option value="initial">First response</option><option value="viewing">Arrange a viewing</option>'+
   '<option value="followup">Follow-up</option><option value="unavailable">Property unavailable</option></select></label>'+
   '<button type="button" class="button outline" data-copy-response>Copy message</button></div>'+
   '<div class="bi-inbox-retry"><small>Original inquiry alert: '+safe(item.discord_notification||"pending")+'</small>'+
   (retryable?'<button type="button" class="button outline" data-inquiry-retry'+(retryBlocked?' disabled':'')+
   ' aria-label="Retry failed notification for '+safe(item.property_name)+'">Retry Discord notification</button>':'')+
   (retryBlocked&&retryable?'<small>Retry available one minute after the previous attempt.</small>':'')+'</div>'+
   '<div class="bi-inbox-history" data-inquiry-history hidden></div></div></article>';
 }).join("");
}
function formatHours(value){return value===null||value===undefined?"Not enough closed inquiries":n(value)+" hours";}
function renderAnalytics(){
 const root=el("inquiryAnalyticsContent");if(!root)return;
 const summary=metrics||{},properties=Array.isArray(summary.topProperties)?summary.topProperties:[],
  team=Array.isArray(summary.team)?summary.team:[];
 const max=Math.max(...properties.map(x=>Number(x.count)||0),1);
 const cards=[
  ["Total inquiries",summary.total],["Last 7 days",summary.lastSevenDays],
  ["Unassigned & open",summary.unassignedOpen],["Needs attention (24h)",summary.needsAttention24h],
  ["Urgent (48h)",summary.urgent48h],["Closed",summary.closed]
 ].map(([title,num])=>'<div class="bi-analytics-metric"><strong>'+safe(n(num))+'</strong><span>'+safe(title)+'</span></div>').join("");
 root.innerHTML='<div class="bi-analytics-metrics">'+cards+'</div>'+
 '<p class="bi-analytics-average"><strong>Average time to close:</strong> '+safe(formatHours(summary.averageCloseHours))+'</p>'+
 '<div class="bi-analytics-columns"><section><h3>Most requested properties</h3>'+
 (properties.length?properties.map(p=>'<div class="bi-analytics-property"><div><strong>'+safe(p.propertyName||p.propertyId)+'</strong><span>'+safe(n(p.count))+' inquiries</span></div>'+
 '<div class="bi-analytics-track"><span style="width:'+Math.round(100*Number(p.count||0)/max)+'%"></span></div></div>').join(""):
 '<p>No property inquiries yet.</p>')+'</section>'+
 '<section><h3>Realtor activity</h3>'+
 (team.length?'<div class="bi-table-scroll"><table class="bi-analytics-table"><thead><tr><th>Realtor</th><th>Assigned</th><th>Open</th><th>Closed</th><th>Claims</th></tr></thead><tbody>'+
 team.map(p=>'<tr><td>'+safe(p.name||"Realtor")+'</td><td>'+safe(n(p.assigned))+'</td><td>'+safe(n(p.open))+'</td><td>'+safe(n(p.closed))+'</td><td>'+safe(n(p.claims))+'</td></tr>').join("")+
 '</tbody></table></div>':'<p>No Realtors available.</p>')+
 '</section></div><p class="bi-analytics-caption">Metrics include all saved inquiries. Realtor assignment counts reflect the current assignee; claims are recorded as activity events.</p>';
}
function renderActivity(history,element,named={}){
 const labels={claimed:"Claimed inquiry",assigned:"Assigned to Realtor",unassigned:"Unassigned Realtor",
  status_changed:"Changed status",note_updated:"Updated private notes",updated:"Updated inquiry"};
 element.hidden=false;
 if(!history?.length){element.innerHTML='<p>No activity recorded yet.</p>';return}
 element.innerHTML='<h3>Activity history</h3><ol class="bi-activity-list">'+history.map(x=>{
  const actor=named[x.actor_discord_id]||"Staff member";
  const when=new Date(x.created_at).toLocaleString();
  const event=labels[x.event_type]||"Updated";
  const statusChanged=x.previous_status!==x.new_status?' · '+(statuses[x.previous_status]||x.previous_status||"Unknown")+' → '+(statuses[x.new_status]||x.new_status||"Unknown"):"";
  const assignment=x.old_assignee!==x.new_assignee?' · Assigned: '+(named[x.new_assignee]|| (x.new_assignee?"Realtor":"Unassigned")):"";
  return '<li><strong>'+safe(event)+'</strong><span>'+safe(actor)+' · '+safe(when)+safe(statusChanged)+safe(assignment)+(x.note_changed?" · Private note changed":"")+'</span></li>'
 }).join("")+'</ol>';
}
function responseText(item,kind){
 const customer=String(item.character_name||"there"),property=String(item.property_name||"the property");
 const scripts={
  initial:"Hello "+customer+", this is Brick & Ivy Real Estate. We received your inquiry about "+property+". A Realtor will be happy to answer your questions. When would be a good time to talk?",
  viewing:"Hello "+customer+", this is Brick & Ivy following up about "+property+". Would you like to arrange a viewing? Let us know when you're available.",
  followup:"Hello "+customer+", we're following up on your inquiry about "+property+". Please let us know if you're still interested or have any additional questions.",
  unavailable:"Hello "+customer+", thank you for asking about "+property+". It is currently unavailable, but Brick & Ivy can help you explore other properties. Would you like some alternatives?"
 };
 return scripts[kind]||scripts.initial;
}
async function reload(){
 el("inquiryStaffContent").hidden=true;
 const {data:{session}}=await client.auth.getSession();
 el("inquiryStaffLogin").hidden=Boolean(session);
 el("inquiryStaffSession").hidden=!session;
 if(!session){info("Sign in with your Brick & Ivy Owner or authorized Realtor Discord account.");return}
 info("Verifying staff access and loading inquiry dashboard…");
 try{
  const result=await api("listInquiries");
  inquiries=result.inquiries||[];realtors=result.realtors||[];names=result.names||{};
  metrics=result.metrics||{};currentDiscordId=result.currentDiscordId||"";role=result.role||"realtor";
  el("inquiryStaffContent").hidden=false;
  el("inquiryDiscordTestArea").hidden=role!=="owner";
  el("inquiryDiscordTest").disabled=result.discordConfigured!==true;
  el("inquiryDiscordCheck").disabled=false;
  el("inquiryDiscordState").textContent=result.discordConfigured===false?
   "Discord bot notifications are not configured. Inquiries are still saved privately.":
   result.discordConfigured===true?"Brick & Ivy App notifications are configured.":"Discord notifications are managed by the Owner.";
  info("Inquiry dashboard loaded. "+n(inquiries.length)+" recent inquiries.");
  render();renderAnalytics();
 }catch(error){info(error.message||"Unable to open inquiry dashboard.")}
}
async function actionClick(event){
 const button=event.target.closest("button");if(!button||busy)return;
 const card=button.closest("[data-inquiry-id]");if(!card)return;
 const item=inquiries.find(x=>x.id===card.dataset.inquiryId);if(!item)return;
 if(button.hasAttribute("data-history-toggle")){
  const panel=card.querySelector("[data-inquiry-history]");
  if(!panel.hidden){panel.hidden=true;button.textContent="View activity history";return}
  button.disabled=true;panel.hidden=false;panel.textContent="Loading activity…";
  try{const history=await api("inquiryActivity",{id:item.id});renderActivity(history.history,panel,history.names||names);button.textContent="Hide activity history"}
  catch(e){panel.textContent=e.message||"Unable to load history."}
  finally{button.disabled=false}
  return;
 }
 if(button.hasAttribute("data-copy-response")){
  const message=responseText(item,card.querySelector("[data-response-template]").value);
  try{await navigator.clipboard.writeText(message);info("Customer response copied. Send it through your in-game phone or Discord.");}
  catch{info("Clipboard unavailable. Please use a browser with clipboard access.");}
  return;
 }
 if(button.hasAttribute("data-inquiry-retry")){
  if(role!=="owner"){info("Only the Owner may retry a Discord notification.");return}
  if(!confirm("Retry the failed Discord notification for this existing inquiry? This will not ping anyone or create a new inquiry."))return;
  busy=true;button.disabled=true;info("Retrying the original inquiry notification…");
  try{const result=await api("retryInquiryNotification",{id:item.id});
    await reload();info(result.message||"Discord notification retried without pings.");
  }catch(error){info(error.message||"Notification retry failed.");button.disabled=false}
  finally{busy=false}
  return;
 }
 if(!button.hasAttribute("data-inquiry-save")&&!button.hasAttribute("data-inquiry-claim"))return;
 busy=true;button.disabled=true;
 let successMessage="";
 try{
  if(button.hasAttribute("data-inquiry-claim")){
   info("Claiming inquiry…");const result=await api("claimInquiry",{id:item.id});
   successMessage="Inquiry claimed."+(result.notification==="failed"?" The non-pinging Discord claim update could not be posted.":"");
  }else{
   const data={id:item.id,status:card.querySelector("[data-inquiry-status]").value,
    assignedDiscordId:card.querySelector("[data-inquiry-assignee]").value,
    note:card.querySelector("[data-inquiry-note]").value};
   info("Saving inquiry…");const result=await api("updateInquiry",data);
   successMessage="Inquiry saved."+(result.notification==="failed"?" The Realtor assignment notification could not be delivered.":"")+(result.statusNotification==="sent"?" Discord status update posted.":result.statusNotification==="failed"?" The Discord status update could not be posted.":"");
  }
  await reload();
  info(successMessage);
 }catch(e){info(e.message||"Unable to update this inquiry.");button.disabled=false}
 finally{busy=false}
}
async function init(){
 try{
  const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm");
  client=createClient(config.supabaseUrl,config.publishableKey,
   {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  el("inquiryStaffSignIn").addEventListener("click",async()=>{
   const {error}=await client.auth.signInWithOAuth({provider:"discord",
    options:{redirectTo:location.origin+location.pathname}});
   if(error)info(error.message);
  });
  el("inquiryStaffSignOut").addEventListener("click",async()=>{await client.auth.signOut();inquiries=[];await reload()});
  el("inquiryStaffRefresh").addEventListener("click",reload);
  el("inquiryStaffSearch").addEventListener("input",render);
  el("inquiryStaffFilter").addEventListener("change",render);
  el("inquiryStaffMine").addEventListener("change",render);
  el("inquiryStaffUnassigned").addEventListener("change",render);
  el("inquiryStaffNeedsAttention").addEventListener("change",render);
  el("inquiryStaffList").addEventListener("click",actionClick);
  el("inquiryDiscordCheck").addEventListener("click",async()=>{
   const button=el("inquiryDiscordCheck"),output=el("inquiryDiscordDiagnostic");
   button.disabled=true;output.hidden=false;output.textContent="Checking bot identity and channel…";
   try{const d=await api("diagnoseInquiryDiscord");output.textContent="Bot: "+String(d.bot||"Unknown")+". "+String(d.detail||"")}
   catch(e){output.textContent=e.message||"Connection check failed"}
   finally{button.disabled=false}
  });
  el("inquiryDiscordTest").addEventListener("click",async()=>{
   if(!confirm("Send a marked test embed from the Brick & Ivy App? No roles or users will be pinged."))return;
   const button=el("inquiryDiscordTest");button.disabled=true;info("Sending Discord test…");
   try{const d=await api("testInquiryDiscord");info(d.message||"Test sent.")}
   catch(e){info(e.message||"Discord test failed.")}
   finally{button.disabled=false}
  });
  await reload();
 }catch(e){info("Could not initialize inquiry dashboard: "+(e.message||"Unknown error"))}
}
document.addEventListener("DOMContentLoaded",init);
