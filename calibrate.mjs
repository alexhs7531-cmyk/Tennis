/* Calibration harness for the match engine.
   Run: node tools/calibrate.mjs [--grid]
   Targets (best of 5, neutral surface):
     Djokovic 98 v Kafelnikov 91  -> ~84%
     Nadal 98    v Haas 90        -> ~87%  */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../js/engine.js'), 'utf8');
(0, eval)(src);
const E = globalThis.TennisEngine;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const P = (name, overall, list) => {
  const keys = E.ATTR_DEFS.map(d => d[0]);
  const attrs = {};
  keys.forEach((k, i) => attrs[k] = list[i]);
  return { name, overall, attrs, surfaces: { hard: 80, clay: 80, grass: 80 } };
};

// Order matches ATTR_DEFS:
// forehand, backhand, serve, firstServe, returnServe, volley, smash, slice, passing,
// consistency, power, depth, angle, defense, coverage, footwork, speed, acceleration,
// agility, balance, flexibility, endurance, recovery, mental, composure, concentration,
// spirit, tactical, adaptability, shotSelection, anticipation, bigPoint, tiebreak,
// clutchServe, clutchReturn, tournamentConsistency, injuryResistance
const djokovic = P('Djokovic', 98, [95,99,92,94,99,88,94,92,99,99,92,98,95,99,99,99,97,96,99,99,99,99,99,99,99,98,99,99,99,99,99,99,98,95,99,99,94]);
const kafelnikov = P('Kafelnikov', 91, [88,95,88,89,91,90,88,86,91,92,88,93,90,87,89,90,88,87,88,91,84,94,92,88,89,87,91,90,89,88,90,88,87,87,90,90,92]);
const nadal = P('Nadal', 98, [99,95,91,91,97,89,95,91,98,98,99,98,99,99,99,99,97,97,98,99,98,99,99,99,98,98,99,97,97,96,98,99,96,94,98,99,82]);
const haas = P('Haas', 90, [91,90,90,91,88,89,92,90,89,90,91,90,89,87,89,91,90,90,91,91,89,91,90,87,88,87,91,91,91,90,91,86,88,89,87,86,60]);
const journeyman = P('Flat 74', 74, new Array(37).fill(74));
const flat88 = P('Flat 88', 88, new Array(37).fill(88));
const flat84 = P('Flat 84', 84, new Array(37).fill(84));

function winRate(a, b, n, bestOf, seed) {
  const rng = mulberry32(seed);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const r = E.simulateMatch(a, b, { bestOf, surface: 'hard', rng });
    if (r.winner === 0) w++;
  }
  return (100 * w) / n;
}

function report(n = 20000) {
  const rows = [
    ['Djokovic 98 v Kafelnikov 91', djokovic, kafelnikov, 84],
    ['Nadal 98 v Haas 90', nadal, haas, 87],
    ['Djokovic 98 v Nadal 98', djokovic, nadal, null],
    ['Djokovic 98 v Flat 74', djokovic, journeyman, null],
    ['Flat 88 v Flat 84', flat88, flat84, null],
    ['Kafelnikov 91 v Flat 88', kafelnikov, flat88, null]
  ];
  for (const [label, a, b, target] of rows) {
    const bo5 = winRate(a, b, n, 5, 42);
    const bo3 = winRate(a, b, n, 3, 43);
    console.log(
      label.padEnd(30),
      'Bo5:', bo5.toFixed(1) + '%',
      ' Bo3:', bo3.toFixed(1) + '%',
      target ? ` (target ~${target}%)` : ''
    );
  }
}

if (process.argv.includes('--grid')) {
  const n = 12000;
  let best = null;
  for (const pt of [0.0014, 0.0015, 0.0016, 0.0017, 0.0018]) {
    for (const fp of [0.08]) { for (const ow of [1.0, 1.2, 1.4]) { E.T.OVR_W = ow;
      E.T.PT_SCALE = pt; E.T.FORM_PER = fp;
      const r1 = winRate(djokovic, kafelnikov, n, 5, 7);
      const r2 = winRate(nadal, haas, n, 5, 11);
      const err = Math.abs(r1 - 84) + Math.abs(r2 - 87);
      console.log(`PT ${pt} OVR_W ${ow} -> DvK ${r1.toFixed(1)}  NvH ${r2.toFixed(1)}  err ${err.toFixed(1)}`);
      if (!best || err < best.err) best = { pt, fp, ow, err, r1, r2 }; }
    }
  }
  console.log('\nBEST:', best);
} else {
  report();
}

/* ---------------- Surface split test ----------------
   Run: node tools/calibrate.mjs --surfaces [SURF_W]
   Realistic surface ratings for the pair:                    gap
     Nadal: clay 99 / hard 92 / grass 85       clay +20, hard +2, grass -6
     Haas:  clay 79 / hard 90 / grass 91
   Illustrative targets: clay ~96, hard ~82-84, grass ~76. */
if (process.argv.includes('--surfaces')) {
  const wArg = process.argv[process.argv.indexOf('--surfaces') + 1];
  if (wArg && !isNaN(Number(wArg))) E.T.SURF_W = Number(wArg);
  const nad = { ...nadal, surfaces: { clay: 99, hard: 92, grass: 84 } };
  const hs = { ...haas, surfaces: { clay: 79, hard: 90, grass: 93 } };
  const flatLow = { ...journeyman, surfaces: { clay: 60, hard: 74, grass: 74 } };
  const djoBest = { ...djokovic, surfaces: { clay: 95, hard: 99, grass: 97 } };
  console.log('SURF_W =', E.T.SURF_W);
  for (const sf of ['clay', 'hard', 'grass']) {
    const rng = mulberry32(777);
    let w = 0; const n = 20000;
    for (let i = 0; i < n; i++) {
      if (E.simulateMatch(nad, hs, { bestOf: 5, surface: sf, rng }).winner === 0) w++;
    }
    console.log(`  Nadal v Haas on ${sf.padEnd(5)}: ${(100 * w / n).toFixed(1)}%`);
  }
  // never-zero check: hopeless mismatch on the strong player's best surface
  {
    const rng = mulberry32(31);
    let w = 0; const n = 200000;
    for (let i = 0; i < n; i++) {
      if (E.simulateMatch(flatLow, djoBest, { bestOf: 5, surface: 'hard', rng }).winner === 0) w++;
    }
    console.log(`  Flat74(weak surfaces) v Djokovic(hard 99), Bo5 hard: underdog wins ${(100 * w / n).toFixed(3)}% (${w}/${n})`);
  }
  process.exit(0);
}
