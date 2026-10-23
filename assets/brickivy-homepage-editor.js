/* Owner-only Brick & Ivy homepage editor with optimistic concurrency and
 * server-verified Discord ownership. Preview never modifies published content.
 */
const cfg=window.BRICK_IVY_CONFIG||{};
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups=[
 {title:'Announcement bar',summary:'Optional message above the homepage, useful for events, special notices or promotions.',fields:[
 ['announcementEnabled','Show announcement','toggle'],
 ['announcementText','Announcement message','text',200]]},
 {title:'Hero section',summary:'The first thing visitors see when they open the homepage.',fields:[
 ['heroEyebrow','Top label','text',200],['heroLead','Main headline','text',200],['heroHighlight','Highlighted headline','text',200],
 ['heroDescription','Introduction','long',1500],['heroPrimaryText','Property button text','text',200],
 ['heroSecondaryText','About button text','text',200],['heroImage','Main image (HTTPS URL)','image',2048],
 ['heroImageAlt','Main image description','text',200],['heroCaption','Image caption','text',200]]},
 {title:'Property collection',summary:'Customize the heading over your live featured listings. The property cards still come from OPFW.',fields:[
 ['showFeatured','Show featured listing section','toggle'],
 ['collectionEyebrow','Top label','text',200],['collectionLead','Heading','text',200],
 ['collectionHighlight','Highlighted words','text',200],['collectionDescription','Description','long',1500]]},
 {title:'Neighborhoods',summary:'Edit the regional introduction, images and section visibility.',fields:[
 ['showNeighborhoods','Show neighborhoods','toggle'],['neighborhoodsEyebrow','Top label','text',200],
 ['neighborhoodsLead','Heading','text',200],['neighborhoodsHighlight','Highlighted words','text',200],
 ['neighborhoodsDescription','Description','long',1500],
 ['lsImage','Los Santos image (HTTPS URL)','image',2048],
 ['sandyImage','Sandy Shores image (HTTPS URL)','image',2048],
 ['paletoImage','Paleto Bay image (HTTPS URL)','image',2048]]},
 {title:'About Brick & Ivy',summary:'Tell visitors what makes your real estate business different.',fields:[
 ['showAbout','Show About section','toggle'],['aboutEyebrow','Top label','text',200],
 ['aboutLead','Heading','text',200],['aboutHighlight','Highlighted words','text',200],
 ['aboutDescription','Description','long',1500],['aboutImage','About image (HTTPS URL)','image',2048]]},
 {title:'Bottom call-to-action',summary:'Update the section encouraging visitors to reach your Realtors.',fields:[
 ['showCta','Show contact section','toggle'],['ctaEyebrow','Top label','text',200],
 ['ctaLead','Heading','text',200],['ctaHighlight','Highlighted words','text',200],
 ['ctaDescription','Description','long',1500],['ctaButton','Realtor button text','text',200]]},
 {title:'Quick search labels',summary:'Keep the property search itself working; customize only its introductory copy.',fields:[
 ['searchTitle','Search headline','text',200],['searchSubtitle','Search subtitle','text',200]]}
];
let client=null,revision=null,draft=null,published=null,busy=false,dirty=false;
const endpoint=()=>cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/brickivy-homepage';
function say(message){const status=$('homeEditorStatus');if(status)status.textContent=message;}
async function api(action,other={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error('Sign in to continue.');
 const response=await fetch(endpoint(),{method:'POST',credentials:'omit',
  headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
  body:JSON.stringify({action,...other})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||'Homepage request failed');
 return result;
}
function inputMarkup([key,label,type,max]){
 const id='home-edit-'+key;
 if(type==='toggle')return '<label class="home-toggle"><input type="checkbox" id="'+id+'" data-home-editor="'+key+'">'+
   '<span>'+safe(label)+'</span></label>';
 if(type==='long')return '<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong>'+
   '<textarea id="'+id+'" data-home-editor="'+key+'" maxlength="'+max+'" rows="3"></textarea></label>';
 return '<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong>'+
   '<input id="'+id+'" data-home-editor="'+key+'" type="'+(type==='image'?'url':'text')+
   '" maxlength="'+max+'" '+(type==='image'?'placeholder="https://…"':'')+
   (['announcementText','heroCaption'].includes(key)?'':' required')+'></label>';
}
function buildForm(){
 const target=$('homeEditorGroups');if(!target)return;
 target.innerHTML=groups.map((group,i)=>
  '<details class="home-editor-group" '+(i===1?'open':'')+'>'+
   '<summary><span><strong>'+safe(group.title)+'</strong><small>'+safe(group.summary)+'</small></span><span aria-hidden="true">＋</span></summary>'+
   '<div class="home-editor-fields">'+group.fields.map(inputMarkup).join('')+'</div></details>'
 ).join('');
 target.addEventListener('input',()=>{dirty=true;updatePreview();updateButtons()});
 target.addEventListener('change',()=>{dirty=true;updatePreview();updateButtons()});
}
function fillForm(values){
 for(const [key,value]of Object.entries(values||{})){
  const field=document.querySelector('[data-home-editor="'+key+'"]');
  if(!field)continue;
  if(field.type==='checkbox')field.checked=value===true;
  else field.value=String(value??'');
 }
 dirty=false;updatePreview();updateButtons();
}
function collect(){
 const values={};
 document.querySelectorAll('[data-home-editor]').forEach(node=>{
  values[node.dataset.homeEditor]=node.type==='checkbox'?node.checked:node.value.trim();
 });
 return values;
}
function setPreviewText(id,value){const el=$(id);if(el)el.textContent=value||''}
function updatePreview(){
 const d=collect();
 setPreviewText('homePreviewEyebrow',d.heroEyebrow);
 setPreviewText('homePreviewLead',d.heroLead);
 setPreviewText('homePreviewHighlight',d.heroHighlight);
 setPreviewText('homePreviewDescription',d.heroDescription);
 setPreviewText('homePreviewPrimary',d.heroPrimaryText);
 setPreviewText('homePreviewSecondary',d.heroSecondaryText);
 setPreviewText('homePreviewCollection',d.collectionLead+' '+d.collectionHighlight);
 setPreviewText('homePreviewAbout',d.aboutLead+' '+d.aboutHighlight);
 setPreviewText('homePreviewCta',d.ctaLead+' '+d.ctaHighlight);
 setPreviewText('homePreviewAnnouncement',d.announcementText);
 const img=$('homePreviewImage');
 if(img){
  try{
   const url=new URL(d.heroImage);
   if(url.protocol==='https:'&&!url.username&&!url.password){img.src=url.href;img.hidden=false;}
   else img.hidden=true;
  }catch{img.hidden=true}
 }
 if($('homePreviewAnnouncementWrap'))$('homePreviewAnnouncementWrap').hidden=!d.announcementEnabled||!d.announcementText;
 if($('homePreviewCollectionWrap'))$('homePreviewCollectionWrap').hidden=!d.showFeatured;
 if($('homePreviewAboutWrap'))$('homePreviewAboutWrap').hidden=!d.showAbout;
 if($('homePreviewCtaWrap'))$('homePreviewCtaWrap').hidden=!d.showCta;
 setPreviewText('homeEditorUnsaved',dirty?'Unsaved draft changes':'Draft matches saved version');
}
function updateButtons(){
 for(const id of ['homeEditorSave','homeEditorPublish','homeEditorDiscard','homeEditorRestore']){
  const el=$(id);if(el)el.disabled=busy||revision===null;
 }
}
function validate(){
 for(const node of document.querySelectorAll('[data-home-editor]')){
  if(node.type==='checkbox')continue;
  if(!node.checkValidity()){
   node.closest('details')?.setAttribute('open','');
   node.reportValidity();throw Error('Check the highlighted field before saving.');
  }
 }
 return collect();
}
async function saveDraft(){
 const content=validate();
 const response=await api('saveDraft',{revision,content});
 revision=response.revision;draft=response.draft;
 dirty=false;updatePreview();updateButtons();
 return response;
}
async function load(){
 const gate=$('homeEditorGate'),login=$('homeEditorLogin'),session=$('homeEditorSession');
 const {data:{session:current}}=await client.auth.getSession();
 login.hidden=Boolean(current);session.hidden=!current;gate.hidden=true;
 if(!current){say('Sign in with your Brick & Ivy Owner Discord account.');return;}
 say('Verifying Owner role and loading your homepage draft…');
 try{
  const state=await api('load');
  draft=state.draft;published=state.published;revision=state.revision;
  fillForm(draft);gate.hidden=false;
  say('Owner verified. Make changes, preview them, then Save Draft or Publish.');
  updateButtons();
 }catch(err){say(err.message||'Unable to open Homepage Editor');}
}
async function action(name){
 if(busy||revision===null)return;
 busy=true;updateButtons();
 try{
  if(name==='save'){
   say('Saving draft…');const data=await saveDraft();
   say('Draft saved privately. The public homepage is unchanged.'+(data.auditRecorded===false?' Audit log unavailable.':''));
  }else if(name==='publish'){
   if(!confirm('Publish your homepage changes to all visitors now?'))return;
   say('Publishing homepage…');
   if(dirty)await saveDraft();
   const data=await api('publish',{revision});
   revision=data.revision;draft=data.draft;published=data.published;
   fillForm(draft);say('Published successfully. Reload the public homepage to see your changes.');
  }else if(name==='discard'){
   if(!confirm('Discard the saved draft and return to the currently published homepage?'))return;
   const data=await api('resetDraft',{revision});
   revision=data.revision;draft=data.draft;fillForm(draft);
   say('Draft reset to the currently published homepage. No public changes were made.');
  }else if(name==='restore'){
   if(!confirm('Replace this draft with the original Brick & Ivy homepage layout? Nothing changes publicly until you publish.'))return;
   const data=await api('restoreDefaults',{revision});
   revision=data.revision;draft=data.draft;fillForm(draft);
   say('Original layout loaded into the private draft. Publish if you want to restore it publicly.');
  }
 }catch(err){say(err.message||'Unable to save homepage');}
 finally{busy=false;updateButtons()}
}
async function init(){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'')||!cfg.publishableKey){
  say('Supabase configuration unavailable.');return;
 }
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm');
  client=createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  buildForm();
  $('homeEditorSignIn')?.addEventListener('click',async()=>{
   const {error}=await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo:location.origin+location.pathname}});
   if(error)say(error.message);
  });
  $('homeEditorSignOut')?.addEventListener('click',async()=>{await client.auth.signOut();draft=null;revision=null;await load()});
  $('homeEditorSave')?.addEventListener('click',()=>action('save'));
  $('homeEditorPublish')?.addEventListener('click',()=>action('publish'));
  $('homeEditorDiscard')?.addEventListener('click',()=>action('discard'));
  $('homeEditorRestore')?.addEventListener('click',()=>action('restore'));
  $('homeEditorReload')?.addEventListener('click',async()=>{
   if(dirty&&!confirm('Discard unsaved changes and reload the saved draft?'))return;
   await load();
  });
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  await load();
 }catch(err){say('Homepage Editor could not load: '+(err.message||'Unknown error'))}
}
document.addEventListener('DOMContentLoaded',init);
