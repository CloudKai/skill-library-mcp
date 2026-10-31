import { ownerRequest } from './owner-api.js';
const $ = selector => document.querySelector(selector);
let state;
let restorePlan;
let updatePlan;
let selectedSkill;
let busy = false;
const status = text => { $('#settings-status').textContent = text; };
const request = (route, body = {}, method = 'POST') => ownerRequest(route, state.csrf_token, body, method);
const option = (name, value) => new Option(name, value);
function projectChanged() {
  const project = state.projects.find(p => p.id === $('#settings-project').value);
  $('#project-form').hidden = !project;
  if (!project) return;
  $('#project-name').value = project.name;
  $('#project-path').value = project.path;
  $('#project-archived').checked = Boolean(project.archived);
}
async function skillChanged() {
  updatePlan = null; selectedSkill = null;
  $('#rollback-reviewed').checked = false;
  $('#rollback-skill').disabled = true;
  $('#update-preview').hidden = true;
  $('#apply-update').disabled = true;
  const skillId = $('#settings-skill').value;
  const summary = [...state.skills, ...(state.archived_skills ?? [])].find(s => s.skill_id === skillId);
  $('#metadata-form').hidden = !summary;
  $('#update-form').hidden = !summary || summary.status === 'archived';
  if (!summary) return;
  $('#skill-notes').value = summary.personal_notes ?? '';
  $('#skill-tags').value = summary.tags.join(', ');
  $('#skill-preferred').checked = summary.preferred;
  $('#skill-archived').checked = summary.status === 'archived';
  if (summary.status === 'archived') return;
  const result = await fetch(`/api/skill?id=${encodeURIComponent(skillId)}`).then(r => r.json());
  if ($('#settings-skill').value !== skillId) return;
  if (result.error) throw new Error(result.error.message);
  selectedSkill = result;
  $('#saved-revision').textContent = `Saved commit: ${result.source.commit ?? 'Not recorded'}. ${result.previous_revisions?.length ?? 0} previous local revisions retained.`;
  $('#rollback-skill').disabled = !result.previous_revisions?.length;
  $('#previous-commit').textContent = result.previous_revisions?.length ? `Previous commit: ${result.previous_revisions[0].commit ?? 'Not recorded'}` : 'No previous revision retained.';
}
async function load() {
  const projectId = $('#settings-project').value, skillId = $('#settings-skill').value || new URLSearchParams(location.search).get('skill');
  const response = await fetch('/api/state');
  if (!response.ok) throw new Error('The owner API is unavailable. Restart the local app and refresh.');
  state = await response.json();
  if (state.mode === 'demo') { $('#settings-controls').hidden = true; status('Library maintenance requires the local app. This public demo cannot change shared data.'); return; }
  $('#settings-project').replaceChildren(...state.projects.map(p => option(`${p.name}${p.archived ? ' · Archived' : ''}`, p.id)));
  if (state.projects.some(p => p.id === projectId)) $('#settings-project').value = projectId;
  $('#settings-skill').replaceChildren(...[...state.skills, ...(state.archived_skills ?? [])].map(s => option(`${s.name}${s.status === 'archived' ? ' · Archived' : ''}`, s.skill_id)));
  if ([...state.skills, ...(state.archived_skills ?? [])].some(s => s.skill_id === skillId)) $('#settings-skill').value = skillId;
  projectChanged(); await skillChanged();
  const health = await fetch('/api/status').then(r => r.json());
  $('#library-health').textContent = health.error ? 'Status unavailable.' : `${health.skills} skills · ${health.files} files · ${(health.bytes / 1048576).toFixed(1)} MiB loaded · HTTP generation ${state.catalog_revision.slice(0, 12)}. Stdio clients keep their own snapshot until reconnected.`;
  $('#recent-operations').replaceChildren(...(health.operations ?? []).map(operation => {
    const row = document.createElement('li');
    row.textContent = `${operation.at} · ${operation.action} · ${operation.status} · ${operation.id}`;
    return row;
  }));
}
async function perform(button, action) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('#settings-controls button, #settings-controls input, #settings-controls textarea, #settings-controls select')];
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => control.disabled = true);
  status('Working…');
  try { await action(); } catch (error) { status(error.message); }
  finally { controls.forEach((control, i) => control.disabled = disabled[i]); busy = false; $('#apply-update').disabled = !updatePlan; $('#apply-restore').disabled = !restorePlan; $('#rollback-skill').disabled = !selectedSkill?.previous_revisions?.length; if (document.activeElement === document.body) (button.disabled ? $('#settings-status') : button).focus({ preventScroll: true }); }
}
function download(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#settings-project').addEventListener('change', projectChanged);
$('#settings-skill').addEventListener('change', () => { void skillChanged().catch(error => status(error.message)); });
$('#project-form').addEventListener('submit', event => {
  event.preventDefault(); void perform($('#save-project'), async () => {
    const project = state.projects.find(p => p.id === $('#settings-project').value);
    await request(`/api/projects/${encodeURIComponent(project.id)}`, { name: $('#project-name').value.trim(), path: $('#project-path').value.trim(), archived: $('#project-archived').checked, expected_revision: project.revision }, 'PATCH');
    await load(); status('Project saved. Archived profiles have no enabled skills or managed copies.');
  });
});
$('#metadata-form').addEventListener('submit', event => {
  event.preventDefault(); void perform($('#save-metadata'), async () => {
    await request('/api/skills/metadata', { skill_id: $('#settings-skill').value, expected_catalog_revision: state.catalog_revision, personal_notes: $('#skill-notes').value, tags: $('#skill-tags').value.split(',').map(x => x.trim()).filter(Boolean), preferred: $('#skill-preferred').checked, status: $('#skill-archived').checked ? 'archived' : 'active' }, 'PATCH');
    await load(); status('Curator metadata saved. Original package instructions were preserved.');
  });
});
$('#check-marketplace').addEventListener('click', () => void perform($('#check-marketplace'), async () => {
  const result = await fetch('/api/marketplace/status').then(r => r.json());
  $('#marketplace-health').textContent = result.message ?? 'Discovery status unavailable.'; status('Discovery probe finished. Provider credentials and quotas remain unverified.');
}));
$('#refresh-library').addEventListener('click', () => void perform($('#refresh-library'), async () => {
  await request('/api/refresh'); await load(); status('HTTP snapshot refreshed. Reconnect stdio clients for package changes.');
}));
$('#export-backup').addEventListener('click', () => void perform($('#export-backup'), async () => {
  const backup = await request('/api/backup'); download('skill-library-backup.json', backup); status('Private backup downloaded. Keep it secure; it includes package contents and profile paths.');
}));
$('#preview-restore').addEventListener('click', () => void perform($('#preview-restore'), async () => {
  restorePlan = null; $('#apply-restore').disabled = true;
  const file = $('#restore-file').files[0];
  if (!file || file.size > 64 * 1048576) throw new Error('Choose a backup JSON file up to 64 MiB.');
  restorePlan = await request('/api/restore/preview', { backup: JSON.parse(await file.text()) });
  $('#restore-summary').textContent = `${restorePlan.packages_to_add} new packages · ${restorePlan.metadata_to_restore ?? 0} starter metadata overrides · ${restorePlan.profiles} profiles. ${restorePlan.note} Review plans expire after 15 minutes.`;
  $('#apply-restore').disabled = false; status('Backup validated. Review the restore summary before applying.');
}));
$('#restore-file').addEventListener('change', () => { restorePlan = null; $('#apply-restore').disabled = true; $('#restore-summary').textContent = ''; });
$('#apply-restore').addEventListener('click', () => void perform($('#apply-restore'), async () => {
  if (!restorePlan) throw new Error('Preview the backup first.');
  const result = await request('/api/restore', { plan_id: restorePlan.plan_id });
  restorePlan = null; await load(); status(result.partial ? `Packages saved; profile restore incomplete: ${result.profile_error}` : 'Backup restored. Choose native directories again; existing profiles were preserved.');
}));
$('#update-form').addEventListener('submit', event => {
  event.preventDefault(); void perform($('#preview-update'), async () => {
    if (!selectedSkill) throw new Error('Choose an active saved skill.');
    updatePlan = await request('/api/skills/update/preview', { skill_id: selectedSkill.skill_id, commit: $('#update-commit').value.trim(), expected_revision: selectedSkill.revision });
    $('#update-summary').textContent = `${updatePlan.saved_commit ?? 'Unrecorded'} → ${updatePlan.reviewed_commit}. ${updatePlan.note}`;
    $('#update-files').replaceChildren(...updatePlan.files.map(file => {
      const row = document.createElement('li'); row.textContent = `${file.change} · ${file.path}`;
      if (file.preview) {
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Compare saved and reviewed text'; details.append(summary);
        for (const [label, content] of [['Saved', file.preview.before], ['Reviewed', file.preview.after]]) { const heading = document.createElement('h3'), pre = document.createElement('pre'); heading.textContent = label; pre.className = 'instructions'; pre.tabIndex = 0; pre.textContent = content || '(File absent)'; details.append(heading, pre); }
        if (file.preview.truncated) { const note = document.createElement('p'); note.textContent = 'Text preview truncated. Inspect the full pinned source before applying.'; details.append(note); }
        row.append(details);
      }
      return row;
    }));
    $('#updated-instructions').textContent = updatePlan.instructions;
    $('#update-preview').hidden = false; $('#apply-update').disabled = false; status('Review the file changes and instructions, then apply explicitly.');
  });
});
$('#update-commit').addEventListener('input', () => { updatePlan = null; $('#apply-update').disabled = true; $('#update-preview').hidden = true; });
$('#apply-update').addEventListener('click', () => void perform($('#apply-update'), async () => {
  if (!updatePlan) throw new Error('Review an update first.');
  const result = await request('/api/skills/update', { plan_id: updatePlan.plan_id });
  await load(); status(result.note);
}));
$('#rollback-skill').addEventListener('click', () => void perform($('#rollback-skill'), async () => {
  if (!selectedSkill?.previous_revisions?.length) throw new Error('There is no retained previous revision.');
  if (!$('#rollback-reviewed').checked) throw new Error('Confirm the previous commit before restoring it.');
  const result = await request('/api/skills/rollback', { skill_id: selectedSkill.skill_id, expected_revision: selectedSkill.revision });
  $('#rollback-reviewed').checked = false; await load(); status(result.note);
}));
$('#update-commit').value = new URLSearchParams(location.search).get('commit') ?? '';
void load().then(() => { if (state?.mode !== 'demo') status('Ready. Changes stay local; review filesystem effects before applying.'); }).catch(error => status(error.message));
