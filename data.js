/* ============================================================
   TENNIS LEGENDS — Data layer
   State, persistence, players, Elo, head-to-heads, career stats.
   DOM-free (runs in browser + node).
   ============================================================ */
(function (global) {
  'use strict';
  const E = global.TennisEngine;
  const SAVE_KEY = 'tennisLegendsSave';
  const BACKUP_KEY = 'tennisLegendsSave_backup';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  function newState() {
    return {
      version: 1,
      seq: 0,
      nextPlayerId: 1,
      nextDefId: 1,
      nextInstanceId: 1,
      nextMatchId: 1,
      players: {},
      defs: {},
      matches: [],
      completed: [],
      h2h: {},
      active: null,
      rankings: [],
      prevRankPos: {},
      settings: { window: 20 }
    };
  }

  /* ---------- Persistence ---------- */
  function hasStorage() {
    try { return typeof localStorage !== 'undefined' && localStorage !== null; }
    catch (e) { return false; }
  }

  function save(state) {
    if (!hasStorage()) return { ok: true, bytes: 0 };
    try {
      const json = JSON.stringify(state);
      localStorage.setItem(SAVE_KEY, json);
      return { ok: true, bytes: json.length };
    } catch (e) {
      return { ok: false, error: e && e.message };
    }
  }

  function load() {
    if (!hasStorage()) return newState();
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return newState();
      const state = migrate(JSON.parse(json));
      try { localStorage.setItem(BACKUP_KEY, json); } catch (e) { /* backup best-effort */ }
      return state;
    } catch (e) {
      try {
        const backup = localStorage.getItem(BACKUP_KEY);
        if (backup) return migrate(JSON.parse(backup));
      } catch (e2) { /* fall through */ }
      return newState();
    }
  }

  function migrate(state) {
    const base = newState();
    for (const k of Object.keys(base)) if (!(k in state)) state[k] = base[k];
    if (!state.settings) state.settings = { window: 20 };
    if (typeof state.settings.window !== 'number') state.settings.window = 20;
    return state;
  }

  function exportJSON(state) { return JSON.stringify(state, null, 1); }

  function importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !obj.players || !('seq' in obj)) {
      throw new Error('Not a Tennis Legends save file');
    }
    return migrate(obj);
  }

  function storageBytes(state) { return JSON.stringify(state).length; }

  /* ---------- Players ---------- */
  function blankAttrs(fill) {
    const attrs = {};
    for (const [key] of E.ATTR_DEFS) attrs[key] = fill;
    return attrs;
  }

  // Accepts { name, country?, overall, attrs?{...}, surfaces?{hard,clay,grass} }
  // Missing attributes default to overall; missing surfaces default to 80.
  function normalisePlayer(input) {
    if (!input || !input.name || String(input.name).trim() === '') throw new Error('Player needs a name');
    const overall = clamp(Number(input.overall) || 70, 1, 99);
    const attrs = blankAttrs(overall);
    if (input.attrs && typeof input.attrs === 'object') {
      for (const [key] of E.ATTR_DEFS) {
        if (input.attrs[key] !== undefined && input.attrs[key] !== null && input.attrs[key] !== '') {
          attrs[key] = clamp(Number(input.attrs[key]), 1, 99);
        }
      }
    }
    const surfaces = { hard: 80, clay: 80, grass: 80 };
    if (input.surfaces && typeof input.surfaces === 'object') {
      for (const s of E.SURFACES) {
        if (input.surfaces[s] !== undefined && input.surfaces[s] !== null && input.surfaces[s] !== '') {
          surfaces[s] = clamp(Number(input.surfaces[s]), 1, 99);
        }
      }
    }
    return {
      name: String(input.name).trim().slice(0, 40),
      country: input.country ? String(input.country).trim().toUpperCase().slice(0, 3) : '',
      overall, attrs, surfaces
    };
  }

  function freshCareer() {
    return {
      active: true,
      elo: 1500, peakElo: 1500,
      w: 0, l: 0,
      surf: { hard: [0, 0], clay: [0, 0], grass: [0, 0] },
      titles: 0, finals: 0,
      titlesByDef: {}, finalsByDef: {},
      rank: null, bestRank: null, no1: 0,
      streak: 0, bestStreak: 0,
      tb: [0, 0], dec: [0, 0], vsTop10: [0, 0]
    };
  }

  function addPlayer(state, input) {
    const core = normalisePlayer(input);
    const p = Object.assign({ id: state.nextPlayerId++ }, core, freshCareer());
    state.players[p.id] = p;
    return p;
  }

  function updatePlayer(state, id, input) {
    const p = state.players[id];
    if (!p) throw new Error('No such player');
    const core = normalisePlayer(Object.assign({ name: p.name }, input));
    p.name = core.name;
    p.country = core.country !== '' ? core.country : p.country;
    p.overall = core.overall;
    p.attrs = core.attrs;
    p.surfaces = core.surfaces;
    return p;
  }

  function importPlayers(state, text) {
    let data = JSON.parse(text);
    if (!Array.isArray(data)) data = [data];
    const added = [];
    for (const item of data) added.push(addPlayer(state, item));
    return added;
  }

  function playerHasHistory(state, id) {
    return state.matches.some(m => m.a === id || m.b === id);
  }

  function deletePlayer(state, id) {
    if (state.active) throw new Error('Finish or cancel the active tournament first');
    if (playerHasHistory(state, id)) throw new Error('This player has match history — retire them instead');
    delete state.players[id];
  }

  /* ---------- Elo ---------- */
  function eloExpected(ra, rb) { return 1 / (1 + Math.pow(10, (rb - ra) / 400)); }

  function eloK(pointsBase) {
    return Math.max(12, Math.min(40, Math.round(10 + pointsBase / 80)));
  }

  /* ---------- Head-to-head ---------- */
  function h2hKey(a, b) { return a < b ? a + '_' + b : b + '_' + a; }

  function h2hGet(state, a, b) {
    const rec = state.h2h[h2hKey(a, b)] || [0, 0];
    return a < b ? { aWins: rec[0], bWins: rec[1] } : { aWins: rec[1], bWins: rec[0] };
  }

  function h2hAdd(state, winner, loser) {
    const key = h2hKey(winner, loser);
    if (!state.h2h[key]) state.h2h[key] = [0, 0];
    state.h2h[key][winner < loser ? 0 : 1]++;
  }

  /* ---------- Applying a main-draw result ---------- */
  function applyMatchResult(state, instance, roundIdx, roundName, pA, pB, result) {
    const winner = result.winner === 0 ? pA : pB;
    const loser = result.winner === 0 ? pB : pA;

    // Elo
    const K = eloK(instance.pointsBase);
    const exp = eloExpected(winner.elo, loser.elo);
    const delta = Math.round(K * (1 - exp));
    const upset = winner.elo < loser.elo - 20;
    winner.elo += delta;
    loser.elo -= delta;
    if (winner.elo > winner.peakElo) winner.peakElo = winner.elo;

    // W/L + surface
    winner.w++; loser.l++;
    const sf = instance.surface;
    winner.surf[sf][0]++; loser.surf[sf][1]++;

    // Streaks
    winner.streak++; if (winner.streak > winner.bestStreak) winner.bestStreak = winner.streak;
    loser.streak = 0;

    // Tie-break sets & deciding sets
    for (const s of result.sets) {
      if (s.tb) {
        const setWinner = s.games[0] > s.games[1] ? 0 : 1;
        const wp = setWinner === result.winner ? winner : loser;
        const lp = setWinner === result.winner ? loser : winner;
        wp.tb[0]++; lp.tb[1]++;
      }
    }
    if (result.decider) { winner.dec[0]++; loser.dec[1]++; }

    // vs top 10 (by current ranking at time of match)
    if (loser.rank && loser.rank <= 10) winner.vsTop10[0]++;
    if (winner.rank && winner.rank <= 10) loser.vsTop10[1]++;

    // H2H + match log
    h2hAdd(state, winner.id, loser.id);
    const rec = {
      i: state.nextMatchId++,
      t: instance.id, rd: roundIdx, rn: roundName,
      a: pA.id, b: pB.id, w: winner.id,
      s: result.scoreStr, sf, m: result.minutes,
      up: upset ? 1 : 0, d: delta,
      st: [
        result.stats[0].aces, result.stats[1].aces,
        result.stats[0].breaks, result.stats[1].breaks,
        result.stats[0].pts, result.stats[1].pts
      ]
    };
    if (result.events && result.events.length) {
      rec.inj = result.events.map(ev => (ev.player === 0 ? pA.id : pB.id) + ':' + ev.afterSet);
    }
    state.matches.push(rec);
    return { winner, loser, delta, upset, rec };
  }

  const Data = {
    SAVE_KEY, BACKUP_KEY,
    newState, save, load, exportJSON, importJSON, storageBytes,
    normalisePlayer, addPlayer, updatePlayer, importPlayers,
    playerHasHistory, deletePlayer,
    eloExpected, eloK, h2hGet, h2hAdd, applyMatchResult, blankAttrs
  };
  global.TennisData = Data;
})(typeof window !== 'undefined' ? window : globalThis);
