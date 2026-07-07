/* ============================================================
   TENNIS LEGENDS — Records layer
   Leader boards, career summaries, head-to-heads, champions wall.
   DOM-free (runs in browser + node).
   ============================================================ */
(function (global) {
  'use strict';
  const D = global.TennisData;

  const pct = (w, l) => (w + l === 0 ? 0 : (100 * w) / (w + l));

  function playersArr(state) { return Object.values(state.players); }

  function leaders(state, minMatches) {
    const min = minMatches === undefined ? 20 : minMatches;
    const all = playersArr(state);
    const played = all.filter(p => p.w + p.l > 0);
    const top = (arr, key, n) => arr.slice().sort((a, b) => key(b) - key(a) || b.w - a.w || a.id - b.id).slice(0, n || 10).filter(p => key(p) > 0);
    return {
      titles: top(all, p => p.titles),
      finals: top(all, p => p.finals),
      wins: top(played, p => p.w),
      winPct: played.filter(p => p.w + p.l >= min)
        .sort((a, b) => pct(b.w, b.l) - pct(a.w, a.l) || b.w - a.w).slice(0, 10),
      peakElo: top(played, p => p.peakElo),
      bestStreak: top(played, p => p.bestStreak),
      no1: top(all, p => p.no1),
      vsTop10: top(played, p => p.vsTop10[0])
    };
  }

  function titlesByTournament(state) {
    // For each tournament definition: who has won it most.
    const out = [];
    for (const def of Object.values(state.defs)) {
      const holders = playersArr(state)
        .filter(p => (p.titlesByDef[def.id] || 0) > 0)
        .sort((a, b) => (b.titlesByDef[def.id] || 0) - (a.titlesByDef[def.id] || 0))
        .slice(0, 3)
        .map(p => ({ player: p, count: p.titlesByDef[def.id] }));
      if (holders.length) out.push({ def, holders });
    }
    return out.sort((a, b) => b.def.points - a.def.points);
  }

  function bigTitles(state, threshold) {
    // Titles at events worth >= threshold points ("majors").
    const th = threshold || 1500;
    const counts = {};
    for (const ev of state.completed) {
      if (ev.pointsBase >= th) counts[ev.champ] = (counts[ev.champ] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([pid, c]) => ({ player: state.players[pid], count: c }))
      .filter(r => r.player)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  function career(state, pid) {
    const p = state.players[pid];
    if (!p) return null;
    const matches = state.matches.filter(m => m.a === pid || m.b === pid);
    const titlesList = state.completed.filter(ev => ev.champ === pid);
    const finalsLost = state.completed.filter(ev => ev.runnerUp === pid);
    return {
      player: p,
      w: p.w, l: p.l, winPct: pct(p.w, p.l),
      surf: p.surf, tb: p.tb, dec: p.dec, vsTop10: p.vsTop10,
      matches: matches.slice(-500).reverse(),
      totalMatches: matches.length,
      titlesList: titlesList.reverse(),
      finalsLost: finalsLost.reverse()
    };
  }

  function h2hDetail(state, aId, bId) {
    const rec = D.h2hGet(state, aId, bId);
    const matches = state.matches.filter(m =>
      (m.a === aId && m.b === bId) || (m.a === bId && m.b === aId)).reverse();
    return { rec, matches };
  }

  function championsWall(state) { return state.completed.slice().reverse(); }

  function opponentsFaced(state, pid) {
    const seen = new Map();
    for (const m of state.matches) {
      if (m.a === pid) seen.set(m.b, true);
      else if (m.b === pid) seen.set(m.a, true);
    }
    return [...seen.keys()].map(id => state.players[id]).filter(Boolean);
  }

  const Records = { pct, leaders, titlesByTournament, bigTitles, career, h2hDetail, championsWall, opponentsFaced };
  global.TennisRecords = Records;
})(typeof window !== 'undefined' ? window : globalThis);
