import { createInstaller } from './marketplace-install.js';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const s = { view: 'most-installed', page: 0, query: '', items: [], projects: [], owned: [], token: '', selected: null, detail: null, next: null, loading: false, installing: false };
let request = 0, detailRequest = 0;
function github(url) { try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com' ? u.href : '';
}
catch {
    return '';
} }
const count = n => typeof n === 'number' ? new Intl.NumberFormat().format(n) : 'Unavailable';
async function api(url, options = {}) { const r = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json', 'X-Skill-Library-Token': s.token } : {}), ...options.headers } }); const d = await r.json(); if (!r.ok) {
    const e = new Error(d.error?.message ?? 'Request failed. Retry shortly.');
    e.code = d.error?.code;
    e.retry = d.error?.retry_after;
    throw e;
} return d; }
async function owner() { const d = await api('/api/state'); s.projects = d.projects; s.owned = d.skills; s.token = d.csrf_token; s.demo = d.mode === 'demo'; }
const savedSkill = item => s.owned.find(x => x.source.url.replace(/\.git$/, '').toLowerCase() === `https://github.com/${item.source}`.toLowerCase() && (item.path === undefined ? x.name === item.slug : x.source.path === item.path));
const installed = item => Boolean(savedSkill(item));
const revisionMismatch = item => Boolean(savedSkill(item) && savedSkill(item).source.commit !== item.commit);
function savedRevisionNotice(item) {
    const saved = savedSkill(item);
    if (!saved)
        return '';
    return `<p class="field-help">Saved commit: <code>${esc(saved.source.commit?.slice(0, 12) ?? 'Not recorded')}</code>. ${revisionMismatch(item) ? `You are inspecting ${esc(item.commit.slice(0, 12))}. Review this commit in Library settings before applying an update. Your saved copy and project selection stay unchanged until then.` : 'This is the commit already saved in your library.'}</p>`;
}
function rows() {
    $('#market-results').innerHTML = s.items.length ? s.items.map((x, i) => `<article class="market-row ${s.selected === i ? 'selected' : ''}"><button class="market-item" data-item="${i}" type="button" aria-pressed="${s.selected === i}"><span class="skill-title">${esc(x.name)}</span><span class="skill-author">${esc(typeof x.sampled_skill_count === 'number' ? 'Skill collection' : x.source)}</span>${x.description ? `<span class="skill-description">${esc(x.description)}</span>` : ''}<span class="market-item-meta">${x.kind === 'repository' ? `${typeof x.sampled_skill_count === 'number' ? `${count(x.sampled_skill_count)} skill${x.sampled_skill_count === 1 ? '' : 's'} in this sample · View collection` : `${count(x.stars)} repository stars · View skills`}` : `${count(x.installs)} installs${s.view === 'hot' && !s.query && typeof x.change === 'number' ? ` · ${x.change >= 0 ? '+' : ''}${count(x.change)} vs yesterday’s hour` : ''}`}${installed(x) ? '<span class="tag installed-tag">In your library</span>' : ''}</span></button>${github(x.repository_url) ? `<a class="market-repo-link" href="${esc(github(x.repository_url))}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ''}</article>`).join('') : '<div class="empty-state"><h2>No matching collections</h2><p>Try another term or ranking.</p></div>';
    $('#market-previous').hidden = s.page === 0;
    $('#market-next').hidden = s.next === null;
}
async function results() {
    const id = ++request;
    ++detailRequest;
    s.loading = true;
    s.selected = null;
    s.detail = null;
    s.repository = null;
    $('#market-results').innerHTML = '<div class="loading-state">Loading provider results…</div>';
    $('#market-meta').textContent = s.query ? `Searching for “${s.query}”…` : 'Loading provider ranking…';
    $('#market-previous').hidden = true;
    $('#market-next').hidden = true;
    $('#market-detail').innerHTML = '<div class="detail-empty"><h2>Inspect before installing</h2><p>Choose a collection to read about the project and browse its skills.</p></div>';
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(!s.query && b.dataset.view === s.view)));
    $('#clear-search').hidden = !s.query;
    try {
        const d = await api(s.query ? `/api/marketplace/search?${new URLSearchParams({ q: s.query, page: s.page })}` : `/api/marketplace/rankings?${new URLSearchParams({ view: s.view, page: s.page })}`);
        if (id !== request)
            return;
        s.items = d.items;
        s.next = d.next_page ?? null;
        $('#market-meta').textContent = `${d.provider} · ${d.metric} · Retrieved ${new Date(d.fetched_at).toLocaleString()} · Page ${s.page + 1}`;
        rows();
    }
    catch (e) {
        if (id !== request)
            return;
        s.items = [];
        s.next = null;
        const title = e.code === 'AUTH_REQUIRED' ? 'Connect ranking data' : e.code === 'RATE_LIMITED' ? 'Provider rate limit reached' : 'Marketplace unavailable';
        $('#market-results').innerHTML = `<div class="empty-state"><h2>${title}</h2><p>${esc(e.message)}${e.retry ? ` Retry in about ${esc(e.retry)} seconds.` : ''}</p><div class="empty-actions"><button class="button secondary" data-retry type="button">Retry</button><a class="button secondary" href="/guide.html#marketplace-setup">Setup guide</a>${e.code === 'AUTH_REQUIRED' ? '<button class="button primary" data-github type="button">Browse GitHub stars</button>' : ''}</div></div>`;
        $('#market-meta').textContent = 'No ranking data is being substituted.';
    }
    finally {
        if (id === request)
            s.loading = false;
    }
}
async function skill(item) {
    const id = ++detailRequest;
    s.detail = null;
    $('#market-detail').innerHTML = '<div class="loading-state">Resolving and validating the source package…</div>';
    if (matchMedia('(max-width: 960px)').matches)
        $('#market-detail').scrollIntoView({ behavior: 'instant', block: 'start' });
    try {
        const q = new URLSearchParams({ source: item.source, skill: item.slug });
        if (item.commit)
            q.set('commit', item.commit);
        if (item.path !== undefined)
            q.set('path', item.path);
        const d = await api(`/api/marketplace/skill?${q}`);
        if (id !== detailRequest)
            return;
        s.detail = d;
        $('#market-detail').innerHTML = `<div class="detail-content">${s.repository?.source === d.source ? '<button class="text-button collection-back" data-back-collection type="button">Back to collection</button>' : ''}<h2>${esc(d.name)}</h2><p class="detail-author">${esc(d.source)} · ${d.standalone ? 'Standalone skill' : 'Collection skill'}</p><p class="detail-description">${esc(d.description)}</p><p class="field-help">Pinned commit <code>${esc(d.commit.slice(0, 12))}</code> · ${d.files.length} files · ${count(d.total_bytes)} bytes</p>${savedRevisionNotice(d)}<div class="market-detail-actions">${!s.demo && revisionMismatch(d) ? `<a class="button secondary" href="/settings.html?skill=${encodeURIComponent(savedSkill(d).skill_id)}&commit=${encodeURIComponent(d.commit)}">Review update</a>` : ''}<button class="button primary" data-install type="button" ${s.demo || revisionMismatch(d) ? 'disabled' : ''}>${s.demo ? 'Install in local app' : revisionMismatch(d) ? 'Use update review' : installed(d) ? 'Configure installation' : 'Install'}</button><a class="button secondary" href="${esc(github(d.repository_url))}" target="_blank" rel="noopener noreferrer">Open repo</a></div><p class="field-help">Installation saves files. Additional repository setup is presented for review and is never run automatically.</p><p class="field-help">Compatibility: ${esc(d.requirements?.compatibility ?? 'Not declared by the author. Review the instructions.')}</p>${d.requirements?.allowed_tools ? `<p class="field-help">Declared tools: ${esc(d.requirements.allowed_tools)}</p>` : ''}<details class="market-setup"><summary>Repository setup instructions</summary><pre class="instructions" tabindex="0">${esc(d.setup_instructions)}</pre></details><h3>Skill instructions</h3><pre class="instructions" tabindex="0">${esc(d.instructions)}</pre></div>`;
        if (matchMedia('(max-width: 960px)').matches)
            $('#market-detail').scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    catch (e) {
        if (id === detailRequest)
            $('#market-detail').innerHTML = `<div class="empty-state"><h2>Couldn’t inspect this skill</h2><p>${esc(e.message)}</p>${github(item.repository_url) ? `<a href="${esc(github(item.repository_url))}" target="_blank" rel="noopener noreferrer">Open its repository</a>` : ''}</div>`;
    }
    finally {
        if (id === detailRequest) {
            const heading = $('#market-detail h2');
            if (heading) {
                heading.tabIndex = -1;
                heading.focus({ preventScroll: true });
            }
        }
    }
}
async function choose(i) {
    s.selected = i;
    rows();
    document.querySelector(`[data-item="${i}"]`)?.focus({ preventScroll: true });
    const item = s.items[i];
    if (!item)
        return;
    if (item.kind !== 'repository') {
        if (!item.installable) {
            $('#market-detail').innerHTML = '<div class="empty-state"><h2>External source</h2><p>This version installs public GitHub skill packages.</p></div>';
            return;
        }
        await skill(item);
        return;
    }
    const id = ++detailRequest;
    s.detail = null;
    s.repository = null;
    $('#market-detail').innerHTML = '<div class="loading-state">Checking the repository for valid skills…</div>';
    if (matchMedia('(max-width: 960px)').matches)
        $('#market-detail').scrollIntoView({ behavior: 'instant', block: 'start' });
    try {
        const d = await api(`/api/marketplace/repository?source=${encodeURIComponent(item.source)}`);
        if (id !== detailRequest)
            return;
        s.repository = d;
        renderRepository(d);
    }
    catch (e) {
        if (id === detailRequest)
            $('#market-detail').innerHTML = `<div class="empty-state"><h2>Repository unavailable</h2><p>${esc(e.message)}</p><a href="${esc(github(item.repository_url))}" target="_blank" rel="noopener noreferrer">Open repo</a></div>`;
    }
}
function renderRepository(d) {
    s.detail = null;
    $('#market-detail').innerHTML = `<div class="detail-content"><h2 tabindex="-1">${esc(d.source)}</h2><p class="detail-description">${esc(d.description || 'The author has not provided a repository description.')}</p><p class="field-help">${d.items.length} verified skills · ${count(d.stars)} repository stars</p><a href="${esc(github(`https://github.com/${d.source}`))}" target="_blank" rel="noopener noreferrer">Open repo</a><h3>Skills in this collection</h3><p class="field-help">Choose a skill to read its full instructions and installation requirements.</p><div class="repository-skills">${d.items.map((x, n) => `<button class="repo-skill" data-repo-skill="${n}" type="button"><strong>${esc(x.name)}</strong><span class="repo-skill-description" title="${esc(x.description)}">${esc(x.description)}</span></button>`).join('') || '<p>No supported SKILL.md packages found. Open the repository for manual setup.</p>'}</div></div>`;
    $('#market-detail h2')?.focus({ preventScroll: true });
    if (matchMedia('(max-width: 960px)').matches)
        $('#market-detail').scrollIntoView({ behavior: 'instant', block: 'start' });
}
const installer = createInstaller({ state: s, api, owner, rows, installed, revisionMismatch });
$('#market-search-form').addEventListener('submit', e => { e.preventDefault(); s.query = $('#market-search').value.trim(); if (s.query.length < 2)
    return; s.page = 0; void results(); });
$('#clear-search').addEventListener('click', () => { s.query = ''; s.page = 0; $('#market-search').value = ''; void results(); });
$('#market-tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b)
    return; s.view = b.dataset.view; s.page = 0; s.query = ''; $('#market-search').value = ''; void results(); });
$('#market-results').addEventListener('click', e => { const b = e.target.closest('[data-item]'); if (b)
    void choose(Number(b.dataset.item)); if (e.target.closest('[data-retry]'))
    void results(); if (e.target.closest('[data-github]')) {
    s.view = 'github-stars';
    s.page = 0;
    s.query = '';
    $('#market-search').value = '';
    void results();
} });
$('#market-detail').addEventListener('click', e => { const b = e.target.closest('[data-repo-skill]'); if (b)
    void skill(s.repository.items[Number(b.dataset.repoSkill)]); if (e.target.closest('[data-install]'))
    installer.open(); if (e.target.closest('[data-back-collection]') && s.repository)
    renderRepository(s.repository); });
$('#market-previous').addEventListener('click', () => { if (!s.loading && s.page) {
    s.page--;
    void results();
} });
$('#market-next').addEventListener('click', () => { if (!s.loading && s.next !== null) {
    s.page = s.next;
    void results();
} });
(async () => { try {
    await owner();
}
catch (e) {
    $('#market-meta').textContent = e.message;
} await results(); })();
