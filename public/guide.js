const $ = selector => document.querySelector(selector);

// Public documentation never loads owner state or project-specific configuration.
const example = {
  json: JSON.stringify({ mcpServers: { skills: { command: 'node', args: ['/absolute/path/to/library-server/dist/stdio.js'], env: { SKILL_LIBRARY_PROJECT: 'your-project-id', SKILL_LIBRARY_DIR: '/absolute/path/to/library' } } } }, null, 2),
  toml: '[mcp_servers.skills]\ncommand = "node"\nargs = ["/absolute/path/to/library-server/dist/stdio.js"]\n\n[mcp_servers.skills.env]\nSKILL_LIBRARY_PROJECT = "your-project-id"\nSKILL_LIBRARY_DIR = "/absolute/path/to/library"',
  http: 'http://127.0.0.1:3333/mcp?project=your-project-id',
};
function renderExample() {
  const format = $('#guide-format').value;
  $('#guide-code').textContent = example[format];
  $('#guide-connection-help').textContent = format === 'http'
    ? 'Example only. Replace the address if needed and use your own project ID. Keep the local HTTP server running.'
    : 'Example only. Replace the server path, library path and project ID. Use the format supported by your MCP client.';
  $('#guide-copy-status').textContent = '';
}
$('#guide-format').addEventListener('change', renderExample);
$('#guide-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#guide-code').textContent); $('#guide-copy-status').textContent = 'Example copied; replace placeholders before connecting.'; }
  catch { $('#guide-copy-status').textContent = 'Select and copy the example manually.'; }
});
// Remove legacy project selection from guide links without disturbing anchors.
const guideUrl = new URL(location.href);
if (guideUrl.searchParams.has('project')) {
  guideUrl.searchParams.delete('project');
  history.replaceState(null, '', `${guideUrl.pathname}${guideUrl.search}${guideUrl.hash}`);
}
renderExample();

const sections = [...document.querySelectorAll('.guide-article > section')];
const links = [...document.querySelectorAll('.guide-toc a[href^="#"]')];
const sidebar = $('#app-sidebar');
let pendingFrame = false;
function followSection() {
  pendingFrame = false;
  if (!sections.length) return;
  const readingLine = ($('.shell-bar')?.getBoundingClientRect().bottom ?? 0) + 24;
  let active = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= readingLine) active = section;
    else break;
  }
  // A short final section may never reach the reading line before page end.
  if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) active = sections.at(-1);
  const current = links.find(link => link.getAttribute('href') === `#${active.id}`);
  for (const link of links) {
    if (link === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  if (!current || !sidebar || sidebar.hidden || !$('.sidebar-section')?.open || matchMedia('(max-width: 620px)').matches) return;
  // Scroll only the navigation container; scrollIntoView could move the article.
  const frame = sidebar.getBoundingClientRect(), item = current.getBoundingClientRect();
  if (item.top < frame.top + 8) sidebar.scrollTop += item.top - frame.top - 8;
  else if (item.bottom > frame.bottom - 8) sidebar.scrollTop += item.bottom - frame.bottom + 8;
}
function scheduleSection() {
  if (pendingFrame) return;
  pendingFrame = true;
  requestAnimationFrame(followSection);
}
window.addEventListener('scroll', scheduleSection, { passive: true });
window.addEventListener('resize', scheduleSection);
window.addEventListener('hashchange', scheduleSection);
window.addEventListener('pageshow', scheduleSection);
$('#sidebar-toggle')?.addEventListener('click', scheduleSection);
$('.sidebar-section')?.addEventListener('toggle', scheduleSection);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleSection).observe($('.guide-article'));
scheduleSection();
