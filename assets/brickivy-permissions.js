/* Brick & Ivy Owner-only Realtor permission editor.
 * The backend validates Discord guild roles and each target identity anew
 * for every request. No service-role credentials are present in this file.
 */
const cfg=window.BRICK_IVY_CONFIG||{};
const byId=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[
 ['can_edit_area','Change location / region','Change website area or neighborhood'],
 ['can_manage_reservations','Manage reservations','Mark homes reserved or remove a reservation'],
 ['can_edit_description','Edit property overviews','Change public property descriptions'],
 ['can_set_prices','Edit weekly rent prices','Override displayed website rent prices'],
 ['can_manage_storage','Edit storage presets','Change SU and object limits by interior'],
 ['can_publish','Publish / unpublish','Control public website listing visibility'],
 ['can_feature','Feature homes','Choose which homes are promoted on the homepage'],
 ['can_manage_photos','Manage property photos','Upload, remove, reorder and set cover images']
];
let client=null,profiles=[],saving=false;
function status(message){const el=byId('permissionsStatus');if(el)el.textContent=message;}
function render(){
 const target=byId('realtorPermissionsList');if(!target)return;
 target.innerHTML=profiles.map((profile,index)=>{
  const id=String(profile.discordId||'').trim(),enabled=/^\d{17,20}$/.test(id);
  const title=String(profile.title||'Realtor');
  return '<section class="perm-realtor-card" data-profile-index="'+index+'">'+
   '<div class="perm-realtor-header"><div><span class="eyebrow">Realtor · CID '+safe(profile.characterId)+'</span>'+
   '<h2 class="serif">'+safe(profile.name)+'</h2><p>'+safe(title)+(id?' · Discord ID '+safe(id):' · Discord ID not configured')+'</p></div>'+
   '<span class="perm-role-label">'+(enabled?'Editable':'Setup needed')+'</span></div>'+
   (enabled?'<div class="perm-grid">'+fields.map(([key,label,description])=>
     '<label class="perm-switch"><input type="checkbox" data-permission="'+safe(key)+'" '+
     (profile.permissions?.[key]===true?'checked':'')+'><span><strong>'+safe(label)+'</strong><small>'+safe(description)+'</small></span></label>'
   ).join('')+'</div><div class="perm-actions"><button class="button dark" type="button" data-save-index="'+index+'">Save permissions →</button>'+
   '<span>Changes apply immediately to the next authenticated request.</span></div>':
   '<p class="perm-warning">Set this Realtor’s numeric Discord User ID in <a href="manage-realtors.html">Realtor Management</a> to enable individual permissions. A real Brick &amp; Ivy Realtor Discord role is also required.</p>')+'</section>';
 }).join('')||'<div class="manage-panel">No Realtors have been added. Add one through Realtor Management first.</div>';
}
async function api(action,data={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error('Sign in to manage permissions.');
 const response=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/brickivy-admin',{
  method:'POST',credentials:'omit',
  headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
  body:JSON.stringify({action,...data})
 });
 const value=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(value.error||'Unable to complete request');
 return value;
}
async function load(){
 const panel=byId('permissionsContent'),login=byId('permissionsLogin'),session=byId('permissionsSession');
 const {data:{session:current}}=await client.auth.getSession();
 login.hidden=Boolean(current);session.hidden=!current;panel.hidden=true;
 if(!current){status('Sign in with a Brick & Ivy Owner Discord account to continue.');return;}
 status('Checking your Owner access and Realtor roster…');
 try{
  const result=await api('listPermissions');
  profiles=result.realtors||[];
  render();panel.hidden=false;
  status('Owner access confirmed. Individual Realtor permissions are ready to edit.');
 }catch(error){status(error.message||'Your account does not have Owner permissions.')}
}
async function setup(){
 if(!cfg.supabaseUrl||!cfg.publishableKey){status('Backend connection unavailable.');return;}
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm');
  client=createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  byId('permissionsSignIn')?.addEventListener('click',async()=>{
   const {error}=await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo:location.origin+location.pathname}});
   if(error)status(error.message);
  });
  byId('permissionsSignOut')?.addEventListener('click',async()=>{await client.auth.signOut();profiles=[];await load()});
  byId('realtorPermissionsList')?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-save-index]');
    if(!button||saving)return;
    const index=Number(button.dataset.saveIndex),profile=profiles[index];
    if(!profile)return;
    const card=button.closest('[data-profile-index]');
    const choices=Object.fromEntries(fields.map(([field])=>
      [field,card?.querySelector('[data-permission="'+field+'"]')?.checked===true]));
    saving=true;button.disabled=true;status('Saving '+profile.name+' permissions…');
    try{
      const result=await api('savePermissions',{discordId:profile.discordId,permissions:choices});
      profile.permissions=result.permissions;render();
      status(profile.name+' permissions saved.'+(result.auditRecorded===false?' Change history could not be saved.':''));
    }catch(error){status(error.message||'Could not save permissions.');button.disabled=false;}
    finally{saving=false}
  });
  byId('permissionsRefresh')?.addEventListener('click',load);
  await load();
 }catch(error){status('Could not initialize permissions: '+(error.message||'Unknown error'))}
}
document.addEventListener('DOMContentLoaded',setup);
