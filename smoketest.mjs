/* Headless integration test. Run: node tools/smoketest.mjs */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['engine.js', 'data.js', 'tournament.js', 'records.js']) {
  (0, eval)(readFileSync(join(here, '../js/' + f), 'utf8'));
}
const E = globalThis.TennisEngine, D = globalThis.TennisData,
  T = globalThis.TennisTournament, R = globalThis.TennisRecords;

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) { failures++; console.error('FAIL:', msg); }
  else console.log('  ok:', msg);
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(2026);

const state = D.newState();

// 50 players, overalls 70-97, some attr scatter
for (let i = 0; i < 50; i++) {
  const ovr = 70 + Math.floor(rng() * 28);
  const attrs = {};
  for (const [k] of E.ATTR_DEFS) attrs[k] = Math.max(40, Math.min(99, ovr + Math.floor(rng() * 9) - 4));
  D.addPlayer(state, {
    name: 'Player ' + (i + 1), country: 'TST', overall: ovr, attrs,
    surfaces: { hard: 70 + Math.floor(rng() * 29), clay: 70 + Math.floor(rng() * 29), grass: 70 + Math.floor(rng() * 29) }
  });
}
assert(Object.keys(state.players).length === 50, '50 players added');

// import format (single + array + defaults)
D.importPlayers(state, JSON.stringify({ name: 'Import Solo', overall: 88 }));
D.importPlayers(state, JSON.stringify([{ name: 'Import A', overall: 85, attrs: { serve: 95 } }, { name: 'Import B', overall: 60 }]));
const solo = Object.values(state.players).find(p => p.name === 'Import Solo');
assert(solo.attrs.forehand === 88 && solo.surfaces.clay === 80, 'import defaults fill from overall / surfaces 80');

// Tournament defs
const wimb = T.createDef(state, { name: 'Wimbledon', surface: 'grass', drawSize: 32, bestOf: 5, points: 2000 });
const minor = T.createDef(state, { name: 'Esher Open', surface: 'hard', drawSize: 16, bestOf: 3, points: 250 });
assert(wimb.quali === 4 && wimb.wild === 2, 'default entry slots for a 32 draw');

// --- Tournament 1: 53 players into a 32 draw -> quali + wildcards
const inst = T.startTournament(state, wimb.id, rng);
assert(inst.size === 32, 'draw size 32');
assert(inst.rounds[0].length === 16 && inst.rounds.length === 5, 'bracket shape 16/8/4/2/1');
const tagVals = Object.values(inst.tags);
assert(tagVals.filter(t => t === 'Q').length === 4 && tagVals.filter(t => t === 'WC').length === 2, '4 qualifiers + 2 wildcards');
const firstIds = inst.rounds[0].flatMap(m => [m.a, m.b]);
assert(new Set(firstIds).size === 32 && !firstIds.includes('BYE'), '32 unique entrants, no byes');

// seeds 1 and 2 land in opposite halves
const slotOfSeed = seedNo => {
  const pid = Number(Object.entries(inst.seeds).find(([, s]) => s === seedNo)[0]);
  return firstIds.indexOf(pid);
};
assert(slotOfSeed(1) < 16 !== slotOfSeed(2) < 16 ? true : (slotOfSeed(1) < 16) !== (slotOfSeed(2) < 16), 'seed placement computed');
assert((slotOfSeed(1) < 16) !== (slotOfSeed(2) < 16), 'seeds 1 & 2 in opposite halves');

// play every match round by round
let played = 0;
while (!T.isFinished(inst)) {
  const r = T.currentRoundIdx(inst);
  inst.rounds[r].forEach((m, i) => {
    if (m.w === null) { T.playMatch(state, r, i, rng); played++; }
  });
}
assert(played === 31, '31 main-draw matches played');
const fin = T.finalizeTournament(state);
console.log('  champion:', fin.champ.name, '(' + fin.champ.overall + ')', fin.finalScore);
assert(state.completed.length === 1 && state.active === null, 'tournament archived');
assert(fin.champ.titles === 1 && fin.champ.titlesByDef[wimb.id] === 1, 'champion credited');
assert(state.rankings.length > 0 && state.rankings[0].pts >= 2000, 'rankings computed, champion on top-level points');
assert(state.players[state.rankings[0].id].rank === 1, 'rank written back to player');
assert(state.players[state.rankings[0].id].no1 === 1, 'number 1 tracker');

// points sanity: champion 2000, finalist 1200, first-round loser 10
const ev = state.completed[0];
assert(ev.points[fin.champ.id] === 2000, 'champion points 2000');
assert(ev.points[fin.runnerUp.id] === 1200, 'runner-up points 1200');
const firstRoundLoserPts = Object.values(ev.points).filter(p => p === 90).length;
assert(firstRoundLoserPts === 16, '16 first-round losers on 90 pts (32-draw ladder)');

// --- Tournament 2: small draw with byes
// retire enough players so the 16-draw pool is thin
const everyone = Object.values(state.players);
everyone.slice(0, 40).forEach(p => { p.active = false; });
const inst2 = T.startTournament(state, minor.id, rng);
const activeCount = everyone.filter(p => p.active).length;
console.log('  active pool:', activeCount, 'draw:', inst2.size);
assert(inst2.size <= 16, 'draw shrinks or byes appear for a thin pool');
const firstIds2 = inst2.rounds[0].flatMap(m => [m.a, m.b]);
const byes = firstIds2.filter(x => x === 'BYE').length;
assert(byes === inst2.size - activeCount, 'bye count matches missing entrants');
while (!T.isFinished(inst2)) {
  const r = T.currentRoundIdx(inst2);
  inst2.rounds[r].forEach((m, i) => { if (m.w === null && m.a !== null && m.b !== null) T.playMatch(state, r, i, rng); });
}
const fin2 = T.finalizeTournament(state);
console.log('  champion 2:', fin2.champ.name, fin2.finalScore);
assert(state.completed.length === 2, 'second tournament archived');

// records + h2h
const L = R.leaders(state, 1);
assert(L.titles.length >= 1 && L.titles[0].titles >= 1, 'leaders: titles list');
const c = R.career(state, fin.champ.id);
assert(c.totalMatches >= 5 && c.winPct > 0, 'career summary');
const someMatch = state.matches[0];
const h = R.h2hDetail(state, someMatch.a, someMatch.b);
assert(h.rec.aWins + h.rec.bWins >= 1 && h.matches.length >= 1, 'head-to-head detail');

// export / import round trip
const json = D.exportJSON(state);
const back = D.importJSON(json);
assert(back.matches.length === state.matches.length && Object.keys(back.players).length === Object.keys(state.players).length, 'export/import round trip');

// window setting behaviour
state.settings.window = 1;
T.recomputeRankings(state);
const ptsNow = T.currentPointsMap(state);
assert(!Object.values(ptsNow).includes(2000), 'window=1 drops the first event\'s points');
state.settings.window = 20;
T.recomputeRankings(state);

// storage size ballpark
console.log('  save size:', (D.storageBytes(state) / 1024).toFixed(1) + ' KB for', state.matches.length, 'matches /', Object.keys(state.players).length, 'players');

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
