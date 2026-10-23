/* Owner-only Brick & Ivy homepage editor with optimistic concurrency and
 * server-verified Discord ownership. Preview never modifies published content.
 */
const cfg=window.BRICK_IVY_CONFIG||{};
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const layoutOptions={
homeTheme:[["classic","Original Brick & Ivy"],["forest","Deep forest"],["coastal","Coastal"],["slate","Modern slate"],["warm","Warm ivory"]],
heroLayout:[["split","Split image + text"],["stacked","Stacked headline + image"],["image-focus","Full image background"]],
featuredLayout:[["three","Three cards"],["two","Two columns / four cards"],["compact","Compact / six cards"]],
neighborhoodLayout:[["cards","Large images"],["compact","Compact images"]],
aboutLayout:[["image-left","Image left"],["image-right","Image right"],["text-first","Text focused"]]};
const sectionKeys=["featured","neighborhoods","about","contact"];
const sectionNames={featured:"Featured properties",neighborhoods:"Neighborhoods",about:"About Brick & Ivy",contact:"Contact section"};
const imageFields=["heroImage","lsImage","sandyImage","paletoImage","aboutImage"];
const groups=[
 {title:'Colors & layout',summary:'Change the color palette and choose different section layouts.',fields:[
 ['homeTheme','Theme','select'],['primaryColor','Primary color','color'],['accentColor','Accent color','color'],
 ['heroLayout','Hero layout','select'],['featuredLayout','Property card layout','select'],
 ['neighborhoodLayout','Neighborhood layout','select'],['aboutLayout','About layout','select']]},
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
let client=null,revision=null,draft=null,published=null,busy=false,dirty=false,media=[],mediaTarget='heroImage',sectionOrder=[...sectionKeys];
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
 if(type==='select')return '<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong><select id="'+id+'" data-home-editor="'+key+'">'+(layoutOptions[key]||[]).map(([v,n])=>'<option value="'+safe(v)+'">'+safe(n)+'</option>').join('')+'</select></label>';
 if(type==='color')return '<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong><input type="color" id="'+id+'" data-home-editor="'+key+'"></label>';
 if(type==='long')return '<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong>'+
   '<textarea id="'+id+'" data-home-editor="'+key+'" maxlength="'+max+'" rows="3"></textarea></label>';
 const basic='<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong>'+
   '<input id="'+id+'" data-home-editor="'+key+'" type="'+(type==='image'?'url':'text')+
   '" maxlength="'+max+'" '+(type==='image'?'placeholder="https://…"':'')+
   (['announcementText','heroCaption'].includes(key)?'':' required')+'></label>';
 return type==='image'?'<div class="home-editor-image-field">'+basic+
  '<div class="home-image-actions"><label class="button outline">Upload image<input type="file" data-image-upload="'+key+'" accept="image/jpeg,image/png,image/webp" hidden></label>'+
  '<button type="button" class="button outline" data-choose-image="'+key+'">Choose from library</button></div></div>':basic;
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
 sectionOrder=Array.isArray(values?.sectionOrder)&&values.sectionOrder.length===4&&sectionKeys.every(x=>values.sectionOrder.includes(x))?[...values.sectionOrder]:[...sectionKeys];
 renderSectionOrder();
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
 values.sectionOrder=[...sectionOrder];
 return values;
}
function renderSectionOrder(){
 const target=$('homeSectionOrder');if(!target)return;
 target.innerHTML=sectionOrder.map((id,i)=>'<div class="home-order-row"><span>'+(i+1)+'.</span><strong>'+safe(sectionNames[id])+'</strong><div>'+
 '<button type="button" data-order-index="'+i+'" data-order-step="-1" '+(i===0?'disabled':'')+' aria-label="Move section up">↑</button>'+
 '<button type="button" data-order-index="'+i+'" data-order-step="1" '+(i===3?'disabled':'')+' aria-label="Move section down">↓</button></div></div>').join('');
}
function setImageField(key,url){
 const node=document.querySelector('[data-home-editor="'+key+'"]');
 if(!node||!imageFields.includes(key))return;
 node.value=url;mediaTarget=key;dirty=true;updatePreview();updateButtons();
}
function showMediaStatus(message){const node=$('homeMediaStatus');if(node)node.textContent=message;}
function safeMediaUrl(raw){
 try{const url=new URL(raw);return url.protocol==='https:'&&url.origin===new URL(cfg.supabaseUrl).origin&&
 url.pathname.startsWith('/storage/v1/object/public/brickivy-homepage-media/')?url.href:''}
 catch{return ''}
}
async function mediaApi(action,args={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error('Your Owner session expired.');
 const uploading=action==='upload';
 const form=uploading?new FormData():null;
 if(form){form.append('action','upload');form.append('file',args.file)}
 const response=await fetch(cfg.supabaseUrl+'/functions/v1/brickivy-homepage-media',{
 method:'POST',credentials:'omit',
 headers:uploading?{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token}:
 {apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
 body:uploading?form:JSON.stringify({action,...args})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Media request failed');
 return data;
}
function renderMedia(){
 const target=$('homeMediaLibrary');if(!target)return;
 target.innerHTML=media.length?media.map(item=>{
  const url=safeMediaUrl(item.url);if(!url)return '';
  return '<div class="home-media-card"><img src="'+safe(url)+'" alt="'+safe(item.filename)+'" loading="lazy">'+
   '<p title="'+safe(item.filename)+'">'+safe(item.filename)+'</p>'+
   '<div class="home-media-buttons"><button type="button" data-media-use="'+safe(item.objectKey)+'">Use image</button>'+
   '<button type="button" class="home-media-remove" data-media-delete="'+safe(item.objectKey)+'">Delete</button></div></div>';
 }).join(''):'<p class="home-media-empty">No uploads yet. Add a JPEG, PNG or WebP to start your image library.</p>';
}
async function loadMedia(){
 try{const data=await mediaApi('list');media=data.images||[];renderMedia();
 showMediaStatus(media.length+' saved image(s). Choose an image field, then click Use image.');
 }catch(error){showMediaStatus(error.message||'Unable to list images');}
}
async function uploadMedia(file,targetField){
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>5*1024*1024){
  showMediaStatus('Images must be JPEG, PNG, or WebP files no larger than 5 MB.');return;
 }
 if(busy)return;
 busy=true;updateButtons();showMediaStatus('Uploading '+file.name+'…');
 try{
  const data=await mediaApi('upload',{file});
  media.unshift(data.image);renderMedia();
  if(targetField)setImageField(targetField,data.image.url);
  showMediaStatus('Image uploaded'+(targetField?' and selected.':' to your library.')+' Save Draft when ready.');
 }catch(error){showMediaStatus(error.message||'Image upload failed');}
 finally{busy=false;updateButtons()}
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
 setPreviewText('homePreviewSearch',d.searchTitle);
 setPreviewText('homePreviewSearchSub',d.searchSubtitle);
 setPreviewText('homePreviewCollection',d.collectionLead+' '+d.collectionHighlight);
 setPreviewText('homePreviewCollectionDesc',d.collectionDescription);
 setPreviewText('homePreviewNeighborhoods',d.neighborhoodsLead+' '+d.neighborhoodsHighlight);
 setPreviewText('homePreviewNeighborhoodsDesc',d.neighborhoodsDescription);
 setPreviewText('homePreviewAbout',d.aboutLead+' '+d.aboutHighlight);
 setPreviewText('homePreviewAboutDesc',d.aboutDescription);
 setPreviewText('homePreviewCta',d.ctaLead+' '+d.ctaHighlight);
 setPreviewText('homePreviewCtaDesc',d.ctaDescription);
 setPreviewText('homePreviewCtaButton',d.ctaButton);
 setPreviewText('homePreviewAnnouncement',d.announcementText);
 const panel=document.querySelector('.home-editor-preview-panel');
 if(panel){
  panel.dataset.homeTheme=d.homeTheme;
  if(/^#[a-fA-F0-9]{6}$/.test(d.primaryColor))panel.style.setProperty('--home-primary',d.primaryColor);
  if(/^#[a-fA-F0-9]{6}$/.test(d.accentColor))panel.style.setProperty('--home-accent',d.accentColor);
  panel.dataset.homeHeroLayout=d.heroLayout;
 }
 const hero=document.querySelector('.home-preview-hero');
 if(hero)hero.dataset.layout=d.heroLayout;
 const extras=document.querySelector('.home-preview-extra');
 if(extras){const nodes={featured:$('homePreviewCollectionWrap'),neighborhoods:$('homePreviewNeighborhoodsWrap'),about:$('homePreviewAboutWrap'),contact:$('homePreviewCtaWrap')};
 for(const key of sectionOrder)if(nodes[key])extras.appendChild(nodes[key]);}
 for(const [id,key] of [
   ['homePreviewImage','heroImage'],['homePreviewLsImage','lsImage'],
   ['homePreviewSandyImage','sandyImage'],['homePreviewPaletoImage','paletoImage'],
   ['homePreviewAboutImage','aboutImage']]){
   const el=$(id);if(!el)continue;
   try{
     const url=new URL(d[key]);
     if(url.protocol==='https:'&&!url.username&&!url.password){el.src=url.href;el.hidden=false;}
     else el.hidden=true;
   }catch{el.hidden=true}
 }
 if($('homePreviewAnnouncementWrap'))$('homePreviewAnnouncementWrap').hidden=!d.announcementEnabled||!d.announcementText;
 if($('homePreviewCollectionWrap'))$('homePreviewCollectionWrap').hidden=!d.showFeatured;
 if($('homePreviewNeighborhoodsWrap'))$('homePreviewNeighborhoodsWrap').hidden=!d.showNeighborhoods;
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
  await loadMedia();
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
  $('homeSectionOrder')?.addEventListener('click',event=>{
   const button=event.target.closest('[data-order-index]');if(!button)return;
   const i=Number(button.dataset.orderIndex),j=i+Number(button.dataset.orderStep);
   if(i<0||j<0||j>=sectionOrder.length)return;
   [sectionOrder[i],sectionOrder[j]]=[sectionOrder[j],sectionOrder[i]];
   dirty=true;renderSectionOrder();updatePreview();updateButtons();
  });
  $('homeEditorGroups')?.addEventListener('click',event=>{
   const button=event.target.closest('[data-choose-image]');
   if(!button)return;
   mediaTarget=button.dataset.chooseImage;
   showMediaStatus('Select Use image to assign a saved image to '+mediaTarget+'.');
   $('homeMediaLibrary')?.scrollIntoView({block:'center',behavior:'smooth'});
  });
  $('homeEditorGroups')?.addEventListener('change',event=>{
   const picker=event.target.closest('[data-image-upload]');if(!picker)return;
   const file=picker.files?.[0];if(file)uploadMedia(file,picker.dataset.imageUpload);
   picker.value='';
  });
  $('homeMediaUpload')?.addEventListener('change',event=>{
   const file=event.target.files?.[0];if(file)uploadMedia(file,mediaTarget);
   event.target.value='';
  });
  $('homeMediaLibrary')?.addEventListener('click',async event=>{
   const select=event.target.closest('[data-media-use]');
   if(select){
    const item=media.find(x=>x.objectKey===select.dataset.mediaUse);
    if(item){setImageField(mediaTarget,item.url);showMediaStatus('Selected for '+mediaTarget+'. Save Draft and Publish when ready.')}
    return;
   }
   const remove=event.target.closest('[data-media-delete]');if(!remove||busy)return;
   const item=media.find(x=>x.objectKey===remove.dataset.mediaDelete);if(!item)return;
   const values=collect();
   if(imageFields.some(key=>values[key]===item.url)){
    showMediaStatus('That image is selected in the current editor. Replace it before deleting.');return;
   }
   if(!confirm('Permanently delete '+item.filename+' from your media library?'))return;
   busy=true;updateButtons();
   try{await mediaApi('delete',{objectKey:item.objectKey});media=media.filter(x=>x.objectKey!==item.objectKey);
    renderMedia();showMediaStatus('Image removed.');
   }catch(error){showMediaStatus(error.message||'Delete failed');}
   finally{busy=false;updateButtons()}
  });
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
