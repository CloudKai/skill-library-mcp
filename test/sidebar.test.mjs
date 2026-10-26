import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../public/sidebar.js', import.meta.url), 'utf8');
function navigation({ narrow = false, stacked = narrow, saved = new Map(), blockedStorage = false } = {}) {
  const handlers = {};
  const on = target => (name, fn) => { handlers[`${target}:${name}`] = fn; };
  const classes = new Set();
  const attributes = {};
  const link = { closest: () => null };
  const dialog = { closest: () => ({ open: true }) };
  const sidebar = { hidden: false, scrollTop: 0, scrollCount: 0, scrollIntoView(options) { this.scrollCount++; this.scrollOptions = options; }, contains: element => element === link || element === dialog };
  const shell = { classList: { toggle(name, value) { value ? classes.add(name) : classes.delete(name); } } };
  const toggle = { addEventListener: on('toggle'), setAttribute(name, value) { attributes[name] = value; }, focus() { document.activeElement = toggle; }, closest: () => null };
  const document = { activeElement: null, addEventListener: on('document'), querySelector: selector => ({ '.app-shell': shell, '#app-sidebar': sidebar, '#sidebar-toggle': toggle })[selector] };
  const media = { matches: narrow, addEventListener: on('media') };
  const mobile = { matches: stacked };
  const storage = { getItem(key) { if (blockedStorage) throw Error('blocked'); return saved.get(key); }, setItem(key, value) { if (blockedStorage) throw Error('blocked'); saved.set(key, value); } };
  runInNewContext(script, { document, window: { addEventListener: on('window') }, matchMedia: query => query.includes('620px') ? mobile : media, localStorage: storage });
  return { sidebar, toggle, document, link, dialog, saved, attributes, classes,
    click() { handlers['toggle:click'](); },
    resize(value, inline = value) { media.matches = value; mobile.matches = inline; handlers['media:change'](); },
    sync(key) { handlers['window:storage']({ key }); },
    escape() { const event = { key: 'Escape', target: document.activeElement, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; handlers['document:keydown'](event); return event.defaultPrevented; }
  };
}
test('sidebar control hides navigation, updates accessible state and persists the desktop choice', () => {
  const ui = navigation();
  assert.equal(ui.sidebar.hidden, false); assert.equal(ui.attributes['aria-expanded'], 'true');
  ui.click();
  assert.equal(ui.sidebar.hidden, true); assert.equal(ui.attributes['aria-label'], 'Show sidebar'); assert.equal(ui.toggle.title, 'Show sidebar'); assert.ok(ui.classes.has('sidebar-hidden'));
  assert.equal(navigation({ saved: ui.saved }).sidebar.hidden, true);
  ui.click(); assert.equal(ui.attributes['aria-label'], 'Hide sidebar'); assert.equal(ui.classes.has('sidebar-hidden'), false);
});
test('narrow screens start closed and remember their choice separately from desktop', () => {
  const ui = navigation({ narrow: true }); assert.equal(ui.sidebar.hidden, true);
  ui.click(); assert.equal(ui.saved.get('skill-library-sidebar:narrow'), 'open');
  ui.resize(false); ui.click(); assert.equal(ui.saved.get('skill-library-sidebar:wide'), 'closed');
  ui.resize(true); assert.equal(ui.sidebar.hidden, false);
});
test('Escape returns focus to the persistent toggle without intercepting dialog Escape', () => {
  const ui = navigation(); ui.document.activeElement = ui.dialog;
  assert.equal(ui.escape(), false); assert.equal(ui.sidebar.hidden, false);
  ui.document.activeElement = ui.link; assert.equal(ui.escape(), true);
  assert.equal(ui.document.activeElement, ui.toggle); assert.equal(ui.sidebar.hidden, true);
});
test('resize and cross-tab changes restore focus before navigation becomes hidden', () => {
  const ui = navigation(); ui.document.activeElement = ui.link; ui.resize(true);
  assert.equal(ui.document.activeElement, ui.toggle); assert.equal(ui.sidebar.hidden, true);
  ui.saved.set('skill-library-sidebar:narrow', 'open'); ui.sync('skill-library-sidebar:narrow'); assert.equal(ui.sidebar.hidden, false);
  ui.document.activeElement = ui.link; ui.saved.clear(); ui.sync(null); assert.equal(ui.sidebar.hidden, true); assert.equal(ui.document.activeElement, ui.toggle);
});
test('sidebar still works when browser storage is unavailable', () => {
  const ui = navigation({ blockedStorage: true }); ui.click(); assert.equal(ui.sidebar.hidden, true); ui.click(); assert.equal(ui.sidebar.hidden, false);
});

test('opening inline mobile navigation reveals it from a scrolled page without moving desktop navigation', () => {
  const phone = navigation({ narrow: true, stacked: true });
  phone.sidebar.scrollTop = 240; phone.click();
  assert.equal(phone.sidebar.scrollCount, 1); assert.equal(phone.sidebar.scrollTop, 0); assert.equal(phone.sidebar.scrollOptions.block, 'start');
  phone.click(); assert.equal(phone.sidebar.scrollCount, 1);
  const panel = navigation({ narrow: true, stacked: false }); panel.click(); assert.equal(panel.sidebar.scrollCount, 0);
  const desktop = navigation(); desktop.click(); desktop.click(); assert.equal(desktop.sidebar.scrollCount, 0);
});
