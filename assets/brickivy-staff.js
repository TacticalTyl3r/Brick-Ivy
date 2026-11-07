/* Brick & Ivy staff sign-in and protected Realtor editing.
 * Requires dedicated Supabase project, Discord provider and Edge Functions.
 * Discord Owner role is checked server-side for each management request.
 */
const cfg = window.BRICK_IVY_CONFIG || {};
const element = id => document.getElementById(id);
let supabase = null;
let currentRole = null;
let roster = [];
let editingId = null;
let propertyDirectory = [];
let rentalSnapshotAvailable = false;
let activeStaffTab = 'overview';

function message(txt) { const el=element('staffMessage');if(el)el.textContent=txt; }
function safe(v) {return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));}
function show(el,visible) {if(el)el.hidden=!visible;}
/* Navigate authorized sections without reloading the private property feed. */
function activateStaffTab(tab,focus=false){
  if(!['overview','properties','tools'].includes(tab))return;
  activeStaffTab=tab;
  document.querySelectorAll('#staffTabNav [data-staff-tab]').forEach(button=>{
    const active=button.dataset.staffTab===tab;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-selected',String(active));
    button.tabIndex=active?0:-1;
    if(active&&focus)button.focus();
  });
  document.querySelectorAll('#staffWorkspace [data-staff-panel]').forEach(panel=>{
    panel.hidden=panel.dataset.staffPanel!==tab;
  });
}
function renderPortfolioOverview(){
  const target=element('staffPortfolioStats');
  if(!target||!currentRole)return;
  const known=rentalSnapshotAvailable===true;
  const available=known?propertyDirectory.filter(p=>p.rented===false&&p.reserved!==true).length:null;
  const rented=known?propertyDirectory.filter(p=>p.rented===true):[];
  const overdue=rented.filter(p=>directoryPaidUntil(p.lastPayment).state==='overdue').length;
  const evictable=rented.filter(p=>directoryPaidUntil(p.lastPayment).state==='evictable').length;
  const alerts=known?overdue+evictable:null;
  const stats=[
    {label:'Total Properties',value:propertyDirectory.length,
      sub:'All homes in your portfolio',kind:'total',filter:''},
    {label:'Available Properties',value:available===null?'—':available,
      sub:known?'Vacant and not reserved':'Rental information unavailable',
      kind:'available',filter:'available'},
    {label:'Overdue / Evictable',value:alerts===null?'—':alerts,
      sub:known?overdue+' overdue · '+evictable+' evictable':'Payment information unavailable',
      kind:'alerts',filter:'payment-alerts'}
  ];
  target.innerHTML=stats.map(stat=>
    '<button type="button" class="bi-staff-stat bi-staff-stat-'+safe(stat.kind)+'"'+
    ' data-staff-summary="'+safe(stat.filter)+'" aria-label="'+safe(stat.label+': '+stat.value+'. '+stat.sub+'. View matching properties')+'">'+
    '<span class="bi-staff-stat-title">'+safe(stat.label)+'</span>'+
    '<strong class="bi-staff-stat-value">'+safe(stat.value)+'</strong>'+
    '<span class="bi-staff-stat-bottom"><small>'+safe(stat.sub)+'</small>'+
    '<span class="bi-staff-stat-arrow" aria-hidden="true">↗</span></span></button>'
  ).join('');
  show(target,true);
}

function isConfigured() {return cfg.discordAuthReady === true && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'')&&/^(sb_publishable_|eyJ)/.test(cfg.publishableKey||'');}
async function api(action,extra={}) {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw Error('Please sign in again.');
  const response=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/brickivy-admin',{
    method:'POST',credentials:'omit',
    headers:{
      'Content-Type':'application/json',
      apikey:cfg.publishableKey,
      Authorization:'Bearer '+session.access_token
    },
    body:JSON.stringify({action,...extra})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Request failed. Try again.');
  return result;
}

/* Show the original inquiry creation time in Eastern Time, regardless
 * of the visitor's browser zone. Older rows with missing timestamps remain usable. */
function inquiryCreatedAt(value){
 if(typeof value!=='string'||!value.trim())return 'Date unavailable';
 const time=new Date(value);
 if(!Number.isFinite(time.getTime()))return 'Date unavailable';
 return new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',
  hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'
 }).format(time);
}

/* Compact private property directory. Uses the same live OPFW-backed staff
 * endpoint as Property Management; it never makes renter data public. */
const directoryMoney=value=>{
  if(value===null||value===undefined||value==='')return 'Not reported';
  const amount=Number(value);
  return Number.isFinite(amount)?new Intl.NumberFormat('en-US',{
    style:'currency',currency:'USD',maximumFractionDigits:2
  }).format(amount):'Not reported';
};

const directoryPaidUntil=value=>{
  if(value===null||value===undefined||String(value).trim()===''||String(value).trim()==='0')
    return {date:'Not recorded',state:'unknown'};
  const raw=String(value).trim();
  // OPFW's property_last_pay is the last payment timestamp; coverage lasts
  // seven days after that payment. Accept Unix seconds, milliseconds or ISO.
  let date;
  if(/^[0-9]{10}$/.test(raw))date=new Date(Number(raw)*1000);
  else if(/^[0-9]{13}$/.test(raw))date=new Date(Number(raw));
  else date=new Date(raw);
  const lastPayment=date.getTime();
  if(!Number.isFinite(lastPayment))return {date:'Date unavailable',state:'unknown'};
  const deadline=lastPayment+7*24*60*60*1000;
  const paidUntil=new Date(deadline);
  const formatted=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',
    hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'
  }).format(paidUntil);
  const lateBy=Date.now()-deadline;
  // Yellow as soon as the payment deadline passes; red at 7 full days late.
  const state=lateBy>=7*24*60*60*1000?'evictable':lateBy>0?'overdue':'current';
  return {date:formatted,state};
};
const directoryProfit=p=>{
  // Company net per property: rent revenue only when occupied, less the
  // weekly maintenance expense that applies to every property.
  const maintenance=p.sourceWeeklyCost;
  if(maintenance===null||maintenance===undefined||maintenance==='')return null;
  if(p.rented===null)return null;
  const cost=Number(maintenance);
  if(!Number.isFinite(cost))return null;
  let rent=0;
  if(p.rented===true){
    if(p.weeklyCost===null||p.weeklyCost===undefined||p.weeklyCost==='')return null;
    rent=Number(p.weeklyCost);
    if(!Number.isFinite(rent))return null;
  }
  return Math.round((rent-cost)*100)/100;
};
const directoryProfitDisplay=value=>{
  if(value===null)return 'Not reported';
  return (value>0?'+':value<0?'−':'')+directoryMoney(Math.abs(value));
};
const interiorLabels={'1':'Motel','2':"Trevor's Trailer",'3':'Janitor Apartment',
  '4':'Low-End Apartment','5':"Lester's House",'6':"Franklin's House",
  '7':'Mid-End Apartment','8':"Trevor's Beach House",'9':"Michael's Mansion",
  '10':"Franklin's Mansion",'11':'High-End Apartment'};
const directoryOccupancy=p=>p.rented===null?'Unknown':p.rented===true?'Rented':p.reserved===true?'Reserved':'Available';
function renderPropertyDirectory(){
  const body=element('staffPropertyRows'),count=element('staffPropertyCount');
  if(!body||!count)return;
  const search=String(element('staffPropertySearch')?.value||'').trim().toLowerCase();
  const status=String(element('staffPropertyFilter')?.value||'');
  const filtered=propertyDirectory.filter(p=>{
    const occupancy=directoryOccupancy(p);
    const matchStatus=!status||(status==='payment-alerts'&&p.rented===true&&
      ['overdue','evictable'].includes(directoryPaidUntil(p.lastPayment).state))||
      occupancy.toLowerCase()===status;
    const matchSearch=!search||[p.address,p.name,p.id,p.blockId,p.area,
      p.renterName,p.renterCharacterId,interiorLabels[String(p.type)]||p.type]
      .some(value=>String(value??'').toLowerCase().includes(search));
    return matchStatus&&matchSearch;
  });
  count.textContent=filtered.length+' of '+propertyDirectory.length+' properties'+
    (rentalSnapshotAvailable?'':' · renter details unavailable');
  renderPortfolioOverview();
  body.innerHTML=filtered.length?filtered.map(p=>{
    const address=String(p.address||p.name||'Unknown address').trim();
    const occupancy=directoryOccupancy(p);
    const tenant=p.rented===null?'Unknown':p.rented===false?'—':
      String(p.renterName||('CID '+(p.renterCharacterId||'Not recorded')));
    const cid=p.rented===true&&p.renterCharacterId?'CID '+p.renterCharacterId:'';
    const weeklyRent=p.weeklyCost;
    const maintenance=p.sourceWeeklyCost;
    const profit=directoryProfit(p);
    const profitClass=profit===null?'is-unknown':profit>0?'is-positive':profit<0?'is-negative':'is-zero';
    const payment=p.rented===true?directoryPaidUntil(p.lastPayment):
      {date:p.rented===null?'Unknown':'—',state:'unknown'};
    const paymentState=p.rented===true?payment.state:'unknown';
    const paymentLabel=paymentState==='overdue'?'OVERDUE':paymentState==='evictable'?'EVICTABLE':'';
    return '<tr><td class="bi-dir-address"><strong>'+safe(address)+'</strong>'+
      '<small>Block '+safe(p.blockId||'—')+' · ID '+safe(p.id||'—')+'</small></td>'+
      '<td>'+safe(p.area||'Unassigned')+'<small>'+safe(interiorLabels[String(p.type)]||p.type||'Unknown')+'</small></td>'+
      '<td><span class="bi-dir-state" data-occupancy="'+safe(occupancy.toLowerCase())+'">'+safe(occupancy)+'</span></td>'+
      '<td>'+safe(tenant)+(cid?'<small>'+safe(cid)+'</small>':'')+'</td>'+
      '<td class="bi-dir-money">'+safe(directoryMoney(weeklyRent))+'</td>'+
      '<td class="bi-dir-money">'+safe(directoryMoney(maintenance))+'</td>'+
      '<td class="bi-dir-money bi-dir-profit '+profitClass+'">'+safe(directoryProfitDisplay(profit))+'</td>'+
      '<td class="bi-dir-payment is-'+safe(paymentState)+'" aria-label="'+safe(paymentLabel?paymentLabel+' — paid until '+payment.date:'Paid until '+payment.date)+'">'+
      (paymentLabel?'<strong class="bi-dir-payment-status is-'+safe(paymentState)+'">'+safe(paymentLabel)+'</strong>':'')+
      '<span class="bi-dir-payment-date">'+safe(payment.date)+'</span>'+
      '</td></tr>';
  }).join(''):'<tr><td colspan="8" class="bi-dir-empty">No properties match your filters.</td></tr>';
}
async function loadPropertyDirectory(){
  const section=element('staffPropertyDirectory'),messageBox=element('staffPropertyMessage');
  if(!section||!messageBox)return;
  show(section,false);
  if(!currentRole||!supabase){propertyDirectory=[];return;}
  messageBox.textContent='Loading the live company portfolio…';
  show(section,true);
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)throw Error('Please sign in again.');
    const res=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/brickivy-property-staff',{
      method:'POST',credentials:'omit',
      headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,
        Authorization:'Bearer '+session.access_token},
      body:JSON.stringify({action:'list'})
    });
    const result=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(result.error||'Property information could not be loaded.');
    if(!Array.isArray(result.properties))throw Error('Unexpected property data.');
    // Do not show a stale directory if the session changed while fetching.
    const {data:{session:active}}=await supabase.auth.getSession();
    if(!active?.access_token||!currentRole){show(section,false);return;}
    propertyDirectory=result.properties.sort((a,b)=>
      String(a.address||a.name||'').localeCompare(String(b.address||b.name||''),'en',{numeric:true}));
    rentalSnapshotAvailable=result.rentalAvailable===true;
    messageBox.textContent=rentalSnapshotAvailable?
      'Live rental and renter details. Updated when you refresh this list.':
      'Rental details could not be verified from OPFW; occupancy is shown as Unknown.';
    renderPropertyDirectory();
  }catch(err){
    propertyDirectory=[];
    show(element('staffPortfolioStats'),false);
    element('staffPropertyRows').innerHTML='<tr><td colspan="8" class="bi-dir-empty">'+
      safe(err.message||'Unable to load the property directory.')+'</td></tr>';
    element('staffPropertyCount').textContent='Property directory unavailable';
    messageBox.textContent='Private property information requires an authorized Brick & Ivy staff session.';
  }
}

/* Staff Portal inquiry pulse. Denied Realtors see no private metrics. */
async function loadInquirySummary(){
 const box=element('staffInquirySummary');
 if(!box)return;
 try{
  const result=await api('inquirySummary');
  const m=result.metrics||{},recent=Array.isArray(result.recent)?result.recent:[];
  box.innerHTML='<div class="bi-portal-pulse-head"><div><span class="eyebrow">Brick & Ivy team</span>'+
   '<h2 class="serif">Inquiry pulse</h2></div><a class="button dark" href="manage-inquiries.html">Open inquiry inbox →</a></div>'+
   '<div class="bi-portal-pulse-grid">'+
   [['New inquiries',m.new],['Needs attention · 24h',m.needsAttention24h],['Urgent · 48h',m.urgent48h],['Unassigned',m.unassignedOpen],['Awaiting customer',m.awaitingCustomer],['Closed',m.closed]]
    .map(([label,value])=>'<div><strong>'+safe(Number(value||0).toLocaleString())+'</strong><span>'+safe(label)+'</span></div>').join('')+'</div>'+
   '<div class="bi-portal-recent"><strong>Recent inquiries</strong>'+
   (recent.length?recent.map((x,index)=>{
    const address=String(x.property_address||'').trim()||String(x.property_name||'').trim()||'Address unavailable';
    const number='#'+String(x.inquiry_number||'—');
    const status=String(x.status||'unknown').replaceAll('_',' ');
    return '<a class="bi-portal-recent-item" href="manage-inquiries.html" aria-label="Inquiry '+number+' for '+safe(address)+', '+safe(status)+', submitted '+safe(inquiryCreatedAt(x.created_at))+'">'+
     '<span class="bi-portal-recent-number" aria-hidden="true">'+number+'</span>'+
     '<span class="bi-portal-recent-details"><strong class="bi-portal-recent-address">'+safe(address)+'</strong>'+
     '<small class="bi-portal-recent-date">Submitted '+safe(inquiryCreatedAt(x.created_at))+'</small></span>'+
     '<span class="bi-portal-recent-status">'+safe(status)+'</span></a>';
   }).join(''):'<p>No inquiries yet.</p>')+'</div>';
  show(box,true);
  show(element('staffInquiryUnavailable'),false);
 }catch{
  box.innerHTML='';show(box,false);
  if(currentRole)show(element('staffInquiryUnavailable'),true);
 }
}
async function checkRole() {
  const {data:{session}}=await supabase.auth.getSession();
  show(element('staffLogin'),!session);
  show(element('staffSession'),Boolean(session));
  show(element('staffOwnerContent'),false);
  show(element('staffTeamContent'),false);
  show(element('staffManagementContent'),false);
  show(element('staffInquirySummary'),false);
  show(element('staffInquiryUnavailable'),false);
  show(element('staffPropertyDirectory'),false);
  show(element('staffPortfolioStats'),false);
  show(element('staffWorkspace'),false);
  show(element('staffRoleChip'),false);
  propertyDirectory=[];
  if(!session){currentRole=null;message('Sign in with Discord to continue.');return;}
  message('Checking your Brick & Ivy Discord permissions…');
  try {
    const me=await api('me');
    currentRole=me.role;
    const accessLabel=me.staffLabel==='Owner'?'Owner':me.staffLabel==='Realtor'?'Realtor':'Staff';
    message('Signed in with Brick & Ivy '+accessLabel+' access.');
    show(element('staffOwnerContent'),currentRole==='owner');
    show(element('staffTeamContent'),currentRole==='realtor');
    const chip=element('staffRoleChip');
    if(chip){chip.textContent=accessLabel+' access';show(chip,true);}
    show(element('staffWorkspace'),true);
    activateStaffTab('overview');
    await Promise.all([loadInquirySummary(),loadPropertyDirectory()]);
    if(currentRole==='owner'&&element('staffManagementContent')){
      await loadRoster();
      show(element('staffManagementContent'),true);
    }
  }catch(error){
    currentRole=null;
    show(element('staffWorkspace'),false);
    show(element('staffRoleChip'),false);
    message(error.message||'Discord role verification failed.');
  }
}
async function loadRoster(){
  const data=await api('list');
  roster=Array.isArray(data.realtors)?data.realtors:[];
  renderRoster();
}
function positionName(realtor) {
  const publicTitle=String(realtor.title||'').trim() || 'Realtor';
  return realtor.role === 'Owner' ? 'Owner' : publicTitle.toLowerCase()==='owner'?'Realtor':publicTitle;
}
function positionGroups(items){
  const sorted=[...items].sort((a,b)=>
    Number(a.displayOrder??999)-Number(b.displayOrder??999)
    ||String(a.name||'').localeCompare(String(b.name||'')));
  const groups=[];
  const seen=new Map();
  for(const realtor of sorted){
    const label=positionName(realtor);
    const key=(realtor.role==='Owner'?'owner:':'staff:')+label.toLowerCase();
    if(!seen.has(key)){
      const group={key,label,owner:realtor.role==='Owner',members:[]};
      seen.set(key,group);
      groups.push(group);
    }
    seen.get(key).members.push(realtor);
  }
  return groups.filter(g=>g.owner).concat(groups.filter(g=>!g.owner));
}
function renderRoster(){
  const el=element('managementRoster');
  if(!el)return;
  const groups=positionGroups(roster);
  const n=roster.length;
  element('managementCount').textContent=n+' '+(n===1?'profile':'profiles');
  const firstNonOwner=groups.findIndex(g=>!g.owner);
  el.innerHTML=groups.map((group,index)=>{
    const controls=group.owner?'':(
      '<div class="manage-section-controls" aria-label="Reorder '+safe(group.label)+' group">'+
      '<button type="button" class="manage-order-button" data-move-section="up" data-section-index="'+index+'" '+(index<=firstNonOwner?'disabled':'')+' title="Move position group up" aria-label="Move '+safe(group.label)+' section up">↑</button>'+
      '<button type="button" class="manage-order-button" data-move-section="down" data-section-index="'+index+'" '+(index===groups.length-1?'disabled':'')+' title="Move position group down" aria-label="Move '+safe(group.label)+' section down">↓</button></div>'
    );
    return '<section class="manage-position-section" aria-labelledby="managePosition'+index+'">'+
      '<div class="manage-position-header"><div class="manage-position-name">'+
      '<h3 id="managePosition'+index+'">'+safe(group.label)+'</h3><span>'+group.members.length+' '+(group.members.length===1?'member':'members')+'</span></div>'+
      controls+'</div>'+
      group.members.map((r,idx)=>'<div class="manage-person">'+
        '<span class="manage-person-avatar" aria-hidden="true">'+safe((r.name||'BI').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase())+'</span>'+
        '<span class="manage-person-details"><strong>'+safe(r.name)+'</strong><span>CID '+safe(r.characterId)+' · '+safe(positionName(r))+'</span></span>'+
        '<span class="manage-public-label '+(r.published?'is-published':'')+'">'+(r.published?'Public':'Hidden')+'</span>'+
        '<div class="manage-person-actions">'+
          '<div class="manage-person-move" aria-label="Reorder '+safe(r.name)+'">'+
          '<button type="button" class="manage-order-button" data-move-person="up" data-section-index="'+index+'" data-person-index="'+idx+'" '+(idx===0?'disabled':'')+' title="Move up" aria-label="Move '+safe(r.name)+' up">↑</button>'+
          '<button type="button" class="manage-order-button" data-move-person="down" data-section-index="'+index+'" data-person-index="'+idx+'" '+(idx===group.members.length-1?'disabled':'')+' title="Move down" aria-label="Move '+safe(r.name)+' down">↓</button></div>'+
          '<button type="button" class="realtor-copy" data-edit="'+safe(r.id)+'">Edit</button>'+
          (r.role==='Owner'?'':'<button type="button" class="realtor-copy" data-remove="'+safe(r.id)+'">Remove</button>')+
        '</div></div>').join('')+'</section>';
  }).join('')||'<p class="manage-empty">No team members yet.</p>';
}
let reorderPending=false;
async function saveReorder(groups){
  if(reorderPending||currentRole!=='owner')return;
  const orderedIds=groups.flatMap(group=>group.members.map(person=>person.id));
  if(orderedIds.length!==roster.length)return;
  reorderPending=true;
  const el=element('managementRoster');
  const status=element('rosterOrderStatus');
  if(status)status.textContent='Saving new order…';
  el?.setAttribute('aria-busy','true');
  el?.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
    const data=await api('reorder',{ids:orderedIds});
    roster=data.realtors;
    if(status)status.textContent='Order saved. The public Realtor page will reflect the change.';
  }catch(err){
    if(status)status.textContent='Could not save the order: '+(err.message||'Try again.')+' No changes were confirmed.';
    // Recover the live server order on errors, including partial save failures.
    try {const data=await api('list');roster=data.realtors;}catch{}
  }finally{
    reorderPending=false;
    renderRoster();
    el?.setAttribute('aria-busy','false');
  }
}
function moveRealtor(sectionIndex,personIndex,direction){
  const groups=positionGroups(roster),g=groups[sectionIndex];
  if(!g||!Number.isInteger(personIndex))return;
  const to=personIndex+(direction==='up'?-1:1);
  if(to<0||to>=g.members.length)return;
  const [member]=g.members.splice(personIndex,1);
  g.members.splice(to,0,member);
  return saveReorder(groups);
}
function movePositionSection(sectionIndex,direction){
  const groups=positionGroups(roster),g=groups[sectionIndex];
  if(!g||g.owner)return;
  const firstNonOwner=groups.findIndex(g=>!g.owner);
  const to=sectionIndex+(direction==='up'?-1:1);
  if(to<firstNonOwner||to>=groups.length||groups[to].owner)return;
  const [group]=groups.splice(sectionIndex,1);
  groups.splice(to,0,group);
  return saveReorder(groups);
}
function fillForm(r){
  const f=element('manageRealtorForm');if(!f)return;
  editingId=r.id;
  for(const key of ['name','characterId','inGamePhone','discordUsername','discordId','title','photo','email','bio']){
    if(f.elements[key])f.elements[key].value=r[key]??'';
  }
  f.elements.published.checked=r.published===true;
  element('formHeading').textContent='Edit Realtor';
  element('saveRealtorButton').textContent='Save changes →';
  element('cancelRealtorEdit').hidden=false;
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function resetForm(){
  editingId=null;
  element('manageRealtorForm')?.reset();
  element('formHeading').textContent='Add a Realtor';
  element('saveRealtorButton').textContent='Add Realtor →';
  element('cancelRealtorEdit').hidden=true;
}
function formEntry(){
  const f=element('manageRealtorForm');
  const data=new FormData(f);
  const id=editingId;
  const n=Number(data.get('characterId'));
  if(!Number.isSafeInteger(n)||n<1)throw Error('Enter a valid Character ID.');
  const photo=String(data.get('photo')||'').trim();
  if(photo&&!photo.startsWith('https://')&&!photo.startsWith('assets/realtors/'))throw Error('Photo must be an HTTPS address.');
  return {
    ...(id?{id}:{}),
    name:String(data.get('name')||'').trim(),
    characterId:n,
    inGamePhone:String(data.get('inGamePhone')||'').trim(),
    discordUsername:String(data.get('discordUsername')||'').trim(),
    discordId:String(data.get('discordId')||'').trim(),
    title:String(data.get('title')||'').trim(),
    photo,
    email:String(data.get('email')||'').trim(),
    bio:String(data.get('bio')||'').trim(),
    published:data.get('published')==='on',
    displayOrder:editingId?(roster.find(x=>x.id===id)?.displayOrder??100):roster.length+1
  };
}
async function discordProviderAvailable(){
  try {
    const response=await fetch(cfg.supabaseUrl+'/auth/v1/settings',{
      headers:{apikey:cfg.publishableKey,Accept:'application/json'},cache:'no-store',credentials:'omit'
    });
    if(!response.ok)return null;
    const settings=await response.json();
    return typeof settings?.external?.discord==='boolean'?settings.external.discord:null;
  }catch{return null}
}

async function setup(){
  const login=element('staffSignIn');
  const logout=element('staffSignOut');
  const form=element('manageRealtorForm');
  if(!isConfigured()){
    show(element('staffLogin'),false);
    show(element('staffSession'),false);
    show(element('staffOwnerContent'),false);
    show(element('staffTeamContent'),false);
    show(element('staffManagementContent'),false);
    message('Discord login is awaiting the dedicated Brick & Ivy Supabase project and OAuth setup. No credentials or staff roles are exposed here.');
    return;
  }
  const providerEnabled=await discordProviderAvailable();
  if(providerEnabled===false){
    show(element('staffLogin'),false);
    show(element('staffSession'),false);
    show(element('staffOwnerContent'),false);
    show(element('staffTeamContent'),false);
    show(element('staffManagementContent'),false);
    message('Supabase Auth still reports Discord as disabled, even if its dashboard toggle appears on. Recheck the saved Discord provider settings in the Brick & Ivy Supabase project, then refresh this page.');
    return;
  }
  try {
    const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm');
    supabase=createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    login?.addEventListener('click',async()=>{
      message('Opening Discord sign-in…');
      const {error}=await supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo:location.origin+location.pathname}});
      if(error)message(error.message);
    });
    logout?.addEventListener('click',async()=>{await supabase.auth.signOut();await checkRole()});
    element('staffPropertySearch')?.addEventListener('input',renderPropertyDirectory);
    element('staffPropertyFilter')?.addEventListener('change',renderPropertyDirectory);
    element('staffPropertyRefresh')?.addEventListener('click',loadPropertyDirectory);
    const tabNav=element('staffTabNav');
    tabNav?.addEventListener('click',event=>{
      const button=event.target.closest('[data-staff-tab]');
      if(button&&currentRole)activateStaffTab(button.dataset.staffTab);
    });
    tabNav?.addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      const tabs=Array.from(tabNav.querySelectorAll('[data-staff-tab]'));
      const index=tabs.indexOf(document.activeElement);
      if(index<0)return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
        (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      activateStaffTab(tabs[next].dataset.staffTab,true);
    });
    element('staffWorkspace')?.addEventListener('click',event=>{
      if(!currentRole)return;
      const summary=event.target.closest('[data-staff-summary]');
      if(summary){
        const filter=element('staffPropertyFilter'),search=element('staffPropertySearch');
        if(filter)filter.value=summary.dataset.staffSummary||'';
        if(search)search.value='';
        renderPropertyDirectory();
        activateStaffTab('properties');
        return;
      }
      const button=event.target.closest('[data-staff-go]');
      if(button)activateStaffTab(button.dataset.staffGo);
    });
    // Keep deadline badges accurate while the Staff Portal is left open.
    setInterval(()=>{if(propertyDirectory.length&&currentRole)renderPropertyDirectory()},60000);
    await checkRole();
    if(form){
      form.addEventListener('submit',async e=>{
        e.preventDefault();
        if(currentRole!=='owner')return;
        if(!form.reportValidity())return;
        const button=element('saveRealtorButton');
        button.disabled=true;
        try{
          await api('save',{realtor:formEntry()});
          await loadRoster();resetForm();element('formStatus').textContent='Realtor saved successfully.';
        }catch(err){element('formStatus').textContent=err.message||'Unable to save Realtor.';}
        finally{button.disabled=false}
      });
      element('cancelRealtorEdit')?.addEventListener('click',resetForm);
      element('managementRoster')?.addEventListener('click',async e=>{
        if(reorderPending||currentRole!=='owner')return;
        const movePerson=e.target.closest('[data-move-person]');
        const moveSection=e.target.closest('[data-move-section]');
        if(movePerson){
          await moveRealtor(Number(movePerson.dataset.sectionIndex),Number(movePerson.dataset.personIndex),movePerson.dataset.movePerson);
          return;
        }
        if(moveSection){
          await movePositionSection(Number(moveSection.dataset.sectionIndex),moveSection.dataset.moveSection);
          return;
        }
        const edit=e.target.closest('[data-edit]');
        const remove=e.target.closest('[data-remove]');
        if(edit){const r=roster.find(x=>x.id===edit.dataset.edit);if(r)fillForm(r);return;}
        if(remove){
          const r=roster.find(x=>x.id===remove.dataset.remove);
          if(!r||r.role==='Owner')return;
          if(!confirm('Remove '+r.name+' from the public Realtor directory?'))return;
          try {await api('delete',{id:r.id});await loadRoster();resetForm();}
          catch(err){element('formStatus').textContent=err.message||'Unable to remove Realtor.';}
        }
      });
    }
  }catch(err){message('Sign-in setup could not load: '+(err.message||'Unknown issue'));}
}
document.addEventListener('DOMContentLoaded',setup);
