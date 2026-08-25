// js/share.js — Web Share API + copy fallback, utm_source=share, localStorage count
(function(){
  function withUtm(url){ try{ const u=new URL(url, location.origin); u.searchParams.set('utm_source','share'); return u.toString(); }catch(e){ return url+(url.includes('?')?'&':'?')+'utm_source=share'; } }
  async function handleShare(url,title){
    const shareUrl=withUtm(url);
    try{
      if(navigator.share){ await navigator.share({title:title||document.title, url:shareUrl}); }
      else if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(shareUrl); toast('Link copied — share anywhere!'); }
      else { const ta=document.createElement('textarea'); ta.value=shareUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Link copied'); }
      try{ const c=parseInt(localStorage.getItem('share_count')||'0',10)+1; localStorage.setItem('share_count', String(c)); }catch(e){}
      return true;
    }catch(e){ if(e && e.name!=='AbortError') toast('Could not share'); return false; }
  }
  function toast(msg){ let t=document.getElementById('share-toast'); if(!t){ t=document.createElement('div'); t.id='share-toast'; t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--fg);color:#fff;padding:10px 16px;border-radius:20px;font-size:13px;z-index:9999;opacity:0;transition:opacity .3s'; document.body.appendChild(t); } t.textContent=msg; t.style.opacity='1'; setTimeout(()=>t.style.opacity='0',2000); }
  document.addEventListener('click', (e)=>{
    const btn=e.target.closest('[data-share]'); if(!btn) return; e.preventDefault();
    const url=btn.getAttribute('data-share')||btn.getAttribute('href')||location.href;
    const title=btn.getAttribute('data-title')||document.title;
    handleShare(url,title);
  });
  if(typeof module!=='undefined') module.exports={handleShare, withUtm};
  else window.Share={handleShare, withUtm};
})();
