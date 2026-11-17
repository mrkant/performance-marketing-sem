/**
 * Marketing Intelligence – Core JavaScript
 * shashikant.jp
 */

document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  
  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', () => {
      mobileNav.classList.toggle('active');
      menuToggle.setAttribute('aria-expanded', 
        mobileNav.classList.contains('active') ? 'true' : 'false');
    });
  }

  // Search overlay
  const searchBtn = document.querySelector('.search-btn');
  const searchOverlay = document.querySelector('.search-overlay');
  const searchClose = document.querySelector('.search-close');
  const searchInput = document.querySelector('.search-input');

  if (searchBtn && searchOverlay) {
    searchBtn.addEventListener('click', () => {
      searchOverlay.classList.add('active');
      setTimeout(() => searchInput?.focus(), 100);
    });
  }

  if (searchClose) {
    searchClose.addEventListener('click', () => {
      searchOverlay.classList.remove('active');
    });
  }

  if (searchOverlay) {
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) {
        searchOverlay.classList.remove('active');
      }
    });
  }

  // Accordion
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const accordion = header.parentElement;
      const wasActive = accordion.classList.contains('active');
      
      // Close others in same group if desired
      document.querySelectorAll('.accordion').forEach(a => a.classList.remove('active'));
      
      if (!wasActive) {
        accordion.classList.add('active');
      }
    });
  });

  // Fishbone branch expansion
  document.querySelectorAll('.branch-label').forEach(label => {
    label.addEventListener('click', () => {
      const details = label.nextElementSibling;
      if (details && details.classList.contains('branch-details')) {
        // Close all others
        document.querySelectorAll('.branch-details').forEach(d => d.classList.remove('active'));
        details.classList.toggle('active');
      }
    });
  });

  // Framework items interaction
  document.querySelectorAll('.framework-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.target;
      if (target) {
        const el = document.querySelector(target);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // Simple search (client-side content filter for demo)
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim().toLowerCase();
        if (query.length < 2) return;
        
        // Basic navigation based on keywords
        const routes = {
          'brand': 'pages/brand-intelligence.html',
          'luxury': 'pages/luxury-strategy.html',
          'product': 'pages/product-intelligence.html',
          'consumer': 'pages/consumer-psychology.html',
          'pricing': 'pages/pricing-strategy.html',
          'retail': 'pages/retail-distribution.html',
          'campaign': 'pages/campaign-intelligence.html',
          'opportunity': 'pages/business-opportunities.html',
          'measurement': 'pages/marketing-measurement.html',
          'case': 'pages/case-studies.html',
          'fishbone': 'pages/fishbone-framework.html',
          'fundamentals': 'pages/fundamentals.html'
        };
        
        for (const [key, path] of Object.entries(routes)) {
          if (query.includes(key)) {
            window.location.href = path.startsWith('pages/') ? path : 'pages/' + path;
            return;
          }
        }
        
        // Fallback message
        alert('Search for topics such as: brand, luxury, product, consumer, pricing, retail, campaign, opportunity, measurement, case studies, fishbone.');
      }
    });
  }

  // Product Opportunity Scoring Calculator (if present)
  const scoreForm = document.getElementById('opportunity-scorer');
  if (scoreForm) {
    scoreForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fields = ['demand', 'attractiveness', 'competition', 'differentiation', 'viability', 'feasibility', 'scalability'];
      let total = 0;
      let count = 0;
      
      fields.forEach(f => {
        const val = parseFloat(document.getElementById(`score-${f}`)?.value || 0);
        if (val >= 1 && val <= 10) {
          total += val;
          count++;
        }
      });
      
      const avg = count ? (total / count).toFixed(1) : 0;
      const resultEl = document.getElementById('score-result');
      if (resultEl) {
        let interpretation = '';
        if (avg >= 8) interpretation = 'Strong opportunity – prioritise for deeper validation.';
        else if (avg >= 6) interpretation = 'Promising – refine the proposition and test assumptions.';
        else if (avg >= 4) interpretation = 'Moderate – significant risks or gaps remain.';
        else interpretation = 'Weak – reconsider or deprioritise.';
        
        resultEl.innerHTML = `
          <div class="callout">
            <div class="callout-title">Opportunity Score: ${avg} / 10</div>
            <p>${interpretation}</p>
            <p class="text-secondary" style="font-size:0.85rem;margin:0">
              This score is based solely on the assumptions you entered. It is not a market forecast.
            </p>
          </div>
        `;
      }
    });
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Active nav highlighting based on path
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && path.includes(href.replace('../', '').replace('./', ''))) {
      link.classList.add('active');
    }
  });
});