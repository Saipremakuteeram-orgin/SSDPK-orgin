// Vercel Speed Insights initialization
// Simplified version for vanilla JavaScript/HTML sites
(function() {
  'use strict';

  // Check if we're in a browser environment
  if (typeof window === 'undefined') return;

  // Initialize the Speed Insights queue
  function initQueue() {
    if (window.si) return;
    window.si = function(...params) {
      window.siq = window.siq || [];
      window.siq.push(params);
    };
  }

  // Detect if we're in development mode
  function isDevelopment() {
    try {
      // Check if running on localhost
      if (window.location.hostname === 'localhost' || 
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname === '') {
        return true;
      }
    } catch (e) {
      // Ignore errors
    }
    return false;
  }

  // Get the script source URL
  function getScriptSrc(props) {
    if (props.scriptSrc) {
      return props.scriptSrc;
    }
    
    if (isDevelopment()) {
      return 'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js';
    }
    
    return '/_vercel/speed-insights/script.js';
  }

  // Inject Speed Insights script
  function injectSpeedInsights(props) {
    props = props || {};
    
    if (props.route === null) return null;

    initQueue();

    var src = getScriptSrc(props);
    
    // Check if script is already loaded
    if (document.head.querySelector('script[src*="' + src + '"]')) {
      return null;
    }

    // Create dataset attributes
    var dataset = {
      sdkn: '@vercel/speed-insights',
      sdkv: '2.0.0'
    };

    if (props.sampleRate) {
      dataset.sampleRate = props.sampleRate.toString();
    }

    if (props.route) {
      dataset.route = props.route;
    }

    if (isDevelopment() && props.debug === false) {
      dataset.debug = 'false';
    }

    // Create and configure the script element
    var script = document.createElement('script');
    script.src = src;
    script.defer = true;

    // Set data attributes
    for (var key in dataset) {
      if (dataset.hasOwnProperty(key)) {
        script.dataset[key] = dataset[key];
      }
    }

    script.onerror = function() {
      console.log(
        '[Vercel Speed Insights] Failed to load script from ' + src + 
        '. Please check if any content blockers are enabled and try again.'
      );
    };

    // Append script to head
    document.head.appendChild(script);

    return {
      setRoute: function(route) {
        script.dataset.route = route || undefined;
      }
    };
  }

  // Auto-initialize Speed Insights when DOM is ready
  function autoInit() {
    injectSpeedInsights({
      debug: isDevelopment()
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  // Export for manual usage if needed
  window.SpeedInsights = {
    inject: injectSpeedInsights
  };

})();
