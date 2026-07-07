/* Headless UI test. Run: node tools/uitest.mjs */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { JSDOM } from '/home/claude/tools-env/node_modules/jsdom/lib/api.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, '..', f), 'utf8');

let html = read('index.html')
  .replace(/<link[^>]*>/g, '')
  .replace(/<script src="[^"]*"><\/script>/g, '');

const dom = new JSDOM(html, { url: 'https://example.org/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.confirm = () => true;
window.URL.createObjectURL = () => 'blob:fake';
window.URL.revokeObjectURL = () => {};

for (const f of ['js/engine.js', 'js/data.js', 'js/tournament.js', 'js/records.js', 'js/ui.js', 'js/app.js']) {
  window.eval(read(f));
}

const doc = window.document;
let failures = 0;
const assert = (cond, msg) => {
  if (!cond) { failures++; console.error('FAIL:', msg); }
  else console.log('  ok:', msg);
};
const click = sel => {
  const el = typeof sel === 'string' ? doc.querySelector(sel) : sel;
  if (!el) throw new Error('missing element: ' + sel);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};
const set = (sel, v) => {
  const el = doc.querySelector(sel);
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

/* empty states */
assert(doc.querySelector('#view-tour').textContent.includes('No tournaments yet'), 'tour empty state');
click('nav.tabs [data-view="players"]');
assert(doc.querySelector('#view-players').textContent.includes('locker room is empty'), 'players empty state');

/* add a player through the sheet */
click('[data-act="addPlayer"]');
assert(doc.querySelector('#overlay').classList.contains('on'), 'player editor opens');
set('#pe-name', 'Prime Novak Djokovic');
set('#pe-country', 'SRB');
set('#pe-overall', '98');
set('#pe-hard', '99'); set('#pe-clay', '95'); set('#pe-grass', '97');
click('[data-act="fillAttrs"]');
assert(doc.querySelector('[data-attr="serve"]').value === '98', 'fill-from-overall populates blanks');
click('[data-act="saveNewPlayer"]');
assert(doc.querySelector('#view-players').textContent.includes('Djokovic'), 'player appears in list');

/* bulk import 15 more via JSON */
click('[data-act="importPlayers"]');
const bulk = [];
for (let i = 0; i < 15; i++) bulk.push({ name: 'Legend ' + (i + 1), overall: 78 + i, surfaces: { hard: 70 + i * 2, clay: 95 - i * 2, grass: 80 } });
doc.querySelector('#imp-text').value = JSON.stringify(bulk);
click('[data-act="doImportPlayers"]');
assert(doc.querySelectorAll('#view-players .p-row').length === 16, '16 players listed after import');

/* search filters */
set('#p-search', 'Legend 1');
assert(doc.querySelectorAll('#view-players .p-row').length === 7, 'search filters (Legend 1, 10-15)');
set('#p-search', '');

/* profile sheet */
click(doc.querySelector('#view-players .p-row'));
assert(doc.querySelector('#sheet').textContent.includes('Attributes'), 'profile sheet renders');
click('[data-act="closeSheet"]');

/* create a tournament */
click('nav.tabs [data-view="tour"]');
click('[data-act="newDef"]');
set('#te-name', 'Wimbledon');
set('#te-surface', 'grass');
set('#te-draw', '16');
set('#te-bestof', '5');
click('[data-act="ptsPreset"][data-id="2000"]');
click('[data-act="saveNewDef"]');
assert(doc.querySelector('#view-tour').textContent.includes('Wimbledon'), 'tournament card shows');

/* start it: 16 players, 16 draw -> everyone direct */
click('[data-act="startDef"]');
assert(doc.querySelector('#view-tour').textContent.includes('R16'), 'bracket opens at R16');
assert(doc.querySelectorAll('[data-act="play"]').length === 8, '8 playable first-round matches');

/* play everything to the title */
let guard = 0;
while (!doc.querySelector('[data-act="crown"]') && guard++ < 40) {
  const btn = doc.querySelector('[data-act="play"]');
  if (!btn) { // move to next round chip
    const rail = [...doc.querySelectorAll('.rail button')];
    const next = rail.find(b => !b.classList.contains('done') && !b.classList.contains('on'));
    if (next) click(next); else break;
    continue;
  }
  click(btn);
}
assert(doc.querySelector('[data-act="crown"]'), 'champion banner appears after the final');
const champName = doc.querySelector('.crown .who').textContent;
click('[data-act="crown"]');
assert(doc.querySelector('#view-tour').textContent.includes('Champion'), 'celebration card after crowning');
console.log('  champion crowned:', champName);

/* match report sheet from a played match — restart view via records wall instead */
click('nav.tabs [data-view="rankings"]');
assert(doc.querySelectorAll('#view-rankings .rank-row').length > 0, 'points rankings render');
assert(doc.querySelector('#view-rankings').textContent.includes(champName), 'champion is ranked');
click('[data-act="rankMode"][data-id="elo"]');
assert(doc.querySelector('#view-rankings .rank-row .mono') !== null, 'elo mode renders');

click('nav.tabs [data-view="records"]');
assert(doc.querySelector('#view-records').textContent.includes('Champions wall'), 'records view renders');
assert(doc.querySelector('.wall').textContent.includes('Wimbledon'), 'wall lists the edition');
/* h2h */
const opts = [...doc.querySelectorAll('#h2h-a option')].map(o => o.value).filter(Boolean);
set('#h2h-a', opts[0]); set('#h2h-b', opts[1]);
click('[data-act="h2h"]');
assert(doc.querySelector('#h2h-out').textContent.length > 0, 'h2h compares');

/* more view + window setting */
click('nav.tabs [data-view="more"]');
assert(doc.querySelector('#view-more').textContent.includes('Save size'), 'more view renders');
set('#win-input', '5');
click('[data-act="saveWindow"]');
assert(doc.querySelector('#toast').textContent.includes('last 5'), 'window setting saves');

/* persistence: reload the world from localStorage */
const saved = window.localStorage.getItem('tennisLegendsSave');
assert(saved && saved.includes('Wimbledon'), 'autosave hit localStorage');

/* match report via tour -> completed? open via records: reuse profile recent matches */
click('nav.tabs [data-view="players"]');
click(doc.querySelector('#view-players .p-row'));
assert(doc.querySelector('#sheet').textContent.includes('Recent matches') || doc.querySelector('#sheet').textContent.includes('Honours'), 'career sections on profile');
click('[data-act="closeSheet"]');

console.log(failures === 0 ? '\nUI: ALL PASS' : '\nUI: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
