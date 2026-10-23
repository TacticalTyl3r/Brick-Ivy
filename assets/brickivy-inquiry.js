// Public Brick & Ivy property inquiry form.
(function(){
 const root=document.getElementById('detailContent');if(!root)return;
 const config=window.BRICK_IVY_CONFIG||{};
 const path='/functions/v1/brickivy-inquiries';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const observer=new MutationObserver(()=>{
  if(!root.querySelector('.detail-shell')||root.querySelector('#biInquiry'))return;
  const id=new URLSearchParams(location.search).get('id');
  if(!id)return;
  const section=document.createElement('section');section.className='bi-inquiry';section.id='biInquiry';
  section.innerHTML='<h2 class="serif">Ask about this property</h2><p>Send a private inquiry to the Brick &amp; Ivy team. Your details will be used to contact you in Legendary Roleplay.</p>'+
  '<form id="biInquiryForm"><input type="hidden" name="website" value="" autocomplete="off"><div class="bi-inquiry-fields">'+
  '<label>Character name <input name="characterName" maxlength="80" minlength="2" autocomplete="name" required></label>'+
  '<label>In-game phone <input name="phone" maxlength="35" minlength="3" required></label>'+
  '<label>Discord contact (optional) <input name="discordContact" maxlength="80"></label></div>'+
  '<label>Your message <textarea name="message" minlength="10" maxlength="1500" rows="5" required placeholder="What would you like to know about this home?"></textarea></label>'+
  '<p class="bi-inquiry-privacy">Your inquiry is stored privately for authorized Brick &amp; Ivy staff and may also be delivered to their private Discord channel.</p>'+
  '<button type="submit" class="button dark">Send inquiry →</button> <span id="biInquiryStatus" role="status" aria-live="polite"></span></form>';
  root.querySelector('.detail-shell').appendChild(section);
  section.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),status=section.querySelector('#biInquiryStatus');
   if(!form.reportValidity())return;
   button.disabled=true;status.textContent='Sending your inquiry…';
   const values=Object.fromEntries(new FormData(form).entries());
   try{
    const response=await fetch(config.supabaseUrl+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'submit',propertyId:id,...values})});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Could not send your inquiry');
    form.reset();status.textContent='Your inquiry was received! A Realtor can follow up using the details you provided.';
   }catch(error){status.textContent=error.message||'Please try again later.'}
   finally{button.disabled=false}
  });
 });
 observer.observe(root,{childList:true,subtree:true});
})();
