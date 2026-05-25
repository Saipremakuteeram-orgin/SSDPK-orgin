// Sathya Sai Prema Kuterram — Shared JS
(function() {
  'use strict';

  // Mobile nav toggle
  var toggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (toggle && navLinks) {
    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      navLinks.classList.toggle('open');
      toggle.setAttribute('aria-expanded', navLinks.classList.contains('open'));
    });
    document.addEventListener('click', function(e) {
      if (!navLinks.contains(e.target) && !toggle.contains(e.target)) {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Active nav link
  var currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function(link) {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });

  // Lightbox
  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightboxImg');
  var lightboxClose = document.getElementById('lightboxClose');

  if (lightbox && lightboxImg) {
    document.querySelectorAll('[data-lightbox]').forEach(function(el) {
      el.addEventListener('click', function() {
        var src = this.getAttribute('data-lightbox');
        var caption = this.getAttribute('data-caption') || '';
        lightboxImg.src = src;
        lightboxImg.alt = caption;
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    function closeLightbox() {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    }

    if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  // Donation tier selection
  var tiers = document.querySelectorAll('.donation-tier');
  var customInput = document.getElementById('customAmount');

  tiers.forEach(function(tier) {
    tier.addEventListener('click', function() {
      tiers.forEach(function(t) { t.classList.remove('selected'); });
      this.classList.add('selected');
      if (customInput) customInput.value = this.getAttribute('data-amount') || '';
    });
  });

  if (customInput) {
    customInput.addEventListener('input', function() {
      tiers.forEach(function(t) { t.classList.remove('selected'); });
    });
  }

  // Razorpay donation handler
  var donateBtn = document.getElementById('donateBtn');
  if (donateBtn) {
    donateBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var customAmountEl = document.getElementById('customAmount');
      var amount = customAmountEl ? customAmountEl.value : '';
      if (!amount || isNaN(amount) || parseInt(amount) <= 0) {
        alert('Please enter a valid donation amount.');
        return;
      }
      amount = parseInt(amount);

      // Show loading state
      donateBtn.textContent = 'Opening Razorpay...';
      donateBtn.disabled = true;

      // Razorpay checkout — test mode
      // Replace KEY with live key in production
      var options = {
        key: 'rzp_test_YOUR_TEST_KEY',
        amount: amount * 100, // paise
        currency: 'INR',
        name: 'Sathya Sai Prema Kuterram',
        description: 'Donation',
        image: '', // optional logo URL
        prefill: {
          name: '',
          email: '',
          contact: ''
        },
        theme: {
          color: '#C07A3E'
        },
        handler: function(response) {
          donateBtn.textContent = 'Donate via Razorpay';
          donateBtn.disabled = false;
          alert('Thank you for your donation! Payment ID: ' + response.razorpay_payment_id);
          // In production: POST to your server to verify payment
        },
        modal: {
          ondismiss: function() {
            donateBtn.textContent = 'Donate via Razorpay';
            donateBtn.disabled = false;
          }
        }
      };

      var rzp = new Razorpay(options);
      rzp.open();
    });
  }

  // Logo zoom click handler (Event Delegation)
  document.addEventListener('click', function(e) {
    var logoImg = e.target;
    if (logoImg && logoImg.classList.contains('nav-logo-img')) {
      e.preventDefault();
      e.stopPropagation();

      // Find or create logo lightbox modal
      var logoModal = document.getElementById('logo-lightbox-modal');
      if (!logoModal) {
        logoModal = document.createElement('div');
        logoModal.id = 'logo-lightbox-modal';
        logoModal.style.position = 'fixed';
        logoModal.style.top = '0';
        logoModal.style.left = '0';
        logoModal.style.width = '100%';
        logoModal.style.height = '100%';
        logoModal.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        logoModal.style.zIndex = '9999';
        logoModal.style.display = 'flex';
        logoModal.style.alignItems = 'center';
        logoModal.style.justifyContent = 'center';
        logoModal.style.opacity = '0';
        logoModal.style.transition = 'opacity 0.3s ease';
        logoModal.style.cursor = 'zoom-out';

        // Close button
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '20px';
        closeBtn.style.right = '30px';
        closeBtn.style.fontSize = '45px';
        closeBtn.style.color = 'white';
        closeBtn.style.border = 'none';
        closeBtn.style.background = 'transparent';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.transition = 'transform 0.2s';
        closeBtn.addEventListener('mouseover', function() { closeBtn.style.transform = 'scale(1.15)'; });
        closeBtn.addEventListener('mouseout', function() { closeBtn.style.transform = 'scale(1)'; });
        logoModal.appendChild(closeBtn);

        // Large image element
        var largeImg = document.createElement('img');
        largeImg.src = logoImg.src;
        largeImg.alt = 'Logo Large';
        largeImg.style.maxWidth = '90%';
        largeImg.style.maxHeight = '90%';
        largeImg.style.borderRadius = '50%';
        largeImg.style.border = '4px solid var(--accent)';
        largeImg.style.boxShadow = '0 0 30px oklch(58% 0.14 50 / 0.8), 0 0 50px oklch(58% 0.14 50 / 0.4)';
        largeImg.style.objectFit = 'contain';
        largeImg.style.transform = 'scale(0.85)';
        largeImg.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        logoModal.appendChild(largeImg);

        document.body.appendChild(logoModal);

        // Close handlers
        var closeModal = function() {
          logoModal.style.opacity = '0';
          largeImg.style.transform = 'scale(0.85)';
          document.body.style.overflow = '';
          setTimeout(function() {
            logoModal.style.display = 'none';
          }, 300);
        };

        logoModal.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        document.addEventListener('keydown', function(event) {
          if (event.key === 'Escape' && logoModal.style.display === 'flex') {
            closeModal();
          }
        });
      }

      // Open the modal
      var imgEl = logoModal.querySelector('img');
      logoModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      // Trigger reflow for CSS transitions
      logoModal.offsetHeight;
      logoModal.style.opacity = '1';
      imgEl.style.transform = 'scale(1)';
    }
  });

  // 3D Tilt Card Interaction
  document.addEventListener('mousemove', function(e) {
    var card = e.target.closest('[data-tilt]');
    if (!card) return;

    var rect = card.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    // Calculate rotation angles (-8deg to 8deg range for subtle, premium feel)
    var rx = ((rect.height / 2) - y) / (rect.height / 2) * 8;
    var ry = (x - (rect.width / 2)) / (rect.width / 2) * 8;

    card.style.transform = 'perspective(1000px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) scale3d(1.02, 1.02, 1.02)';
    card.style.boxShadow = '0 15px 35px rgba(142, 90, 48, 0.12), 0 0 25px oklch(62% 0.16 50 / 0.15)';
    
    var inner = card.querySelector('.tilt-card-inner');
    if (inner) {
      inner.style.transform = 'translateZ(40px) scale(0.98)';
    }
  });

  document.addEventListener('mouseout', function(e) {
    var card = e.target.closest('[data-tilt]');
    if (!card) return;

    var related = e.relatedTarget;
    if (related && card.contains(related)) return;

    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    card.style.boxShadow = '';
    
    var inner = card.querySelector('.tilt-card-inner');
    if (inner) {
      inner.style.transform = 'translateZ(0px) scale(1)';
    }
  });

  // Rebuild HTML elements with 3D Morph & Glassmorphism classes dynamically
  function upgradeRedesign() {
    // 1. Upgrade cards
    document.querySelectorAll('.card, .feature-card, .tree-child-node, .tree-root, .event-card, .gallery-item').forEach(function(card) {
      if (card.classList.contains('tilt-card')) return;
      card.classList.add('glass-panel', 'tilt-card');
      card.setAttribute('data-tilt', '');
      
      if (!card.querySelector('.tilt-card-inner')) {
        var wrapper = document.createElement('div');
        wrapper.className = 'tilt-card-inner';
        while (card.firstChild) {
          wrapper.appendChild(card.firstChild);
        }
        card.appendChild(wrapper);
      }
    });

    // 2. Upgrade hero content card
    var heroContent = document.querySelector('.hero-content');
    if (heroContent && !heroContent.classList.contains('tilt-card')) {
      heroContent.classList.add('glass-panel', 'tilt-card');
      heroContent.setAttribute('data-tilt', '');
      heroContent.style.padding = '40px';
      heroContent.style.borderRadius = '16px';
      
      if (!heroContent.querySelector('.tilt-card-inner')) {
        var wrapper = document.createElement('div');
        wrapper.className = 'tilt-card-inner';
        while (heroContent.firstChild) {
          wrapper.appendChild(heroContent.firstChild);
        }
        heroContent.appendChild(wrapper);
      }
    }

    // 3. Upgrade primary buttons
    document.querySelectorAll('.btn-primary, .donate-btn, #donateBtn').forEach(function(btn) {
      btn.classList.add('btn-premium');
    });

    // 4. Force cache-busting on all local page navigation links
    document.querySelectorAll('a[href$=".html"], a[href*=".html?"]').forEach(function(link) {
      var href = link.getAttribute('href');
      if (href) {
        var base = href.split('?')[0];
        link.setAttribute('href', base + '?v=1.0.5');
      }
    });
  }

  // Run upgrade
  upgradeRedesign();
  window.addEventListener('DOMContentLoaded', upgradeRedesign);
})();
