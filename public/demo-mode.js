// Samples are opt-in via /demo/. No preference can silently enable them on /.
(async () => {
  const demo = /^\/demo(?:\/|$)/.test(location.pathname);
  const toggle = document.createElement('a');
  toggle.className = 'button secondary mode-toggle';
  toggle.href = demo ? '/' : '/demo/';
  toggle.textContent = demo ? 'Exit demo' : 'Demo';
  document.querySelector('.shell-bar')?.append(toggle);
  if (demo) {
    const scopeLink = link => {
      const href = link.getAttribute('href');
      if (link !== toggle && href?.startsWith('/') && !href.startsWith('//') && !href.startsWith('/demo')) link.setAttribute('href', `/demo${href}`);
    };
    document.querySelectorAll('a[href]').forEach(scopeLink);
    document.addEventListener('click', event => { const link = event.target.closest('a[href]'); if (link) scopeLink(link); }, true);
  }
  try {
    const response = await fetch(`${demo ? '/demo' : ''}/api/capabilities`);
    if (!response.ok) return;
    const mode = (await response.json()).mode;
    if (mode === 'local') return;
    const banner = document.createElement('p');
    banner.className = 'demo-banner';
    banner.textContent = mode === 'demo'
      ? 'Demo · Sample skills and locations. Changes stay in this browser. Exit demo to return to your real workspace.'
      : 'Real workspace · Run the local app to access your computer’s skills. Click Demo to explore sample data.';
    document.querySelector('main')?.prepend(banner);
    const label = document.querySelector('.sidebar-bottom strong');
    if (label) label.textContent = mode === 'demo' ? 'Demo' : 'Local app required';
    for (const selector of ['#scan-open', '#new-project']) {
      const button = document.querySelector(selector);
      if (button) { button.disabled = true; button.title = 'Run the local app to scan your computer and manage real skills.'; }
    }
  } catch { /* The local app remains usable if mode discovery is temporarily unavailable. */ }
})();
