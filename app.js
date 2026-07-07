/* ============================================================
   TENNIS LEGENDS — App controller
   Boot, autosave, delegated events.
   ============================================================ */
(function () {
  'use strict';
  const E = window.TennisEngine;
  const D = window.TennisData;
  const T = window.TennisTournament;
  const UI = window.TennisUI;

  let state;
  try { state = D.load(); }
  catch (e) { state = D.newState(); }

  function save() {
    try {
      D.save(state);
      UI.lastSaved = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      UI.toast('Could not save — storage may be full. Export a backup now.');
    }
  }

  const num = (id, fallback) => {
    const v = document.getElementById(id) ? document.getElementById(id).value : '';
    return v === '' ? fallback : Number(v);
  };
  const txt = id => (document.getElementById(id) ? document.getElementById(id).value : '');

  function readPlayerForm() {
    const attrs = {};
    document.querySelectorAll('[data-attr]').forEach(inp => {
      if (inp.value !== '') attrs[inp.dataset.attr] = Number(inp.value);
    });
    return {
      name: txt('pe-name').trim(),
      country: txt('pe-country').trim().toUpperCase(),
      overall: num('pe-overall', 75),
      surfaces: { hard: num('pe-hard', 80), clay: num('pe-clay', 80), grass: num('pe-grass', 80) },
      attrs
    };
  }

  function readDefForm() {
    return {
      name: txt('te-name').trim(),
      surface: txt('te-surface'),
      drawSize: num('te-draw', 128),
      bestOf: num('te-bestof', 5),
      points: num('te-points', 2000),
      quali: num('te-quali', undefined),
      wild: num('te-wild', undefined)
    };
  }

  /* ---------------- actions ---------------- */
  const actions = {
    /* tour */
    newDef() { UI.sheetTournamentEditor(state, null); },
    editDef(id) { UI.sheetTournamentEditor(state, Number(id)); },
    saveNewDef() {
      const input = readDefForm();
      if (!input.name) return UI.toast('Give the tournament a name');
      T.createDef(state, input);
      UI.closeSheet(); save(); UI.refresh(state);
      UI.toast('Tournament created');
    },
    saveEditDef(id) {
      const input = readDefForm();
      if (!input.name) return UI.toast('Give the tournament a name');
      T.updateDef(state, Number(id), input);
      UI.closeSheet(); save(); UI.refresh(state);
    },
    deleteDef(id) {
      if (!confirm('Delete this tournament? Its past champions stay on the records.')) return;
      try { T.deleteDef(state, Number(id)); } catch (e) { return UI.toast(e.message); }
      UI.closeSheet(); save(); UI.refresh(state);
    },
    ptsPreset(v) {
      const inp = document.getElementById('te-points');
      if (inp) inp.value = v;
    },
    startDef(id) {
      try {
        T.startTournament(state, Number(id));
        UI.roundSel = null;
        UI.lastCrown = null;
        save(); UI.refresh(state);
      } catch (e) { UI.toast(e.message); }
    },
    round(i) { UI.roundSel = Number(i); UI.refresh(state); },
    play(_, el) {
      const r = Number(el.dataset.r), i = Number(el.dataset.i);
      try {
        const res = T.playMatch(state, r, i);
        save(); UI.refresh(state);
        if (res.finished) UI.toast('We have a champion 🏆');
      } catch (e) { UI.toast(e.message); }
    },
    report(id) { UI.sheetMatchReport(state, id); },
    crown() {
      try {
        const inst = state.active;
        const fin = T.finalizeTournament(state);
        UI.lastCrown = {
          name: fin.champ.name, event: inst.name, edition: inst.edition,
          score: fin.finalScore, pts: inst.pointsBase,
          rank: fin.champ.rank,
          no1: state.rankings.length ? state.players[state.rankings[0].id].name : null
        };
        UI.roundSel = null;
        save(); UI.refresh(state);
      } catch (e) { UI.toast(e.message); }
    },
    cancelT() {
      if (!confirm('Cancel this tournament? No champion will be crowned, but matches already played stay on every record.')) return;
      T.cancelTournament(state);
      UI.roundSel = null;
      save(); UI.refresh(state);
    },

    /* players */
    addPlayer() { UI.sheetPlayerEditor(state, null); },
    editPlayer(id) { UI.sheetPlayerEditor(state, Number(id)); },
    saveNewPlayer() {
      const input = readPlayerForm();
      if (!input.name) return UI.toast('The player needs a name');
      const p = D.addPlayer(state, input);
      UI.closeSheet(); save(); UI.refresh(state);
      UI.toast(p.name + ' joins the tour');
    },
    saveEditPlayer(id) {
      const input = readPlayerForm();
      if (!input.name) return UI.toast('The player needs a name');
      D.updatePlayer(state, Number(id), input);
      UI.closeSheet(); save(); UI.refresh(state);
    },
    fillAttrs() {
      const ovr = num('pe-overall', 75);
      document.querySelectorAll('[data-attr]').forEach(inp => { if (inp.value === '') inp.value = ovr; });
    },
    importPlayers() { UI.sheetImportPlayers(); },
    doImportPlayers() {
      try {
        const added = D.importPlayers(state, txt('imp-text'));
        UI.closeSheet(); save(); UI.refresh(state);
        UI.toast(added.length + ' player' + (added.length === 1 ? '' : 's') + ' imported');
      } catch (e) { UI.toast('Import failed: ' + e.message); }
    },
    profile(id) { UI.sheetProfile(state, Number(id)); },
    toggleRetire(id) {
      const p = state.players[Number(id)];
      if (!p) return;
      p.active = !p.active;
      save(); UI.sheetProfile(state, p.id); UI.refresh(state);
      UI.toast(p.active ? p.name + ' is back on tour' : p.name + ' has retired');
    },
    deletePlayer(id) {
      const p = state.players[Number(id)];
      if (!p) return;
      if (D.playerHasHistory(state, p.id)) {
        return UI.toast('Players with match history can\'t be deleted — retire them instead');
      }
      if (!confirm('Delete ' + p.name + ' for good?')) return;
      D.deletePlayer(state, p.id);
      UI.closeSheet(); save(); UI.refresh(state);
    },

    /* rankings + records */
    rankMode(m) { UI.rankMode = m; UI.refresh(state); },
    wallAll() { UI.wallAll = true; UI.refresh(state); },
    h2h() {
      const a = Number(txt('h2h-a')), b = Number(txt('h2h-b'));
      const out = document.getElementById('h2h-out');
      if (!a || !b) return UI.toast('Pick two players');
      if (a === b) return UI.toast('Pick two different players');
      out.innerHTML = UI.h2hResultHTML(state, a, b);
    },

    /* more */
    export() {
      const blob = new Blob([D.exportJSON(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      a.download = 'tennis-legends-backup-' + d.toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      UI.toast('Backup exported — keep it somewhere safe');
    },
    importSave() { document.getElementById('import-file').click(); },
    saveWindow() {
      const w = Math.max(0, Math.min(200, num('win-input', 20)));
      state.settings.window = w;
      T.recomputeRankings(state);
      save(); UI.refresh(state);
      UI.toast(w === 0 ? 'Rankings now count everything ever played' : 'Rankings now count the last ' + w + ' tournaments');
    },
    reset() {
      if (!confirm('Erase EVERYTHING — every player, match and champion?')) return;
      if (!confirm('Last chance. This cannot be undone unless you have a backup.')) return;
      state = D.newState();
      save(); UI.roundSel = null; UI.lastCrown = null; UI.refresh(state);
      UI.toast('A blank page. Build a new era.');
    },

    closeSheet() { UI.closeSheet(); }
  };

  /* ---------------- wiring ---------------- */
  document.addEventListener('click', e => {
    const nav = e.target.closest('nav.tabs [data-view]');
    if (nav) { UI.view = nav.dataset.view; UI.refresh(state); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el.dataset.id, el);
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'p-search') {
      UI.playerSearch = e.target.value;
      const pos = e.target.selectionStart;
      UI.renderPlayers(state);
      const inp = document.getElementById('p-search');
      inp.focus();
      try { inp.setSelectionRange(pos, pos); } catch (_) { /* number/search quirks */ }
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'p-sort') { UI.playerSort = e.target.value; UI.refresh(state); }
    if (e.target.id === 'te-draw') {
      const s = T.defaultSlots(Number(e.target.value));
      const q = document.getElementById('te-quali'), w = document.getElementById('te-wild');
      if (q) q.value = s.quali;
      if (w) w.value = s.wild;
    }
    if (e.target.id === 'import-file') {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const incoming = D.importJSON(reader.result);
          if (!confirm('Replace your current world with this backup? Your current save will be overwritten.')) return;
          state = incoming;
          save(); UI.roundSel = null; UI.lastCrown = null; UI.refresh(state);
          UI.toast('Backup restored');
        } catch (err) { UI.toast('That doesn\'t look like a Tennis Legends save'); }
      };
      reader.readAsText(file);
    }
  });

  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target.id === 'overlay') UI.closeSheet();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeSheet(); });

  /* boot */
  UI.refresh(state);
})();
