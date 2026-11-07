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
 ['can_manage_photos','Manage property photos','Upload, remove, reorder and set cover images'],
 ['can_view_financials','View Financial Snapshot','View the weekly company rent, total maintenance and net income dashboard'],
 ['can_manage_inquiries','Manage property inquiries','Read visitor inquiries and update their progress or internal notes']
];
let client=null,roles=[],selectedRoleId="",saving=false;
const STATUS=(txt)=>{const el=byId('permissionsStatus');if(el)el.textContent=txt};
const ROLE_DEFAULT_ID="1502870035176357968";
function availableRole(){
 return roles.find(r=>r.id===selectedRoleId)||null;
}
function renderRolePicker(){
 const picker=byId('permissionRoleSelect');
 if(!picker)return;
 const ordered=[...roles].sort((a,b)=>{
  if(a.isDefaultRealtor!==b.isDefaultRealtor)return a.isDefaultRealtor?-1:1;
  if(a.configured!==b.configured)return a.configured?-1:1;
  return (b.position||0)-(a.position||0);
 });
 picker.innerHTML=ordered.map(r=>
   '<option value="'+safe(r.id)+'">'+safe(r.name)+
   (r.configured?' · Configured':r.isDefaultRealtor?' · Base access':' · Not configured')+
   '</option>').join('');
 if(!roles.some(r=>r.id===selectedRoleId))selectedRoleId=
  ordered.find(r=>r.isDefaultRealtor)?.id||ordered.find(r=>r.configured)?.id||ordered[0]?.id||"";
 picker.value=selectedRoleId;
 const count=byId('configuredRoleCount');
 if(count)count.textContent=roles.filter(r=>r.configured).length+' customized role'+
  (roles.filter(r=>r.configured).length===1?'':'s');
}
function render(){
 renderRolePicker();
 const card=byId('realtorPermissionsList');
 if(!card)return;
 const role=availableRole();
 if(!role){card.innerHTML='<div class="manage-panel">No assignable Discord roles were found. Check your Brick &amp; Ivy Discord bot permissions.</div>';return;}
 const state=role.configured?'Customized role':role.isDefaultRealtor?'Realtor defaults':'Not configured';
 const help=role.isDefaultRealtor?
   'The Realtor role retains its default ability to manage reservations unless you customize it. Owner access is always unrestricted.':
   role.configured?
   'All members with this Discord role receive these permissions while they hold the role.':
   'This role currently provides no staff access. Saving a permission configuration enables Staff Portal access for its members.';
 card.innerHTML='<section class="perm-realtor-card" data-role-card="'+safe(role.id)+'">'+
  '<div class="perm-realtor-header"><div>'+
   '<span class="eyebrow">Brick &amp; Ivy · Discord server role</span>'+
   '<h2 class="serif">'+safe(role.name)+'</h2>'+
   '<p>Role ID '+safe(role.id)+' · '+safe(state)+'</p></div>'+
   '<span class="perm-role-label">'+safe(state)+'</span></div>'+
  '<p class="perm-warning">'+safe(help)+'</p>'+
  (role.deleted?'<div class="manage-notice">This role is no longer in Discord. Remove its saved settings below.</div>':
   '<div class="perm-grid">'+fields.map(([key,label,description])=>
     '<label class="perm-switch"><input type="checkbox" data-permission="'+safe(key)+'" '+
      (role.permissions?.[key]===true?'checked':'')+
      '><span><strong>'+safe(label)+'</strong><small>'+safe(description)+'</small></span></label>'
   ).join('')+'</div>')+
  '<div class="perm-actions">'+
   (role.deleted?'':'<button class="button dark" type="button" data-role-save>Save role permissions →</button>')+
   (role.configured&&!role.isDefaultRealtor?
     '<button class="button outline" type="button" data-role-remove>Remove role access</button>':'')+
   '<span>Applied live to verified Discord members. Permissions from multiple roles are combined.</span></div>'+
  '</section>';
}
async function api(action,data={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error('Sign in to manage permissions.');
 const res=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/brickivy-admin',{
  method:'POST',credentials:'omit',
  headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
  body:JSON.stringify({action,...data})
 });
 const result=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(result.error||'Unable to complete request');
 return result;
}
async function load(){
 const panel=byId('permissionsContent'),login=byId('permissionsLogin'),session=byId('permissionsSession');
 const {data:{session:active}}=await client.auth.getSession();
 login.hidden=Boolean(active);session.hidden=!active;panel.hidden=true;
 if(!active){STATUS('Sign in with your Brick & Ivy Owner Discord account.');return;}
 STATUS('Checking Owner access and retrieving Discord roles…');
 try{
  const result=await api('listRolePermissions');
  roles=Array.isArray(result.roles)?result.roles:[];
  render();panel.hidden=false;
  STATUS('Owner verified. Select a Discord role to manage its permissions.');
 }catch(error){STATUS(error.message||'Could not verify the Owner role or load Discord roles.')}
}
async function setup(){
 if(!cfg.supabaseUrl||!cfg.publishableKey){STATUS('Backend connection unavailable.');return;}
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm');
  client=createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  byId('permissionsSignIn')?.addEventListener('click',async()=>{
   const {error}=await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo:location.origin+location.pathname}});
   if(error)STATUS(error.message);
  });
  byId('permissionsSignOut')?.addEventListener('click',async()=>{
   await client.auth.signOut();roles=[];selectedRoleId='';await load();
  });
  byId('permissionRoleSelect')?.addEventListener('change',event=>{
   selectedRoleId=event.target.value;render();
  });
  byId('realtorPermissionsList')?.addEventListener('click',async event=>{
   if(saving)return;
   const save=event.target.closest('[data-role-save]');
   const remove=event.target.closest('[data-role-remove]');
   if(!save&&!remove)return;
   const role=availableRole(),card=event.target.closest('[data-role-card]');
   if(!role||!card)return;
   if(remove&&!confirm('Remove all Brick & Ivy staff permissions for the Discord role "'+role.name+'"?'))return;
   saving=true;event.target.disabled=true;
   STATUS((remove?'Removing':'Saving')+' permissions for @'+role.name+'…');
   try{
    if(remove){
     const result=await api('deleteRolePermissions',{roleId:role.id});
     role.configured=false;
     role.permissions=Object.fromEntries(fields.map(([key])=>[key,false]));
     STATUS('Role access removed.'+(result.auditRecorded===false?' Audit entry could not be written.':''));
    }else{
     const selected=Object.fromEntries(fields.map(([key])=>[
      key,card.querySelector('[data-permission="'+key+'"]')?.checked===true
     ]));
     const result=await api('saveRolePermissions',{roleId:role.id,permissions:selected});
     role.configured=true;role.permissions=result.permissions;
     STATUS('Permissions saved for @'+role.name+'.'+
      (result.auditRecorded===false?' Audit entry could not be written.':''));
    }
    render();
   }catch(error){STATUS(error.message||'Unable to update role permissions.');event.target.disabled=false;}
   finally{saving=false}
  });
  byId('permissionsRefresh')?.addEventListener('click',load);
  await load();
 }catch(error){STATUS('Could not initialize role settings: '+(error.message||'Unknown error'))}
}
document.addEventListener('DOMContentLoaded',setup);
