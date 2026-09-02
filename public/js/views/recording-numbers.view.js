/**
 * BHS Soccer — recording numbers.
 *
 * The recording number is what a player writes on a paper score sheet during a
 * session, because handwriting is not always readable and a number is. It is
 * NOT the shirt number: it runs 1..N over the squad and stays put all season.
 *
 * Until now the only way to set one was to include a RecordingNumber column in
 * an import. A squad imported without that column — the JV roster, for one —
 * had no numbers at all and no way to get them, so every screen that leads
 * with the number showed a dash for the whole team.
 *
 * Classic script. Extends the prototype from app.core.js, so it must load
 * after it.
 */

Object.assign(BHSSoccerApp.prototype, {

  /**
   * Propose 1..N over the squad, in the order a coach reads a team sheet.
   *
   * Surname order, because that is how a roster is printed and how a coach
   * looks somebody up. Players who already have a number keep it — renumbering
   * a squad mid-season would invalidate every paper sheet already filled in —
   * so this only fills the gaps, taking the lowest numbers still free.
   */
  proposeRecordingNumbers(players) {
    const taken = new Set(
      players.map(p => p.recordingNumber).filter(n => n != null).map(Number)
    );

    const bySurname = players.slice().sort((a, b) => {
      const sa = String(a.lastName || a.name || '').toLowerCase();
      const sb = String(b.lastName || b.name || '').toLowerCase();
      return sa.localeCompare(sb) || String(a.name || '').localeCompare(String(b.name || ''));
    });

    let next = 1;
    const out = new Map();
    bySurname.forEach(p => {
      if (p.recordingNumber != null) { out.set(p.id, Number(p.recordingNumber)); return; }
      while (taken.has(next)) next += 1;
      taken.add(next);
      out.set(p.id, next);
    });
    return out;
  },

  /**
   * Duplicates, reported as the numbers that clash.
   *
   * Checked before anything is written. The database enforces uniqueness per
   * team too, but hitting that constraint halfway through leaves the squad
   * part-renumbered, which is worse than refusing up front.
   */
  duplicateRecordingNumbers(assignments) {
    const seen = new Map();
    const dupes = new Set();
    assignments.forEach(a => {
      if (a.value == null) return;
      if (seen.has(a.value)) dupes.add(a.value);
      seen.set(a.value, true);
    });
    return Array.from(dupes).sort((a, b) => a - b);
  },

  /**
   * The order writes must happen in to avoid a transient collision.
   *
   * The unique index is per team, so swapping two players' numbers by writing
   * one at a time hits the constraint on the first write even though the final
   * state is legal. Anything whose number is being taken by somebody else is
   * therefore cleared to null first, then everything is set.
   *
   * Rows that are not changing are left out entirely — a squad of 25 with two
   * edits makes two writes, not fifty.
   */
  planRecordingNumberWrites(assignments) {
    const changed = assignments.filter(a => Number(a.value) !== Number(a.current)
      || (a.value == null) !== (a.current == null));
    if (changed.length === 0) return [];

    const wanted = new Set(changed.map(a => a.value).filter(v => v != null).map(Number));
    // Whose current number somebody else is about to take.
    const mustClear = assignments.filter(a =>
      a.current != null && wanted.has(Number(a.current))
      && Number(a.current) !== Number(a.value));

    return [
      ...mustClear.map(a => ({ playerId: a.playerId, value: null })),
      ...changed.map(a => ({ playerId: a.playerId, value: a.value }))
    ];
  },

  rosterForNumbering() {
    return (this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted);
  },

  openRecordingNumbersModal() {
    this._recNumError = '';
    this._recNumDraft = null;
    this.renderRecordingNumbersBody();
    const modal = document.getElementById('recordingNumbersModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  /** Read what is on screen, so a redraw never discards half-typed edits. */
  captureRecordingNumberDrafts() {
    const draft = {};
    this.rosterForNumbering().forEach(p => {
      const el = document.getElementById('recNum_' + p.id);
      if (el) draft[p.id] = el.value;
    });
    this._recNumDraft = draft;
  },

  autoNumberRoster() {
    const players = this.rosterForNumbering();
    const proposed = this.proposeRecordingNumbers(players);
    const draft = {};
    players.forEach(p => { draft[p.id] = String(proposed.get(p.id) ?? ''); });
    this._recNumDraft = draft;
    this._recNumError = '';
    this.renderRecordingNumbersBody();
  },

  clearRecordingNumberDrafts() {
    this.captureRecordingNumberDrafts();
    const draft = {};
    this.rosterForNumbering().forEach(p => { draft[p.id] = ''; });
    this._recNumDraft = draft;
    this._recNumError = '';
    this.renderRecordingNumbersBody();
  },

  renderRecordingNumbersBody() {
    const body = document.getElementById('recordingNumbersBody');
    if (!body) return;

    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const draft = this._recNumDraft;
    const players = this.rosterForNumbering().slice().sort((a, b) => {
      const sa = String(a.lastName || a.name || '').toLowerCase();
      const sb = String(b.lastName || b.name || '').toLowerCase();
      return sa.localeCompare(sb);
    });

    if (players.length === 0) {
      body.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No players on this team yet.</p>';
      return;
    }

    body.innerHTML = players.map(p => {
      const val = draft ? (draft[p.id] ?? '') : (p.recordingNumber != null ? p.recordingNumber : '');
      return `
        <div style="display:flex; gap:10px; align-items:center; padding:5px 0; border-bottom:1px solid var(--bhs-navy-border);">
          <input type="number" id="recNum_${esc(p.id)}" class="form-control" min="1" step="1"
                 style="width:78px; text-align:center;" value="${esc(val)}"
                 aria-label="Recording number for ${esc(p.name)}" />
          <span style="flex:1; min-width:0; color:#FFF; font-size:0.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${esc(p.name)}
          </span>
          <span class="text-muted" style="font-size:0.75rem;">${p.number != null ? '#' + esc(p.number) : ''}</span>
        </div>`;
    }).join('');

    const err = document.getElementById('recordingNumbersError');
    if (err) err.textContent = this._recNumError || '';
  },

  async saveRecordingNumbers() {
    const btn = document.getElementById('recordingNumbersSave');
    const err = document.getElementById('recordingNumbersError');
    const setErr = (m) => { this._recNumError = m; if (err) err.textContent = m; };

    if (!this.activeTeamId) return setErr('Choose a team in the header first.');

    const assignments = this.rosterForNumbering().map(p => {
      const el = document.getElementById('recNum_' + p.id);
      const raw = el ? String(el.value).trim() : '';
      return {
        playerId: p.id,
        name: p.name,
        value: raw === '' ? null : Number(raw),
        current: p.recordingNumber == null ? null : Number(p.recordingNumber)
      };
    });

    const bad = assignments.find(a => a.value !== null
      && (!Number.isInteger(a.value) || a.value < 1));
    if (bad) return setErr(`${bad.name}: a recording number must be a whole number of 1 or more.`);

    const dupes = this.duplicateRecordingNumbers(assignments);
    if (dupes.length) {
      // Refuse before writing: the database would stop halfway and leave the
      // squad part-renumbered.
      return setErr(`Two players share ${dupes.length === 1 ? 'number' : 'numbers'} ${dupes.join(', ')}. Every number must be different.`);
    }

    const writes = this.planRecordingNumberWrites(assignments);
    if (writes.length === 0) { setErr(''); this.closeModals(); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    setErr('');

    const failures = [];
    for (const w of writes) {
      const res = await window.supabaseService.setRecordingNumber(
        this.activeTeamId, w.playerId, w.value);
      if (!res || !res.ok) {
        const who = assignments.find(a => a.playerId === w.playerId);
        failures.push(`${who ? who.name : 'A player'}: ${res?.error || 'refused'}`);
      }
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Save numbers'; }

    if (failures.length) {
      // Say which ones, rather than a count. A partial save is recoverable
      // only if the coach knows what did not land.
      return setErr(failures.slice(0, 3).join(' · ')
        + (failures.length > 3 ? ` · and ${failures.length - 3} more` : ''));
    }

    // Re-read rather than patching local state: the numbers now live in
    // Postgres and every screen reads them from this.data.
    await this.syncFromSupabase();
    this.closeModals();
    this.renderCurrentView();
  }

});
