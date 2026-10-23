/* Owner-only Brick & Ivy homepage editor with optimistic concurrency and
 * server-verified Discord ownership. Preview never modifies published content.
 */
const cfg=window.BRICK_IVY_CONFIG||{};
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Curated palettes power the theme selector and its matching primary/accent colors.
// Saved manual color adjustments are respected when loading an existing draft.
const themePalettes=Object.freeze([
 {id:"classic",name:"Original Brick & Ivy",primary:"#244436",accent:"#b39a70",note:"Timeless olive and champagne"},
 {id:"forest",name:"Deep Forest",primary:"#173e30",accent:"#b6d2a0",note:"Rich evergreen and sage"},
 {id:"coastal",name:"Coastal Retreat",primary:"#234f60",accent:"#d3b48d",note:"Blue teal and soft sand"},
 {id:"slate",name:"Modern Slate",primary:"#343d4f",accent:"#cbbf9d",note:"Slate and brushed gold"},
 {id:"warm",name:"Warm Ivory",primary:"#61442f",accent:"#d7ae79",note:"Espresso and honey"},
 {id:"midnight",name:"Midnight Luxury",primary:"#172b47",accent:"#edcb91",note:"Deep navy and champagne"},
 {id:"emerald",name:"Emerald Estate",primary:"#075847",accent:"#dcc487",note:"Emerald and antique gold"},
 {id:"burgundy",name:"Burgundy Manor",primary:"#612f40",accent:"#e5bbaa",note:"Wine and muted rose"},
 {id:"blush",name:"Rosewood",primary:"#573d50",accent:"#e6bccb",note:"Plum and blush pink"},
 {id:"charcoal",name:"Charcoal & Gold",primary:"#2c3333",accent:"#d7b78b",note:"Dark charcoal and gold"},
 {id:"lavender",name:"Lavender Luxe",primary:"#463b66",accent:"#d1b8e3",note:"Royal violet and lilac"},
 {id:"autumn",name:"Autumn Oak",primary:"#69442f",accent:"#ecc084",note:"Warm oak and amber"},
 {id:"winter",name:"Winter Frost",primary:"#234759",accent:"#d2e4ed",note:"Winter blue and silver"}
]);
const themeById=new Map(themePalettes.map(theme=>[theme.id,theme]));
const layoutOptions={
homeTheme:themePalettes.map(theme=>[theme.id,theme.name]),
heroLayout:[["split","Split image + text"],["stacked","Stacked headline + image"],["image-focus","Full image background"]],
featuredLayout:[["three","Three cards"],["two","Two columns / four cards"],["compact","Compact / six cards"]],
neighborhoodLayout:[["cards","Large images"],["compact","Compact images"]],
aboutLayout:[["image-left","Image left"],["image-right","Image right"],["text-first","Text focused"]]};
const sectionKeys=["featured","neighborhoods","about","contact"];
const sectionNames={featured:"Featured properties",neighborhoods:"Neighborhoods",about:"About Brick & Ivy",contact:"Contact section"};
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
let client=null,revision=null,draft=null,published=null,busy=false,dirty=false,sectionOrder=[...sectionKeys];
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
 if(type==='select'){
  const field='<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong><select id="'+id+'" data-home-editor="'+key+'">'+
   (layoutOptions[key]||[]).map(([v,n])=>'<option value="'+safe(v)+'">'+safe(n)+'</option>').join('')+'</select></label>';
  return key==='homeTheme'?'<div class="home-theme-picker">'+field+
   '<div id="homeThemePaletteGrid" class="home-theme-grid" role="group" aria-label="Choose a homepage color theme"></div>'+
   '<div class="home-theme-hint"><small id="homeThemeColorStatus">Selecting a theme sets a matching primary and accent color automatically.</small>'+
   '<button type="button" class="home-theme-reset" data-reset-theme-colors>Reset to theme colors</button></div></div>':field;
 }
 if(type==='color')return '<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong><input type="color" id="'+id+'" data-home-editor="'+key+'"></label>';
 if(type==='long')return '<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong>'+
   '<textarea id="'+id+'" data-home-editor="'+key+'" maxlength="'+max+'" rows="3"></textarea></label>';
 const basic='<label class="home-editor-field" for="'+id+'"><strong>'+safe(label)+'</strong>'+
   '<input id="'+id+'" data-home-editor="'+key+'" type="'+(type==='image'?'url':'text')+
   '" maxlength="'+max+'" '+(type==='image'?'placeholder="https://…"':'')+
   (['announcementText','heroCaption'].includes(key)?'':' required')+'></label>';
 return basic;
}
function buildForm(){
 const target=$('homeEditorGroups');if(!target)return;
 target.innerHTML=groups.map((group,i)=>
  '<details class="home-editor-group" '+(i===0||i===2?'open':'')+'>'+
   '<summary><span><strong>'+safe(group.title)+'</strong><small>'+safe(group.summary)+'</small></span><span aria-hidden="true">＋</span></summary>'+
   '<div class="home-editor-fields">'+group.fields.map(inputMarkup).join('')+'</div></details>'
 ).join('');
 paintThemeTiles();
 target.addEventListener('input',()=>{dirty=true;updatePreview();updateButtons()});
 target.addEventListener('change',event=>{
  if(event.target.matches('[data-home-editor="homeTheme"]')){
   applyThemePalette(event.target.value);
   return;
  }
  dirty=true;updatePreview();updateButtons();
 });
 target.addEventListener('click',event=>{
  const tile=event.target.closest('[data-theme-choice]');
  if(tile){applyThemePalette(tile.dataset.themeChoice);return;}
  if(event.target.closest('[data-reset-theme-colors]')){
   applyThemePalette($('home-edit-homeTheme')?.value);
  }
 });
}
function paintThemeTiles(){
 const target=$('homeThemePaletteGrid');if(!target)return;
 target.innerHTML=themePalettes.map(theme=>
  '<button type="button" class="home-theme-tile" data-theme-choice="'+theme.id+'" aria-pressed="false" title="'+safe(theme.note)+'">'+
  '<span class="home-theme-colors" aria-hidden="true">'+
   '<i style="background:'+theme.primary+'"></i><i style="background:'+theme.accent+'"></i></span>'+
  '<strong>'+safe(theme.name)+'</strong><small>'+safe(theme.note)+'</small></button>'
 ).join('');
}
function updateThemeSelection(){
 const id=$('home-edit-homeTheme')?.value,selected=themeById.get(id);
 if(!selected)return;
 const color=$('home-edit-primaryColor')?.value.toLowerCase();
 const accent=$('home-edit-accentColor')?.value.toLowerCase();
 const custom=color!==selected.primary||accent!==selected.accent;
 const status=$('homeThemeColorStatus');
 if(status)status.textContent=custom?
  'Custom colors for '+selected.name+'. Reset to restore its coordinated palette.':
  'Coordinated '+selected.name+' colors applied. You can fine-tune either color below.';
 document.querySelectorAll('[data-theme-choice]').forEach(tile=>{
  const active=tile.dataset.themeChoice===id;
  tile.setAttribute('aria-pressed',String(active));
  tile.classList.toggle('is-selected',active);
 });
}
function applyThemePalette(id){
 const preset=themeById.get(id);
 if(!preset)return;
 const theme=$('home-edit-homeTheme'),primary=$('home-edit-primaryColor'),accent=$('home-edit-accentColor');
 if(!theme||!primary||!accent)return;
 theme.value=preset.id;primary.value=preset.primary;accent.value=preset.accent;
 dirty=true;updatePreview();updateButtons();
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
function setPreviewText(id,value){const el=$(id);if(el)el.textContent=value||''}
function updatePreview(){
 const d=collect();
 updateThemeSelection();
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
  panel.dataset.homeFeaturedLayout=d.featuredLayout;
  panel.dataset.homeNeighborhoodLayout=d.neighborhoodLayout;
  panel.dataset.homeAboutLayout=d.aboutLayout;
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
