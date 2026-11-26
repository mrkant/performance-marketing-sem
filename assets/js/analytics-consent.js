(() => {
  'use strict';

  const key = 'shashikant.analytics-consent.v1';
  const measurement = 'G-L3MNSKHPTR';
  const days = 180;
  const layer = window.dataLayer = window.dataLayer || [];
  let started = false;
  let preference = readPreference();

  function consent() {
    layer.push(arguments);
  }

  function setting(analytics) {
    return {
      analytics_storage: analytics,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    };
  }

  consent('consent', 'default', setting('denied'));

  function readPreference() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved && saved.expires > Date.now() &&
          ['allow', 'decline'].includes(saved.value)) return saved.value;
    } catch {
      // Browsers can block storage.
    }
    return null;
  }

  function start() {
    if (started) return;
    const segments = location.pathname.toLowerCase().split('/');
    const excluded = segments.some(part => /^(?:search|contact)(?:\.html)?$/.test(part));
    const hasQuery = [...new URLSearchParams(location.search).keys()]
      .some(name => name.toLowerCase() === 'q');
    if (excluded || hasQuery) return;

    started = true;
    window['ga-disable-' + measurement] = false;
    consent('consent', 'update', setting('granted'));
    layer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const loader = document.createElement('script');
    loader.async = true;
    loader.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-NHZZRHMS';
    document.head.append(loader);
  }

  function stop() {
    window['ga-disable-' + measurement] = true;
    if (started) {
      consent('consent', 'update', setting('denied'));
      if (typeof window.clarity === 'function') {
        window.clarity('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' });
      }
    }
    const cookies = /^(?:_ga(?:_.+)?|_gid|_gat(?:_.+)?|_clck|_clsk)$/;
    for (const entry of document.cookie.split(';')) {
      const name = entry.trim().split('=')[0];
      if (!cookies.test(name)) continue;
      const expiry = name + '=; Max-Age=0; Path=/';
      document.cookie = expiry;
      if (/(^|\.)shashikant\.jp$/.test(location.hostname)) {
        document.cookie = expiry + '; Domain=shashikant.jp';
      }
    }
    if (started) location.reload();
  }

  const copy = {
    en: ['Analytics preferences', 'Allow Google Analytics and Microsoft Clarity to measure visits and interactions, including clicks and session recordings? The site works regardless of your choice.', 'Accept analytics', 'Reject analytics', 'Privacy policy'],
    ja: ['アクセス解析の設定', 'Google Analytics と Microsoft Clarity による訪問・クリック等の計測やセッションの記録を許可しますか？どちらを選んでもサイトをご利用いただけます。', 'アクセス解析に同意する', 'アクセス解析を拒否する', 'プライバシーポリシー'],
    ko: ['분석 설정', 'Google Analytics와 Microsoft Clarity에서 방문과 클릭을 측정하고 세션을 기록하도록 허용하시겠습니까? 어느 쪽을 선택해도 사이트를 이용할 수 있습니다.', '분석 허용', '분석 거부', '개인정보 처리방침'],
    hi: ['वेबसाइट विश्लेषण की सेटिंग', 'क्या Google Analytics और Microsoft Clarity को विज़िट और क्लिक मापने तथा सत्र रिकॉर्ड करने की अनुमति दें? आप किसी भी विकल्प के साथ वेबसाइट इस्तेमाल कर सकते हैं।', 'विश्लेषण की अनुमति दें', 'विश्लेषण अस्वीकार करें', 'गोपनीयता नीति']
  };

  function render() {
    const pathLanguage = location.pathname.split('/')[1].toLowerCase();
    const pageLanguage = document.documentElement.lang.toLowerCase().split('-')[0];
    const [title, message, accept, reject, policy] =
      Object.hasOwn(copy, pathLanguage) ? copy[pathLanguage] :
      Object.hasOwn(copy, pageLanguage) ? copy[pageLanguage] : copy.en;
    const panel = document.createElement('section');
    panel.setAttribute('aria-label', title);
    panel.style.cssText = 'position:fixed;inset:auto 1rem 1rem;z-index:10000;max-width:35rem;padding:1rem;background:#101c2a;color:#fff;border:1px solid #8398ab;border-radius:12px;font:1rem/1.5 system-ui;max-height:85vh;overflow:auto;';
    const description = document.createElement('p');
    description.textContent = message;
    description.style.color = 'inherit';
    const link = document.createElement('a');
    link.href = '/privacy.html';
    link.textContent = policy;
    link.style.cssText = 'display:block;margin-top:.4rem;color:#b9e1ff;text-decoration:underline;';

    function button(label, action) {
      const control = document.createElement('button');
      control.type = 'button';
      control.textContent = label;
      control.style.cssText = 'cursor:pointer;margin:.2rem;padding:.5rem .75rem;font:inherit;border:1px solid #597086;border-radius:6px;background:#eef6ff;color:#101c2a;';
      control.addEventListener('click', action);
      return control;
    }

    function save(value) {
      preference = value;
      try {
        localStorage.setItem(key, JSON.stringify({ value, expires: Date.now() + days * 86400000 }));
      } catch {
        // Apply this choice for the current page.
      }
      panel.hidden = true;
      settings.focus();
      if (value === 'allow') start();
      else stop();
    }

    const rejectButton = button(reject, () => save('decline'));
    const acceptButton = button(accept, () => save('allow'));
    const settings = button(title, () => {
      panel.hidden = false;
      rejectButton.focus();
    });
    panel.append(description, rejectButton, acceptButton, link);
    panel.hidden = Boolean(preference);
    document.body.append(panel);
    (document.querySelector('footer') || document.body).append(settings);
  }

  window.addEventListener('storage', event => {
    if ((event.key === key || event.key === null) && started && readPreference() !== 'allow') {
      stop();
    }
  });

  if (preference === 'allow') start();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})();
