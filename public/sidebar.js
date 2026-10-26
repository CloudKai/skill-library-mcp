(() => {
  const shell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('#app-sidebar');
  const toggle = document.querySelector('#sidebar-toggle');
  if (!shell || !sidebar || !toggle) return;

  const narrow = matchMedia('(max-width: 960px)');
  const storageKey = () => `skill-library-sidebar:${narrow.matches ? 'narrow' : 'wide'}`;
  let open = true;

  function render(next) {
    const restoreFocus = !next && sidebar.contains(document.activeElement);
    open = next;
    sidebar.hidden = !open;
    shell.classList.toggle('sidebar-hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide sidebar' : 'Show sidebar');
    toggle.title = open ? 'Hide sidebar' : 'Show sidebar';
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }
  function load() {
    let saved;
    try { saved = localStorage.getItem(storageKey()); } catch { /* Navigation still works without storage. */ }
    render(saved === 'open' ? true : saved === 'closed' ? false : !narrow.matches);
  }
  function choose(next) {
    render(next);
    if (next && matchMedia('(max-width: 620px)').matches) {
      sidebar.scrollTop = 0;
      sidebar.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    try { localStorage.setItem(storageKey(), open ? 'open' : 'closed'); } catch { /* Keep the current page usable. */ }
  }
  toggle.addEventListener('click', () => choose(!open));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !open || event.target?.closest('dialog[open]')) return;
    if (sidebar.contains(document.activeElement) || document.activeElement === toggle) {
      event.preventDefault();
      choose(false);
    }
  });
  narrow.addEventListener('change', load);
  window.addEventListener('storage', event => { if (event.key === storageKey() || event.key === null) load(); });
  load();
})();
