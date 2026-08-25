// js/seo-inject.js — og:image + JSON-LD injector, no extra cost
(function(){
  function setOgImage(url){
    if(!url) return;
    let meta=document.querySelector('meta[property="og:image"]');
    if(!meta){ meta=document.createElement('meta'); meta.setAttribute('property','og:image'); document.head.appendChild(meta); }
    meta.setAttribute('content', url);
  }
  function injectEventJsonLd(evt){
    if(!evt) return;
    const data={ "@context":"https://schema.org", "@type":"Event", name:evt.title, startDate:evt.date, location:{ "@type":"Place", name: evt.venue||'Sri Sai Brindhavan' }, image: evt.image||'https://saidharmasamrakshanapremakuteeram.qzz.io/share-image.jpg', description: evt.description||'', organizer:{ "@type":"Organization", name:"Sri Sai Dharma Samrakshana Prema Kuteeram", url:"https://saidharmasamrakshanapremakuteeram.qzz.io/" } };
    let s=document.createElement('script'); s.type='application/ld+json'; s.textContent=JSON.stringify(data); document.head.appendChild(s);
  }
  function injectArticleJsonLd(d){
    const data={ "@context":"https://schema.org", "@type":"Article", headline:d.title, datePublished:d.date, image:d.thumbnail||d.image, author:{ "@type":"Organization", name:"SSPK"} };
    let s=document.createElement('script'); s.type='application/ld+json'; s.textContent=JSON.stringify(data); document.head.appendChild(s);
  }
  // auto-run on events/discourse pages: try to set og:image from first gallery image or brochure
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      if(typeof supabase==='undefined') return;
      const params=new URLSearchParams(location.search); const id=params.get('id');
      if(location.pathname.includes('events') && id){
        const {data}=await supabase.from('gallery').select('src_url').eq('event_id',id).limit(1);
        if(data && data[0] && data[0].src_url) setOgImage(data[0].src_url);
        const {data:ev}=await supabase.from('events').select('*').eq('id',id).single();
        if(ev) injectEventJsonLd(ev);
      }
      if(location.pathname.includes('discourse') && id){
        const {data}=await supabase.from('weekly_messages').select('*').eq('id',id).single();
        if(data) injectArticleJsonLd(data);
      }
    }catch(e){}
  });
  if(typeof module!=='undefined') module.exports={setOgImage, injectEventJsonLd, injectArticleJsonLd};
  else { window.SEOInject={setOgImage, injectEventJsonLd, injectArticleJsonLd}; }
})();
