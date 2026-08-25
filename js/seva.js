// js/seva.js — Seva (contribution) module
import { validateAmount } from './razorpay-helpers.js';

export function createDonorFromForm(doc) {
  const name = doc.getElementById('sevaName');
  const email = doc.getElementById('sevaEmail');
  const phone = doc.getElementById('sevaPhone');
  return {
    name: name ? name.value.trim() : '',
    email: email ? email.value.trim() : '',
    phone: phone ? phone.value.trim() : ''
  };
}

function getSelectedPurpose(doc) {
  const sel = doc.querySelector('.seva-purpose-select');
  if (!sel) return { amount: null, label: '' };
  const opt = sel.options[sel.selectedIndex];
  const amount = validateAmount(opt && opt.getAttribute('data-amount'));
  return { amount, label: opt ? opt.textContent : '' };
}

async function fetchJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/razorpay/config');
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export function hasSession(session) {
  return !!(session && session.role && session.identifier);
}

export function getSessionEmail() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem('sspk_session')); } catch (e) { raw = null; }
  return raw && raw.identifier && String(raw.identifier).includes('@') ? raw.identifier : null;
}

export function resolveQRSource(config) {
  if (config && config.payment_link_short_url) {
    return { source: 'configured', short_url: config.payment_link_short_url };
  }
  return { source: 'api' };
}

export function resolveAutopaySource(config) {
  if (config && config.subscription_id) {
    return { source: 'configured', subscription_id: config.subscription_id, key_id: config.key_id || '' };
  }
  return { source: 'api' };
}

function loadCheckoutScript() {
  return new Promise(function(resolve, reject) {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = function() { reject(new Error('Failed to load Razorpay checkout')); };
    document.head.appendChild(s);
  });
}

function openCheckout(opts) {
  return loadCheckoutScript().then(function() {
    const rzp = new window.Razorpay(opts);
    rzp.open();
  });
}

function renderQR(url, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const img = document.createElement('img');
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url);
  img.alt = 'Seva QR Code';
  img.width = 220;
  img.height = 220;
  container.appendChild(img);
}

function switchTab(doc, tab) {
  doc.querySelectorAll('.seva-tab').forEach(function(t) {
    t.classList.remove('active');
  });
  doc.querySelectorAll('.seva-panel').forEach(function(p) {
    p.classList.remove('active');
  });
  var tabBtn = doc.querySelector('.seva-tab[data-tab="' + tab + '"]');
  var panel = doc.getElementById('sevaPanel' + cap(tab));
  if (tabBtn) tabBtn.classList.add('active');
  if (panel) panel.classList.add('active');
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function handleOnce(doc, btn) {
  const input = doc.getElementById('sevaOnceAmount');
  const amount = validateAmount(input && input.value);
  if (amount === null) { alert((window.i18n && window.i18n.t) ? window.i18n.t('seva.invalidAmount') : 'Please enter a valid amount.'); return; }
  const donor = createDonorFromForm(doc);
  btn.disabled = true;
  try {
    const data = await fetchJson('/api/razorpay/order', { amount, purpose: 'One-time Seva', donor });
    await openCheckout({
      key: data.key_id,
      amount: data.amount * 100,
      currency: 'INR',
      name: 'Sathya Sai Prema Kuteeram',
      description: 'Seva',
      prefill: { name: donor.name, email: donor.email, contact: donor.phone },
      theme: { color: '#C07A3E' },
      handler: function(response) {
        if(response && response.razorpay_payment_id){ const w=document.getElementById('receiptLinkWrap'); const a=document.getElementById('receiptLink'); if(w&&a){ a.href=`https://dashboard.razorpay.com/app/payments/${response.razorpay_payment_id}`; w.classList.remove('hidden'); } }
        alert('Sai Ram! Thank you for your seva. Payment ID: ' + response.razorpay_payment_id);
      }
    });
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleQR(doc, btn) {
  const sel = doc.querySelector('.seva-purpose-select');
  const { amount, label } = getSelectedPurpose(doc);
  if (amount === null) { alert('Please select a valid purpose.'); return; }
  const donor = createDonorFromForm(doc);
  btn.disabled = true;
  try {
    const config = await fetchConfig();
    const src = resolveQRSource(config);
    let shortUrl;
    if (src.source === 'configured') {
      shortUrl = src.short_url;
      const email = getSessionEmail();
      if (email) shortUrl += (shortUrl.includes('?') ? '&' : '?') + 'email=' + encodeURIComponent(email);
    } else {
      const data = await fetchJson('/api/razorpay/payment-link', { amount, purpose: label || 'Seva', donor });
      shortUrl = data.short_url;
    }
    renderQR(shortUrl, 'sevaQR');
    const shareBtn = doc.getElementById('sevaShareBtn');
    if (shareBtn && shortUrl) {
      shareBtn.onclick = function() {
        window.open('https://wa.me/?text=' + encodeURIComponent('Please contribute to our Seva: ' + shortUrl), '_blank');
      };
    }
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleAuto(doc, btn) {
  const input = doc.getElementById('sevaAutoAmount');
  const amount = validateAmount(input && input.value);
  if (amount === null) { alert('Please enter a valid monthly amount.'); return; }
  const donor = createDonorFromForm(doc);
  btn.disabled = true;
  try {
    const config = await fetchConfig();
    const src = resolveAutopaySource(config);
    let keyId, subscriptionId;
    if (src.source === 'configured') {
      keyId = src.key_id;
      subscriptionId = src.subscription_id;
    } else {
      const data = await fetchJson('/api/razorpay/subscription', { amount, interval: 'monthly', donor });
      keyId = data.key_id;
      subscriptionId = data.subscription_id;
    }
    await openCheckout({
      key: keyId,
      subscription_id: subscriptionId,
      name: 'Sathya Sai Prema Kuteeram',
      description: 'Monthly Seva',
      prefill: { name: donor.name, email: donor.email, contact: donor.phone },
      theme: { color: '#C07A3E' },
      handler: function(response) {
        const email = getSessionEmail();
        if (email && response && response.razorpay_subscription_id) {
          fetch('/api/razorpay/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription_id: response.razorpay_subscription_id,
              email: email,
              name: donor.name,
              phone: donor.phone
            })
          }).catch(function() { /* non-blocking attribution */ });
        }
        alert('Sai Ram! Your monthly seva has been set up.');
      }
    });
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

export function initSeva() {
  const section = document.querySelector('.seva-section');
  if (!section) return;

  let session = null;
  try { session = JSON.parse(localStorage.getItem('sspk_session')); } catch (e) { session = null; }
  if (!hasSession(session)) {
    if (typeof window !== 'undefined' && window.location.pathname.indexOf('seva.html') !== -1) {
      window.location.replace('login.html');
    }
    return;
  }

  document.querySelectorAll('.seva-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      switchTab(document, tab.getAttribute('data-tab'));
    });
  });

  const onceBtn = document.getElementById('sevaOnceBtn');
  if (onceBtn) onceBtn.addEventListener('click', function() { handleOnce(document, onceBtn); });

  const qrBtn = document.getElementById('sevaQrBtn');
  if (qrBtn) qrBtn.addEventListener('click', function() { handleQR(document, qrBtn); });

  const autoBtn = document.getElementById('sevaAutoBtn');
  if (autoBtn) autoBtn.addEventListener('click', function() { handleAuto(document, autoBtn); });

  const sel = document.querySelector('.seva-purpose-select');
  if (sel) {
    sel.addEventListener('change', function() {
      const { amount } = getSelectedPurpose(document);
      const input = document.getElementById('sevaQrAmount');
      if (input && amount !== null) input.value = amount;
    });
  }
}

if (typeof window !== 'undefined') {
  window.Seva = {
    init: initSeva,
    createDonorFromForm: createDonorFromForm,
    hasSession: hasSession,
    getSessionEmail: getSessionEmail,
    resolveQRSource: resolveQRSource,
    resolveAutopaySource: resolveAutopaySource
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSeva);
  } else {
    initSeva();
  }
}

export function getImpactText(amount){
  amount=Number(amount)||0;
  if(amount>=1101) return `₹${amount} — Sponsor a Homam + prasadam for devotees`;
  if(amount>=501) return `₹${amount} — Veda student support for 1 month`;
  if(amount>=202) return `₹${amount} — ${Math.floor(amount/101)} meals for families`;
  if(amount>=101) return `₹${amount} — 1 meal for 3 families (Anna Danam)`;
  if(amount>0) return `₹${amount} — Every rupee sustains seva`;
  return 'Choose an amount to see impact';
}
export function formatSocialProof(count){ count=Number(count)||0; if(count===0) return 'Be the first to support this month — your seva inspires others.'; return `You joined ${count} supporters this month — thank you!`; }
export async function loadSocialProof(){
  const el=document.getElementById('socialProofText'); if(!el) return;
  try{
    const res=await fetch('/api/razorpay/history'); const j=await res.json();
    const thisMonth=new Date().toISOString().slice(0,7);
    const count=(j.data||j||[]).filter(d=> (d.created_at||'').startsWith(thisMonth)).length;
    el.textContent=formatSocialProof(count);
  }catch(e){ el.textContent=formatSocialProof(0); }
}
if(typeof module!=='undefined' && module.exports){ module.exports.getImpactText=getImpactText; module.exports.formatSocialProof=formatSocialProof; module.exports.loadSocialProof=loadSocialProof; }
if(typeof window!=='undefined'){ window.SevaCalc={getImpactText, formatSocialProof, loadSocialProof}; if(window.Seva){ window.Seva.getImpactText=getImpactText; window.Seva.formatSocialProof=formatSocialProof; window.Seva.loadSocialProof=loadSocialProof; } }
if(typeof document!=='undefined'){
  document.addEventListener('DOMContentLoaded',()=>{
    const impact=document.getElementById('impactText');
    const upd=(v)=>{ if(impact) impact.textContent=getImpactText(v); };
    document.querySelectorAll('.donation-tier').forEach(b=>b.addEventListener('click',()=>upd(b.dataset.amount)));
    const inp=document.getElementById('sevaOnceAmount'); if(inp) inp.addEventListener('input',()=>upd(inp.value));
    const qr=document.getElementById('sevaQrAmount'); if(qr) qr.addEventListener('input',()=>upd(qr.value));
  });
  document.addEventListener('DOMContentLoaded', loadSocialProof);
}