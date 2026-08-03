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
    const data = await fetchJson('/api/razorpay/payment-link', { amount, purpose: label || 'Seva', donor });
    renderQR(data.short_url, 'sevaQR');
    const shareBtn = doc.getElementById('sevaShareBtn');
    if (shareBtn && data.short_url) {
      shareBtn.onclick = function() {
        window.open('https://wa.me/?text=' + encodeURIComponent('Please contribute to our Seva: ' + data.short_url), '_blank');
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
    const data = await fetchJson('/api/razorpay/subscription', { amount, interval: 'monthly', donor });
    await openCheckout({
      key: data.key_id,
      subscription_id: data.subscription_id,
      name: 'Sathya Sai Prema Kuteeram',
      description: 'Monthly Seva',
      prefill: { name: donor.name, email: donor.email, contact: donor.phone },
      theme: { color: '#C07A3E' },
      handler: function() {
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
  window.Seva = { init: initSeva, createDonorFromForm: createDonorFromForm };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSeva);
  } else {
    initSeva();
  }
}