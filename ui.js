/* ============================================================
   TENNIS LEGENDS — UI layer
   Rendering for all views + bottom-sheet modals.
   ============================================================ */
(function (global) {
  'use strict';
  const E = global.TennisEngine;
  const D = global.TennisData;
  const T = global.TennisTournament;
  const R = global.TennisRecords;

  const $ = sel => document.querySelector(sel);

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmt = n => Number(n || 0).toLocaleString('en-GB');
  const pct1 = (w, l) => (w + l === 0 ? '–' : ((100 * w) / (w + l)).toFixed(1) + '%');

  const SURF_NAME = { hard: 'Hard', clay: 'Clay', grass: 'Grass' };
  const surfChip = s => `<span class="chip"><span class="dot ${s}"></span>${SURF_NAME[s]}</span>`;

  const UI = {
    view: 'tour',
    roundSel: null,
    playerSearch: '',
    playerSort: 'overall',
    rankMode: 'points',
    wallAll: false,
    lastCrown: null,
    lastSaved: null,

    esc, fmt,

    toast(msg) {
      const t = $('#toast');
      t.textContent = msg;
      t.classList.add('on');
      clearTimeout(UI._toastTimer);
      UI._toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
    },

    /* ---------------- shell ---------------- */
    refresh(state) {
      document.querySelectorAll('nav.tabs button').forEach(b =>
        b.classList.toggle('on', b.dataset.view === UI.view));
      document.querySelectorAll('.view').forEach(v =>
        v.classList.toggle('on', v.id === 'view-' + UI.view));
      const render = {
        tour: UI.renderTour, players: UI.renderPlayers, rankings: UI.renderRankings,
        records: UI.renderRecords, more: UI.renderMore
      }[UI.view];
      render(state);
    },

    /* ---------------- TOUR ---------------- */
    renderTour(state) {
      const el = $('#view-tour');
      if (state.active) { el.innerHTML = UI.activeTournamentHTML(state); return; }

      let crownHTML = '';
      if (UI.lastCrown) {
        const c = UI.lastCrown;
        crownHTML = `
          <div class="crown">
            <div class="lbl">Champion · ${esc(c.event)} ${c.edition ? 'No.' + c.edition : ''}</div>
            <div class="who">${esc(c.name)}</div>
            <div class="mono small muted">${esc(c.score)}</div>
            <div class="small muted mt">+${fmt(c.pts)} ranking points ${c.rank ? '· now world No.' + c.rank : ''}</div>
            ${c.no1 ? `<div class="tiny faint mt">World No.1: ${esc(c.no1)}</div>` : ''}
          </div>`;
      }

      const defs = Object.values(state.defs);
      const cards = defs.map(d => {
        const lastWin = state.completed.slice().reverse().find(ev => ev.defId === d.id);
        const holder = lastWin && state.players[lastWin.champ];
        return `
        <div class="card t-card">
          <div class="row">
            <div class="grow">
              <div class="name">${esc(d.name)}</div>
              <div class="t-meta">
                ${surfChip(d.surface)}
                <span class="chip">${d.drawSize} draw</span>
                <span class="chip">Best of ${d.bestOf}</span>
                <span class="chip" style="color:var(--gold-bright);border-color:var(--gold)">${fmt(d.points)} pts</span>
              </div>
              <div class="tiny faint mt">
                ${d.editions > 0 ? `Held ${d.editions}× ${holder ? '· holder: ' + esc(holder.name) : ''}` : 'Never held'}
              </div>
            </div>
          </div>
          <div class="row mt">
            <button class="btn primary grow" data-act="startDef" data-id="${d.id}">Start tournament</button>
            <button class="btn sm" data-act="editDef" data-id="${d.id}">Edit</button>
          </div>
        </div>`;
      }).join('');

      const playerCount = Object.values(state.players).filter(p => p.active).length;
      el.innerHTML = `
        ${crownHTML}
        <div class="section-label">The Tour</div>
        ${defs.length ? cards : `
          <div class="empty">
            <div class="big">No tournaments yet</div>
            Create your first event — you decide what gets played and when.
          </div>`}
        <button class="btn gold wide" data-act="newDef">+ New tournament</button>
        <div class="tiny faint center mt">${playerCount} active player${playerCount === 1 ? '' : 's'} in the pool</div>`;
    },

    activeTournamentHTML(state) {
      const inst = state.active;
      const finished = T.isFinished(inst);
      const cur = Math.min(T.currentRoundIdx(inst), inst.rounds.length - 1);
      if (UI.roundSel === null || UI.roundSel >= inst.rounds.length) UI.roundSel = cur;
      const sel = UI.roundSel;

      const tagVals = Object.values(inst.tags || {});
      const qCount = tagVals.filter(t => t === 'Q').length;
      const wCount = tagVals.filter(t => t === 'WC').length;
      const byeCount = inst.rounds[0].filter(m => m.a === 'BYE' || m.b === 'BYE').length;
      const direct = inst.size - qCount - wCount - byeCount;

      let crown = '';
      if (finished) {
        const champ = state.players[inst.rounds[inst.rounds.length - 1][0].w];
        crown = `
          <div class="crown">
            <div class="lbl">Your champion</div>
            <div class="who">${esc(champ.name)}</div>
            <button class="btn gold mt" data-act="crown">Add to the honours board</button>
          </div>`;
      }

      const rail = inst.roundNames.map((rn, i) => {
        const done = inst.rounds[i].every(m => m.w !== null);
        return `<button data-act="round" data-id="${i}" class="${i === sel ? 'on' : done ? 'done' : ''}">${rn}</button>`;
      }).join('');

      const playedInRound = inst.rounds[sel].filter(m => m.w !== null && m.s !== 'bye').length;
      const totalInRound = inst.rounds[sel].filter(m => m.s !== 'bye').length;

      const matches = inst.rounds[sel].map((m, i) => UI.matchCardHTML(state, inst, sel, i, m)).join('');

      return `
        ${crown}
        <div class="card">
          <div class="h-display" style="font-size:20px">${esc(inst.name)} <span class="muted" style="font-size:14px">No.${inst.edition}</span></div>
          <div class="t-meta">
            ${surfChip(inst.surface)}
            <span class="chip">${inst.size} draw</span>
            <span class="chip">Best of ${inst.bestOf}</span>
            <span class="chip" style="color:var(--gold-bright);border-color:var(--gold)">${fmt(inst.pointsBase)} pts</span>
          </div>
          <div class="tiny faint mt">${direct} direct entries${qCount ? ` · ${qCount} through qualifying` : ''}${wCount ? ` · ${wCount} wildcards` : ''}${byeCount ? ` · ${byeCount} byes` : ''}</div>
        </div>
        <div class="rail">${rail}</div>
        <div class="tiny faint" style="margin:-4px 2px 10px">${inst.roundNames[sel]} · ${playedInRound}/${totalInRound} played</div>
        ${matches}
        ${!finished ? `<button class="btn danger sm wide mt" data-act="cancelT">Cancel tournament</button>` : ''}`;
    },

    matchCardHTML(state, inst, rIdx, mIdx, m) {
      const head = `<div class="m-head"><span>${inst.roundNames[rIdx]} · Match ${mIdx + 1}</span><span>${esc(inst.name)}</span></div>`;

      if (m.s === 'bye') {
        const p = state.players[m.w];
        return `<div class="match"><div class="m-body">
          <div class="m-row winner">${UI.seedCell(inst, m.w)}<span class="pname grow ellip">${esc(p.name)}</span><span class="tiny faint">bye — through to the next round</span></div>
        </div></div>`;
      }

      const rowFor = (pid, other) => {
        if (pid === null) return `<div class="m-row"><span class="seed"></span><span class="pname grow faint">Awaiting result</span></div>`;
        const p = state.players[pid];
        const isW = m.w !== null && m.w === pid;
        const isL = m.w !== null && m.w !== pid;
        let boxes = '';
        if (m.w !== null) {
          const sets = UI.parseScore(m.s);
          boxes = `<span class="setbox">` + sets.map(s => {
            const mine = isW ? s.w : s.l;
            const sup = s.tb !== null && !isW ? `<sup>${s.tb}</sup>` : (s.tb !== null && isW ? `<sup>${s.tb + 2 > s.tbw ? s.tbw : s.tbw}</sup>` : '');
            return `<span class="${isW && s.w > s.l ? 'w' : ''}">${mine}${s.tb !== null ? (isW ? `<sup>${s.tbw}</sup>` : `<sup>${s.tb}</sup>`) : ''}</span>`;
          }).join('') + `</span>`;
        }
        return `<div class="m-row ${isW ? 'winner' : ''} ${isL ? 'loser' : ''}">
          ${UI.seedCell(inst, pid)}
          <span class="pname grow ellip" data-act="profile" data-id="${pid}">${esc(p.name)}</span>
          ${m.w === null ? `<span class="ovr">${p.overall}</span>` : boxes}
        </div>`;
      };

      let foot;
      if (m.w !== null) {
        const rec = state.matches.find(x => x.i === m.mid);
        foot = `<div class="m-foot">
          <span class="tiny faint">${rec ? rec.m + ' min · Elo ±' + rec.d : ''} ${rec && rec.up ? '<span class="badge-upset">Upset</span>' : ''}</span>
          <button class="btn sm" data-act="report" data-id="${m.mid}">Match report</button>
        </div>`;
      } else if (m.a !== null && m.b !== null) {
        foot = `<div class="m-foot"><span class="tiny faint">Ready</span>
          <button class="btn primary sm" data-act="play" data-r="${rIdx}" data-i="${mIdx}">Play match</button></div>`;
      } else {
        foot = `<div class="m-foot"><span class="tiny faint">Waiting on earlier results</span></div>`;
      }

      return `<div class="match ${m.w === null ? 'pending' : ''}">${head}<div class="m-body">${rowFor(m.a)}${rowFor(m.b)}</div>${foot}</div>`;
    },

    seedCell(inst, pid) {
      const seed = inst.seeds[pid];
      const tag = inst.tags && inst.tags[pid];
      return `<span class="seed">${seed ? seed : ''}</span>${tag ? `<span class="tag">${tag}</span>` : ''}`;
    },

    // "6-4 3-6 7-6(5)" (winner's perspective) -> [{w,l,tb}] where tb = TB loser's points
    parseScore(s) {
      return s.split(' ').map(part => {
        const tbMatch = part.match(/\((\d+)\)/);
        const nums = part.replace(/\(.*\)/, '').split('-').map(Number);
        return { w: nums[0], l: nums[1], tb: tbMatch ? Number(tbMatch[1]) : null };
      });
    },

    /* ---------------- PLAYERS ---------------- */
    renderPlayers(state) {
      const el = $('#view-players');
      let list = Object.values(state.players);
      const q = UI.playerSearch.trim().toLowerCase();
      if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.country || '').toLowerCase().includes(q));
      const sorters = {
        overall: (a, b) => b.overall - a.overall,
        rank: (a, b) => (a.rank || 9e9) - (b.rank || 9e9),
        elo: (a, b) => b.elo - a.elo,
        titles: (a, b) => b.titles - a.titles || b.w - a.w,
        name: (a, b) => a.name.localeCompare(b.name)
      };
      list.sort((a, b) => sorters[UI.playerSort](a, b) || a.id - b.id);

      const rows = list.slice(0, 400).map(p => `
        <div class="p-row" data-act="profile" data-id="${p.id}">
          <span class="rk">${p.rank ? '#' + p.rank : '—'}</span>
          <div class="grow">
            <div class="nm ellip">${esc(p.name)} ${p.country ? `<span class="tiny faint">${esc(p.country)}</span>` : ''} ${!p.active ? '<span class="tag">Retired</span>' : ''}</div>
            <div class="sub mono">Elo ${p.elo} · ${p.w}–${p.l}${p.titles ? ' · ' + p.titles + ' 🏆' : ''}</div>
          </div>
          <span class="ovr">${p.overall}</span>
        </div>`).join('');

      el.innerHTML = `
        <div class="toolbar">
          <input id="p-search" type="search" placeholder="Search players…" value="${esc(UI.playerSearch)}">
          <select id="p-sort">
            <option value="overall" ${UI.playerSort === 'overall' ? 'selected' : ''}>Overall</option>
            <option value="rank" ${UI.playerSort === 'rank' ? 'selected' : ''}>Ranking</option>
            <option value="elo" ${UI.playerSort === 'elo' ? 'selected' : ''}>Elo</option>
            <option value="titles" ${UI.playerSort === 'titles' ? 'selected' : ''}>Titles</option>
            <option value="name" ${UI.playerSort === 'name' ? 'selected' : ''}>Name</option>
          </select>
        </div>
        <div class="row" style="margin-bottom:12px">
          <button class="btn primary grow" data-act="addPlayer">+ Add player</button>
          <button class="btn" data-act="importPlayers">Import JSON</button>
        </div>
        ${list.length ? rows : `
          <div class="empty">
            <div class="big">The locker room is empty</div>
            Add your first legend — every attribute out of 99, exactly how you rate them.
          </div>`}
        ${list.length > 400 ? `<div class="tiny faint center">Showing 400 of ${list.length} — search to narrow down</div>` : ''}
        <div class="tiny faint center mt">${list.length} player${list.length === 1 ? '' : 's'}</div>`;
    },

    /* ---------------- RANKINGS ---------------- */
    renderRankings(state) {
      const el = $('#view-rankings');
      const win = state.settings.window;
      let rows;
      if (UI.rankMode === 'points') {
        rows = state.rankings.map(r => {
          const p = state.players[r.id];
          if (!p) return '';
          const prev = state.prevRankPos[r.id];
          const mv = prev === undefined ? '<span class="mv same">new</span>'
            : prev === r.rank ? '<span class="mv same">–</span>'
              : prev > r.rank ? `<span class="mv up">▲${prev - r.rank}</span>`
                : `<span class="mv down">▼${r.rank - prev}</span>`;
          return `<div class="rank-row" data-act="profile" data-id="${p.id}">
            <span class="pos">${r.rank}</span>
            <div class="grow">
              <div class="nm ellip">${esc(p.name)}</div>
              <div class="tiny faint mono">Elo ${p.elo} · peak #${p.bestRank || '–'}</div>
            </div>
            ${mv}
            <span class="mono" style="color:var(--gold-bright)">${fmt(r.pts)}</span>
          </div>`;
        }).join('');
      } else {
        const byElo = Object.values(state.players).filter(p => p.w + p.l > 0)
          .sort((a, b) => b.elo - a.elo).slice(0, 100);
        rows = byElo.map((p, i) => `
          <div class="rank-row" data-act="profile" data-id="${p.id}">
            <span class="pos">${i + 1}</span>
            <div class="grow"><div class="nm ellip">${esc(p.name)}</div>
              <div class="tiny faint mono">peak ${p.peakElo}</div></div>
            <span class="mono" style="color:var(--gold-bright)">${p.elo}</span>
          </div>`).join('');
      }

      el.innerHTML = `
        <div class="seg">
          <button data-act="rankMode" data-id="points" class="${UI.rankMode === 'points' ? 'on' : ''}">Ranking points</button>
          <button data-act="rankMode" data-id="elo" class="${UI.rankMode === 'elo' ? 'on' : ''}">Elo</button>
        </div>
        ${UI.rankMode === 'points'
          ? `<div class="tiny faint" style="margin-bottom:8px">Points from ${win > 0 ? 'the last ' + win + ' tournaments' : 'all tournaments ever played'} — change this under More.</div>`
          : `<div class="tiny faint" style="margin-bottom:8px">Elo rises for beating strong opponents and falls for losing to weak ones. Everyone starts at 1500.</div>`}
        <div class="card" style="padding:4px 2px">
          ${rows || '<div class="empty">No ranked players yet — finish a tournament first.</div>'}
        </div>`;
    },

    /* ---------------- RECORDS ---------------- */
    renderRecords(state) {
      const el = $('#view-records');
      const L = R.leaders(state);
      const majors = R.bigTitles(state, 1500);

      const leadCard = (title, arr, valueFn, subFn) => {
        if (!arr || arr.length === 0) return '';
        return `<div class="card lead"><div class="t">${title}</div><ol>` +
          arr.slice(0, 5).map((p, i) => `
            <li data-act="profile" data-id="${p.player ? p.player.id : p.id}">
              <span class="n">${i + 1}</span>
              <span class="ellip">${esc((p.player || p).name)}</span>
              <span class="v">${valueFn(p)}</span>
            </li>`).join('') + `</ol></div>`;
      };

      const honours = R.titlesByTournament(state).map(({ def, holders }) => `
        <div class="card lead"><div class="t">${esc(def.name)}</div><ol>
          ${holders.map((h, i) => `<li data-act="profile" data-id="${h.player.id}"><span class="n">${i + 1}</span><span class="ellip">${esc(h.player.name)}</span><span class="v">${h.count}</span></li>`).join('')}
        </ol></div>`).join('');

      const wall = R.championsWall(state);
      const wallRows = (UI.wallAll ? wall : wall.slice(0, 25)).map(ev => {
        const c = state.players[ev.champ], ru = state.players[ev.runnerUp];
        return `<div class="wall-row">
          <span class="ed">${esc(ev.name).slice(0, 14)} №${ev.n}</span>
          <span class="ch grow ellip" data-act="profile" data-id="${ev.champ}">${c ? esc(c.name) : '?'}</span>
          <span class="tiny faint mono">d. ${ru ? esc(ru.name.split(' ').slice(-1)[0]) : '?'} ${esc(ev.finalScore)}</span>
        </div>`;
      }).join('');

      const playerOpts = Object.values(state.players)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

      el.innerHTML = `
        <div class="section-label">All-time leaders</div>
        <div class="lead-grid">
          ${leadCard('Most titles', L.titles, p => p.titles)}
          ${leadCard('Major titles (1500+ pt events)', majors, r => r.count)}
          ${leadCard('Most finals', L.finals, p => p.finals)}
          ${leadCard('Match wins', L.wins, p => p.w)}
          ${leadCard('Win percentage (min 20)', L.winPct, p => pct1(p.w, p.l))}
          ${leadCard('Peak Elo', L.peakElo, p => p.peakElo)}
          ${leadCard('Longest win streak', L.bestStreak, p => p.bestStreak)}
          ${leadCard('Finished world No.1', L.no1, p => p.no1 + '×')}
          ${leadCard('Wins over the top 10', L.vsTop10, p => p.vsTop10[0])}
        </div>
        ${honours ? `<div class="section-label">Honours by event</div><div class="lead-grid">${honours}</div>` : ''}
        <div class="section-label">Head to head</div>
        <div class="card">
          <div class="form-grid">
            <select id="h2h-a"><option value="">Player one…</option>${playerOpts}</select>
            <select id="h2h-b"><option value="">Player two…</option>${playerOpts}</select>
          </div>
          <button class="btn wide mt" data-act="h2h">Compare</button>
          <div id="h2h-out"></div>
        </div>
        <div class="section-label">Champions wall</div>
        ${wall.length ? `<div class="wall">${wallRows}
          ${wall.length > 25 && !UI.wallAll ? `<button class="btn sm wide mt" data-act="wallAll">Show all ${wall.length}</button>` : ''}
        </div>` : '<div class="empty">No champions yet. The wall awaits its first name.</div>'}`;
    },

    h2hResultHTML(state, aId, bId) {
      const a = state.players[aId], b = state.players[bId];
      const { rec, matches } = R.h2hDetail(state, aId, bId);
      const meetings = matches.slice(0, 10).map(m => {
        const wn = state.players[m.w];
        return `<div class="statline"><span class="ellip">${esc(wn ? wn.name : '?')} · ${esc(m.rn)} <span class="faint">${esc(m.sf)}</span></span><span class="v small">${esc(m.s)}</span></div>`;
      }).join('');
      return `
        <div class="hero-grid mt">
          <div class="cell"><div class="hero-num">${rec.aWins}</div><div class="k ellip">${esc(a.name.split(' ').slice(-1)[0])}</div></div>
          <div class="cell"><div class="hero-num" style="color:var(--muted)">v</div><div class="k">${rec.aWins + rec.bWins} met</div></div>
          <div class="cell"><div class="hero-num">${rec.bWins}</div><div class="k ellip">${esc(b.name.split(' ').slice(-1)[0])}</div></div>
        </div>
        ${meetings || '<div class="tiny faint center">They have never met.</div>'}`;
    },

    /* ---------------- MORE ---------------- */
    renderMore(state) {
      const el = $('#view-more');
      const kb = (D.storageBytes(state) / 1024).toFixed(0);
      el.innerHTML = `
        <div class="section-label">Your save</div>
        <div class="card">
          <div class="statline"><span>Players</span><span class="v">${Object.keys(state.players).length}</span></div>
          <div class="statline"><span>Matches on record</span><span class="v">${fmt(state.matches.length)}</span></div>
          <div class="statline"><span>Tournaments completed</span><span class="v">${state.completed.length}</span></div>
          <div class="statline"><span>Save size</span><span class="v">${kb} KB</span></div>
          ${UI.lastSaved ? `<div class="tiny faint mt">Autosaved ${UI.lastSaved}</div>` : ''}
        </div>
        <div class="card">
          <div class="small" style="margin-bottom:8px">Everything lives in this browser. Export a backup regularly — if the browser ever clears its storage, the backup file is your simulation.</div>
          <div class="row">
            <button class="btn gold grow" data-act="export">Export backup</button>
            <button class="btn grow" data-act="importSave">Import backup</button>
          </div>
          <input type="file" id="import-file" accept=".json,application/json" style="display:none">
        </div>
        <div class="section-label">Rankings</div>
        <div class="card">
          <label class="f" for="win-input">Ranking window — how many recent tournaments count</label>
          <div class="row">
            <input id="win-input" type="number" min="0" max="200" value="${state.settings.window}">
            <button class="btn" data-act="saveWindow">Save</button>
          </div>
          <div class="tiny faint mt">Like the real tour's rolling 12 months, but measured in tournaments. Set 0 to count everything ever played.</div>
        </div>
        <div class="section-label">Danger zone</div>
        <div class="card">
          <button class="btn danger wide" data-act="reset">Erase everything and start again</button>
        </div>
        <div class="tiny faint center mt">Tennis Legends · the eternal tour · no ageing, no seasons, just the game</div>`;
    },

    /* ---------------- SHEETS (modals) ---------------- */
    openSheet(html) {
      $('#sheet').innerHTML = `<div class="grab"></div><button class="sheet-close" data-act="closeSheet">✕</button>` + html;
      $('#overlay').classList.add('on');
      $('#sheet').scrollTop = 0;
    },
    closeSheet() { $('#overlay').classList.remove('on'); $('#sheet').innerHTML = ''; },

    sheetPlayerEditor(state, id) {
      const p = id ? state.players[id] : null;
      const attrVal = key => (p ? p.attrs[key] : '');
      const groups = Object.entries(E.ATTR_GROUPS).map(([gname, keys], gi) => `
        <details class="grp" ${gi === 0 ? 'open' : ''}>
          <summary>${gname}</summary>
          <div class="inner attr-grid">
            ${keys.map(k => {
              const label = E.ATTR_DEFS.find(d => d[0] === k)[1];
              return `<div class="a"><label for="attr-${k}">${label}</label>
                <input id="attr-${k}" data-attr="${k}" type="number" min="1" max="99" inputmode="numeric" value="${attrVal(k)}"></div>`;
            }).join('')}
          </div>
        </details>`).join('');

      UI.openSheet(`
        <h2>${p ? 'Edit ' + esc(p.name) : 'New player'}</h2>
        <div class="tiny faint" style="margin-bottom:12px">Empty attribute boxes take the Overall value when you save.</div>
        <div class="form-grid">
          <div class="full"><label class="f" for="pe-name">Name</label><input id="pe-name" value="${p ? esc(p.name) : ''}" placeholder="Prime Novak Djokovic"></div>
          <div><label class="f" for="pe-country">Country (optional)</label><input id="pe-country" maxlength="3" value="${p ? esc(p.country) : ''}" placeholder="SRB"></div>
          <div><label class="f" for="pe-overall">Overall / 99</label><input id="pe-overall" type="number" min="1" max="99" inputmode="numeric" value="${p ? p.overall : ''}"></div>
          <div><label class="f" for="pe-hard">Hard court</label><input id="pe-hard" type="number" min="1" max="99" inputmode="numeric" value="${p ? p.surfaces.hard : 80}"></div>
          <div><label class="f" for="pe-clay">Clay court</label><input id="pe-clay" type="number" min="1" max="99" inputmode="numeric" value="${p ? p.surfaces.clay : 80}"></div>
          <div><label class="f" for="pe-grass">Grass court</label><input id="pe-grass" type="number" min="1" max="99" inputmode="numeric" value="${p ? p.surfaces.grass : 80}"></div>
        </div>
        <button class="btn sm mt" data-act="fillAttrs">Fill empty boxes from Overall</button>
        <div class="mt">${groups}</div>
        <button class="btn primary wide mt" data-act="${p ? 'saveEditPlayer' : 'saveNewPlayer'}" data-id="${p ? p.id : ''}">Save player</button>`);
    },

    sheetImportPlayers() {
      UI.openSheet(`
        <h2>Import players</h2>
        <div class="small muted" style="margin:6px 0 10px">Paste one player or an array. Any attribute you leave out takes the Overall value; surfaces default to 80.</div>
        <textarea id="imp-text" rows="9" placeholder='[{"name":"Prime Pete Sampras","country":"USA","overall":96,"surfaces":{"grass":98,"hard":95,"clay":78},"attrs":{"serve":99,"volley":97,"returnServe":88}}]'></textarea>
        <button class="btn primary wide mt" data-act="doImportPlayers">Import</button>`);
    },

    sheetProfile(state, id) {
      const c = R.career(state, id);
      if (!c) return;
      const p = c.player;

      const honoursList = c.titlesList.slice(0, 30).map(ev =>
        `<div class="statline"><span>${esc(ev.name)} №${ev.n}</span><span class="v small">d. ${esc((state.players[ev.runnerUp] || { name: '?' }).name.split(' ').slice(-1)[0])} ${esc(ev.finalScore)}</span></div>`).join('');

      const recent = c.matches.slice(0, 12).map(m => {
        const won = m.w === p.id;
        const oppId = m.a === p.id ? m.b : m.a;
        const opp = state.players[oppId];
        return `<div class="statline">
          <span class="ellip">${won ? '<span style="color:var(--win)">W</span>' : '<span style="color:var(--danger)">L</span>'} v ${esc(opp ? opp.name : '?')} <span class="faint tiny">${esc(m.rn)}</span></span>
          <span class="v small">${esc(m.s)}</span></div>`;
      }).join('');

      const bars = Object.entries(E.ATTR_GROUPS).map(([gname, keys]) => `
        <details class="grp"><summary>${gname}</summary><div class="inner">
          ${keys.map(k => {
            const label = E.ATTR_DEFS.find(d => d[0] === k)[1];
            const v = p.attrs[k];
            return `<div class="bar"><span class="lb">${label}</span><span class="tr"><span class="fl" style="width:${v}%"></span></span><span class="vl">${v}</span></div>`;
          }).join('')}
        </div></details>`).join('');

      UI.openSheet(`
        <div class="row">
          <div class="grow">
            <h2>${esc(p.name)}</h2>
            <div class="tiny faint">${esc(p.country || '')} ${!p.active ? '· Retired from the pool' : ''}</div>
          </div>
          <span class="ovr" style="font-size:17px;padding:6px 8px">${p.overall}</span>
        </div>
        <div class="hero-grid">
          <div class="cell"><div class="hero-num">${p.rank ? '#' + p.rank : '—'}</div><div class="k">Rank · peak ${p.bestRank ? '#' + p.bestRank : '—'}</div></div>
          <div class="cell"><div class="hero-num">${p.titles}</div><div class="k">Titles · ${p.finals} finals</div></div>
          <div class="cell"><div class="hero-num">${p.elo}</div><div class="k">Elo · peak ${p.peakElo}</div></div>
        </div>
        <div class="card">
          <div class="statline"><span>Record</span><span class="v">${p.w}–${p.l} (${pct1(p.w, p.l)})</span></div>
          <div class="statline"><span>Hard · Clay · Grass</span><span class="v">${p.surf.hard[0]}–${p.surf.hard[1]} · ${p.surf.clay[0]}–${p.surf.clay[1]} · ${p.surf.grass[0]}–${p.surf.grass[1]}</span></div>
          <div class="statline"><span>Deciding sets</span><span class="v">${p.dec[0]}–${p.dec[1]}</span></div>
          <div class="statline"><span>Tie-break sets</span><span class="v">${p.tb[0]}–${p.tb[1]}</span></div>
          <div class="statline"><span>Wins v top 10</span><span class="v">${p.vsTop10[0]}–${p.vsTop10[1]}</span></div>
          <div class="statline"><span>Win streak</span><span class="v">${p.streak} now · ${p.bestStreak} best</span></div>
          <div class="statline"><span>Finished world No.1</span><span class="v">${p.no1}×</span></div>
        </div>
        <div class="row">
          <span class="chip"><span class="dot hard"></span>${p.surfaces.hard}</span>
          <span class="chip"><span class="dot clay"></span>${p.surfaces.clay}</span>
          <span class="chip"><span class="dot grass"></span>${p.surfaces.grass}</span>
        </div>
        ${honoursList ? `<div class="section-label">Honours</div>${honoursList}` : ''}
        ${recent ? `<div class="section-label">Recent matches <span class="faint" style="letter-spacing:0;text-transform:none">(${fmt(c.totalMatches)} total)</span></div>${recent}` : ''}
        <div class="section-label">Attributes</div>
        ${bars}
        <div class="row mt">
          <button class="btn grow" data-act="editPlayer" data-id="${p.id}">Edit</button>
          <button class="btn grow" data-act="toggleRetire" data-id="${p.id}">${p.active ? 'Retire' : 'Reinstate'}</button>
          <button class="btn danger" data-act="deletePlayer" data-id="${p.id}">Delete</button>
        </div>`);
    },

    sheetTournamentEditor(state, id) {
      const d = id ? state.defs[id] : null;
      const slots = d ? { quali: d.quali, wild: d.wild } : T.defaultSlots(128);
      UI.openSheet(`
        <h2>${d ? 'Edit ' + esc(d.name) : 'New tournament'}</h2>
        <div class="form-grid mt">
          <div class="full"><label class="f" for="te-name">Name</label><input id="te-name" value="${d ? esc(d.name) : ''}" placeholder="Wimbledon"></div>
          <div><label class="f" for="te-surface">Surface</label>
            <select id="te-surface">
              ${E.SURFACES.map(s => `<option value="${s}" ${d && d.surface === s ? 'selected' : ''}>${SURF_NAME[s]}</option>`).join('')}
            </select></div>
          <div><label class="f" for="te-draw">Draw size</label>
            <select id="te-draw">${[128, 64, 32, 16, 8, 4].map(n => `<option ${d ? (d.drawSize === n ? 'selected' : '') : (n === 128 ? 'selected' : '')}>${n}</option>`).join('')}</select></div>
          <div><label class="f" for="te-bestof">Format</label>
            <select id="te-bestof"><option value="3" ${d && d.bestOf === 3 ? 'selected' : ''}>Best of 3</option><option value="5" ${!d || d.bestOf === 5 ? 'selected' : ''}>Best of 5</option></select></div>
          <div><label class="f" for="te-points">Champion's points</label><input id="te-points" type="number" min="50" max="4000" inputmode="numeric" value="${d ? d.points : 2000}"></div>
          <div><label class="f" for="te-quali">Qualifier spots</label><input id="te-quali" type="number" min="0" max="32" inputmode="numeric" value="${slots.quali}"></div>
          <div><label class="f" for="te-wild">Wildcard spots</label><input id="te-wild" type="number" min="0" max="32" inputmode="numeric" value="${slots.wild}"></div>
        </div>
        <div class="row mt">
          ${[2000, 1000, 500, 250].map(v => `<button class="btn sm grow" data-act="ptsPreset" data-id="${v}">${v}</button>`).join('')}
        </div>
        <div class="tiny faint mt">Points set an event's prestige: every round pays a share of the champion's total (final 60%, semis 36%, quarters 18%…), and bigger events swing Elo harder. The rest of the field fights through simulated qualifying; wildcards are drawn at random, weighted towards better players.</div>
        <button class="btn primary wide mt" data-act="${d ? 'saveEditDef' : 'saveNewDef'}" data-id="${d ? d.id : ''}">Save tournament</button>
        ${d ? `<button class="btn danger sm wide mt" data-act="deleteDef" data-id="${d.id}">Delete tournament</button>` : ''}`);
    },

    sheetMatchReport(state, mid) {
      const m = state.matches.find(x => x.i === Number(mid));
      if (!m) return;
      const a = state.players[m.a], b = state.players[m.b];
      const winnerIsA = m.w === m.a;
      const sets = UI.parseScore(m.s);
      const rowBoxes = isA => `<span class="setbox">` + sets.map(s => {
        const mine = (isA === winnerIsA) ? s.w : s.l;
        const won = (isA === winnerIsA) ? s.w > s.l : s.l > s.w;
        const sup = s.tb === null ? '' : `<sup>${(isA === winnerIsA) ? s.tbw : s.tb}</sup>`;
        return `<span class="${won ? 'w' : ''}">${mine}${sup}</span>`;
      }).join('') + `</span>`;
      const st = m.st || [0, 0, 0, 0, 0, 0];
      const injNote = (m.inj || []).map(x => {
        const [pid, setNo] = x.split(':');
        const pl = state.players[Number(pid)];
        return `${pl ? esc(pl.name) : '?'} picked up a knock after set ${setNo}`;
      }).join(' · ');

      UI.openSheet(`
        <h2>Match report</h2>
        <div class="tiny faint">${esc(m.rn)} · ${SURF_NAME[m.sf] || esc(m.sf)} · ${m.m} minutes</div>
        <div class="match mt"><div class="m-body">
          <div class="m-row ${winnerIsA ? 'winner' : 'loser'}"><span class="pname grow ellip">${esc(a ? a.name : '?')}</span>${rowBoxes(true)}</div>
          <div class="m-row ${!winnerIsA ? 'winner' : 'loser'}"><span class="pname grow ellip">${esc(b ? b.name : '?')}</span>${rowBoxes(false)}</div>
        </div></div>
        <div class="card">
          <div class="statline"><span>Points won</span><span class="v">${st[4]} – ${st[5]}</span></div>
          <div class="statline"><span>Aces</span><span class="v">${st[0]} – ${st[1]}</span></div>
          <div class="statline"><span>Breaks of serve</span><span class="v">${st[2]} – ${st[3]}</span></div>
          <div class="statline"><span>Elo exchanged</span><span class="v">±${m.d}</span></div>
          ${m.up ? `<div class="statline"><span>Verdict</span><span class="v" style="color:var(--danger)">Upset</span></div>` : ''}
        </div>
        ${injNote ? `<div class="tiny muted">${injNote}</div>` : ''}`);
    }
  };

  global.TennisUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
