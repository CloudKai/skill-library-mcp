export function createInstaller({ state: s, api, owner, rows, installed, revisionMismatch }) {
    const $ = selector => document.querySelector(selector);
    let nativePlan;
    const preview = document.createElement('section');
    preview.hidden = true;
    const previewTitle = document.createElement('h3'); previewTitle.textContent = 'Review native destinations';
    const previewPaths = document.createElement('ul');
    const applyNative = document.createElement('button'); applyNative.type = 'button'; applyNative.className = 'button primary'; applyNative.textContent = 'Apply reviewed native copies';
    preview.append(previewTitle, previewPaths, applyNative);
    $('#install-status').after(preview);
    function clearPreview() { nativePlan = null; preview.hidden = true; }
    function projectChanged() { clearPreview(); const p = s.projects.find(x => x.id === $('#install-project').value); $('#install-root').value = p?.path ?? ''; document.querySelectorAll('[name="native-target"]').forEach(c => { c.disabled = !p; if (!p)
        c.checked = false; }); $('#install-enable').disabled = !p || s.installing; }
    function openInstall() { if (!s.detail || s.demo || revisionMismatch(s.detail))
        return; $('#install-explanation').textContent = installed(s.detail) ? 'Already in your library. Install preserves its project selection; Install & enable makes it available to the selected project.' : 'Install saves a new skill disabled. Install & enable makes it available to the selected project.'; $('#install-title').textContent = `Install ${s.detail.name}`; $('#install-summary').textContent = `${s.detail.source} · commit ${s.detail.commit.slice(0, 12)} · No setup scripts will run.`; $('#install-project').replaceChildren(new Option('Library only', ''), ...s.projects.map(p => new Option(p.name, p.id))); let saved; try {
        saved = localStorage.getItem('skill-library-project');
    }
    catch { } if (s.projects.some(p => p.id === saved))
        $('#install-project').value = saved; document.querySelectorAll('[name="native-target"]').forEach(c => c.checked = false); projectChanged(); $('#install-error').hidden = true; $('#install-status').textContent = ''; $('#install-dialog').showModal(); }
    async function install(enabled) {
        const d = s.detail;
        if (!d || s.installing || s.demo)
            return;
        const targets = [...document.querySelectorAll('[name="native-target"]:checked')].map(c => c.value), project = $('#install-project').value, root = $('#install-root').value.trim();
        if (((targets.length || enabled) && !project) || (targets.length && !root)) {
            $('#install-error').textContent = 'Choose a project and enter its existing directory for coding-app copies.';
            $('#install-error').hidden = false;
            return;
        }
        clearPreview();
        s.installing = true;
        $('#install-error').hidden = true;
        $('#install-status').textContent = 'Downloading the pinned package and validating files…';
        ['install-only', 'install-enable', 'close-install', 'install-project', 'install-root'].forEach(x => $('#' + x).disabled = true);
        document.querySelectorAll('[name="native-target"]').forEach(c => c.disabled = true);
        try {
            const out = await api('/api/marketplace/install', { method: 'POST', body: JSON.stringify({ source: d.source, skill: d.slug, path: d.path, commit: d.commit, ...(project ? { project_id: project } : {}), enabled: targets.length ? false : enabled, targets: [], root }) });
            await owner();
            rows();
            const configure = $('[data-install]');
            if (configure)
                configure.textContent = 'Configure installation';
            if (out.native_error) {
                $('#install-error').textContent = `Saved to your library. Native activation was not applied: ${out.native_error.message}`;
                $('#install-error').hidden = false;
                $('#install-status').textContent = 'Existing activation and native files were preserved.';
            }
            else
                $('#install-status').textContent = `${out.already_installed ? 'Already saved.' : 'Installed in your library.'} ${enabled || out.project?.enabled_skills?.includes(out.skill_id) ? 'Enabled for this project.' : out.already_installed ? 'Existing project selection preserved.' : 'Not enabled; use the project switch when ready.'}${targets.length ? ' The same switch manages coding-app copies. Reload your agent if needed.' : ''} Reconnect existing stdio library clients to load new packages.`;
            if (targets.length && !out.native_error) {
                const profile = s.projects.find(p => p.id === project);
                const input = { skill_id: out.skill_id, root, targets, enabled: enabled || profile.enabled_skills.includes(out.skill_id), expected_revision: profile.revision };
                const plan = await api(`/api/projects/${encodeURIComponent(project)}/native/preview`, { method: 'POST', body: JSON.stringify(input) });
                previewPaths.replaceChildren(...plan.changes.map(change => { const row = document.createElement('li'); row.textContent = `${change.action} · ${change.path}${change.conflict ? ` · ${change.conflict}` : ''}`; return row; }));
                nativePlan = { project, input }; preview.hidden = false; applyNative.disabled = !plan.can_apply;
                $('#install-status').textContent = 'Package saved. Native copies have not been applied. Review exact destinations and conflicts below, then apply explicitly.';
            }
        }
        catch (e) {
            $('#install-error').textContent = e.message;
            $('#install-error').hidden = false;
            $('#install-status').textContent = '';
        }
        finally {
            s.installing = false;
            ['install-only', 'close-install', 'install-project', 'install-root'].forEach(x => $('#' + x).disabled = false);
            document.querySelectorAll('[name="native-target"]').forEach(c => c.disabled = !$('#install-project').value);
            $('#install-enable').disabled = !$('#install-project').value;
        }
    }
    applyNative.addEventListener('click', async () => {
        if (!nativePlan || s.installing) return;
        const plan = nativePlan; s.installing = true; applyNative.disabled = true;
        try {
            await api(`/api/projects/${encodeURIComponent(plan.project)}/native`, { method: 'PATCH', body: JSON.stringify(plan.input) });
            await owner(); rows(); clearPreview();
            $('#install-status').textContent = 'Reviewed native copies applied. Reload your coding agent if needed; host execution is not verified.';
        } catch (error) { clearPreview(); $('#install-error').textContent = error.message + ' Preview again before retrying.'; $('#install-error').hidden = false; }
        finally { s.installing = false; }
    });
    $('#install-root').addEventListener('input', clearPreview);
    document.querySelectorAll('[name="native-target"]').forEach(control => control.addEventListener('change', clearPreview));
    $('#install-project').addEventListener('change', projectChanged);
    $('#close-install').addEventListener('click', () => { if (!s.installing)
        $('#install-dialog').close(); });
    $('#install-dialog').addEventListener('cancel', e => { if (s.installing)
        e.preventDefault(); });
    $('#install-only').addEventListener('click', () => void install(false));
    $('#install-enable').addEventListener('click', () => void install(true));
    return { open: openInstall };
}
