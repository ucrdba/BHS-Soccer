/**
 * Daily coaching messages.
 *
 * Moved out of planner.view.js, which had grown past 2.3k lines holding the
 * planner, the drills library, the diagrammer, the quiz AND this. Only this
 * section moved: its service calls were being rewritten for team scoping
 * anyway, so the file stops growing without a broader refactor.
 *
 * Classic script — no imports. Extends the prototype defined in app.core.js,
 * so index.html must load this AFTER that file. Every method here is called as
 * app.method() from home.view.js and index.html, so moving them needs no call
 * site changes.
 */
Object.assign(BHSSoccerApp.prototype, {

  getActiveThought() {
    const thoughts = this.data.dailyThoughts || [];
    return thoughts.find(t => t.isActive) || thoughts[0] || {
      id: 'dt_default',
      coachId: 'c1',
      coachName: '',
      text: 'No coach thoughts entered for today.',
      isActive: true
    };
  },

  openManageThoughtsModal() {
    this.renderThoughtsList();
    const modal = document.getElementById('manageThoughtsModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderThoughtsList() {
    const container = document.getElementById('thoughtsListContainer');
    if (!container) return;

    const thoughts = this.data.dailyThoughts || [];
    if (thoughts.length === 0) {
      container.innerHTML = `<p class="text-muted" style="font-size:0.85rem; text-align: center; padding: 20px;">
        No messages for this team yet. Messages are per team now, so each squad
        gets its own &mdash; write one below, or copy one across from another team.</p>`;
      return;
    }

    container.innerHTML = thoughts.map(t => `
      <div style="background: rgba(0,0,0,0.3); border: ${t.isActive ? '2px solid var(--bhs-gold-accent)' : '1px solid var(--bhs-navy-border)'}; border-radius: 8px; padding: 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="color: #FFF;">— ${t.coachName || 'Coach Bob Miller'}</strong>
            ${t.isActive ? '<span class="badge badge-gold">🟢 ACTIVE</span>' : '<span class="badge badge-secondary" style="font-size:0.7rem;">ARCHIVED</span>'}
          </div>
          <div style="display:flex; gap:6px;">
            ${!t.isActive ? `<button class="btn btn-secondary" style="padding:3px 8px; font-size:0.75rem;" onclick="app.setActiveThought('${t.id}')">⭐ Set Active</button>` : ''}
            <button class="btn btn-primary" style="padding:3px 8px; font-size:0.75rem;" onclick="app.openEditThoughtFormModal('${t.id}')">✏️ Edit</button>
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="app.openCopyToTeam('thought','${t.id}')">Copy to team…</button>
            <button class="btn btn-secondary" style="padding:3px 8px; font-size:0.75rem; background:rgba(239,68,68,0.2); color:var(--color-danger); border-color:var(--color-danger);" onclick="app.deleteThought('${t.id}')">🗑️ Delete</button>
          </div>
        </div>
        <p style="color: #DDD; font-size: 0.88rem; line-height: 1.5; margin: 0; white-space: pre-wrap;">${t.text}</p>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 8px;">Posted: ${t.createdAt || 'Recent'}</div>
      </div>
    `).join('');
  },

  openAddThoughtModal() {
    const currentUser = window.auth.getCurrentUser();
    document.getElementById('thoughtEditId').value = '';
    document.getElementById('thoughtFormModalTitle').textContent = '➕ ADD NEW DAILY THOUGHT';
    document.getElementById('thoughtCoachNameInput').value = (currentUser && currentUser.name) ? currentUser.name : 'Coach Bob Miller';
    document.getElementById('thoughtTitleInput').value = '';
    document.getElementById('thoughtTextInput').value = '';
    document.getElementById('thoughtIsActiveInput').checked = true;

    const modal = document.getElementById('editThoughtFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  openEditThoughtFormModal(thoughtId) {
    const thought = (this.data.dailyThoughts || []).find(t => t.id === thoughtId);
    if (!thought) return;

    document.getElementById('thoughtEditId').value = thought.id;
    document.getElementById('thoughtFormModalTitle').textContent = '✏️ EDIT DAILY THOUGHT';
    document.getElementById('thoughtCoachNameInput').value = thought.coachName || 'Coach Bob Miller';
    document.getElementById('thoughtTitleInput').value = thought.title || '';
    document.getElementById('thoughtTextInput').value = thought.text || '';
    document.getElementById('thoughtIsActiveInput').checked = !!thought.isActive;

    const modal = document.getElementById('editThoughtFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async submitThoughtForm() {
    const id = document.getElementById('thoughtEditId').value;
    const coachName = document.getElementById('thoughtCoachNameInput').value.trim() || 'Coach Bob Miller';
    const title = document.getElementById('thoughtTitleInput').value.trim();
    const text = document.getElementById('thoughtTextInput').value.trim();
    const isActive = document.getElementById('thoughtIsActiveInput').checked;

    if (!text) { alert('Please enter daily thoughts text.'); return; }

    const currentUser = window.auth.getCurrentUser();
    const coachId = (currentUser && currentUser.id) ? currentUser.id : 'c1';

    if (isActive) {
      (this.data.dailyThoughts || []).forEach(t => t.isActive = false);
    }

    let targetThought = null;
    if (id) {
      targetThought = (this.data.dailyThoughts || []).find(t => t.id === id);
      if (targetThought) {
        targetThought.coachName = coachName;
        targetThought.title = title;
        targetThought.text = text;
        targetThought.isActive = isActive;
      }
    } else {
      targetThought = {
        id: 'dt_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        coachId: coachId,
        coachName: coachName,
        title: title,
        text: text,
        isActive: isActive,
        createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
      };
      if (!this.data.dailyThoughts) this.data.dailyThoughts = [];
      this.data.dailyThoughts.unshift(targetThought);
    }

    this.saveData();

    let cloudResult = null;
    let dbSaved = true;
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      if (this.activeTeamId) {
        cloudResult = await window.supabaseService.upsertDailyThought(this.activeTeamId, {
          id: targetThought.id,
          coachId: coachId,
          coachName: coachName,
          title: title,
          text: text,
          isActive: isActive
        });

        if (cloudResult && cloudResult.data && cloudResult.data.id) {
          targetThought.id = cloudResult.data.id;
          if (isActive) {
            await window.supabaseService.setActiveDailyThought(this.activeTeamId, cloudResult.data.id);
          }
        }
      } else {
        // upsertDailyThought now refuses a non-uuid/absent team_id. This is an
        // explicit modal Save action, so the coach must be told -- the thought
        // would otherwise appear to save and vanish on reload.
        dbSaved = false;
        console.warn('Daily thought not saved to the database — no team is selected.');
      }
    }

    this.saveData();
    this.renderThoughtsList();
    this.renderCurrentView();
    const formModal = document.getElementById('editThoughtFormModal');
    if (formModal) { formModal.style.display = 'none'; formModal.classList.remove('active'); }

    if (!dbSaved) {
      alert('⚠️ Daily thought saved to this screen, but NOT saved to the database — no team is selected. Choose a team in the header first; it will disappear on reload.');
    } else if (cloudResult && cloudResult.error) {
      alert(`⚠️ Saved locally, but Supabase Cloud error:\n${cloudResult.error}\n\nMake sure the "daily_thoughts" table exists in your Supabase SQL Editor!`);
    } else {
      alert('✅ Daily thought saved to Supabase Cloud & Local Storage successfully!');
    }
  },

  async setActiveThought(thoughtId) {
    (this.data.dailyThoughts || []).forEach(t => {
      t.isActive = (t.id === thoughtId);
    });
    this.saveData();

    let dbSaved = true;
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      if (this.activeTeamId) {
        await window.supabaseService.setActiveDailyThought(this.activeTeamId, thoughtId);
      } else {
        // setActiveDailyThought now refuses a non-uuid/absent team_id. This is
        // an explicit "Set Active" click, so the coach must be told -- the
        // change would otherwise appear to apply and revert on reload.
        dbSaved = false;
        console.warn('Active thought change not saved to the database — no team is selected.');
      }
    }

    this.renderThoughtsList();
    this.renderCurrentView();
    if (!dbSaved) {
      alert('⚠️ Active thought updated on this screen, but NOT saved to the database — no team is selected. Choose a team in the header first; it will revert on reload.');
    }
  },

  async deleteThought(thoughtId) {
    this.showConfirmModal({
      title: '🗑️ DELETE DAILY THOUGHT',
      message: 'Are you sure you want to delete this daily thought entry?',
      confirmText: '🗑️ Delete Entry',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        this.data.dailyThoughts = (this.data.dailyThoughts || []).filter(t => t.id !== thoughtId);
        if (this.data.dailyThoughts.length > 0 && !this.data.dailyThoughts.some(t => t.isActive)) {
          this.data.dailyThoughts[0].isActive = true;
        }

        this.saveData();

        if (window.supabaseService && window.supabaseService.isConfigured()) {
          await window.supabaseService.deleteDailyThought(thoughtId);
        }

        this.renderThoughtsList();
        this.renderCurrentView();
      }
    });
  },

  /**
   * Open the copy dialog for a plan or a daily message.
   *
   * Shared by thoughts.view.js and planner.view.js -- both extend the same
   * BHSSoccerApp.prototype, and defining this once here (rather than in both
   * files) avoids one silently overwriting the other at script-load time.
   *
   * @param kind 'plan' or 'thought'
   * @param ref  the plan NAME, or the thought id
   */
  async openCopyToTeam(kind, ref) {
    this._copyKind = kind;
    this._copyRef = ref;
    this._copySourceTeamId = this.activeTeamId;
    this._copyTargets = [];

    const err = document.getElementById('copyToTeamError');
    if (err) err.textContent = '';
    const what = document.getElementById('copyToTeamWhat');
    if (what) {
      what.textContent = kind === 'plan'
        ? `Copying the plan "${ref}" — every drill slot in it.`
        : 'Copying this message to another team.';
    }

    if (window.supabaseService?.isConfigured()) {
      const teams = (await window.supabaseService.teamsCoachedBy()) || [];
      // Never offer the team it is already on: the copy would be refused, and
      // two identically named plans on one team cannot be told apart.
      this._copyTargets = teams.filter(t => t.id !== this._copySourceTeamId);
    }

    const box = document.getElementById('copyToTeamTargets');
    if (box) box.innerHTML = this.renderCopyTargets();

    const modal = document.getElementById('copyToTeamModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderCopyTargets() {
    const targets = this._copyTargets || [];
    if (targets.length === 0) {
      return `<p class="text-muted" style="font-size:0.85rem;">
        You do not coach another team to copy this to. An admin assigns coaches to
        teams under Admin &rsaquo; Teams &amp; Coach Assignments.</p>`;
    }
    return `
      <label for="copyToTeamSelect" style="display:block; font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); margin-bottom:3px;">Destination team</label>
      <select id="copyToTeamSelect" class="form-control" style="font-size:0.85rem;">
        ${targets.map(t => `<option value="${t.id}">${t.name}${t.school_name ? ' — ' + t.school_name : ''}</option>`).join('')}
      </select>`;
  },

  async confirmCopyToTeam() {
    const err = document.getElementById('copyToTeamError');
    const set = (m) => { if (err) err.textContent = m; };
    const to = document.getElementById('copyToTeamSelect')?.value;
    if (!to) return set('Pick a destination team.');

    const btn = document.getElementById('copyToTeamBtn');
    if (btn) btn.disabled = true;
    try {
      set('Copying…');
      const res = this._copyKind === 'plan'
        ? await window.supabaseService.copyPracticePlan(this._copyRef, this._copySourceTeamId, to)
        : await window.supabaseService.copyDailyThought(this._copyRef, to);

      // A missing/null result is treated the same as an explicit refusal --
      // res.ok would throw on null and leave the div stuck on "Copying…"
      // with the coach shown nothing, the exact silent-failure shape this
      // control exists to avoid.
      if (!res || !res.ok) return set((res && res.error) || 'Could not copy that.');

      // The service names the drills a cross-organization copy is missing;
      // pass that through verbatim rather than replacing it with something
      // generic the coach cannot act on.
      set('');
      await this.syncFromSupabase();
      this.renderCurrentView();
      this.closeModals();
    } catch (e) {
      // A thrown error (network drop, bad response, ...) must not escape
      // uncaught and leave the div reading "Copying…" forever -- show
      // something the coach can act on instead.
      set('Could not reach the database. Check your connection and try again.');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

});
