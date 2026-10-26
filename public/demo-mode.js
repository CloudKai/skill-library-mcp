// Hosted pages are labelled before a visitor confuses sample data with their computer.
(async () => {
  try {
    const response = await fetch('/api/capabilities');
    if (!response.ok || (await response.json()).mode !== 'demo') return;
    const banner = document.createElement('p');
    banner.className = 'demo-banner';
    banner.textContent = 'Public demo · Library and locations are sample data. Marketplace discovery is live. Scanning and installation require the local app.';
    document.querySelector('main')?.prepend(banner);
    document.querySelector('.sidebar-bottom strong').textContent = 'Public demo';
    for (const selector of ['#scan-open','#new-project']) {
      const button = document.querySelector(selector);
      if (button) { button.disabled = true; button.title = 'Run the local app to scan folders, install skills or create real project profiles.'; }
    }
  } catch { /* The regular local pages remain usable without this optional mode label. */ }
})();
