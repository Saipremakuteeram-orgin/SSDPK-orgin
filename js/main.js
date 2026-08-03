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
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  function renderDynamicNav() {
    var navLinks = document.getElementById('navLinks');
    if (navLinks) {
      console.log('Dynamic nav links checking... navLinks found.');
      var session = null;
      try {
        session = JSON.parse(localStorage.getItem('sspk_session'));
        console.log('Session retrieved in main.js:', session);
      } catch (e) {
        console.error(e);
      }
      
      var linksHtml = '';
      linksHtml += '<a href="index.html" data-i18n="nav.home">Home</a>';
      linksHtml += '<a href="about.html" data-i18n="nav.about">About</a>';
      linksHtml += '<a href="trustees.html" data-i18n="nav.trustees">Trustees</a>';
      linksHtml += '<a href="gallery.html" data-i18n="nav.gallery">Gallery</a>';
      linksHtml += '<a href="events.html" data-i18n="nav.events">Events</a>';
      
      if (session) {
        linksHtml += '<a href="dashboard.html" class="donate-btn" data-i18n="nav.dashboard">Dashboard</a>';
        linksHtml += '<a href="#" id="navLogoutBtn" class="nav-logout-btn" data-i18n="nav.signOut">Sign Out</a>';
      } else {
        linksHtml += '<a href="login.html" class="nav-login-btn" data-i18n="nav.signIn">Sign In</a>';
        linksHtml += '<a href="signup.html" class="nav-signup-btn" data-i18n="nav.signUp">Sign Up</a>';
      }
      
      navLinks.innerHTML = linksHtml;

      // Handle sign out
      var navLogoutBtn = document.getElementById('navLogoutBtn');
      if (navLogoutBtn) {
        navLogoutBtn.addEventListener('click', function(e) {
          e.preventDefault();
          localStorage.removeItem('sspk_session');
          if (window.supabase) {
            window.supabase.auth.signOut().catch(function(err) { console.warn(err); });
          }
          window.location.href = 'login.html';
        });
      }

      // Active nav link highlight
      var currentPath = window.location.pathname.split('/').pop() || 'index.html';
      currentPath = currentPath.split('?')[0];
      document.querySelectorAll('.nav-links a').forEach(function(link) {
        var href = link.getAttribute('href');
        if (href && href.split('?')[0] === currentPath) {
          link.classList.add('active');
        }
      });
    }
  }

  // Run renderDynamicNav
  renderDynamicNav();
  window.addEventListener('DOMContentLoaded', renderDynamicNav);

  // Lightbox
  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightboxImg');
  var lightboxClose = document.getElementById('lightboxClose');

  if (lightbox && lightboxImg) {
    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-lightbox]');
      if (el) {
        var src = el.getAttribute('data-lightbox');
        var caption = el.getAttribute('data-caption') || '';
        lightboxImg.src = src;
        lightboxImg.alt = caption;
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
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
        link.setAttribute('href', base + '?v=1.1.0');
      }
    });
  }

  // Run upgrade
  upgradeRedesign();
  window.addEventListener('DOMContentLoaded', upgradeRedesign);

  // ══════════════════════════════════════════════════════════════
  // SCROLL REVEAL ANIMATIONS
  // ══════════════════════════════════════════════════════════════
  function initScrollReveal() {
    var animElements = document.querySelectorAll('[data-animate]');
    if (!animElements.length) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    animElements.forEach(function(el) { observer.observe(el); });
  }
  initScrollReveal();
  window.addEventListener('DOMContentLoaded', initScrollReveal);

  // ══════════════════════════════════════════════════════════════
  // FLOATING PARTICLES
  // ══════════════════════════════════════════════════════════════
  function createParticles() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var container = document.createElement('div');
    container.className = 'divine-particles';
    document.body.appendChild(container);

    for (var i = 0; i < 15; i++) {
      var p = document.createElement('div');
      p.className = 'divine-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (8 + Math.random() * 12) + 's';
      p.style.animationDelay = Math.random() * 10 + 's';
      p.style.width = p.style.height = (3 + Math.random() * 5) + 'px';
      container.appendChild(p);
    }
  }
  createParticles();

  // ══════════════════════════════════════════════════════════════
  // CURSOR GLOW TRAIL
  // ══════════════════════════════════════════════════════════════
  function initCursorGlow() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if ('ontouchstart' in window) return;

    var glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);

    document.addEventListener('mousemove', function(e) {
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    });
  }
  initCursorGlow();

  // ══════════════════════════════════════════════════════════════
  // BACK TO TOP BUTTON
  // ══════════════════════════════════════════════════════════════
  function initBackToTop() {
    var btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.innerHTML = '&#9650;';
    btn.setAttribute('aria-label', 'Back to top');
    btn.setAttribute('data-tooltip', 'Back to top');
    document.body.appendChild(btn);

    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', function() {
      if (window.scrollY > 400) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    });
  }
  initBackToTop();

  // ══════════════════════════════════════════════════════════════
  // RIPPLE CLICK EFFECT ON BUTTONS
  // ══════════════════════════════════════════════════════════════
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn, .ripple');
    if (!btn) return;

    var rect = btn.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    var wave = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.left = x + 'px';
    wave.style.top = y + 'px';
    wave.style.width = wave.style.height = Math.max(rect.width, rect.height) + 'px';

    btn.style.position = btn.style.position || 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(wave);

    setTimeout(function() { wave.remove(); }, 600);
  });

  // ══════════════════════════════════════════════════════════════
  // SMOOTH COUNTER ANIMATION
  // ══════════════════════════════════════════════════════════════
  function animateCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var target = parseInt(el.getAttribute('data-count'), 10);
          var duration = 2000;
          var start = 0;
          var startTime = null;

          el.classList.add('counting');

          function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(eased * target).toLocaleString();
            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              el.textContent = target.toLocaleString();
              el.classList.remove('counting');
            }
          }
          requestAnimationFrame(step);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(function(c) { observer.observe(c); });
  }
  animateCounters();

  // ══════════════════════════════════════════════════════════════
  // LAZY LOAD IMAGES
  // ══════════════════════════════════════════════════════════════
  function initLazyLoad() {
    var imgs = document.querySelectorAll('img[data-src]');
    if (!imgs.length) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          img.src = img.getAttribute('data-src');
          img.removeAttribute('data-src');
          img.addEventListener('load', function() { img.classList.add('loaded'); });
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });

    imgs.forEach(function(img) { observer.observe(img); });
  }
  initLazyLoad();

  // ══════════════════════════════════════════════════════════════
  // MAGNETIC BUTTONS
  // ══════════════════════════════════════════════════════════════
  function initMagnetic() {
    if ('ontouchstart' in window) return;
    document.addEventListener('mousemove', function(e) {
      var btn = e.target.closest('.magnetic-btn');
      if (!btn) return;
      var rect = btn.getBoundingClientRect();
      var x = e.clientX - rect.left - rect.width / 2;
      var y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = 'translate(' + (x * 0.2) + 'px, ' + (y * 0.2) + 'px)';
    });
    document.addEventListener('mouseleave', function(e) {
      var btn = e.target.closest('.magnetic-btn');
      if (btn) btn.style.transform = '';
    }, true);
  }
  initMagnetic();

  // ══════════════════════════════════════════════════════════════
  // SMOOTH NAV SHADOW ON SCROLL
  // ══════════════════════════════════════════════════════════════
  function initNavScroll() {
    var nav = document.querySelector('nav');
    if (!nav) return;
    window.addEventListener('scroll', function() {
      if (window.scrollY > 50) {
        nav.style.boxShadow = '0 4px 20px oklch(72% 0.14 85 / 0.1)';
      } else {
        nav.style.boxShadow = '';
      }
    });
  }
  initNavScroll();

  // ══════════════════════════════════════════════════════════════
  // PARALLAX ON SCROLL
  // ══════════════════════════════════════════════════════════════
  function initParallax() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var els = document.querySelectorAll('[data-parallax]');
    if (!els.length) return;

    window.addEventListener('scroll', function() {
      var scrollY = window.scrollY;
      els.forEach(function(el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.3;
        var rect = el.getBoundingClientRect();
        var offset = (rect.top + scrollY - window.innerHeight / 2) * speed;
        el.style.transform = 'translateY(' + (-offset) + 'px)';
      });
    });
  }
  initParallax();

})();

