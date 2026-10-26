export const platformName = value => ({ shared: 'Shared', codex: 'Codex', 'claude-code': 'Claude Code', cursor: 'Cursor', opencode: 'OpenCode', custom: 'Custom' }[value] || value);
export function inventoryItems(inventory, groupId = 'all', query = '') {
  const term = query.trim().toLowerCase();
  return (inventory?.items || []).map(item => ({ ...item, origins: item.origins.filter(origin => groupId === 'all' || origin.group_id === groupId) }))
    .filter(item => item.origins.length && (!term || [item.name, item.description, item.folder, ...item.origins.flatMap(o => [o.platform, platformName(o.platform), o.project || '', o.path])].some(value => value.toLowerCase().includes(term))))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function skillOrigins(inventory, skillId) {
  return (inventory?.items || []).filter(item => item.skill_id === skillId).flatMap(item => item.origins);
}
export function sourceSummary(origins) {
  const places = [...new Set(origins.map(o => o.project_path || o.project ? 'Project' : o.platform === 'custom' ? 'Custom' : 'Global'))];
  const apps = [...new Set(origins.map(o => platformName(o.platform)))];
  return [...places, ...apps].join(' · ');
}
