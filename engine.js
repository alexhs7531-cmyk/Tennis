/* ============================================================
   TENNIS LEGENDS — Match Engine
   Point-by-point simulation. DOM-free (runs in browser + node).
   Calibrated so that (best of 5, neutral surfaces):
     Prime Djokovic (98) beats Prime Kafelnikov (91) ~84%
     Prime Nadal   (98) beats Prime Haas       (90) ~87%
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- Tuning constants (set by Monte Carlo calibration) ---------- */
  const T = {
    BASE_SERVE: 0.615,      // point-win chance for server between equal players
    PT_SCALE: 0.0016,       // probability shift per rating-point of advantage
    SURF_W: 0.70,           // weight of surface-affinity difference (a 20-pt surface gap swings a match heavily)
    OVR_W: 1.2,             // weight of the Overall Ability gap (scout's judgement)
    MNT_W: 0.10,            // constant mental influence
    BIG_W: 0.60,            // big-point (break/set/match point) influence
    TB_W: 0.28,             // tie-break skill influence inside tie-breaks
    FORM_BASE: 1.0,         // per-match form sigma floor (rating points)
    FORM_PER: 0.08,         // extra sigma per point below 99 Consistency Over Tournament
    FORM_DOWN: 0.14,        // inconsistent players play below their sheet more often
    MOM_GAIN: 0.35,         // momentum gained per game won
    MOM_DECAY: 0.86,        // momentum decay per game
    MOM_CAP: 1.4,           // momentum cap (rating points)
    MOM_W: 0.55,            // momentum influence
    FATIGUE_W: 0.85,        // fatigue influence per accumulated unit
    DECIDER_FATIGUE: 1.30,  // fatigue multiplier in the deciding set
    DECIDER_MNT: 0.15,      // extra mental weight in the deciding set
    INJ_PER_SET: 0.6,       // scales in-match knock probability (cubic in fragility)
    GRASS_SERVE: 0.020,     // faster surface: serve worth more
    CLAY_SERVE: -0.018,     // slower surface: serve worth less
    HARD_SERVE: 0.004
  };

  /* ---------- Attribute schema ---------- */
  const ATTR_DEFS = [
    ['forehand', 'Forehand'], ['backhand', 'Backhand'], ['serve', 'Serve'],
    ['firstServe', 'First Serve Accuracy'], ['returnServe', 'Return of Serve'],
    ['volley', 'Volley'], ['smash', 'Smash'], ['slice', 'Slice'],
    ['passing', 'Passing Shots'], ['consistency', 'Groundstroke Consistency'],
    ['power', 'Power'], ['depth', 'Depth of Shot'], ['angle', 'Angle Creation'],
    ['defense', 'Defensive Skills'], ['coverage', 'Court Coverage'],
    ['footwork', 'Footwork'], ['speed', 'Speed'], ['acceleration', 'Acceleration'],
    ['agility', 'Agility'], ['balance', 'Balance'], ['flexibility', 'Flexibility'],
    ['endurance', 'Endurance'], ['recovery', 'Recovery Between Points'],
    ['mental', 'Mental Toughness'], ['composure', 'Composure'],
    ['concentration', 'Concentration'], ['spirit', 'Competitive Spirit'],
    ['tactical', 'Tactical Intelligence'], ['adaptability', 'Match Adaptability'],
    ['shotSelection', 'Shot Selection'], ['anticipation', 'Anticipation'],
    ['bigPoint', 'Big Point Performance'], ['tiebreak', 'Tie-break Ability'],
    ['clutchServe', 'Clutch Serving'], ['clutchReturn', 'Clutch Returning'],
    ['tournamentConsistency', 'Consistency Over Tournament'],
    ['injuryResistance', 'Injury Resistance']
  ];
  const ATTR_GROUPS = {
    'Technique': ['forehand', 'backhand', 'serve', 'firstServe', 'returnServe', 'volley', 'smash', 'slice', 'passing', 'consistency'],
    'Ball Striking': ['power', 'depth', 'angle', 'shotSelection'],
    'Defence & Movement': ['defense', 'coverage', 'footwork', 'speed', 'acceleration', 'agility', 'balance', 'flexibility'],
    'Physical': ['endurance', 'recovery', 'injuryResistance'],
    'Mental': ['mental', 'composure', 'concentration', 'spirit', 'bigPoint', 'tiebreak', 'clutchServe', 'clutchReturn', 'tournamentConsistency'],
    'Tactical': ['tactical', 'adaptability', 'anticipation']
  };
  const SURFACES = ['hard', 'clay', 'grass'];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------- Composite ratings ---------- */
  function derive(p) {
    const a = p.attrs;
    const SRV = 0.42 * a.serve + 0.24 * a.firstServe + 0.20 * a.power + 0.14 * a.depth;
    const RET = 0.48 * a.returnServe + 0.22 * a.anticipation + 0.16 * a.passing + 0.14 * a.agility;
    const GRD = 0.14 * a.forehand + 0.14 * a.backhand + 0.14 * a.consistency +
      0.08 * a.depth + 0.08 * a.angle + 0.08 * a.power + 0.08 * a.shotSelection +
      0.04 * a.slice + 0.07 * a.tactical + 0.06 * a.anticipation +
      0.05 * a.volley + 0.04 * a.smash;
    const MOV = 0.20 * a.defense + 0.18 * a.coverage + 0.14 * a.speed +
      0.13 * a.footwork + 0.11 * a.agility + 0.08 * a.acceleration +
      0.07 * a.balance + 0.05 * a.flexibility + 0.04 * a.anticipation;
    const MNT = 0.26 * a.mental + 0.22 * a.composure + 0.20 * a.concentration +
      0.16 * a.spirit + 0.16 * a.adaptability;
    const PHY = 0.55 * a.endurance + 0.33 * a.recovery + 0.12 * a.flexibility;
    const BIG_S = 0.65 * a.bigPoint + 0.35 * a.clutchServe;
    const BIG_R = 0.65 * a.bigPoint + 0.35 * a.clutchReturn;
    return { SRV, RET, GRD, MOV, MNT, PHY, BIG_S, BIG_R, TB: a.tiebreak };
  }

  function gaussian(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /* ---------- Point probability ----------
     ctx: { bigPoint, tiebreak, decider }
     side objects: { d(derived), form, mom, fatigue, injury, surf } */
  function pointProb(server, returner, surface, ctx) {
    const s = server, r = returner;
    let base = T.BASE_SERVE +
      (surface === 'grass' ? T.GRASS_SERVE : surface === 'clay' ? T.CLAY_SERVE : T.HARD_SERVE);

    const srvSide = 0.52 * s.d.SRV + 0.30 * s.d.GRD + 0.18 * s.d.MOV;
    const retSide = 0.40 * r.d.RET + 0.34 * r.d.GRD + 0.26 * r.d.MOV;

    let diff = srvSide - retSide;
    diff += (s.ovr - r.ovr) * T.OVR_W;
    diff += (s.d.MNT - r.d.MNT) * T.MNT_W;
    diff += (s.surf - r.surf) * T.SURF_W;
    diff += (s.form - r.form);
    diff += (s.mom - r.mom) * T.MOM_W;
    diff -= (s.fatigue - r.fatigue) * T.FATIGUE_W * (ctx.decider ? T.DECIDER_FATIGUE : 1);
    diff -= (s.injury - r.injury);

    if (ctx.decider) diff += (s.d.MNT - r.d.MNT) * T.DECIDER_MNT;
    if (ctx.tiebreak) diff += (s.d.TB - r.d.TB) * T.TB_W;
    if (ctx.bigPoint) diff += (s.d.BIG_S - r.d.BIG_R) * T.BIG_W;

    return clamp(base + diff * T.PT_SCALE, 0.05, 0.95);
  }

  function aceChance(server, returner, surface) {
    const retQ = 0.6 * returner.player.attrs.returnServe + 0.4 * returner.player.attrs.anticipation;
    let p = 0.05 + (server.d.SRV - retQ) * 0.005 +
      (server.player.attrs.serve + server.player.attrs.power - 176) * 0.0022;
    if (surface === 'grass') p += 0.03;
    if (surface === 'clay') p -= 0.02;
    return clamp(p, 0.02, 0.30);
  }

  /* ---------- Match simulation ----------
     playerA / playerB: { id?, name, attrs:{...}, surfaces:{hard,clay,grass} }
     opts: { bestOf: 3|5, surface: 'hard'|'clay'|'grass', rng } */
  function simulateMatch(playerA, playerB, opts) {
    const bestOf = opts.bestOf === 3 ? 3 : 5;
    const surface = SURFACES.includes(opts.surface) ? opts.surface : 'hard';
    const rng = opts.rng || Math.random;
    const setsToWin = (bestOf + 1) / 2;

    const mk = (player) => {
      const d = derive(player);
      const tc = player.attrs.tournamentConsistency;
      const sigma = T.FORM_BASE + (99 - tc) * T.FORM_PER;
      return {
        player, d,
        ovr: player.overall || Math.round((d.SRV + d.RET + d.GRD + d.MOV + d.MNT) / 5),
        form: clamp(gaussian(rng) * sigma, -3 * sigma, 3 * sigma) - (99 - tc) * T.FORM_DOWN,
        mom: 0, fatigue: 0, injury: 0,
        surf: (player.surfaces && player.surfaces[surface]) || 80,
        fatigueRate: Math.max(0.08, 1 - d.PHY / 140)
      };
    };
    const P = [mk(playerA), mk(playerB)];
    const stats = [
      { pts: 0, svcPts: 0, svcWon: 0, aces: 0, bpFaced: 0, bpSaved: 0, breaks: 0 },
      { pts: 0, svcPts: 0, svcWon: 0, aces: 0, bpFaced: 0, bpSaved: 0, breaks: 0 }
    ];
    const events = [];
    const sets = [];
    const setWins = [0, 0];
    let server = rng() < 0.5 ? 0 : 1;
    let totalPoints = 0, totalGames = 0;

    const playPoint = (srv, ctx) => {
      const rcv = 1 - srv;
      const p = pointProb(P[srv], P[rcv], surface, ctx);
      totalPoints++;
      const srvWins = rng() < p;
      stats[srv].svcPts++;
      if (srvWins) {
        stats[srv].svcWon++;
        stats[srv].pts++;
        if (rng() < aceChance(P[srv], P[rcv], surface)) stats[srv].aces++;
      } else {
        stats[rcv].pts++;
      }
      return srvWins ? srv : rcv;
    };

    const playGame = (srv, games, decider) => {
      const rcv = 1 - srv;
      const sc = [0, 0]; // 0,1,2,3 = 0/15/30/40, then advantage handling
      for (;;) {
        const srvGamePt = sc[srv] >= 3 && sc[srv] >= sc[rcv] + 1;
        const rcvBreakPt = sc[rcv] >= 3 && sc[rcv] >= sc[srv] + 1;
        const big = srvGamePt || rcvBreakPt;
        if (rcvBreakPt) stats[srv].bpFaced++; // server faces a break point
        const w = playPoint(srv, { bigPoint: big, tiebreak: false, decider });
        if (rcvBreakPt && w === srv) stats[srv].bpSaved++;
        sc[w]++;
        if (sc[w] >= 4 && sc[w] >= sc[1 - w] + 2) {
          if (w === rcv) stats[rcv].breaks++;
          return w;
        }
        if (sc[0] === 4 && sc[1] === 4) { sc[0] = 3; sc[1] = 3; } // deuce reset
      }
    };

    const playTiebreak = (firstSrv, target, decider, matchOnLine) => {
      const sc = [0, 0];
      let srv = firstSrv, played = 0;
      for (;;) {
        const setPt = sc[0] >= target - 1 || sc[1] >= target - 1;
        const w = playPoint(srv, {
          bigPoint: setPt, tiebreak: true, decider
        });
        sc[w]++;
        played++;
        if (sc[w] >= target && sc[w] >= sc[1 - w] + 2) return { winner: w, score: sc.slice() };
        if (played % 2 === 1) srv = 1 - srv; // serve change after 1st point, then every 2
      }
    };

    while (setWins[0] < setsToWin && setWins[1] < setsToWin) {
      const decider = (setWins[0] === setsToWin - 1 && setWins[1] === setsToWin - 1);
      const games = [0, 0];
      let tb = null;
      for (;;) {
        if (games[0] === 6 && games[1] === 6) {
          const target = decider ? 10 : 7;
          tb = playTiebreak(server, target, decider, decider);
          games[tb.winner]++;
          server = 1 - server; // next set: alternation continues after TB
          break;
        }
        const w = playGame(server, games, decider);
        games[w]++;
        totalGames++;
        // momentum
        P[w].mom = clamp(P[w].mom * T.MOM_DECAY + T.MOM_GAIN, -T.MOM_CAP, T.MOM_CAP);
        P[1 - w].mom = clamp(P[1 - w].mom * T.MOM_DECAY - T.MOM_GAIN * 0.6, -T.MOM_CAP, T.MOM_CAP);
        server = 1 - server;
        if (games[w] >= 6 && games[w] >= games[1 - w] + 2) break;
      }
      const setWinner = games[0] > games[1] ? 0 : 1;
      setWins[setWinner]++;
      sets.push({ games: games.slice(), tb: tb ? tb.score : null });

      // fatigue accrues with set length
      const load = (games[0] + games[1]) / 10;
      P.forEach(pl => { pl.fatigue += load * pl.fatigueRate; });

      // possible knock (in-match only, no lasting effect)
      if (setWins[0] < setsToWin && setWins[1] < setsToWin) {
        P.forEach((pl, i) => {
          const ir = pl.player.attrs.injuryResistance;
          const chance = Math.pow((99 - ir) / 99, 3) * T.INJ_PER_SET;
          if (pl.injury === 0 && rng() < chance) {
            pl.injury = 2 + rng() * 4;
            events.push({ type: 'injury', player: i, afterSet: sets.length });
          }
        });
      }
    }

    const winner = setWins[0] > setWins[1] ? 0 : 1;
    const scoreStr = sets.map(s => {
      const g = winner === 0 ? [s.games[0], s.games[1]] : [s.games[1], s.games[0]];
      let str = g[0] + '-' + g[1];
      if (s.tb) str += '(' + Math.min(s.tb[0], s.tb[1]) + ')';
      return str;
    }).join(' ');

    const paceMin = surface === 'clay' ? 0.80 : surface === 'grass' ? 0.62 : 0.71;
    const minutes = Math.round(totalPoints * paceMin + sets.length * 4);

    return {
      winner, sets, setWins: setWins.slice(), scoreStr, stats, events,
      surface, bestOf, totalPoints, minutes,
      decider: sets.length === bestOf,
      hadTiebreak: sets.some(s => s.tb)
    };
  }

  const Engine = { T, ATTR_DEFS, ATTR_GROUPS, SURFACES, derive, simulateMatch, clamp };
  global.TennisEngine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
