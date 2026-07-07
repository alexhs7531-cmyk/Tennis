/* ============================================================
   TENNIS LEGENDS — Tournament layer
   Entry lists (direct / qualifying / wildcards), seeded draws,
   byes, bracket progression, ranking points, finalisation.
   DOM-free (runs in browser + node).
   ============================================================ */
(function (global) {
  'use strict';
  const E = global.TennisEngine;
  const D = global.TennisData;

  // Points for reaching a stage, as a share of the champion's points.
  // Index = rounds short of the title: 0 champion, 1 finalist, 2 SF, ...
  const POINT_LADDER = [1, 0.6, 0.36, 0.18, 0.09, 0.045, 0.0225, 0.005];

  const ROUND_LABELS = { 128: 'R128', 64: 'R64', 32: 'R32', 16: 'R16', 8: 'QF', 4: 'SF', 2: 'F' };

  function roundName(playersInRound) { return ROUND_LABELS[playersInRound] || ('R' + playersInRound); }

  /* ---------- Tournament definitions ---------- */
  function defaultSlots(drawSize) {
    const map = {
      128: { quali: 16, wild: 8 },
      64: { quali: 8, wild: 4 },
      32: { quali: 4, wild: 2 },
      16: { quali: 2, wild: 1 },
      8: { quali: 0, wild: 1 },
      4: { quali: 0, wild: 0 }
    };
    return map[drawSize] || { quali: 0, wild: 0 };
  }

  function createDef(state, input) {
    const drawSize = [4, 8, 16, 32, 64, 128].includes(Number(input.drawSize)) ? Number(input.drawSize) : 32;
    const slots = defaultSlots(drawSize);
    const quali = input.quali === undefined ? slots.quali : Math.max(0, Math.min(drawSize / 4, Math.round(Number(input.quali) || 0)));
    const wild = input.wild === undefined ? slots.wild : Math.max(0, Math.min(drawSize / 4, Math.round(Number(input.wild) || 0)));
    const def = {
      id: state.nextDefId++,
      name: String(input.name || 'Untitled Open').trim().slice(0, 40),
      surface: E.SURFACES.includes(input.surface) ? input.surface : 'hard',
      drawSize,
      bestOf: Number(input.bestOf) === 5 ? 5 : 3,
      points: Math.max(50, Math.min(4000, Math.round(Number(input.points) || 500))),
      quali, wild,
      editions: 0
    };
    state.defs[def.id] = def;
    return def;
  }

  function updateDef(state, id, input) {
    const def = state.defs[id];
    if (!def) throw new Error('No such tournament');
    const fresh = createDef({ nextDefId: 0, defs: {} }, input);
    def.name = fresh.name; def.surface = fresh.surface; def.drawSize = fresh.drawSize;
    def.bestOf = fresh.bestOf; def.points = fresh.points;
    def.quali = fresh.quali; def.wild = fresh.wild;
    return def;
  }

  function deleteDef(state, id) {
    if (state.active && state.active.defId === id) throw new Error('This tournament is currently running');
    delete state.defs[id];
  }

  /* ---------- Entry list ---------- */
  function entryOrder(state) {
    // Ranking points, then Elo, then overall — the pecking order for entries and seedings.
    const pts = currentPointsMap(state);
    return Object.values(state.players)
      .filter(p => p.active)
      .sort((a, b) =>
        (pts[b.id] || 0) - (pts[a.id] || 0) ||
        b.elo - a.elo ||
        b.overall - a.overall ||
        a.id - b.id);
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Backend qualifying: everyone outside direct entry gets a path in.
  // Snake-seeded knockout pods, one qualifier per pod. Matches are not recorded.
  function runQualifying(state, pool, spots, def, rng) {
    if (spots <= 0 || pool.length === 0) return { qualifiers: [], rounds: 0 };
    if (pool.length <= spots) return { qualifiers: pool.slice(), rounds: 0 };
    const pods = Array.from({ length: spots }, () => []);
    pool.forEach((p, i) => {
      const row = Math.floor(i / spots);
      const col = row % 2 === 0 ? i % spots : spots - 1 - (i % spots);
      pods[col].push(p);
    });
    const qualifiers = [];
    let maxRounds = 0;
    for (const pod of pods) {
      let alive = pod.slice();
      let rounds = 0;
      while (alive.length > 1) {
        rounds++;
        const next = [];
        // pair best v worst within the pod; odd player out gets a bye
        let lo = 0, hi = alive.length - 1;
        while (lo < hi) {
          const r = E.simulateMatch(alive[lo], alive[hi], { bestOf: 3, surface: def.surface, rng });
          next.push(r.winner === 0 ? alive[lo] : alive[hi]);
          lo++; hi--;
        }
        if (lo === hi) next.push(alive[lo]);
        alive = next;
      }
      qualifiers.push(alive[0]);
      maxRounds = Math.max(maxRounds, rounds);
    }
    return { qualifiers, rounds: maxRounds };
  }

  // Wildcards: weighted random from the leftovers — the better you are, the better your odds.
  function pickWildcards(pool, count, rng) {
    const picks = [];
    const remaining = pool.slice();
    while (picks.length < count && remaining.length > 0) {
      const weights = remaining.map(p => Math.pow(Math.max(1, p.overall - 40), 3));
      const total = weights.reduce((s, w) => s + w, 0);
      let roll = rng() * total;
      let idx = 0;
      while (roll > weights[idx] && idx < remaining.length - 1) { roll -= weights[idx]; idx++; }
      picks.push(remaining.splice(idx, 1)[0]);
    }
    return picks;
  }

  /* ---------- Seeded draw with byes ----------
     Canonical slot numbering: slot i carries canonical number order[i];
     canonical k pairs with canonical N+1-k in round one. Seeds within
     real-tennis bands (3-4, 5-8, 9-16, 17-32) are shuffled, byes sit
     opposite the top seeds, everyone else lands at random. */
  function canonicalOrder(n) {
    let order = [1];
    while (order.length < n) {
      const m = order.length * 2 + 1;
      const next = [];
      for (const x of order) { next.push(x, m - x); }
      order = next;
    }
    return order;
  }

  function buildDraw(entrants, seedCount, byeCount, rng) {
    const N = entrants.length + byeCount;
    const order = canonicalOrder(N);
    const bySlotCanon = order; // slot index -> canonical number

    // canonical number -> participant
    const canonMap = new Array(N + 1).fill(null);
    // seed bands: [1],[2],[3-4],[5-8],[9-16],[17-32]
    const bands = [[1, 1], [2, 2], [3, 4], [5, 8], [9, 16], [17, 32]];
    let assigned = 0;
    for (const [lo, hi] of bands) {
      if (assigned >= seedCount) break;
      const bandSeeds = [];
      for (let s = lo; s <= Math.min(hi, seedCount); s++) bandSeeds.push(s);
      const canonSlots = bandSeeds.slice();
      shuffle(canonSlots, rng);
      bandSeeds.forEach((seedNo, i) => { canonMap[canonSlots[i]] = entrants[seedNo - 1]; });
      assigned += bandSeeds.length;
    }
    // byes opposite the best seeds: canonical N, N-1, ...
    for (let i = 0; i < byeCount; i++) canonMap[N - i] = 'BYE';
    // everyone else at random into the remaining canonical numbers
    const rest = entrants.slice(seedCount);
    shuffle(rest, rng);
    let ri = 0;
    for (let c = 1; c <= N; c++) if (canonMap[c] === null) canonMap[c] = rest[ri++];

    const slots = bySlotCanon.map(c => canonMap[c]);
    const seedOf = {};
    for (let s = 1; s <= seedCount; s++) seedOf[entrants[s - 1].id] = s;
    return { slots, seedOf, size: N };
  }

  /* ---------- Starting a tournament ---------- */
  function startTournament(state, defId, rng) {
    rng = rng || Math.random;
    if (state.active) throw new Error('Finish or cancel the active tournament first');
    const def = state.defs[defId];
    if (!def) throw new Error('No such tournament');
    const order = entryOrder(state);
    if (order.length < 2) throw new Error('You need at least 2 active players');

    // Shrink the bracket if the player pool is small.
    let size = def.drawSize;
    while (size > 4 && order.length <= size / 2) size = size / 2;

    let directList, qualifiers = [], wildcards = [], qualiRounds = 0;
    if (order.length <= size) {
      directList = order.slice();
    } else {
      const quali = Math.min(def.quali, size - 2);
      const wild = Math.min(def.wild, size - quali - 2);
      const direct = size - quali - wild;
      directList = order.slice(0, direct);
      const outside = order.slice(direct);
      const q = runQualifying(state, outside, quali, def, rng);
      qualifiers = q.qualifiers; qualiRounds = q.rounds;
      const qualifiedIds = new Set(qualifiers.map(p => p.id));
      const leftovers = outside.filter(p => !qualifiedIds.has(p.id));
      wildcards = pickWildcards(leftovers, wild, rng);
    }

    const entrants = directList.concat(qualifiers, wildcards);
    // Seeding order = entry-ranking order among entrants
    const rankIndex = new Map(order.map((p, i) => [p.id, i]));
    entrants.sort((a, b) => rankIndex.get(a.id) - rankIndex.get(b.id));

    const seedCount = Math.min(Math.max(2, size / 4), 32, entrants.length);
    const byeCount = size - entrants.length;
    const draw = buildDraw(entrants, seedCount, byeCount, rng);

    const totalRounds = Math.log2(size);
    const rounds = [];
    const first = [];
    for (let i = 0; i < size; i += 2) {
      first.push({ a: idOf(draw.slots[i]), b: idOf(draw.slots[i + 1]), w: null, s: null });
    }
    rounds.push(first);
    for (let r = 1; r < totalRounds; r++) {
      rounds.push(Array.from({ length: size / Math.pow(2, r + 1) }, () => ({ a: null, b: null, w: null, s: null })));
    }

    def.editions++;
    const instance = {
      id: state.nextInstanceId++,
      defId: def.id,
      name: def.name,
      edition: def.editions,
      surface: def.surface,
      bestOf: def.bestOf,
      pointsBase: def.points,
      size,
      seeds: draw.seedOf,
      tags: buildTags(qualifiers, wildcards),
      qualiRounds,
      rounds,
      roundNames: Array.from({ length: totalRounds }, (_, r) => roundName(size / Math.pow(2, r)))
    };
    state.active = instance;
    resolveByes(state, instance);
    return instance;
  }

  function idOf(slot) { return slot === 'BYE' ? 'BYE' : slot.id; }

  function buildTags(qualifiers, wildcards) {
    const tags = {};
    for (const p of qualifiers) tags[p.id] = 'Q';
    for (const p of wildcards) tags[p.id] = 'WC';
    return tags;
  }

  function resolveByes(state, inst) {
    const first = inst.rounds[0];
    first.forEach((m, i) => {
      if (m.b === 'BYE' && m.w === null) { m.w = m.a; m.s = 'bye'; advance(inst, 0, i); }
      else if (m.a === 'BYE' && m.w === null) { m.w = m.b; m.s = 'bye'; advance(inst, 0, i); }
    });
  }

  function advance(inst, roundIdx, matchIdx) {
    const m = inst.rounds[roundIdx][matchIdx];
    if (roundIdx + 1 >= inst.rounds.length) return;
    const target = inst.rounds[roundIdx + 1][Math.floor(matchIdx / 2)];
    if (matchIdx % 2 === 0) target.a = m.w; else target.b = m.w;
  }

  function currentRoundIdx(inst) {
    for (let r = 0; r < inst.rounds.length; r++) {
      if (inst.rounds[r].some(m => m.w === null)) return r;
    }
    return inst.rounds.length; // finished
  }

  function isFinished(inst) { return currentRoundIdx(inst) >= inst.rounds.length; }

  /* ---------- Playing a match ---------- */
  function playMatch(state, roundIdx, matchIdx, rng) {
    const inst = state.active;
    if (!inst) throw new Error('No tournament running');
    const m = inst.rounds[roundIdx][matchIdx];
    if (!m || m.w !== null) throw new Error('Match already decided');
    if (m.a === null || m.b === null) throw new Error('Waiting on earlier results');
    const pA = state.players[m.a], pB = state.players[m.b];
    const result = E.simulateMatch(pA, pB, { bestOf: inst.bestOf, surface: inst.surface, rng: rng || Math.random });
    m.w = result.winner === 0 ? pA.id : pB.id;
    m.s = result.scoreStr;
    const applied = D.applyMatchResult(state, inst, roundIdx, inst.roundNames[roundIdx], pA, pB, result);
    m.mid = applied.rec.i;
    advance(inst, roundIdx, matchIdx);
    return { result, applied, finished: isFinished(inst) };
  }

  /* ---------- Points + finalisation ---------- */
  function pointsForExit(pointsBase, roundsShortOfTitle) {
    const factor = POINT_LADDER[Math.min(roundsShortOfTitle, POINT_LADDER.length - 1)];
    return Math.max(5, Math.round(pointsBase * factor));
  }

  function finalizeTournament(state) {
    const inst = state.active;
    if (!inst || !isFinished(inst)) throw new Error('Tournament is not finished');
    const totalRounds = inst.rounds.length;
    const finalMatch = inst.rounds[totalRounds - 1][0];
    const champId = finalMatch.w;
    const runnerUpId = finalMatch.a === champId ? finalMatch.b : finalMatch.a;

    // Everyone's exit round -> points
    const points = {};
    for (let r = 0; r < totalRounds; r++) {
      for (const m of inst.rounds[r]) {
        if (m.s === 'bye') continue;
        const loser = m.a === m.w ? m.b : m.a;
        if (loser !== 'BYE' && loser !== null) points[loser] = pointsForExit(inst.pointsBase, totalRounds - r);
      }
    }
    points[champId] = pointsForExit(inst.pointsBase, 0);

    const champ = state.players[champId];
    const runnerUp = state.players[runnerUpId];
    champ.titles++;
    champ.titlesByDef[inst.defId] = (champ.titlesByDef[inst.defId] || 0) + 1;
    champ.finals++;
    champ.finalsByDef[inst.defId] = (champ.finalsByDef[inst.defId] || 0) + 1;
    runnerUp.finals++;
    runnerUp.finalsByDef[inst.defId] = (runnerUp.finalsByDef[inst.defId] || 0) + 1;

    state.seq++;
    state.completed.push({
      id: inst.id, defId: inst.defId, n: inst.edition, seq: state.seq,
      name: inst.name, surface: inst.surface, pointsBase: inst.pointsBase, size: inst.size,
      champ: champId, runnerUp: runnerUpId, finalScore: finalMatch.s,
      points
    });
    state.active = null;
    recomputeRankings(state);
    return { champ, runnerUp, finalScore: finalMatch.s };
  }

  function cancelTournament(state) {
    // Results already played stay on record; the event just never crowns a champion.
    state.active = null;
  }

  /* ---------- Rankings ---------- */
  function currentPointsMap(state) {
    const windowSize = state.settings.window;
    const events = windowSize > 0 ? state.completed.slice(-windowSize) : state.completed;
    const pts = {};
    for (const ev of events) {
      for (const [pid, p] of Object.entries(ev.points)) {
        pts[pid] = (pts[pid] || 0) + p;
      }
    }
    return pts;
  }

  function recomputeRankings(state) {
    const pts = currentPointsMap(state);
    state.prevRankPos = {};
    for (const row of state.rankings) state.prevRankPos[row.id] = row.rank;

    const rows = Object.values(state.players)
      .map(p => ({ id: p.id, pts: pts[p.id] || 0, elo: p.elo }))
      .filter(r => r.pts > 0)
      .sort((a, b) => b.pts - a.pts || b.elo - a.elo || a.id - b.id);

    rows.forEach((r, i) => { r.rank = i + 1; });
    state.rankings = rows;

    // write current + best rank onto players
    for (const p of Object.values(state.players)) p.rank = null;
    for (const r of rows) {
      const p = state.players[r.id];
      p.rank = r.rank;
      if (p.bestRank === null || r.rank < p.bestRank) p.bestRank = r.rank;
    }
    if (rows.length > 0) state.players[rows[0].id].no1++;
    return rows;
  }

  const Tournament = {
    POINT_LADDER, roundName, defaultSlots,
    createDef, updateDef, deleteDef,
    entryOrder, startTournament, playMatch,
    currentRoundIdx, isFinished, finalizeTournament, cancelTournament,
    currentPointsMap, recomputeRankings, pointsForExit
  };
  global.TennisTournament = Tournament;
})(typeof window !== 'undefined' ? window : globalThis);
