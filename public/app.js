import { inventoryItems, skillOrigins, sourceSummary, platformName } from './inventory.js';
const $ = (selector) => document.querySelector(selector);
const icons = {
  market: '<path d="M3 9h18l-2-5H5zM5 9v12h14V9M9 21v-7h6v7"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3-1 3 15-3 1z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  document: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  bug: '<path d="M9 5 7 3m8 2 2-2M8 9h8v7a4 4 0 0 1-8 0zM9 9V7a3 3 0 0 1 6 0v2M4 10h4m8 0h4M4 15h4m8 0h4M6 21l3-3m6 0 3 3M12 10v9"/>',
  review: '<path d="M13 3H5v18h14V9M13 3v6h6M13 3l6 6M8 14l2 2 5-5"/>',
  external: '<path d="M14 3h7v7M21 3 10 14M10 4H4v16h16v-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  plug: '<path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.document}</svg>`;
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

const state = { demo: false, skills: [], projects: [], inventory: { groups: [], items: [], last_scan: null }, sourceId: null, inventoryQuery: '', csrf: '', projectId: null, filter: 'all', query: '', selected: null, saving: false, loaded: false, detailTab: 'instructions', expandedFolders: new Set() };
const detailCache = new Map();
let detailRequest = 0;
let toastTimer;
let connection;
let connectionRequest = 0;
let focusIntent = null;
let lastSelection = null;
const currentProject = () => state.projects.find(p => p.id === state.projectId);
const title = (skill) => skill.name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
const emblem = (skill) => icon(skill.name.includes('bug') ? 'bug' : skill.name.includes('review') ? 'review' : 'document');
const enabled = (skill) => currentProject()?.enabled_skills.includes(skill.skill_id) ?? false;
function rememberProject(id) { try { localStorage.setItem('skill-library-project', id ?? '__library__'); } catch { /* Storage may be disabled. */ } }
function savedProject() { try { return localStorage.getItem('skill-library-project'); } catch { return null; } }
function rememberFocus(element = document.activeElement) {
  if (!element?.dataset) return;
  const choices = [['source', 'data-source'], ['toggle', 'data-toggle'], ['toggleFolder', 'data-toggle-folder'], ['folder', 'data-folder'], ['project', 'data-project'], ['select', 'data-select'], ['detailTab', 'data-detail-tab']];
  for (const [key, attribute] of choices) {
    if (element.dataset[key] !== undefined) {
      focusIntent = { attribute, value: element.dataset[key], region: element.closest('#skill-detail') ? '#skill-detail' : element.closest('#projects-nav') ? '#projects-nav' : element.closest('#inventory-nav') ? '#inventory-nav' : '#skills-list' };
      return;
    }
  }
}
function restoreFocus(region) {
  if (!focusIntent || state.saving || focusIntent.region !== region) return;
  const selector = `${region} [${focusIntent.attribute}="${CSS.escape(focusIntent.value)}"]`;
  const target = document.querySelector(selector);
  const fallback = ['#projects-nav', '#inventory-nav'].includes(region) ? $('#project-select') : $('#skills-list [data-folder]') || $('#skills-list [data-select]') || $('#skills-list [data-show-all]') || $('#skill-search');
  if (target && !target.disabled && target.getClientRects().length) target.focus({ preventScroll: true });
  else fallback.focus({ preventScroll: true });
  focusIntent = null;
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(state.csrf ? { 'X-Skill-Library-Token': state.csrf } : {}), ...(options.body ? { 'Content-Type': 'application/json', 'X-Skill-Library-Token': state.csrf } : {}), ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('The library returned an unreadable response. Refresh and try again.'); }
  if (!response.ok) throw new Error(data.error?.message || 'The library could not complete this request.');
  return data;
}
function showError(message) { $('#error-text').textContent = message; $('#error-banner').hidden = false; }
function clearError() { $('#error-banner').hidden = true; }
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3000);
}
function sourceLink(skill) {
  try {
    const url = new URL(skill.source.url);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
    const base = url.href.replace(/\/$/, '');
    const ref = encodeURIComponent(skill.source.commit || 'HEAD');
    return `${base}/tree/${ref}/${skill.source.path.split('/').map(encodeURIComponent).join('/')}`;
  } catch { return null; }
}
function visibleSkills() {
  const query = state.query.trim().toLowerCase();
  return state.skills.filter(skill => {
    if (state.projectId && state.filter === 'enabled' && !enabled(skill)) return false;
    if (state.projectId && state.filter === 'disabled' && enabled(skill)) return false;
    return !query || [skill.folder, skill.name, skill.description, skill.tags.join(' '), skill.personal_notes, skill.skill_id].some(text => text.toLowerCase().includes(query));
  });
}
function chooseProject(id) {
  state.sourceId = null;
  try { localStorage.removeItem('skill-library-source'); } catch {}
  state.projectId = id;
  state.filter = 'all';
  state.query = '';
  $('#skill-search').value = '';
  rememberProject(id);
  render();
}
function chooseSource(id) {
  state.sourceId = id;
  try { localStorage.setItem('skill-library-source', id); } catch {}
  $('#inventory-navigation').open = true;
  state.projectId = null;
  state.selected = null;
  state.inventoryQuery = '';
  $('#inventory-search').value = '';
  rememberProject(null);
  render();
}
function renderInventoryNavigation() {
  const inventory = state.inventory;
  const nav = $('#inventory-nav');
  const groups = inventory.groups || [];
  const row = (id, name, count, hint = '') => `<button type="button" class="nav-item ${state.sourceId === id ? 'selected' : ''}" data-source="${escape(id)}" aria-current="${state.sourceId === id ? 'page' : 'false'}"><span class="project-label"><span>${escape(name)}</span>${hint ? `<small>${escape(hint)}</small>` : ''}</span><span class="nav-count">${count}</span></button>`;
  nav.innerHTML = inventory.last_scan ? row('all', 'All discovered', inventory.items.length) + groups.map(g => row(g.id, g.name, g.count, g.path ? g.path.split('/').slice(-2).join('/') : '')).join('') : '<p class="nav-loading">Scan to discover source locations.</p>';
  $('#inventory-group').innerHTML = '<option value="all">All discovered locations</option>' + groups.map(g => `<option value="${escape(g.id)}">${escape(g.name)}${g.path ? ` · ${escape(g.path.split('/').slice(-2).join('/'))}` : ''}</option>`).join('');
  $('#inventory-group').value = state.sourceId || 'all';
}
function originDetails(origins) {
  if (!origins.length) return '';
  return `<details class="source-locations"><summary>Source locations (${origins.length})</summary>${origins.map(o => `<p><strong>${escape(platformName(o.platform))} · ${escape(o.project_path || o.project ? 'Project' : o.platform === 'custom' ? 'Custom' : 'Global')}</strong>${o.plugin ? ` · ${escape(o.plugin)}` : ''}${!o.registered ? ' · installation unverified' : ''}<code>${escape(o.path)}</code>${o.last_seen ? `<span>Last seen ${escape(new Date(o.last_seen).toLocaleString())}</span>` : ''}</p>`).join('')}</details>`;
}
function renderInventory() {
  const inventory = state.inventory;
  const group = inventory.groups.find(g => g.id === state.sourceId);
  const items = inventoryItems(inventory, state.sourceId, state.inventoryQuery);
  $('#breadcrumb').textContent = 'Library / Source locations';
  $('#page-title').textContent = group?.name || 'All discovered skills';
  $('#page-description').textContent = 'Skills observed on this computer, grouped by where they were found. Source locations do not change project access.';
  $('#connect-project').hidden = true;
  $('#inventory-coverage').textContent = state.inventoryError || (inventory.last_scan ? `${items.length} skills · ${state.demo ? 'Sample inventory' : 'Latest scan'} ${new Date(inventory.last_scan.at).toLocaleString()}${inventory.last_scan.complete ? '' : ' · Partial coverage'}. Observations from other scans are retained; check each location’s last-seen time.` : 'Run a scan to discover global installations and projects with skill folders.');
  $('#inventory-coverage-detail').textContent = inventory.last_scan?.coverage || '';
  $('#inventory-warnings').innerHTML = (inventory.last_scan?.warnings || []).map(w => `<li>${escape(w)}</li>`).join('');
  $('#inventory-report').hidden = !inventory.last_scan;
  const labels = { installed: 'In library', ready: 'Not imported', unsupported: 'Unsupported package', cached: 'Cached · unverified' };
  $('#inventory-results').innerHTML = items.length ? items.map(item => `<article class="inventory-row"><div class="inventory-row-heading"><div><h2>${escape(item.name)}</h2><p>${escape(sourceSummary(item.origins))}</p></div><span class="tag">${labels[item.status] || escape(item.status)}</span></div><p class="inventory-description">${escape(item.description || 'No portable skill description available.')}</p>${item.issue && item.status !== 'installed' ? `<p class="field-help">${escape(item.issue)}</p>` : ''}${originDetails(item.origins)}<div class="inventory-actions">${item.skill_id ? `<button class="text-button" type="button" data-open-saved="${escape(item.skill_id)}">View saved skill</button>` : ['ready','cached'].includes(item.status) ? '<button class="text-button" type="button" data-scan-source>Scan to review &amp; import</button>' : ''}</div></article>`).join('') : `<div class="empty-state"><h2>${state.inventoryQuery ? 'No matching skills' : 'No skills observed here'}</h2><p>${state.inventoryQuery ? 'Try a name, platform or location.' : 'Scan this location or add a project/workspace folder in the scanner.'}</p></div>`;
}
function renderNavigation() {
  $('#library-count').textContent = state.skills.length;
  $('#library-nav').classList.toggle('selected', !state.projectId && !state.sourceId);
  $('#library-nav').setAttribute('aria-current', !state.projectId && !state.sourceId ? 'page' : 'false');
  $('#projects-nav').innerHTML = state.projects.map(p => `<button type="button" class="nav-item ${p.id === state.projectId ? 'selected' : ''}" data-project="${escape(p.id)}" aria-current="${p.id === state.projectId ? 'page' : 'false'}" title="${escape(p.path || p.name)}"><span class="nav-icon">${icon('folder')}</span><span class="project-label">${escape(p.name)}</span><span class="nav-count">${p.enabled_skills.filter(id => state.skills.some(s => s.skill_id === id)).length}</span></button>`).join('') || '<p class="nav-loading">No projects yet.</p>';
  $('#project-select').innerHTML = '<option value="">All skills</option>' + state.projects.map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');
  if (state.inventory.last_scan) $('#project-select').innerHTML += '<optgroup label="Found on this computer"><option value="source:all">All discovered skills</option>' + state.inventory.groups.map(g => `<option value="source:${escape(g.id)}">${escape(g.name)}${g.path ? ` · ${escape(g.path.split('/').slice(-2).join('/'))}` : ''}</option>`).join('') + '</optgroup>';
  $('#project-select').value = state.sourceId ? `source:${state.sourceId}` : state.projectId || '';
  renderInventoryNavigation();
}
function skillRow(skill, project) {
  return `<article class="skill-row ${skill.skill_id === state.selected ? 'selected' : ''}">
      <button class="skill-content" type="button" data-select="${escape(skill.skill_id)}" aria-label="Inspect ${escape(title(skill))}" aria-pressed="${skill.skill_id === state.selected}"><span class="skill-emblem">${emblem(skill)}</span><span class="skill-text"><span class="skill-title">${escape(title(skill))}</span><span class="skill-author">${escape(skill.skill_id.split('/')[0])}${skill.standalone ? ' · Standalone skill' : ''}</span><span class="skill-description">${escape(skill.description)}</span><span class="skill-tags">${skillOrigins(state.inventory, skill.skill_id).length ? `<span class="tag">${escape(sourceSummary(skillOrigins(state.inventory, skill.skill_id)))}</span>` : ''}${skill.tags.map(tag => `<span class="tag">${escape(tag)}</span>`).join('')}</span></span></button>
      <div class="skill-action">${project ? `<button class="switch" type="button" role="switch" aria-checked="${enabled(skill)}" aria-label="Enable ${escape(title(skill))} for ${escape(project.name)}" data-toggle="${escape(skill.skill_id)}" ${state.saving ? 'disabled' : ''}></button><span class="switch-status ${enabled(skill) ? 'is-enabled' : ''}">${state.saving && state.pendingSkill === skill.skill_id ? 'Saving…' : enabled(skill) ? 'Enabled' : 'Not enabled'}</span>` : '<span class="library-label">In library</span>'}</div>
    </article>`;
}
function render() {
  if (!state.loaded) return;
  rememberFocus();
  renderNavigation();
  $('#inventory-panel').hidden = !state.sourceId;
  $('#library-browser').hidden = Boolean(state.sourceId);
  if (state.sourceId) { renderInventory(); restoreFocus('#inventory-nav'); return; }
  const project = currentProject();
  $('#breadcrumb').textContent = project ? 'Projects / Skills' : 'Your collection';
  $('#page-title').textContent = project ? project.name : 'All skills';
  $('#page-description').textContent = project ? state.demo ? 'Try project selections using sample skills. Changes stay in this browser and do not configure an assistant.' : 'Choose the skills your assistant can access in this project.' : 'Your saved workflows, ready when the right project needs them.';
  $('#connect-project').hidden = !project;
  $('#undo-selection').hidden = !lastSelection || lastSelection.project_id !== project?.id;
  $('#undo-selection').disabled = state.saving || lastSelection?.revision !== project?.revision;
  $('#create-first-project').hidden = state.demo || state.projects.length > 0;
  $('#count-all').textContent = state.skills.length;
  const count = state.skills.filter(enabled).length;
  $('#count-enabled').textContent = count;
  $('#count-disabled').textContent = state.skills.length - count;
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.hidden = !project && button.dataset.filter !== 'all';
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
  });
  $('#scope-note p').textContent = project
    ? state.demo ? `${count} of ${state.skills.length} sample skills selected. This changes the demo in this browser only; the sample MCP endpoint keeps its fixed example selection.` : `${count} of ${state.skills.length} skills enabled. The rest stay in your library and are hidden from this project’s MCP connection.`
    : 'Browse the full collection. Choose a project in the sidebar to enable skills for its assistant.';
  const skills = visibleSkills();
  if (state.selected && !skills.some(s => s.skill_id === state.selected && (s.standalone || state.expandedFolders.has(s.folder)))) {
    state.selected = null;
    state.detailTab = 'instructions';
  }
  if (!skills.length) {
    const isSearch = Boolean(state.query.trim());
    const emptyTitle = isSearch ? 'No matching skills' : state.filter === 'enabled' ? 'A focused project starts here' : state.filter === 'disabled' ? 'Everything is enabled' : 'Your library is empty';
    const description = isSearch ? 'Try a skill name, category, or a shorter search.' : state.filter === 'enabled' ? 'Browse all skills and enable the ones this project needs.' : state.filter === 'disabled' ? 'Every saved skill is available to this project.' : 'Import a skill from a local folder to start your collection.';
    $('#skills-list').innerHTML = `<div class="empty-state"><span data-icon="library">${icon('library')}</span><h2>${emptyTitle}</h2><p>${description}</p>${state.filter === 'enabled' && !isSearch ? '<button class="button secondary" type="button" data-show-all>Browse all skills</button>' : ''}</div>`;
  } else {
    const folders = [...new Set(skills.filter(skill => !skill.standalone).map(skill => skill.folder))].sort((a, b) => a.localeCompare(b));
    $('#skills-list').innerHTML = folders.map((folder, index) => {
      const members = state.skills.filter(skill => !skill.standalone && skill.folder === folder);
      const shown = skills.filter(skill => !skill.standalone && skill.folder === folder);
      const selectedCount = members.filter(enabled).length;
      const checked = selectedCount === members.length ? 'true' : selectedCount ? 'mixed' : 'false';
      const expanded = state.expandedFolders.has(folder);
      const status = state.saving && state.pendingFolder === folder ? 'Saving…' : checked === 'true' ? 'All enabled' : checked === 'mixed' ? 'Some enabled' : 'Not enabled';
      return `<section class="skill-folder" aria-label="${escape(folder)}">
        <div class="folder-header">
          <button class="folder-disclosure" type="button" data-folder="${escape(folder)}" aria-expanded="${expanded}" aria-controls="folder-children-${index}"><span class="folder-chevron ${expanded ? 'is-open' : ''}">${icon('chevron')}</span><span class="folder-emblem">${icon('folder')}</span><span class="folder-copy"><span class="folder-title">${escape(folder)}</span><span class="folder-summary">${project ? `${selectedCount} of ${members.length} enabled` : `${members.length} saved skills`}${shown.length !== members.length ? ` · ${shown.length} matching` : ''}</span></span></button>
          ${project ? `<div class="folder-action"><button class="folder-checkbox" type="button" role="checkbox" aria-checked="${checked}" aria-label="Enable all ${escape(folder)} for ${escape(project.name)}" title="Applies to all ${members.length} skills in this folder, including filtered-out skills" data-toggle-folder="${escape(folder)}" ${state.saving ? 'disabled' : ''}>${icon(checked === 'mixed' ? 'minus' : 'check')}</button><span class="switch-status ${checked === 'true' ? 'is-enabled' : ''}">${status}${shown.length !== members.length ? ` · affects all ${members.length} skills` : ''}</span></div>` : ''}
        </div>
        <div id="folder-children-${index}" class="folder-children" ${expanded ? '' : 'hidden'}>${shown.map(skill => skillRow(skill, project)).join('')}</div></section>`;
    }).join('') + skills.filter(skill => skill.standalone).map(skill => skillRow(skill, project)).join('');
  }
  const folderCount = new Set(skills.filter(skill => !skill.standalone).map(skill => skill.folder)).size;
  $('#result-count').textContent = `${folderCount} ${folderCount === 1 ? 'collection' : 'collections'} · ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}${state.query ? ' found' : ''}`;
  $('#save-state').textContent = state.saving ? 'Saving change…' : project ? state.demo ? 'Demo selections saved in this browser' : 'Selections saved locally' : '';
  void renderDetails();
  restoreFocus('#skills-list');
  restoreFocus('#projects-nav');
}
async function renderDetails() {
  const request = ++detailRequest;
  const selected = state.selected;
  if (!selected) {
    const firstUse = !state.demo && !state.projects.length;
    $('#skill-detail').innerHTML = firstUse
      ? `<div class="detail-empty setup-empty"><span data-icon="folder">${icon('folder')}</span><h2>Set up your first project</h2><ol><li>Create a project to keep its selection separate.</li><li>Enable the skills you want it to use.</li><li>Connect your assistant and check its available skills.</li></ol><button class="button primary" type="button" data-create-project>Create project</button><p>Or browse the collection first. Scanning is optional.</p></div>`
      : `<div class="detail-empty"><span data-icon="folder">${icon('folder')}</span><h2>Your skills, organized</h2><p>${currentProject() ? 'Enable a collection, or expand it to choose its skills. Standalone skills have their own switch.' : 'Choose a project to manage its enabled skills.'} Select any skill to inspect its workflow.</p></div>`;
    restoreFocus('#skill-detail');
    return;
  }
  let skill = detailCache.get(selected);
  if (!skill) {
    $('#skill-detail').innerHTML = '<div class="loading-state">Loading skill details…</div>';
    try { skill = await api(`/api/skill?id=${encodeURIComponent(selected)}`); detailCache.set(selected, skill); }
    catch (error) { if (request === detailRequest) $('#skill-detail').innerHTML = `<div class="empty-state"><h2>Couldn’t load this skill</h2><p>${escape(error.message)}</p><button class="text-button" type="button" data-retry-detail>Try again</button></div>`; return; }
  }
  if (request !== detailRequest) return;
  const project = currentProject();
  const link = sourceLink(skill);
  $('#skill-detail').innerHTML = `<div class="detail-content">
    <div class="detail-title-row"><span class="skill-emblem">${emblem(skill)}</span><div><h2>${escape(title(skill))}</h2><span class="detail-author">${escape(skill.skill_id.split('/')[0])}</span></div></div>
    <p class="detail-description">${escape(skill.description)}</p>
    ${project ? `<div class="detail-status"><div><strong>${enabled(skill) ? 'Enabled for this project' : 'Not enabled for this project'}</strong><p>${state.demo ? 'Sample selection in this browser only; no assistant is configured' : enabled(skill) ? 'Available through its MCP connection' : 'Saved in the library, hidden from this project'}</p></div><button class="switch" role="switch" type="button" aria-checked="${enabled(skill)}" aria-label="Enable ${escape(title(skill))} for ${escape(project.name)}" data-toggle="${escape(skill.skill_id)}" ${state.saving ? 'disabled' : ''}></button></div>` : ''}
    ${skill.standalone && skill.skill_id === 'pbakaus/impeccable' ? '<section class="detail-section"><h3>One skill, many commands</h3><p>Init captures project context. Audit checks quality. Polish refines the finish. Adapt improves responsiveness. All commands share this skill’s enable switch. The full command catalog is included under Package files → scripts/command-metadata.json.</p></section>' : ''}
    ${project && !state.demo ? `<button class="button secondary native-settings-button" type="button" data-native-setup>${project.native_bindings?.some(b => b.skill_id === skill.skill_id) ? 'Manage coding-app copies' : 'Install in coding apps'}</button>${project.native_bindings?.find(b => b.skill_id === skill.skill_id) ? `<p class="field-help">Managed in ${escape(project.native_bindings.find(b => b.skill_id === skill.skill_id).targets.join(', '))}. The project switch controls these copies too; reload the coding agent if needed.</p>` : ''}` : ''}
    <section class="detail-section"><h3>Required capabilities</h3><div class="requirements">${skill.requirements.map(r => `<span class="tag">${escape(r)}</span>`).join('') || '<span class="tag">Not specified</span>'}</div><p class="field-help">${skill.requirements_assessment === 'curator_listed' ? 'Curator-listed capabilities; runtime access and complete dependencies are not verified.' : 'Requirements have not been assessed. Review the instructions and setup before use.'}</p>${skill.author_compatibility ? `<p class="field-help">Author’s compatibility note: ${escape(skill.author_compatibility)}</p>` : ''}</section>
    <details class="detail-advanced"><summary>Notes and provenance</summary><section class="detail-section"><h3>Your note</h3><p>${escape(skill.personal_notes || 'No personal note saved.')}</p></section>
    ${originDetails(skillOrigins(state.inventory, skill.skill_id))}
    <section class="detail-section"><h3>Original source</h3>${link ? `<a class="source-link" href="${escape(link)}" target="_blank" rel="noopener noreferrer">${icon('external')}View skill on GitHub</a>` : '<p>Imported from a local source.</p>'}<p class="source-meta">${skill.source.commit ? `Saved commit <code>${escape(skill.source.commit.slice(0, 10))}</code>` : 'No upstream commit recorded'} · ${skill.manifest.length} files</p></section>
    </details><div class="detail-tabs"><button type="button" data-detail-tab="instructions" aria-pressed="${state.detailTab === 'instructions'}">Instructions</button><button type="button" data-detail-tab="files" aria-pressed="${state.detailTab === 'files'}">Package files <span>${skill.manifest.length}</span></button></div>
    <div id="detail-tab-content">${state.detailTab === 'instructions' ? `<pre class="instructions" tabindex="0" aria-label="Skill instructions">${escape(skill.instructions)}</pre>` : `<ul class="files-list">${skill.manifest.map(file => `<li><button class="file-button" type="button" data-file="${escape(file.path)}">${icon('document')}${escape(file.path)}</button></li>`).join('')}</ul>`}</div>
  </div>`;
  restoreFocus('#skill-detail');
}
async function loadState() {
  try {
    const data = await api('/api/state');
    state.skills = data.skills;
    state.projects = data.projects.filter(p => !p.archived);
    state.demo = data.mode === 'demo';
    if (state.demo) {
      let saved = {}; try { saved = JSON.parse(localStorage.getItem('skill-library-demo-selections') || '{}'); } catch {}
      state.projects = state.projects.map(p => ({ ...p, enabled_skills: Array.isArray(saved[p.id]) ? saved[p.id].filter(id => state.skills.some(s => s.skill_id === id)) : p.enabled_skills }));
    }
    state.csrf = data.csrf_token;
    try { state.inventory = await api('/api/local-skills/inventory'); state.inventoryError = ''; } catch (error) { state.inventoryError = error.message; }
    if (!state.loaded) {
      if (state.inventory.last_scan) $('#inventory-navigation').open = true;
      const saved = savedProject();
      state.projectId = saved === '__library__' ? null : state.projects.find(p => p.id === saved)?.id ?? state.projects[0]?.id ?? null;
      let source; try { source = localStorage.getItem('skill-library-source'); } catch {}
      if (source && (source === 'all' || state.inventory.groups.some(g => g.id === source))) { state.sourceId = source; state.projectId = null; $('#inventory-navigation').open = true; }
    } else if (state.projectId && !state.projects.some(p => p.id === state.projectId)) state.projectId = null;
    state.loaded = true;
    clearError();
    render();
    if (state.inventoryError) showError(`Source inventory unavailable: ${state.inventoryError}`);
  } catch (error) { showError(error.message); $('#skills-list').innerHTML = '<div class="empty-state"><h2>Library unavailable</h2><p>Check that the local server is running, then refresh.</p></div>'; }
}
function saveDemoSelections() { try { localStorage.setItem('skill-library-demo-selections', JSON.stringify(Object.fromEntries(state.projects.map(p => [p.id, p.enabled_skills])))); } catch { toast('Demo selection changed for this page; browser storage is unavailable.'); } }
async function toggleSkill(id) {
  const project = currentProject();
  if (!project || state.saving) return;
  const turnOn = !project.enabled_skills.includes(id);
  if (state.demo) { project.enabled_skills = turnOn ? [...project.enabled_skills, id] : project.enabled_skills.filter(value => value !== id); saveDemoSelections(); render(); toast('Demo selection updated in this browser only.'); return; }
  state.saving = true;
  state.pendingSkill = id;
  render();
  try {
    const updated = await api(`/api/projects/${encodeURIComponent(project.id)}/skills`, { method: 'PATCH', body: JSON.stringify({ skill_id: id, enabled: turnOn, expected_revision: project.revision }) });
    lastSelection = { project_id: project.id, enabled_skills: [...project.enabled_skills], revision: updated.revision };
    state.projects = state.projects.map(p => p.id === updated.id ? updated : p);
    clearError();
    toast(`${title(state.skills.find(s => s.skill_id === id))} ${turnOn ? 'enabled' : 'disabled'} for ${project.name}${project.native_bindings?.some(b => b.skill_id === id) ? '. Reload your coding agent if needed.' : ''}`);
  } catch (error) { showError(error.message); await loadState(); showError(error.message); }
  finally { state.saving = false; state.pendingSkill = null; render(); }
}
async function toggleFolder(folder) {
  const project = currentProject();
  if (!project || state.saving) return;
  const members = state.skills.filter(skill => !skill.standalone && skill.folder === folder);
  const turnOn = !members.every(enabled);
  if (state.demo) { const ids = new Set(members.map(s => s.skill_id)); project.enabled_skills = turnOn ? [...new Set([...project.enabled_skills, ...ids])] : project.enabled_skills.filter(id => !ids.has(id)); saveDemoSelections(); render(); toast('Demo collection updated in this browser only.'); return; }
  state.saving = true;
  state.pendingFolder = folder;
  render();
  try {
    const updated = await api(`/api/projects/${encodeURIComponent(project.id)}/folder`, { method: 'PATCH', body: JSON.stringify({ folder, enabled: turnOn, expected_revision: project.revision }) });
    lastSelection = { project_id: project.id, enabled_skills: [...project.enabled_skills], revision: updated.revision };
    state.projects = state.projects.map(p => p.id === updated.id ? updated : p);
    clearError();
    toast(`${folder}: ${members.length} skills ${turnOn ? 'enabled' : 'disabled'} for ${project.name}${project.native_bindings?.length ? '. Reload managed coding apps if needed.' : ''}`);
  } catch (error) { showError(error.message); await loadState(); showError(error.message); }
  finally { state.saving = false; state.pendingFolder = null; render(); }
}

$('#undo-selection').addEventListener('click', async () => {
  const project = currentProject();
  if (!lastSelection || !project || lastSelection.project_id !== project.id || state.saving) return;
  state.saving = true; render();
  try {
    const updated = await api(`/api/projects/${encodeURIComponent(project.id)}/selection`, { method: 'POST', body: JSON.stringify({ enabled_skills: lastSelection.enabled_skills, expected_revision: lastSelection.revision }) });
    state.projects = state.projects.map(p => p.id === updated.id ? updated : p); lastSelection = null; toast('Previous selection restored. Native conflicts are checked before files change.');
  } catch (error) { await loadState(); showError(error.message); }
  finally { state.saving = false; render(); }
});

$('#inventory-nav').addEventListener('click', event => { const button = event.target.closest('[data-source]'); if (button) { rememberFocus(button); chooseSource(button.dataset.source); } });
$('#inventory-group').addEventListener('change', event => chooseSource(event.target.value));
$('#inventory-search').addEventListener('input', event => { state.inventoryQuery = event.target.value; renderInventory(); });
$('#inventory-rescan').addEventListener('click', () => state.demo ? toast('Run the local app to scan your computer. These locations are samples.') : $('#scan-open').click());
$('#inventory-results').addEventListener('click', event => {
  const saved = event.target.closest('[data-open-saved]');
  if (saved) { const id = saved.dataset.openSaved; chooseProject(null); const skill = state.skills.find(s => s.skill_id === id); if (skill) { state.expandedFolders.add(skill.folder); state.selected = id; render(); document.querySelector(`[data-select="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); } }
  if (event.target.closest('[data-scan-source]')) $('#scan-open').click();
});
$('#library-nav').addEventListener('click', () => chooseProject(null));
$('#projects-nav').addEventListener('click', event => { const button = event.target.closest('[data-project]'); if (button) chooseProject(button.dataset.project); });
$('#project-select').addEventListener('change', event => { const value = event.target.value; value.startsWith('source:') ? chooseSource(value.slice(7)) : chooseProject(value || null); });
$('#skill-search').addEventListener('input', event => {
  state.query = event.target.value;
  state.expandedFolders = state.query.trim() ? new Set(visibleSkills().map(skill => skill.folder)) : new Set();
  render();
});
$('#filters').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (button) { state.filter = button.dataset.filter; render(); } });
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); (state.sourceId ? $('#inventory-search') : $('#skill-search')).focus(); } });
$('#retry').addEventListener('click', () => void loadState());
document.addEventListener('click', async event => {
  if (event.target.closest('[data-create-project]')) { openCreateProject(); return; }
  if (event.target.closest('[data-native-setup]')) { openNativeSettings(); return; }
  const folderToggle = event.target.closest('[data-toggle-folder]');
  if (folderToggle) { rememberFocus(folderToggle); void toggleFolder(folderToggle.dataset.toggleFolder); return; }
  const folder = event.target.closest('[data-folder]');
  if (folder) {
    rememberFocus(folder);
    const name = folder.dataset.folder;
    if (state.expandedFolders.has(name)) state.expandedFolders.delete(name);
    else state.expandedFolders.add(name);
    render();
    return;
  }
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) { void toggleSkill(toggle.dataset.toggle); return; }
  const select = event.target.closest('[data-select]');
  if (select) {
    state.selected = select.dataset.select;
    state.detailTab = 'instructions';
    render();
    if (matchMedia('(max-width: 960px)').matches) $('#skill-detail').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    return;
  }
  if (event.target.closest('[data-show-all]')) { state.filter = 'all'; render(); return; }
  if (event.target.closest('[data-retry-detail]')) { void renderDetails(); return; }
  const close = event.target.closest('[data-close]');
  if (close) { document.getElementById(close.dataset.close).close(); return; }
  const tab = event.target.closest('[data-detail-tab]');
  if (tab) { rememberFocus(tab); state.detailTab = tab.dataset.detailTab; void renderDetails(); return; }
  const file = event.target.closest('[data-file]');
  if (file) {
    const selected = state.selected;
    const skill = detailCache.get(selected);
    const filePath = file.dataset.file;
    file.disabled = true;
    try {
      const data = await api(`/api/file?${new URLSearchParams({ id: selected, revision: skill.revision, path: filePath })}`);
      if (state.selected !== selected || state.detailTab !== 'files') return;
      $('#detail-tab-content').innerHTML = `<button type="button" class="text-button file-back" data-detail-tab="files">Back to package files</button><p class="file-caption">${escape(filePath)}</p><pre class="instructions" tabindex="0" aria-label="Supporting file content">${escape(data.encoding === 'base64' ? `Binary asset (${data.size_bytes} bytes). Returned by MCP as base64.\n\n${data.content}` : data.content)}</pre>`;
      $('#detail-tab-content .instructions').focus({ preventScroll: true });
    } catch (error) { showError(error.message); file.disabled = false; }
  }
});

function openCreateProject() {
  if (state.demo) return;
  $('#create-form').reset();
  $('#create-error').hidden = true;
  $('#create-dialog').showModal();
  $('#new-name').focus();
}
$('#new-project').addEventListener('click', openCreateProject);
$('#create-first-project').addEventListener('click', openCreateProject);
$('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#create-submit');
  button.disabled = true;
  button.textContent = 'Creating…';
  $('#create-error').hidden = true;
  try {
    const project = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: $('#new-name').value.trim(), path: $('#new-path').value.trim() }) });
    state.projects.push(project);
    $('#create-dialog').close();
    chooseProject(project.id);
    ($('#skills-list [data-folder]') || $('#skills-list [data-select]') || $('#skill-search')).focus({ preventScroll: true });
    toast('Project created. Choose the skills it needs.');
  } catch (error) { $('#create-error').textContent = error.message; $('#create-error').hidden = false; }
  finally { button.disabled = false; button.textContent = 'Create project'; }
});
function renderConnection() {
  const format = $('#connection-format').value;
  const showLocal = $('#connection-local-paths').checked;
  const config = showLocal ? connection : connection?.example;
  $('#copy-connection').textContent = showLocal ? 'Copy configuration' : 'Copy example';
  $('#connection-code').textContent = !config ? 'Loading configuration…' : format === 'http' ? config.http_headers ? JSON.stringify({ url: `${location.origin}${config.http_path}`, headers: config.http_headers }, null, 2) : `${location.origin}${config.http_path}` : config[format];
}
$('#connect-project').addEventListener('click', async () => {
  const project = currentProject();
  if (!project) return;
  const request = ++connectionRequest;
  connection = null;
  $('#connection-local-paths').checked = false;
  $('#connection-local-paths').disabled = state.demo;
  $('#connection-description').textContent = `Give your assistant access to the skills enabled for ${project.name}.`;
  $('#connection-error').hidden = true;
  $('#copy-connection').disabled = true;
  $('#check-connection').hidden = state.demo;
  $('#check-connection').disabled = true;
  $('#connection-check-status').textContent = state.demo ? 'Public demo: no local server or external assistant is configured.' : 'No external assistant connection has been verified.';
  renderConnection();
  $('#connect-dialog').showModal();
  try { const result = await api(`/api/projects/${encodeURIComponent(project.id)}/connection`); if (request !== connectionRequest) return; connection = result; renderConnection(); $('#copy-connection').disabled = false; $('#check-connection').disabled = state.demo; }
  catch (error) { if (request === connectionRequest) { $('#connection-error').textContent = error.message; $('#connection-error').hidden = false; } }
});
$('#check-connection').addEventListener('click', async () => {
  const project = state.projects.find(p => p.id === connection?.project_id);
  if (!project || state.demo || $('#check-connection').disabled) return;
  const request = connectionRequest;
  $('#check-connection').disabled = true;
  $('#connection-check-status').textContent = 'Starting a temporary stdio client and checking project-scoped retrieval…';
  try {
    const result = await api(`/api/projects/${encodeURIComponent(project.id)}/check`, { method: 'POST', body: JSON.stringify({ expected_revision: project.revision }) });
    if (request !== connectionRequest) return;
    $('#connection-check-status').textContent = `Local stdio check passed: ${result.available_skills} enabled skill${result.available_skills === 1 ? '' : 's'} available.${result.retrieval_checked ? ' Instructions and a manifested file were retrieved.' : ' Enable a skill and check again to test retrieval.'} Your external assistant connection is still unverified.`;
  } catch (error) { if (request === connectionRequest) $('#connection-check-status').textContent = `Check failed: ${error.message}`; }
  finally { if (request === connectionRequest) { $('#check-connection').disabled = false; if ($('#connect-dialog').open && document.activeElement === document.body) $('#check-connection').focus({ preventScroll: true }); } }
});
$('#connection-format').addEventListener('change', renderConnection);
$('#connection-local-paths').addEventListener('change', renderConnection);
$('#copy-connection').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#connection-code').textContent); toast($('#connection-local-paths').checked ? 'Local configuration copied; keep it private.' : 'Example copied; replace placeholders before connecting.'); }
  catch { $('#connection-error').textContent = 'Clipboard access is unavailable. Select and copy the configuration above.'; $('#connection-error').hidden = false; }
});
void loadState();

let nativePreview = null;
let nativePreviewRequest = 0;
function nativeInput() {
  return { skill_id: state.selected, root: $('#native-root').value.trim(), targets: [...document.querySelectorAll('[name="native-app"]:checked')].map(c => c.value), enabled: currentProject()?.enabled_skills.includes(state.selected), expected_revision: currentProject()?.revision };
}
function invalidateNativePreview() {
  nativePreview = null; ++nativePreviewRequest;
  $('#native-submit').disabled = true; $('#native-plan').hidden = true;
}
$('#native-root').addEventListener('input', invalidateNativePreview);
document.querySelectorAll('[name="native-app"]').forEach(input => input.addEventListener('change', invalidateNativePreview));
$('#native-preview').addEventListener('click', async () => {
  const project = currentProject(); if (!project) return;
  const input = nativeInput(), generation = ++nativePreviewRequest;
  nativePreview = null; $('#native-submit').disabled = true; $('#native-preview').disabled = true;
  $('#native-error').hidden = true;
  try {
    const plan = await api(`/api/projects/${encodeURIComponent(project.id)}/native/preview`, { method: 'POST', body: JSON.stringify(input) });
    if (generation !== nativePreviewRequest) return;
    const intro = document.createElement('p'); intro.textContent = plan.changes.length ? 'Review these exact destinations. They will be checked again when applying.' : 'No native files change. Disabled skills are copied only when enabled.';
    $('#native-plan').replaceChildren(intro, ...plan.changes.map(change => { const line = document.createElement('p'); line.textContent = `${change.action}: ${change.path}${change.conflict ? ` — Conflict: ${change.conflict}` : ''}`; return line; }));
    $('#native-plan').hidden = false;
    if (plan.can_apply) { nativePreview = JSON.stringify(input); $('#native-submit').disabled = false; }
  } catch (error) { if (generation === nativePreviewRequest) { $('#native-error').textContent = error.message; $('#native-error').hidden = false; } }
  finally { $('#native-preview').disabled = false; }
});
function openNativeSettings() {
  const project = currentProject(); if (!project || !state.selected) return;
  const binding = project.native_bindings?.find(b => b.skill_id === state.selected);
  $('#native-description').textContent = `${title(state.skills.find(s => s.skill_id === state.selected))} for ${project.name}.`;
  $('#native-root').value = binding?.root ?? project.path;
  document.querySelectorAll('[name="native-app"]').forEach(c => { c.checked = binding?.targets.includes(c.value) ?? false; });
  invalidateNativePreview(); $('#native-error').hidden = true; $('#native-dialog').showModal();
}
$('#native-form').addEventListener('submit', async event => {
  event.preventDefault(); const project = currentProject(), id = state.selected;
  if (!project || !id) return;
  const button = $('#native-submit'); button.disabled = true; button.textContent = 'Saving…'; $('#native-error').hidden = true;
  try {
    if (!nativePreview || JSON.stringify(nativeInput()) !== nativePreview) throw new Error('Preview these destinations before applying.');
    const updated = await api(`/api/projects/${encodeURIComponent(project.id)}/native`, { method: 'PATCH', body: JSON.stringify({ skill_id: id, root: $('#native-root').value.trim(), targets: [...document.querySelectorAll('[name="native-app"]:checked')].map(c => c.value), enabled: project.enabled_skills.includes(id), expected_revision: project.revision }) });
    state.projects = state.projects.map(p => p.id === updated.id ? updated : p); $('#native-dialog').close(); render(); toast('Coding-app destinations saved. Reload the agent if needed.');
  } catch (error) { $('#native-error').textContent = error.message; $('#native-error').hidden = false; }
  finally { button.disabled = !nativePreview; button.textContent = 'Apply reviewed destinations'; }
});

let localScan = null;
let scanBusy = false;
let scanImporting = false;
const selectedScans = new Set();
const scanPaths = selector => $(selector).value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
function scanButtons() {
  $('#scan-run').disabled = scanBusy;
  $('#scan-import').disabled = scanBusy || !selectedScans.size;
  $('#scan-import').textContent = scanImporting ? 'Importing…' : `Import selected${selectedScans.size ? ` (${selectedScans.size})` : ''}`;
  $('#scan-close').disabled = scanImporting;
  $('#scan-select-new').disabled = scanBusy;
  $('#scan-form').querySelectorAll('input, select, textarea').forEach(input => { input.disabled = scanBusy; });
}
function renderLocalScan() {
  if (!localScan) return;
  const statuses = { ready: 'New skill', installed: 'Already saved', unsupported: 'Cannot import here', cached: 'Cached package · installation unverified' };
  $('#scan-preview').hidden = false;
  $('#scan-summary').textContent = `${localScan.items.filter(x => x.status === 'ready').length} new · ${localScan.items.filter(x => x.status === 'installed').length} already saved · ${localScan.items.filter(x => x.status === 'unsupported' || x.status === 'cached').length} need review. ${localScan.complete ? 'Selected locations checked.' : 'Coverage is partial; inspect the location report.'}`;
  $('#scan-items').innerHTML = localScan.items.length ? localScan.items.map(item => `<article class="scan-row"><label class="scan-row-label"><input type="checkbox" data-scan-id="${escape(item.id)}" ${selectedScans.has(item.id) ? 'checked' : ''} ${scanBusy || !['ready','cached'].includes(item.status) ? 'disabled' : ''}><span class="scan-row-copy"><strong>${escape(item.name)}</strong><span>${escape(statuses[item.status])} · ${escape(item.folder)}</span>${item.description ? `<p>${escape(item.description)}</p>` : ''}${item.issue ? `<p>${escape(item.issue)}</p>` : ''}</span></label><details><summary>Source${item.origins.length > 1 ? `s (${item.origins.length})` : ''}${item.files ? ` · ${item.files} files` : ''}</summary>${item.origins.map(o => `<p>${escape(o.platform)} · ${escape(o.scope)}${o.project ? ` · ${escape(o.project)}` : ''}${!o.registered ? ' · installation unverified' : ''}<code>${escape(o.path)}</code></p>`).join('')}</details></article>`).join('') : '<p class="field-help">No SKILL.md packages found in the selected locations. Add a project/workspace folder or custom skills folder, then scan again.</p>';
  $('#scan-coverage').textContent = localScan.coverage;
  $('#scan-locations').innerHTML = localScan.locations.map(x => `<p class="scan-location"><strong>${escape(x.platform)} · ${escape(x.scope)} · ${escape(x.status)}</strong><code>${escape(x.path)}</code>${x.message ? `<span>${escape(x.message)}</span>` : ''}</p>`).join('');
  $('#scan-warnings').innerHTML = localScan.warnings.map(x => `<li>${escape(x)}</li>`).join('');
  scanButtons();
}
$('#scan-open').addEventListener('click', () => {
  if (state.demo) { toast('Scanning requires the local app. This demo uses sample locations.'); return; }
  if (!state.loaded) { toast('Wait for the library to finish loading, then scan.'); return; }
  const previous = $('#scan-project').value;
  $('#scan-project').replaceChildren(new Option('All registered projects', ''), ...state.projects.map(p => new Option(p.name, p.id)));
  if (state.projects.some(p => p.id === previous)) $('#scan-project').value = previous;
  const group = state.inventory.groups.find(g => g.id === state.sourceId);
  if (group?.kind === 'project' && group.path) { $('#scan-scope').value = 'projects'; $('#scan-project-folders').value = group.path; $('#scan-project').value = ''; }
  else if (group?.kind === 'global') $('#scan-scope').value = 'global';
  $('#scan-dialog').showModal();
});
$('#scan-close').addEventListener('click', () => { if (!scanImporting) $('#scan-dialog').close(); });
$('#scan-dialog').addEventListener('cancel', event => { if (scanImporting) event.preventDefault(); });
$('#scan-items').addEventListener('change', event => {
  const box = event.target.closest('[data-scan-id]'); if (!box || scanBusy) return;
  box.checked ? selectedScans.add(box.dataset.scanId) : selectedScans.delete(box.dataset.scanId); scanButtons();
});
$('#scan-select-new').addEventListener('click', () => { if (scanBusy || !localScan) return; selectedScans.clear(); localScan.items.filter(x => x.status === 'ready').forEach(x => selectedScans.add(x.id)); renderLocalScan(); });
$('#scan-form').addEventListener('submit', async event => {
  event.preventDefault(); if (scanBusy) return;
  const platforms = [...$('#scan-platforms').querySelectorAll('input:checked')].map(x => x.value);
  $('#scan-error').hidden = true;
  if (!platforms.length) { $('#scan-error').textContent = 'Choose at least one platform.'; $('#scan-error').hidden = false; return; }
  const input = { scope: $('#scan-scope').value, platforms, project_directories: scanPaths('#scan-project-folders'), skill_directories: scanPaths('#scan-skill-folders'), include_cached: $('#scan-cached').checked, ...($('#scan-project').value ? { project_ids: [$('#scan-project').value] } : {}) };
  scanBusy = true; localScan = null; selectedScans.clear(); $('#scan-preview').hidden = true; $('#scan-import-note').textContent = ''; $('#scan-status').textContent = 'Scanning local skill packages…'; scanButtons();
  try {
    localScan = await api('/api/local-skills/scan', { method: 'POST', body: JSON.stringify(input) });
    localScan.items.filter(x => x.status === 'ready').forEach(x => selectedScans.add(x.id));
    state.inventory = await api('/api/local-skills/inventory');
    state.inventoryError = '';
    $('#inventory-navigation').open = true;
    chooseSource('all');
    renderLocalScan(); $('#scan-status').textContent = 'Scan complete. Review the skills and coverage before importing.';
    if ($('#scan-dialog').open) $('#scan-results-title').focus();
  } catch(error) { $('#scan-error').textContent = error.message; $('#scan-error').hidden = false; $('#scan-status').textContent = 'Scan could not finish. Adjust the locations and retry.'; }
  finally { scanBusy = false; renderLocalScan(); scanButtons(); }
});
$('#scan-import').addEventListener('click', async () => {
  if (scanBusy || !localScan || !selectedScans.size) return;
  scanBusy = true; scanImporting = true; $('#scan-error').hidden = true; $('#scan-import-note').textContent = 'Validating and copying the selected packages…'; renderLocalScan();
  try {
    const result = await api('/api/local-skills/import', { method: 'POST', body: JSON.stringify({ scan_id: localScan.scan_id, ids: [...selectedScans] }) });
    for (const outcome of result.outcomes) { const item = localScan.items.find(x => x.id === outcome.id); if (!item) continue; if (outcome.status === 'imported' || outcome.status === 'already installed') { item.status = 'installed'; item.skill_id = outcome.skill_id; item.issue = ''; } else item.issue = outcome.message; }
    selectedScans.clear(); await loadState();
    $('#scan-import-note').textContent = `${result.imported} imported${result.failed ? ` · ${result.failed} failed; see the affected rows` : ''}. ${result.note}`;
  } catch(error) { $('#scan-error').textContent = error.message; $('#scan-error').hidden = false; $('#scan-import-note').textContent = 'Import did not finish. Scan again to check which packages were saved before retrying.'; }
  finally { scanBusy = false; scanImporting = false; renderLocalScan(); scanButtons(); }
});
