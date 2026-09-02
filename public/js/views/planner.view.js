/**
 * BHS Soccer - Coach Planner View (drills, quiz, daily thoughts, saved plans)
 * Adds renderPlannerView() and all planner-related methods to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  renderPlannerView() {
    const savedCount = (this.data.savedPlans || []).length;
    const activeName = this.data.activePlanName || 'Standard Practice Session';

    // copyPracticePlan matches on practice_plans.name, so "Copy to team…" can
    // only work when the heading above it names a plan that actually exists.
    // activePlanName is set solely by Save Practice Plan and Load Plan, and is
    // never restored by syncFromSupabase -- so after any reload the heading
    // falls back to "Standard Practice Session", which no write path ever
    // stores, and the copy returned `No plan named "Standard Practice Session"
    // on that team.` even on Varsity with all 27 rows. Gate the control on the
    // active plan being real instead: Load, then Copy.
    const copyablePlan = (this.data.savedPlans || []).find(
      p => this.data.activePlanName && p.name === this.data.activePlanName
    );
    // The name lands inside a single-quoted onclick attribute, so an
    // apostrophe in a coach-chosen plan name would otherwise break the handler.
    const copyArg = copyablePlan
      ? copyablePlan.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')
      : '';
    const copyButton = copyablePlan
      ? `<button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="app.openCopyToTeam('plan','${copyArg}')">📋 Copy to team…</button>`
      : `<button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem; opacity:0.5; cursor:not-allowed;" disabled title="Load a saved plan first — copying sends a named plan to another team.">📋 Copy to team…</button>`;

    // Compute total session duration in minutes
    let totalMinutes = 0;
    (this.data.currentPracticePlan || []).forEach(p => {
      const match = (p.duration || '').match(/(\d+)/);
      if (match) {
        totalMinutes += parseInt(match[1]);
      }
    });

    let totalTimeStr = `${totalMinutes} min`;
    if (totalMinutes >= 60) {
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      totalTimeStr = `${totalMinutes} min (${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''})`;
    }

    return `
      <div class="container">
        <div class="portal-header">
          <div class="portal-title">
            <h2>📋 COACH PRACTICE PLANNER</h2>
            <p>Design practice sessions, prompt &amp; save named plans to database, and reload past sessions anytime.</p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-gold" onclick="app.openAddPlanDrillModal()">+ Add Drill to Plan</button>
            <button class="btn btn-gold" style="border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent);" onclick="app.openDrillsBankModal()">➕ Add New Drill (${(this.data.drillsBank || []).length})</button>
            <button class="btn btn-gold" onclick="app.openSavePlanModal()">💾 Save Practice Plan</button>
            <button class="btn btn-primary" onclick="app.openLoadPlanModal()">📂 Select Practice Plan (${savedCount})</button>
            <button class="btn btn-primary" onclick="app.printPracticePlan()">🖨️ Print Practice Plan</button>
            <button class="btn btn-secondary" onclick="app.downloadPracticePlan('html')">📥 Save/Download Plan File</button>
            <button class="btn btn-secondary" onclick="app.openRoundRobinModal()" title="Every player against every other, once">🏆 1v1 Round Robin</button>
          </div>
        </div>

        <div class="planner-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 14px;">
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                <h3 style="color: #FFF; margin: 0;">TODAY'S PRACTICE TIMELINE</h3>
                <span class="badge badge-coach">ACTIVE PLAN</span>
              </div>
              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <div style="color: var(--bhs-gold-accent); font-size: 0.95rem; font-weight: 700;">
                  "${activeName}"
                </div>
                ${copyButton}
              </div>
            </div>
            <div style="display: flex; gap: 16px; align-items: center; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--bhs-navy-border); padding: 8px 16px; border-radius: 8px; font-size: 0.85rem;">
              <div>
                <span class="text-muted" style="font-size:0.72rem; display:block;">TOTAL SESSION TIME</span>
                <strong style="color: var(--bhs-cyan-accent); font-size: 1.05rem;">⏱️ ${totalTimeStr}</strong>
              </div>
              <div style="border-left: 1px solid var(--bhs-navy-border); padding-left: 16px;">
                <span class="text-muted" style="font-size:0.72rem; display:block;">TOTAL DRILLS</span>
                <strong style="color: #FFF; font-size: 1.05rem;">⚽ ${this.data.currentPracticePlan.length} Drills</strong>
              </div>
            </div>
          </div>

            ${this.data.currentPracticePlan.length === 0 ? `
              <div style="text-align:center; padding:30px; color:var(--text-muted);">
                <p style="font-size:1rem; margin-bottom:8px;">Today's practice timeline is currently empty.</p>
                <p style="font-size:0.85rem;">Click <strong>+ Add Drill to Plan</strong> above or <strong>📂 Select Practice Plan</strong> to load a session.</p>
              </div>
            ` : this.data.currentPracticePlan.map((p, idx) => {
              const isSelected = (this.selectedDrillIndex === idx) || (this.selectedDrillIndex === undefined && idx === 0);
              if (this.selectedDrillIndex === undefined && idx === 0) this.selectedDrillIndex = 0;

              return `
                <div class="drill-item" 
                  draggable="true"
                  ondragstart="app.handleDrillDragStart(event, ${idx})"
                  ondragover="app.handleDrillDragOver(event, ${idx})"
                  ondragenter="app.handleDrillDragEnter(event, ${idx})"
                  ondragleave="app.handleDrillDragLeave(event, ${idx})"
                  ondrop="app.handleDrillDrop(event, ${idx})"
                  ondragend="app.handleDrillDragEnd(event)"
                  onclick="app.selectPracticeDrill(${idx})" 
                  style="flex-direction: column; align-items: stretch; cursor: grab; border: ${isSelected ? '2px solid var(--bhs-gold-accent)' : '1px solid var(--bhs-navy-border)'}; background: ${isSelected ? 'rgba(0, 71, 171, 0.25)' : 'rgba(0, 0, 0, 0.25)'}; transition: all 0.2s ease;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div style="display:flex; align-items:flex-start; gap:10px; flex:1;">
                      <div class="drag-handle" title="Drag to re-order drill timeline" style="cursor:grab; font-size:1.4rem; color:var(--bhs-gold-accent); padding:2px 4px; user-select:none; font-weight:bold;">⣿</div>
                      <div class="drill-info" style="flex: 1; padding-right: 20px;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 4px;">
                          <h4 style="margin: 0;">${p.name}</h4>
                          ${isSelected ? `<span class="badge badge-gold" style="font-size:0.7rem;">ACTIVE SELECTED DRILL</span>` : `<span class="badge badge-secondary" style="font-size:0.68rem; opacity:0.7;">CLICK TO SELECT</span>`}
                        </div>
                        <p style="white-space: pre-wrap; margin-top: 4px; color: var(--bhs-silver); font-size: 0.85rem;">💡 <strong>Coach Focus &amp; Notes:</strong>\n${p.coachNotes}</p>
                      </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                      <div style="text-align: right;">
                        <div class="drill-duration">${p.duration}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${p.time}</div>
                      </div>
                      <div style="display: flex; gap: 6px;">
                        <button class="btn ${isSelected ? 'btn-gold' : 'btn-secondary'}" style="padding: 4px 8px; font-size: 0.8rem;" onclick="event.stopPropagation(); app.openCreateMasterDrillModalForPlanDrill(${idx})">🎨 View / Edit Diagram</button>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="event.stopPropagation(); app.openEditPlanDrillModal(${idx})">✏️ Edit</button>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.2); color: var(--color-danger); border-color: var(--color-danger);" onclick="event.stopPropagation(); app.deletePlanDrill(${idx})">🗑️</button>
                      </div>
                    </div>
                  </div>

                  ${(() => {
                    const diagramImg = p.diagramImage || (this.data.drillsBank || []).find(d => d.name.toLowerCase() === (p.name || '').toLowerCase())?.diagramImage;
                    if (!diagramImg) return '';
                    return `
                      <div style="margin-top: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-gold-accent); padding: 10px; border-radius: 8px; text-align: left;">
                        <div style="font-size: 0.75rem; color: var(--bhs-gold-accent); margin-bottom: 6px; font-weight: 700; display:flex; justify-content:space-between; align-items:center;">
                          <span>🎨 TACTICAL DRILL DIAGRAM (CLICK TO EDIT IN FULL DIAGRAMMER)</span>
                          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.72rem; background: rgba(239,68,68,0.2); color: var(--color-danger);" onclick="event.stopPropagation(); app.removeDrillDiagram(${idx})">🗑️ Remove Diagram</button>
                        </div>
                        <img src="${diagramImg}" style="max-width: 100%; max-height: 260px; border-radius: 6px; object-fit: contain; background: #163d16; border: 1px solid var(--bhs-gold-accent); cursor: pointer;" onclick="event.stopPropagation(); app.openCreateMasterDrillModalForPlanDrill(${idx})" title="Click to open full tactical diagram editor" />
                      </div>
                    `;
                  })()}
                </div>
              `;
            }).join('')}
        </div>
      </div>
    `;
  },

  selectPracticeDrill(idx) {
    if (!this.data.currentPracticePlan || idx < 0 || idx >= this.data.currentPracticePlan.length) return;
    this.selectedDrillIndex = idx;

    // 1. Render view first so the canvas element 'soccerBoardCanvas' is re-created in DOM
    this.renderCurrentView();

    const drill = this.data.currentPracticePlan[idx];
    const masterDrill = (this.data.drillsBank || []).find(d => d.name.toLowerCase() === (drill?.name || '').toLowerCase());
    const targetData = drill?.diagramData || masterDrill?.diagramData;

    // 2. Initialize diagrammer on the active canvas element and load diagram elements (attackers, defenders, drawings)
    setTimeout(() => {
      if (this.diagrammer) {
        this.diagrammer.init('soccerBoardCanvas');
        if (targetData) {
          this.diagrammer.loadDiagramData(targetData);
        } else {
          this.diagrammer.clear();
        }
      }

      const card = document.getElementById('diagrammerCard');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  },

  setDiagramTool(tool) {
    if (this.diagrammer) {
      this.diagrammer.setTool(tool);
    }
  },

  async attachDiagramToDrill(targetIndex = null) {
    if (!this.diagrammer) return;
    const dataUrl = this.diagrammer.exportImage();
    const diagramData = this.diagrammer.exportDiagramData();
    if (!dataUrl) return;

    if (!this.data.currentPracticePlan || this.data.currentPracticePlan.length === 0) {
      alert('Please add at least one drill to today\'s practice timeline first using "+ Add Drill to Plan" above!');
      return;
    }

    let selectedIdx = (targetIndex !== null && targetIndex !== undefined) ? targetIndex : this.selectedDrillIndex;
    if (selectedIdx === null || selectedIdx === undefined || selectedIdx < 0 || selectedIdx >= this.data.currentPracticePlan.length) {
      const options = this.data.currentPracticePlan.map((p, idx) => `${idx + 1}. ${p.name}`).join('\n');
      this.showPromptModal({
        title: '🎯 ATTACH TACTICAL DIAGRAM TO DRILL',
        message: `Select practice drill number to attach this tactical diagram to:\n\n${options}`,
        defaultValue: '1',
        onConfirm: (selectedIdxStr) => {
          if (!selectedIdxStr) return;
          const idx = parseInt(selectedIdxStr) - 1;
          if (isNaN(idx) || idx < 0 || idx >= this.data.currentPracticePlan.length) {
            this.showAlertModal('Invalid Selection', 'Invalid drill selection.');
            return;
          }
          this.attachDiagramToDrillAtIndex(dataUrl, diagramData, idx);
        }
      });
      return;
    }

    if (isNaN(selectedIdx) || selectedIdx < 0 || selectedIdx >= this.data.currentPracticePlan.length) {
      alert('Invalid drill selection.');
      return;
    }

    const drill = this.data.currentPracticePlan[selectedIdx];
    drill.diagramImage = dataUrl;
    drill.diagramData = diagramData;
    this.selectedDrillIndex = selectedIdx;

    // Persist diagram to Master Drills Repository (drills_bank) so it only has to be created once
    if (!this.data.drillsBank) this.data.drillsBank = [];
    let masterDrill = this.data.drillsBank.find(d => d.name.toLowerCase() === drill.name.toLowerCase());
    if (!masterDrill) {
      masterDrill = {
        id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: drill.name,
        category: 'General',
        coachNotes: drill.coachNotes || ''
      };
      this.data.drillsBank.push(masterDrill);
    }
    masterDrill.diagramImage = dataUrl;
    masterDrill.diagramData = diagramData;

    this.saveData();

    // Persist to Supabase Database for both practice plan and drills_bank repository
    let dbSaved = true;
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      if (this.activeTeamId) {
        await window.supabaseService.upsertPracticePlanItem(this.activeTeamId, drill);
      } else {
        // upsertPracticePlanItem now refuses a non-uuid/absent team_id, so
        // sending nothing would silently drop this on the floor.
        dbSaved = false;
        console.warn('Practice plan diagram not saved to the database — no team is selected.');
      }
      await window.supabaseService.upsertDrillBankItem('bhs', masterDrill);
    }

    this.renderCurrentView();
    alert(dbSaved
      ? `🎉 Tactical drill diagram stored in Master Drills Repository (drills_bank) for "${drill.name}"!`
      : `⚠️ Diagram stored for "${drill.name}", but NOT saved to the database — no team is selected. Choose a team in the header first; it will disappear on reload.`);
  },

  async removeDrillDiagram(idx) {
    if (this.data.currentPracticePlan && this.data.currentPracticePlan[idx]) {
      const drill = this.data.currentPracticePlan[idx];
      delete drill.diagramImage;
      delete drill.diagramData;
      this.saveData();

      let dbSaved = true;
      if (window.supabaseService && window.supabaseService.isConfigured()) {
        if (this.activeTeamId) {
          await window.supabaseService.upsertPracticePlanItem(this.activeTeamId, drill);
        } else {
          // upsertPracticePlanItem now refuses a non-uuid/absent team_id, so
          // the removal would silently revert on the next reload otherwise.
          dbSaved = false;
          console.warn('Drill diagram removal not saved to the database — no team is selected.');
        }
      }

      this.renderCurrentView();
      if (!dbSaved) {
        alert('⚠️ Diagram removed from this screen, but NOT saved to the database — no team is selected. Choose a team in the header first; the diagram will reappear on reload.');
      }
    }
  },

  downloadDiagramPNG() {
    if (!this.diagrammer) return;
    const dataUrl = this.diagrammer.exportImage();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `bhs_cougars_drill_diagram_${Date.now()}.png`;
    a.click();
  },

  /**
   * Coach-written text lands inside HTML. Escaped rather than interpolated
   * raw: a question containing "<" would otherwise silently swallow the rest
   * of the option list.
   */
  escapeQuizText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  openTakeQuizModal(tab = 'quiz') {
    const activeThought = this.getActiveThought();
    const container = document.getElementById('quizModalContent');
    if (!container) return;

    // The questions this team asks, loaded by syncFromSupabase. Was five blocks
    // of hardcoded markup with the answer key written into submitQuizAnswer.
    const questions = this.data.quizQuestions || [];

    // An attempt is attributed to a person, so it needs a real one. This used to
    // fall back to a demo player, which meant a signed-out visitor's attempt was
    // written to the database under a name belonging to nobody.
    const currentUser = window.auth.getCurrentUser();
    const modal = document.getElementById('takeQuizModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }

    if (!currentUser) {
      container.innerHTML = `
        <div style="padding:20px; text-align:center;">
          <h3 style="color:var(--bhs-gold-accent); margin-bottom:10px;">Sign in to take the quiz</h3>
          <p style="color:var(--text-muted); font-size:0.9rem; line-height:1.6;">
            Quiz attempts are recorded against your player profile, so you need to be
            signed in before you can start. The Daily Thought itself is open to everyone.
          </p>
        </div>`;
      return;
    }

    const isLeaderboard = tab === 'leaderboard';

    container.innerHTML = `
      <div style="display: flex; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 10px;">
        <button class="btn ${!isLeaderboard ? 'btn-gold' : 'btn-secondary'}" onclick="app.openTakeQuizModal('quiz')" style="font-size: 0.82rem; font-weight: 700;">📝 Take Quiz${questions.length ? ' (' + questions.length + ')' : ''}</button>
        <button class="btn ${isLeaderboard ? 'btn-gold' : 'btn-secondary'}" onclick="app.openTakeQuizModal('leaderboard')" style="font-size: 0.82rem; font-weight: 700;">🏆 Quiz Results Leaderboard</button>
      </div>

      ${isLeaderboard ? this.renderQuizLeaderboardHTML() : `
        <div style="background: rgba(0, 71, 171, 0.2); border: 1px solid var(--bhs-navy-border); padding: 12px 14px; border-radius: 8px; margin-bottom: 16px;">
          <div style="font-size: 0.78rem; color: var(--bhs-gold-accent); font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">
            📌 Today's Tactical Focus${activeThought.coachName ? ` (${activeThought.coachName})` : ''}
          </div>
          <div style="font-size: 0.86rem; color: #FFF; font-style: italic; line-height: 1.4; max-height: 75px; overflow-y: auto;">
            "${activeThought.text}"
          </div>
        </div>

        <form id="dailyQuizForm" onsubmit="event.preventDefault(); app.submitQuizAnswer();" style="max-height: 440px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin;">
          ${questions.length === 0 ? `
            <div style="text-align:center; padding:26px; color:var(--text-muted);">
              <p style="font-size:1.05rem; margin-bottom:6px;">No quiz questions for this team yet.</p>
              <p style="font-size:0.85rem;">A coach adds them in the admin panel, then switches on the ones
                this squad should be asked.</p>
            </div>` : questions.map((q, i) => `
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;">
              <label style="display:block; color:#FFF; font-weight:700; font-size:0.9rem; margin-bottom:8px;">
                ${i + 1}. ${this.escapeQuizText(q.question)}
              </label>
              <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem;">
                ${(q.answers || []).map(a => `
                  <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                    <input type="radio" name="quiz_${q.question_id}" value="${a.letter}" required /> ${a.letter}) ${this.escapeQuizText(a.text)}
                  </label>`).join('')}
              </div>
            </div>`).join('')}

          ${questions.length ? `<button type="submit" class="btn btn-gold" style="width: 100%; font-weight: 700; padding: 10px; font-size: 0.95rem;">🎯 Submit &amp; Grade Quiz</button>` : ''}
        </form>
        <div id="quizScoreResult" style="margin-top: 14px;"></div>
      `}
    `;
  },

  async submitQuizAnswer() {
    // Guarded again here rather than trusting the modal: openTakeQuizModal is
    // not the only way this can be reached, and the consequence of a missing
    // check is a database row attributed to a player who does not exist.
    const currentUser = window.auth.getCurrentUser();
    if (!currentUser) {
      const resultDiv = document.getElementById('quizScoreResult');
      if (resultDiv) {
        resultDiv.innerHTML = `
          <div style="background:rgba(234,179,8,0.25); border:2px solid var(--bhs-gold-accent); padding:16px; border-radius:10px; text-align:center;">
            <strong>Sign in to record your score.</strong>
          </div>`;
      }
      return;
    }

    // Scored against the stored correct_option, not a key written into this
    // file. The old version hardcoded ['B','A','A','B','C'] here, so editing a
    // question in the database would have silently broken the marking.
    const questions = this.data.quizQuestions || [];
    if (questions.length === 0) return;

    let score = 0;
    const playerAnswers = questions.map(q => {
      const selected = document.querySelector(`input[name="quiz_${q.question_id}"]:checked`)?.value;
      // Marked against the answer row flagged correct (0019), falling back
      // to correct_option for a question whose options are still columns.
      const right = (q.answers || []).find(a => a.isCorrect);
      const rightLetter = right ? right.letter : q.correct_option;
      const isCorrect = !!selected && selected === rightLetter;
      if (isCorrect) score += 1;
      return {
        questionId: q.question_id,
        selectedOption: selected || null,
        isCorrect: isCorrect
      };
    });

    const totalQuestions = questions.length;
    const percentage = Math.round((score / totalQuestions) * 100);

    // Save attempt to local memory
    if (!this.data.quizAttempts) this.data.quizAttempts = [];
    const attemptRecord = {
      attempt_id: Date.now(),
      player_id: currentUser.id,
      player_name: currentUser.name,
      score: score,
      total_questions: totalQuestions,
      percentage: percentage,
      completed_at: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
    };
    this.data.quizAttempts.unshift(attemptRecord);
    this.saveData();

    // Save attempt & individual player_answers to Supabase Cloud
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.saveQuizAttempt(currentUser, playerAnswers, score, totalQuestions, this.activeTeamId);
    }

    const resultDiv = document.getElementById('quizScoreResult');
    if (resultDiv) {
      // Perfect is every question, not five: the quiz is however many
      // questions this team has switched on.
      const perfect = score === totalQuestions;

      // Explanations are written per question and nothing displayed them
      // before. Shown only for the ones missed -- a wall of text against
      // answers they already got right is noise.
      const missed = playerAnswers
        .map((a, i) => ({ a, q: questions[i] }))
        .filter(({ a, q }) => !a.isCorrect && q && q.explanation);

      resultDiv.innerHTML = `
        <div style="background: ${perfect ? 'rgba(34, 197, 94, 0.25)' : 'rgba(234, 179, 8, 0.25)'}; border: 2px solid ${perfect ? 'var(--color-success)' : 'var(--bhs-gold-accent)'}; padding: 16px; border-radius: 10px; text-align: center;">
          <h4 style="color: #FFF; margin-bottom: 6px;">
            ${perfect ? '🌟 PERFECT SCORE! 100%' : '🎯 QUIZ GRADED RESULT'}
          </h4>
          <div style="font-size: 1.8rem; font-weight: 800; color: ${percentage >= 80 ? 'var(--color-success)' : 'var(--bhs-gold-accent)'}; margin-bottom: 6px;">
            ${score} / ${totalQuestions} (${percentage}%)
          </div>
          <p style="font-size: 0.85rem; color: #FFF; margin: 0;">
            ${perfect
              ? 'Awesome job! Your attempt has been saved.'
              : "Review the coach's daily thoughts and attempt again to reach 100%!"}
          </p>
          <button class="btn btn-gold" onclick="app.openTakeQuizModal('leaderboard')" style="margin-top: 12px; font-size: 0.8rem;">🏆 View Leaderboard &amp; Results</button>
        </div>
        ${missed.length ? `
          <div style="margin-top: 12px; text-align: left;">
            <div style="color: var(--bhs-gold-accent); font-size: 0.8rem; font-weight: 700; margin-bottom: 6px;">WHY THOSE ANSWERS</div>
            ${missed.map(({ q }) => `
              <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); border-radius: 8px; padding: 10px 12px; margin-bottom: 6px;">
                <div style="color:#FFF; font-size:0.82rem; font-weight:700; margin-bottom:3px;">${this.escapeQuizText(q.question)}</div>
                <div class="text-muted" style="font-size:0.8rem;">${this.escapeQuizText(q.explanation)}</div>
              </div>`).join('')}
          </div>` : ''}
      `;
    }
  },

  renderQuizLeaderboardHTML() {
    const localAttempts = this.data.quizAttempts || [];

    return `
      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px; margin-bottom: 14px;">
        <h4 style="color: var(--bhs-gold-accent); margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
          <span>📊</span> GRADED QUIZ RESULTS (VIEW: quiz_results)
        </h4>
        <p class="text-muted" style="font-size: 0.82rem; margin: 0;">
          Calculated from <code>quiz_attempts</code> &amp; <code>player_answers</code> database tables.
        </p>
      </div>

      <div style="max-height: 360px; overflow-y: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid var(--bhs-navy-border); color: var(--bhs-gold-accent);">
              <th style="padding: 8px;">PLAYER NAME</th>
              <th style="padding: 8px; text-align: center;">SCORE</th>
              <th style="padding: 8px; text-align: center;">PERCENTAGE</th>
              <th style="padding: 8px; text-align: right;">COMPLETED AT</th>
            </tr>
          </thead>
          <tbody>
            ${localAttempts.map(a => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                <td style="padding: 10px 8px; font-weight: 600; color: #FFF;">⚽ ${a.player_name}</td>
                <td style="padding: 10px 8px; text-align: center; font-weight: 700; color: ${a.score >= 4 ? 'var(--color-success)' : 'var(--bhs-gold-accent)'};">${a.score} / ${a.total_questions}</td>
                <td style="padding: 10px 8px; text-align: center;"><span class="badge ${a.percentage === 100 ? 'badge-gold' : 'badge-primary'}">${a.percentage}%</span></td>
                <td style="padding: 10px 8px; text-align: right; color: var(--text-muted); font-size: 0.78rem;">${a.completed_at || 'Just now'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderCoachesView() {
    const isCoach = window.auth.isCoach();
    const coaches = this.data.coaches || [];

    return `
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">${this.activeTeamLabel().org.toUpperCase()} COACHING STAFF</h2>
            <p class="text-muted">Leadership, tactical direction &amp; player development team</p>
          </div>
          ${isCoach ? `<button class="btn btn-gold" onclick="app.openAddCoachModal()">+ Add New Coach</button>` : ''}
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
          ${coaches.map(c => `
            <div class="player-card" style="padding: 24px; position: relative;">
              ${isCoach ? `
                <div style="position: absolute; top: 15px; right: 15px; display: flex; gap: 6px;">
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="app.openEditCoachModal('${c.id}')">✏️ Edit</button>
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.2); color: var(--color-danger); border-color: var(--color-danger);" onclick="app.deleteCoach('${c.id}')">🗑️</button>
                </div>
              ` : ''}

              <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <img src="${this.photoOrPlaceholder(c.photo, 'coach')}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--bhs-gold-accent); object-fit: cover;" alt="${c.name}" />
                <div>
                  <h3 style="color: #FFF; font-size: 1.25rem; margin-bottom: 4px;">${c.name}</h3>
                  <span class="badge badge-coach">${c.level}</span>
                </div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem; color: var(--bhs-silver); margin-bottom: 16px;">
                <div>📞 <strong>Phone:</strong> <a href="tel:${c.phone}" style="color: var(--bhs-cyan-accent); text-decoration: none;">${c.phone}</a></div>
                <div>✉️ <strong>Email:</strong> <a href="mailto:${c.email}" style="color: var(--bhs-cyan-accent); text-decoration: none;">${c.email}</a></div>
                <div>📍 <strong>Address / Location:</strong> ${c.address}</div>
              </div>

              ${c.bio ? `
                <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 12px; border-radius: 8px; font-size: 0.83rem; color: var(--text-muted); line-height: 1.5;">
                  📝 <strong>Bio:</strong> ${c.bio}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  openAddCoachModal() {
    const modal = document.getElementById('addCoachModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  getSchoolsList() {
    if (!this.data.schools || !Array.isArray(this.data.schools) || this.data.schools.length === 0) {
      this.data.schools = this.data.school ? [this.data.school] : [];
    }
    return this.data.schools;
  },

  populateCoachSchoolDropdown(selectId, selectedCode = 'bhs') {
    const el = document.getElementById(selectId);
    if (!el) return;

    const schools = this.getSchoolsList();
    el.innerHTML = `
      ${schools.map(s => {
        const code = s.code || s.id || 'bhs';
        const isSelected = (code.toLowerCase() === (selectedCode || 'bhs').toLowerCase());
        return `<option value="${code}" ${isSelected ? 'selected' : ''}>🏫 ${s.name} (${s.mascot || code})</option>`;
      }).join('')}
      <option value="NEW_SCHOOL" style="font-weight:700; color:var(--bhs-gold-accent);">➕ Add New School / Club...</option>
    `;
  },

  handleCoachSchoolSelect(val, mode) {
    if (val === 'NEW_SCHOOL') {
      this.pendingCoachSchoolMode = mode;
      this.openSchoolFormModal();
    }
  },

  populateSchoolFormSelect(selectedCode = null) {
    const el = document.getElementById('schoolFormSelect');
    if (!el) return;

    const schools = this.getSchoolsList();
    const currentCode = (selectedCode || this.data.school?.code || 'bhs').toLowerCase();

    el.innerHTML = `
      ${schools.map(s => {
        const code = (s.code || s.id || 'bhs').toLowerCase();
        const isSel = code === currentCode;
        return `<option value="${code}" ${isSel ? 'selected' : ''}>🏫 ${s.name} (${s.mascot || code.toUpperCase()})</option>`;
      }).join('')}
      <option value="NEW_SCHOOL" style="font-weight:700; color:var(--bhs-gold-accent);">➕ Add New School / Club...</option>
    `;
  },

  onSchoolFormSelectChange(val) {
    if (val === 'NEW_SCHOOL') {
      document.getElementById('schoolFormCode').value = '';
      document.getElementById('schoolFormName').value = '';
      document.getElementById('schoolFormMascot').value = '';
      document.getElementById('schoolFormCity').value = '';
      document.getElementById('schoolFormPrimaryColor').value = '#0047AB';
      document.getElementById('schoolFormSecondaryColor').value = '#FFD700';
      document.getElementById('schoolFormWins').value = 0;
      document.getElementById('schoolFormLosses').value = 0;
      document.getElementById('schoolFormDraws').value = 0;
    } else {
      const schools = this.getSchoolsList();
      const s = schools.find(item => (item.code || item.id || '').toLowerCase() === val.toLowerCase());
      if (s) {
        this.fillSchoolFormFields(s);
      }
    }
  },

  fillSchoolFormFields(s) {
    document.getElementById('schoolFormCode').value = s.code || s.id || '';
    document.getElementById('schoolFormName').value = s.name || '';
    document.getElementById('schoolFormMascot').value = s.mascot || '';
    document.getElementById('schoolFormCity').value = s.city || '';
    document.getElementById('schoolFormPrimaryColor').value = s.colors?.primary || '#0047AB';
    document.getElementById('schoolFormSecondaryColor').value = s.colors?.secondary || '#FFD700';
    document.getElementById('schoolFormWins').value = s.record?.wins ?? 0;
    document.getElementById('schoolFormLosses').value = s.record?.losses ?? 0;
    document.getElementById('schoolFormDraws').value = s.record?.draws ?? 0;
  },

  openSchoolFormModal(schoolData = null) {
    const sData = schoolData || this.data.school;
    if (!sData) return;
    this.populateSchoolFormSelect(sData.code || sData.id);
    this.fillSchoolFormFields(sData);

    const noticeEl = document.getElementById('schoolFormStatusNotice');
    if (noticeEl) {
      if (window.supabaseService?.isConfigured()) {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(40,167,69,0.2)';
        noticeEl.style.borderColor = 'rgba(40,167,69,0.4)';
        noticeEl.innerHTML = '⚡ <strong>Cloud DB Active:</strong> Changes will sync live to <strong>Supabase DB</strong> (`schools` table).';
      } else {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(255,193,7,0.2)';
        noticeEl.style.borderColor = 'rgba(255,193,7,0.4)';
        noticeEl.innerHTML = '📦 <strong>Local Mode Active:</strong> Supabase Cloud DB is not configured, so changes will not be saved. (Provide Supabase key in Admin Center to enable cloud sync).';
      }
    }

    const modal = document.getElementById('schoolFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async submitSchoolForm() {
    const statusNotice = document.getElementById('schoolFormStatusNotice');
    const submitBtn = document.querySelector('#schoolFormModal button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '💾 Save to Database';

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Saving School Profile...';
      }

      const code = (document.getElementById('schoolFormCode')?.value || '').trim().toLowerCase();
      const name = (document.getElementById('schoolFormName')?.value || '').trim();
      const mascot = (document.getElementById('schoolFormMascot')?.value || '').trim();
      const city = (document.getElementById('schoolFormCity')?.value || '').trim();
      const primaryColor = document.getElementById('schoolFormPrimaryColor')?.value || '#0047AB';
      const secondaryColor = document.getElementById('schoolFormSecondaryColor')?.value || '#FFD700';
      const wins = parseInt(document.getElementById('schoolFormWins')?.value || 0, 10);
      const losses = parseInt(document.getElementById('schoolFormLosses')?.value || 0, 10);
      const draws = parseInt(document.getElementById('schoolFormDraws')?.value || 0, 10);

      if (!code || !name) {
        alert('⚠️ Please enter a valid School Code and School Name.');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalBtnText; }
        return;
      }

      const schools = this.getSchoolsList();
      const existing = schools.find(s => (s.code || s.id || '').toLowerCase() === code);

      const schoolObj = {
        id: (existing?.id && existing.id.length === 36 && existing.id.includes('-')) ? existing.id : undefined,
        code,
        name,
        mascot,
        city,
        colors: { primary: primaryColor, secondary: secondaryColor },
        record: { wins, losses, draws }
      };

      // 1. Update active school object and multi-tenant schools array
      this.data.school = schoolObj;

      const existingIdx = schools.findIndex(s => (s.code || s.id || '').toLowerCase() === code);
      if (existingIdx !== -1) {
        schools[existingIdx] = { ...schools[existingIdx], ...schoolObj };
      } else {
        schools.push(schoolObj);
      }
      this.data.schools = schools;

      // 2. Update in-memory app state (saveData() is a no-op; Postgres is source of truth)
      this.saveData();

      // 3. Save / Upsert to Supabase Database (if configured)
      let cloudRes = null;
      if (window.supabaseService?.isConfigured()) {
        cloudRes = await window.supabaseService.upsertSchool(code, schoolObj);
        if (cloudRes && cloudRes.data && cloudRes.data.id) {
          schoolObj.id = cloudRes.data.id;
          this.saveData();
        }
      }

      // Update dropdowns & branding
      if (this.pendingCoachSchoolMode === 'edit') {
        this.populateCoachSchoolDropdown('editCoachSchool', code);
      } else if (this.pendingCoachSchoolMode === 'add') {
        this.populateCoachSchoolDropdown('newCoachSchool', code);
      }

      this.updateHeaderBranding();
      this.renderCurrentView();

      // Provide clear, unambiguous user feedback!
      if (cloudRes && cloudRes.data) {
        if (statusNotice) {
          statusNotice.style.display = 'block';
          statusNotice.style.background = 'rgba(40,167,69,0.25)';
          statusNotice.style.borderColor = 'rgba(40,167,69,0.6)';
          statusNotice.innerHTML = `✅ <strong>Saved to Supabase DB!</strong><br/>School "${name}" (${code}) successfully updated in cloud database.`;
        }
        alert(`✅ SUCCESS!\n\nSchool profile for "${name} ${mascot}" has been synced to your Supabase Cloud Database!`);
        this.closeModal('schoolFormModal');
      } else if (cloudRes && cloudRes.error) {
        if (statusNotice) {
          statusNotice.style.display = 'block';
          statusNotice.style.background = 'rgba(220,53,69,0.25)';
          statusNotice.style.borderColor = 'rgba(220,53,69,0.6)';
          statusNotice.innerHTML = `⚠️ <strong>Cloud DB Error — Not Saved:</strong> ${cloudRes.error}`;
        }
        alert(`⚠️ NOT SAVED\n\nA Supabase Cloud error occurred, so this school profile was not persisted:\n${cloudRes.error}\n\nMake sure the "schools" table and RLS policies are created in your Supabase SQL Editor.`);
      } else {
        if (statusNotice) {
          statusNotice.style.display = 'block';
          statusNotice.style.background = 'rgba(255,193,7,0.25)';
          statusNotice.style.borderColor = 'rgba(255,193,7,0.6)';
          statusNotice.innerHTML = `📦 <strong>Not Saved — Cloud DB Not Configured.</strong><br/>Enter your Supabase Anon key in Admin Center to enable cloud database sync.`;
        }
        alert(`📦 NOT SAVED\n\nSupabase Cloud DB is not configured, so this school profile was not persisted.\n\n(To save to Supabase Cloud DB, click "Sign In / Register" -> Admin Center and enter your Supabase Anon Key).`);
        this.closeModal('schoolFormModal');
      }
    } catch (err) {
      console.error('Error submitting school form:', err);
      alert(`❌ Error saving school data:\n${err.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }
  },

  updateHeaderBranding() {
    const school = this.data.school;
    if (!school) return;
    const headerSchoolName = document.querySelector('.brand-text h1');
    const headerSchoolTag = document.querySelector('.brand-text p');
    if (headerSchoolName) {
      headerSchoolName.textContent = (school.name || 'BEAUMONT HIGH SCHOOL').toUpperCase();
    }
    if (headerSchoolTag) {
      headerSchoolTag.textContent = `${(school.mascot || 'COUGARS').toUpperCase()} • HIGH SCHOOL SOCCER`;
    }
    const footerSchoolName = document.querySelector('footer strong');
    if (footerSchoolName) {
      footerSchoolName.textContent = `${school.name || 'Beaumont High School'} Soccer Program`;
    }
  },

  openAddCoachModal() {
    this.populateCoachSchoolDropdown('newCoachSchool', this.data.school?.code || 'bhs');
    const modal = document.getElementById('addCoachModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async addCoach(data) {
    const schoolCode = data.schoolCode || 'bhs';
    const newCoach = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      schoolCode: schoolCode,
      name: data.name.trim(),
      level: data.level.trim(),
      phone: data.phone.trim(),
      address: data.address.trim(),
      email: data.email.trim(),
      // Stored empty rather than defaulted to a stock photo: assigning a random
      // stranger's face makes a coach without a photo look like they have one.
      // The coaches view renders the silhouette placeholder instead.
      photo: (data.photo || '').trim(),
      bio: data.bio?.trim() || ''
    };

    if (!this.data.coaches) this.data.coaches = [];
    this.data.coaches.push(newCoach);
    this.saveData();

    if (window.supabaseService?.isConfigured()) {
      const saved = await window.supabaseService.upsertCoach(schoolCode, newCoach);
      if (saved && saved.id) newCoach.id = saved.id;
    }

    this.renderCurrentView();
    this.closeModals();
    alert(`✅ Coach "${newCoach.name}" added to coaching staff successfully!`);
  },

  openEditCoachModal(coachId) {
    const coach = (this.data.coaches || []).find(c => c.id === coachId);
    if (!coach) return;

    this.populateCoachSchoolDropdown('editCoachSchool', coach.schoolCode || coach.school_id || 'bhs');
    document.getElementById('editCoachId').value = coach.id;
    document.getElementById('editCoachName').value = coach.name;
    document.getElementById('editCoachLevel').value = coach.level;
    document.getElementById('editCoachPhone').value = coach.phone;
    document.getElementById('editCoachEmail').value = coach.email;
    document.getElementById('editCoachAddress').value = coach.address;
    document.getElementById('editCoachPhoto').value = coach.photo;
    document.getElementById('editCoachBio').value = coach.bio || '';

    const modal = document.getElementById('editCoachModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async submitEditCoach() {
    const id = document.getElementById('editCoachId').value;
    const index = (this.data.coaches || []).findIndex(c => c.id === id);
    if (index === -1) return;

    const schoolCode = document.getElementById('editCoachSchool').value || 'bhs';
    const updated = {
      ...this.data.coaches[index],
      schoolCode: schoolCode,
      name: document.getElementById('editCoachName').value.trim(),
      level: document.getElementById('editCoachLevel').value.trim(),
      phone: document.getElementById('editCoachPhone').value.trim(),
      email: document.getElementById('editCoachEmail').value.trim(),
      address: document.getElementById('editCoachAddress').value.trim(),
      photo: document.getElementById('editCoachPhoto').value.trim(),
      bio: document.getElementById('editCoachBio').value.trim()
    };

    this.data.coaches[index] = updated;
    this.saveData();

    if (window.supabaseService?.isConfigured()) {
      await window.supabaseService.upsertCoach(schoolCode, updated);
    }

    this.renderCurrentView();
    this.closeModals();
    alert(`✅ Coach profile updated for "${updated.name}"!`);
  },

  async deleteCoach(coachId) {
    const coach = (this.data.coaches || []).find(c => c.id === coachId);
    if (!coach) return;

    this.showConfirmModal({
      title: '🗑️ REMOVE COACH PROFILE',
      message: `Are you sure you want to remove "${coach.name}" from the coaching staff?`,
      confirmText: '🗑️ Remove Coach',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        this.data.coaches = (this.data.coaches || []).filter(c => c.id !== coachId);
        this.saveData();

        if (window.supabaseService?.isConfigured()) {
          await window.supabaseService.deleteCoach(coachId);
        }

        this.renderCurrentView();
      }
    });
  },

  openSavePlanModal() {
    if (!this.data.currentPracticePlan || this.data.currentPracticePlan.length === 0) {
      alert('Your current practice timeline is empty. Add at least one drill to the plan before saving.');
      return;
    }
    const input = document.getElementById('savePlanNameInput');
    if (input) {
      input.value = this.data.activePlanName || `Practice Plan - ${new Date().toLocaleDateString()}`;
      setTimeout(() => { input.focus(); input.select(); }, 150);
    }
    const modal = document.getElementById('savePlanModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async savePracticePlan(planName, triggerDownload = true) {
    if (!planName || !planName.trim()) {
      alert('Please enter a valid name for the practice plan.');
      return;
    }
    const cleanName = planName.trim();
    if (!this.data.savedPlans) this.data.savedPlans = [];
    const existingIndex = this.data.savedPlans.findIndex(p => p.name.toLowerCase() === cleanName.toLowerCase());

    const planObj = {
      id: existingIndex !== -1 ? this.data.savedPlans[existingIndex].id : 'plan_' + Date.now(),
      name: cleanName,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
      drills: JSON.parse(JSON.stringify(this.data.currentPracticePlan))
    };

    if (existingIndex !== -1) {
      this.data.savedPlans[existingIndex] = planObj;
    } else {
      this.data.savedPlans.push(planObj);
    }

    this.data.activePlanName = cleanName;
    this.tagWorkingPlanTeam();
    this.saveData();

    let dbSaved = true;
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      if (this.activeTeamId) {
        const res = await window.supabaseService.saveFullPracticePlan(this.activeTeamId, cleanName, planObj.drills);
        if (!(res && res.success)) dbSaved = false;
      } else {
        // saveFullPracticePlan now refuses a non-uuid/absent team_id, so
        // sending nothing would silently drop this plan on the floor.
        dbSaved = false;
        console.warn('Practice plan not saved to the database — no team is selected.');
      }
    }

    this.renderCurrentView();
    this.closeModals();

    if (triggerDownload) {
      // Trigger native browser File Save dialog with Filename Box prefilled with cleanName
      this.downloadPracticePlan('html');
    } else {
      alert(dbSaved
        ? `✅ Practice Plan "${cleanName}" saved to database successfully!`
        : `⚠️ Practice Plan "${cleanName}" saved to this screen, but NOT to the database — no team is selected. Choose a team in the header first; it will disappear on reload.`);
    }
  },

  openLoadPlanModal() {
    const container = document.getElementById('savedPlansContainer');
    const saved = this.data.savedPlans || [];

    if (container) {
      if (saved.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:30px; color:var(--text-muted);">
            <p style="font-size:1.1rem; margin-bottom:8px;">No practice plans for this team yet.</p>
            <p style="font-size:0.85rem;">Build one below, or open a plan on another team and use
              <strong style="color:#FFF;">Copy to team…</strong> &mdash; plans belong to a single team
              now, so ${this.activeTeamLabel ? (this.activeTeamLabel().team || 'this team') : 'this team'} starts fresh.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:12px; max-height:420px; overflow-y:auto; padding-right:4px;">
            ${saved.map(p => `
              <div style="background:var(--bhs-navy-card); border:1px solid var(--bhs-navy-border); border-radius:10px; padding:16px; display:flex; justify-content:space-between; align-items:center; gap:15px; flex-wrap:wrap;">
                <div>
                  <h4 style="color:#FFF; margin-bottom:4px;">${p.name}</h4>
                  <div style="font-size:0.8rem; color:var(--text-muted);">
                    📅 Saved: ${p.date || 'Recently'} &nbsp;·&nbsp; ⚽ Drills: <strong>${p.drills ? p.drills.length : 0}</strong>
                  </div>
                  <div style="font-size:0.75rem; color:var(--bhs-cyan-accent); margin-top:4px;">
                    ${(p.drills || []).map(d => d.name).slice(0, 3).join(', ')}${(p.drills || []).length > 3 ? '...' : ''}
                  </div>
                </div>
                <div style="display:flex; gap:8px;">
                  <button class="btn btn-gold" style="padding:6px 12px; font-size:0.82rem;" onclick="app.loadPracticePlan('${p.id}')">⚡ Load Plan</button>
                  <button class="btn btn-secondary" style="padding:6px 10px; font-size:0.82rem;" onclick="app.renameSavedPlan('${p.id}')" title="Rename this plan">✏️ Rename</button>
                  <button class="btn btn-secondary" style="padding:6px 10px; font-size:0.82rem; background:rgba(239, 68, 68, 0.2); color:var(--color-danger); border-color:var(--color-danger);" onclick="app.deleteSavedPlan('${p.id}')">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    const modal = document.getElementById('loadPlanModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  loadPracticePlan(planId) {
    const plan = (this.data.savedPlans || []).find(p => p.id === planId);
    if (!plan) return;

    this.showConfirmModal({
      title: '📂 LOAD PRACTICE PLAN',
      message: `Load practice plan "${plan.name}"?\n\nThis will replace today's practice timeline with the ${plan.drills.length} drills from this plan.`,
      confirmText: '📂 Load Plan',
      confirmClass: 'btn-gold',
      onConfirm: () => {
        this.data.currentPracticePlan = JSON.parse(JSON.stringify(plan.drills));
        this.data.activePlanName = plan.name;
        this.tagWorkingPlanTeam();
        this.saveData();
        this.renderCurrentView();
        this.closeModals();
      }
    });
  },

  /**
   * Rename a saved plan.
   *
   * A plan is the set of practice_plans rows sharing a name, so this renames
   * every slot in one write. The service refuses a rename onto a name this
   * team already uses: Postgres would accept it and quietly fuse the two into
   * a single session with overlapping times.
   *
   * The local copies are updated alongside the database rather than by a full
   * re-sync, so the modal stays open on the list the coach is working through.
   */
  renameSavedPlan(planId) {
    const plan = (this.data.savedPlans || []).find(p => p.id === planId);
    if (!plan) return;

    this.showPromptModal({
      title: '✏️ RENAME PRACTICE PLAN',
      message: `Rename "${plan.name}". Every drill slot in this plan moves with it.`,
      defaultValue: plan.name,
      placeholder: 'e.g. Short Varsity 60-Min High Intensity',
      confirmText: '✏️ Rename',
      onConfirm: async (value) => {
        const newName = (value || '').trim();
        if (!newName || newName === plan.name) { this.openLoadPlanModal(); return; }

        if (!window.supabaseService || !window.supabaseService.isConfigured()) {
          window.alert('Cloud database is not configured; the plan was not renamed.');
          return;
        }
        if (!this.activeTeamId) {
          window.alert('No team is selected, so the plan was not renamed. Choose a team in the header first.');
          return;
        }

        const oldName = plan.name;
        const res = await window.supabaseService.renamePracticePlan(this.activeTeamId, oldName, newName);
        if (!res || !res.ok) {
          window.alert((res && res.error) || 'Could not rename that plan.');
          this.openLoadPlanModal();
          return;
        }

        // Keep local state in step: the saved list, and the active plan name if
        // this is the plan currently loaded into the timeline. oldName is read
        // before the mutation below -- comparing after it would always match.
        plan.name = newName;
        if (this.data.activePlanName === oldName) this.data.activePlanName = newName;
        this.saveData();
        this.renderCurrentView();
        this.openLoadPlanModal();
      }
    });
  },

  deleteSavedPlan(planId) {
    const plan = (this.data.savedPlans || []).find(p => p.id === planId);
    if (!plan) return;

    this.showConfirmModal({
      title: '🗑️ DELETE SAVED PLAN',
      message: `Are you sure you want to delete the saved plan "${plan.name}"?`,
      confirmText: '🗑️ Delete Plan',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        this.data.savedPlans = (this.data.savedPlans || []).filter(p => p.id !== planId);
        this.saveData();
        this.openLoadPlanModal();
      }
    });
  },

  generateDiagramStepDataUrl(diagramData, stepIndex = 0, targetWidth = 800) {
    if (!diagramData) return null;

    let parsed = diagramData;
    if (typeof diagramData === 'string') {
      try { parsed = JSON.parse(diagramData); } catch (e) { return null; }
    }

    const pitchType = parsed.pitchType || 'full';
    const keyframes = parsed.keyframes || [];

    let elements = [];
    let drawings = [];
    let stepLabel = 'Tactical Pitch Diagram';

    if (keyframes.length > 0 && stepIndex >= 0 && stepIndex < keyframes.length) {
      const kf = keyframes[stepIndex];
      elements = (kf && Array.isArray(kf.elements)) ? kf.elements : (parsed.elements || []);
      drawings = (kf && Array.isArray(kf.drawings)) ? kf.drawings : (parsed.drawings || []);
      stepLabel = kf.label || `Step ${stepIndex + 1}`;
    } else {
      elements = parsed.elements || [];
      drawings = parsed.drawings || [];
    }

    // Native tactical canvas dimensions are 800 x 480 (100% identical to interactive board on website)
    const nativeWidth = 800;
    const nativeHeight = 480;

    const canvas = document.createElement('canvas');
    canvas.width = nativeWidth;
    canvas.height = nativeHeight;
    const ctx = canvas.getContext('2d');

    // Bind dummy board object to reuse exact SoccerTacticalBoard rendering routines
    const dummyBoard = {
      ctx: ctx,
      pitchType: pitchType
    };

    // 1. Render Pitch
    SoccerTacticalBoard.prototype.drawPitch.call(dummyBoard, nativeWidth, nativeHeight);

    // 2. Render Paths
    drawings.forEach(d => {
      SoccerTacticalBoard.prototype.drawPath.call(dummyBoard, d);
    });

    // 3. Render Elements
    elements.forEach(el => {
      SoccerTacticalBoard.prototype.drawElement.call(dummyBoard, el);
    });

    return {
      dataUrl: canvas.toDataURL('image/png'),
      label: stepLabel
    };
  },

  printPracticePlan() {
    const plan = this.data.currentPracticePlan || [];

    if (plan.length === 0) {
      this.showAlertModal('Timeline Empty', 'Your current practice timeline is empty. Add at least one drill to the plan before printing.');
      return;
    }

    const modal = document.getElementById('printPlanModal');
    const input = document.getElementById('practiceStartTimeInput');
    if (modal && input) {
      const savedTime = this.data.practiceStartTime || '4:00 PM';
      let matchFound = Array.from(input.options).some(opt => opt.value === savedTime);
      if (!matchFound) {
        const customOpt = document.createElement('option');
        customOpt.value = savedTime;
        customOpt.textContent = savedTime;
        input.appendChild(customOpt);
      }
      input.value = savedTime;
      modal.style.display = '';
      modal.classList.add('active');
      setTimeout(() => {
        input.focus();
      }, 50);
    } else {
      this.confirmPrintPracticePlan(this.data.practiceStartTime || '4:00 PM');
    }
  },

  confirmPrintPracticePlan(startTimeInput) {
    this.closeModals();
    const activeName = this.data.activePlanName || 'Standard Practice Session';
    const plan = this.data.currentPracticePlan || [];

    if (plan.length === 0) return;

    // Parse start time into total minutes
    let startMins = 16 * 60; // default 4:00 PM
    const rawStart = (startTimeInput || '').trim();
    if (rawStart) {
      const converted = this.format12hTo24h(rawStart) || rawStart;
      const parts = converted.split(':').map(n => parseInt(n, 10));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        startMins = parts[0] * 60 + parts[1];
      }
    }

    // Save chosen start time for next print
    this.data.practiceStartTime = rawStart || '4:00 PM';
    this.saveData();

    // Build running timeline: compute start & end time for each drill inline
    const toHHMM = (totalMins) => {
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      return this.format24hTo12h(`${hh}:${mm}`);
    };

    let cursor = startMins;
    const drillTimes = plan.map(d => {
      const mins = parseInt((d.duration || '').match(/(\d+)/)?.[1] || '20', 10);
      const start = toHHMM(cursor);
      const end   = toHHMM(cursor + mins);
      cursor += mins;
      return { start, end };
    });

    let totalMinutes = 0;
    plan.forEach(p => {
      const match = (p.duration || '').match(/(\d+)/);
      if (match) totalMinutes += parseInt(match[1]);
    });

    let totalTimeStr = `${totalMinutes} min`;
    if (totalMinutes >= 60) {
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      totalTimeStr = `${totalMinutes} min (${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''})`;
    }

    const sessionStart = toHHMM(startMins);
    const sessionEnd   = toHHMM(startMins + totalMinutes);
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // ── Pre-build every table row BEFORE assembling the template ──────────────
    // (Avoids nested template literal mis-parsing that caused only the last row to render)
    let tableRowsHtml = '';
    let elapsedSoFar = 0;

    for (let idx = 0; idx < plan.length; idx++) {
      const d = plan[idx];
      const drillMins = parseInt((d.duration || '').match(/(\d+)/)?.[1] || '0', 10);
      const drillElapsed = elapsedSoFar;
      elapsedSoFar += drillMins;

      const timeStart = drillTimes[idx] ? drillTimes[idx].start : '';
      const timeEnd   = drillTimes[idx] ? drillTimes[idx].end   : '';

      // Resolve diagram: prioritize Master Drill Library repository (Edit Master Drill)
      const masterDrill = (this.data.drillsBank || []).find(b =>
        (d.drillId && b.id === d.drillId) ||
        (d.id && b.id === d.id) ||
        (b.name && d.name && b.name.toLowerCase().trim() === d.name.toLowerCase().trim())
      );

      let masterParsed = masterDrill ? masterDrill.diagramData : null;
      if (typeof masterParsed === 'string') {
        try { masterParsed = JSON.parse(masterParsed); } catch(e) { masterParsed = null; }
      }

      let planParsed = d.diagramData;
      if (typeof planParsed === 'string') {
        try { planParsed = JSON.parse(planParsed); } catch(e) { planParsed = null; }
      }

      // If Master Drill has keyframes (from Edit Master Drill editor), prioritize it
      let parsedDiagram = null;
      if (masterParsed && masterParsed.keyframes && masterParsed.keyframes.length > 0) {
        parsedDiagram = masterParsed;
      } else if (planParsed && planParsed.keyframes && planParsed.keyframes.length > 0) {
        parsedDiagram = planParsed;
      } else {
        parsedDiagram = masterParsed || planParsed;
      }

      const diagramImage = (masterDrill && masterDrill.diagramImage) || d.diagramImage;
      const keyframes = (parsedDiagram && parsedDiagram.keyframes && parsedDiagram.keyframes.length > 0)
        ? parsedDiagram.keyframes
        : (d.keyframes || (masterDrill && masterDrill.keyframes) || []);

      let diagramHtml = '';

      // 1. Keyframe sequence — render EVERY step frame card
      if (keyframes.length > 0) {
        let stepCardsHtml = '';
        const diagramToPass = parsedDiagram || { keyframes, pitchType: d.pitchType || (masterDrill && masterDrill.pitchType) };
        for (let stepIdx = 0; stepIdx < keyframes.length; stepIdx++) {
          const kf = keyframes[stepIdx];
          const stepObj = this.generateDiagramStepDataUrl(diagramToPass, stepIdx, 560);
          if (!stepObj || !stepObj.dataUrl) continue;
          stepCardsHtml +=
            '<div style="flex:1 1 240px;max-width:100%;background:#FFFFFF;border:1px solid #D1D5DB;border-radius:8px;padding:12px;page-break-inside:avoid;box-shadow:0 1px 3px rgba(0,0,0,0.05);">' +
              '<div style="font-weight:700;font-size:11px;color:#0047AB;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #E5E7EB;padding-bottom:4px;">' +
                '<span>📍 ' + (kf.label || ('Step ' + (stepIdx + 1))) + '</span>' +
                '<span style="color:#6B7280;font-size:10px;font-weight:600;">FRAME #' + (stepIdx + 1) + ' OF ' + keyframes.length + '</span>' +
              '</div>' +
              '<img src="' + stepObj.dataUrl + '" style="width:100%;max-width:520px;height:auto;border-radius:4px;border:1px solid #9CA3AF;display:block;margin:0 auto;" />' +
            '</div>';
        }
        if (stepCardsHtml) {
          diagramHtml =
            '<div style="margin-top:12px;background:#F8FAFC;border:1px solid #E2E8F0;padding:12px;border-radius:8px;page-break-inside:avoid;">' +
              '<div style="font-weight:700;font-size:12px;color:#1E293B;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">' +
                '📐 Tactical Pitch Diagram — Complete Sequence (' + keyframes.length + ' Step' + (keyframes.length > 1 ? 's' : '') + '):' +
              '</div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;">' +
                stepCardsHtml +
              '</div>' +
            '</div>';
        }
      }

      // 2. Direct diagram image (attached PNG / data URL)
      if (!diagramHtml && diagramImage) {
        diagramHtml =
          '<div style="margin-top:10px;background:#F8FAFC;border:1px solid #E2E8F0;padding:10px;border-radius:8px;page-break-inside:avoid;">' +
            '<div style="font-weight:700;font-size:12px;color:#0047AB;margin-bottom:6px;">📐 Tactical Pitch Diagram:</div>' +
            '<img src="' + diagramImage + '" style="width:100%;max-width:520px;height:auto;border-radius:4px;border:1px solid #9CA3AF;display:block;margin:0 auto;" />' +
          '</div>';
      }

      // 3. Dynamic canvas rendering from diagramData elements/drawings
      if (!diagramHtml && parsedDiagram && ((parsedDiagram.elements && parsedDiagram.elements.length > 0) || (parsedDiagram.drawings && parsedDiagram.drawings.length > 0))) {
        const stepObj = this.generateDiagramStepDataUrl(parsedDiagram, 0, 560);
        if (stepObj && stepObj.dataUrl) {
          diagramHtml =
            '<div style="margin-top:10px;background:#F8FAFC;border:1px solid #E2E8F0;padding:10px;border-radius:8px;page-break-inside:avoid;">' +
              '<div style="font-weight:700;font-size:12px;color:#0047AB;margin-bottom:6px;">📐 Tactical Pitch Diagram:</div>' +
              '<img src="' + stepObj.dataUrl + '" style="width:100%;max-width:520px;height:auto;border-radius:4px;border:1px solid #9CA3AF;display:block;margin:0 auto;" />' +
            '</div>';
        }
      }

      const notesHtml = d.coachNotes
        ? '<div class="notes">\uD83D\uDCA1 <strong>Coach Focus &amp; Notes:</strong><br/>' + d.coachNotes + '</div>'
        : '';

      const elapsedLabel = drillElapsed > 0 ? ('+' + drillElapsed + ' min') : 'Start';

      tableRowsHtml +=
        '<tr style="page-break-inside:avoid;">' +
          '<td class="time-col">' +
            '<div class="time-start">' + timeStart + '</div>' +
            (timeEnd ? '<div class="time-arrow">\u2193</div><div class="time-end">' + timeEnd + '</div>' : '') +
          '</td>' +
          '<td>' +
            '<div style="font-size:15px;font-weight:bold;color:#0047AB;margin-bottom:4px;">' + d.name + '</div>' +
            notesHtml +
            diagramHtml +
          '</td>' +
          '<td class="dur-col">' + d.duration + '</td>' +
          '<td class="elapsed-col">' + elapsedLabel + '</td>' +
        '</tr>';
    }
    // ─────────────────────────────────────────────────────────────────────────

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #111827; line-height: 1.5; }
    .header { border-bottom: 3px solid #0047AB; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { margin: 0; font-size: 20px; color: #0047AB; letter-spacing: 0.5px; }
    .header h2 { margin: 4px 0 0 0; font-size: 15px; color: #374151; font-weight: 600; }
    .meta { font-size: 12px; color: #4B5563; text-align: right; }
    .summary-bar { background: #F3F4F6; border: 1px solid #E5E7EB; padding: 10px 16px; border-radius: 6px; margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #1F2937; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #0047AB; color: #FFFFFF; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 12px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; font-size: 13px; }
    tr:nth-child(even) { background: #F9FAFB; }
    .time-col { width: 150px; font-weight: bold; color: #0047AB; vertical-align: top; }
    .time-start { font-size: 14px; font-weight: 800; color: #0047AB; }
    .time-end   { font-size: 12px; color: #374151; margin-top: 2px; }
    .time-arrow { font-size: 11px; color: #6B7280; margin: 1px 0; }
    .dur-col { width: 90px; font-weight: bold; text-align: center; color: #111827; }
    .elapsed-col { width: 80px; text-align: center; font-size: 11px; color: #6B7280; }
    .notes { margin-top: 6px; color: #374151; font-size: 12px; white-space: pre-wrap; background: #FFF; padding: 6px 8px; border-left: 3px solid #0047AB; }
    .footer { margin-top: 35px; border-top: 1px solid #E5E7EB; padding-top: 10px; font-size: 11px; color: #6B7280; text-align: center; }
    @media print {
      body { margin: 15px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>BEAUMONT HIGH SCHOOL COUGARS SOCCER</h1>
      <h2>OFFICIAL PRACTICE TIMELINE & DRILL PLAN</h2>
    </div>
    <div class="meta">
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Plan Name:</strong> "${activeName}"</div>
    </div>
  </div>

  <div class="summary-bar">
    <div>⏱️ Session: ${sessionStart} – ${sessionEnd} (${totalTimeStr})</div>
    <div>⚽ Total Drills: ${plan.length}</div>
    <div>📍 Beaumont Cougar Stadium Practice Field</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="time-col">TIME SLOT</th>
        <th>DRILL NAME &amp; COACH FOCUS NOTES</th>
        <th class="dur-col">DURATION</th>
        <th class="elapsed-col">ELAPSED</th>
      </tr>
    </thead>
    <tbody>
      ${tableRowsHtml}
    </tbody>
  </table>

  <div class="footer">
    Beaumont High School Athletics &bull; Boys Varsity Soccer Command Center
  </div>
</body>
</html>`;

    // Use document.write — far more reliable than blob URLs which get popup-blocked
    // and cause the fallback to print the main app page (the soccer pitch diagrammer).
    const printWin = window.open('about:blank', '_blank', 'width=900,height=1000,scrollbars=yes');
    if (!printWin) {
      alert('⚠️ Your browser blocked the print window popup.\n\nPlease allow popups for this page, then try again.\n(Click the popup-blocked icon in the address bar → Always allow)');
      return;
    }
    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
    printWin.focus();
    // Give the new window time to render canvas-based diagrams before printing
    setTimeout(() => {
      try { printWin.print(); } catch(e) { /* user closed window early */ }
    }, 500);
  },

  downloadPracticePlan(format = 'html') {
    const activeName = this.data.activePlanName || 'Standard Practice Session';
    const plan = this.data.currentPracticePlan || [];

    if (plan.length === 0) {
      alert('Your current practice timeline is empty. Add at least one drill to the plan before downloading.');
      return;
    }

    const safeFileName = activeName.replace(/[/\\?%*:|"<>]/g, '_');

    if (format === 'xlsx') {
      this.exportXLSX('plan');
      return;
    }

    let totalMinutes = 0;
    plan.forEach(p => {
      const match = (p.duration || '').match(/(\d+)/);
      if (match) totalMinutes += parseInt(match[1]);
    });

    let totalTimeStr = `${totalMinutes} min`;
    if (totalMinutes >= 60) {
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      totalTimeStr = `${totalMinutes} min (${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''})`;
    }

    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #111827; line-height: 1.5; }
    .header { border-bottom: 3px solid #0047AB; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { margin: 0; font-size: 20px; color: #0047AB; letter-spacing: 0.5px; }
    .header h2 { margin: 4px 0 0 0; font-size: 15px; color: #374151; font-weight: 600; }
    .meta { font-size: 12px; color: #4B5563; text-align: right; }
    .summary-bar { background: #F3F4F6; border: 1px solid #E5E7EB; padding: 10px 16px; border-radius: 6px; margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #1F2937; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #0047AB; color: #FFFFFF; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 12px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; font-size: 13px; }
    tr:nth-child(even) { background: #F9FAFB; }
    .time-col { width: 120px; font-weight: bold; color: #0047AB; }
    .dur-col { width: 90px; font-weight: bold; text-align: center; color: #111827; }
    .notes { margin-top: 6px; color: #374151; font-size: 12px; white-space: pre-wrap; background: #FFF; padding: 6px 8px; border-left: 3px solid #0047AB; }
    .footer { margin-top: 35px; border-top: 1px solid #E5E7EB; padding-top: 10px; font-size: 11px; color: #6B7280; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>BEAUMONT HIGH SCHOOL COUGARS SOCCER</h1>
      <h2>OFFICIAL PRACTICE TIMELINE & DRILL PLAN</h2>
    </div>
    <div class="meta">
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Plan Name:</strong> "${activeName}"</div>
    </div>
  </div>

  <div class="summary-bar">
    <div>⏱️ Total Time: ${totalTimeStr}</div>
    <div>⚽ Total Drills: ${plan.length}</div>
    <div>📍 Location: Cougar Stadium Practice Field</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="time-col">TIME SLOT</th>
        <th>DRILL NAME & COACH FOCUS NOTES</th>
        <th class="dur-col">DURATION</th>
      </tr>
    </thead>
    <tbody>
      ${plan.map(d => {
        let renderedDiagramStepsHtml = '';
        const masterDrill = (this.data.drillsBank || []).find(b =>
          (d.drillId && b.id === d.drillId) ||
          (d.id && b.id === d.id) ||
          (b.name && d.name && b.name.toLowerCase().trim() === d.name.toLowerCase().trim())
        );

        let masterParsed = masterDrill ? masterDrill.diagramData : null;
        if (typeof masterParsed === 'string') {
          try { masterParsed = JSON.parse(masterParsed); } catch(e) { masterParsed = null; }
        }

        let planParsed = d.diagramData;
        if (typeof planParsed === 'string') {
          try { planParsed = JSON.parse(planParsed); } catch(e) { planParsed = null; }
        }

        // If Master Drill has keyframes (from Edit Master Drill editor), prioritize it
        let parsedDiagram = null;
        if (masterParsed && masterParsed.keyframes && masterParsed.keyframes.length > 0) {
          parsedDiagram = masterParsed;
        } else if (planParsed && planParsed.keyframes && planParsed.keyframes.length > 0) {
          parsedDiagram = planParsed;
        } else {
          parsedDiagram = masterParsed || planParsed;
        }

        const diagramImage = (masterDrill && masterDrill.diagramImage) || d.diagramImage;
        const keyframes = (parsedDiagram && parsedDiagram.keyframes && parsedDiagram.keyframes.length > 0)
          ? parsedDiagram.keyframes
          : (d.keyframes || (masterDrill && masterDrill.keyframes) || []);

        if (keyframes.length > 0) {
          const diagramToPass = parsedDiagram || { keyframes, pitchType: d.pitchType || (masterDrill && masterDrill.pitchType) };
          const stepCards = keyframes.map((kf, stepIdx) => {
            const stepObj = this.generateDiagramStepDataUrl(diagramToPass, stepIdx, 520);
            if (!stepObj || !stepObj.dataUrl) return '';
            return `
              <div style="flex: 1 1 240px; max-width: 100%; background: #FFFFFF; border: 1px solid #D1D5DB; border-radius: 8px; padding: 12px; page-break-inside: avoid; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-weight: 700; font-size: 11px; color: #0047AB; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #E5E7EB; padding-bottom: 4px;">
                  <span>📍 ${kf.label || `Step ${stepIdx + 1}`}</span>
                  <span style="color: #6B7280; font-size: 10px; font-weight: 600;">FRAME #${stepIdx + 1} OF ${keyframes.length}</span>
                </div>
                <img src="${stepObj.dataUrl}" style="width: 100%; max-width: 480px; height: auto; border-radius: 4px; border: 1px solid #9CA3AF; display: block; margin: 0 auto;" />
              </div>
            `;
          }).filter(Boolean).join('');

          if (stepCards) {
            renderedDiagramStepsHtml = `
              <div style="margin-top: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; page-break-inside: avoid;">
                <div style="font-weight: 700; font-size: 12px; color: #1E293B; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                  📐 Tactical Pitch Diagram Complete Sequence (${keyframes.length} Step${keyframes.length > 1 ? 's' : ''}):
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start;">
                  ${stepCards}
                </div>
              </div>
            `;
          }
        }

        if (!renderedDiagramStepsHtml && diagramImage) {
          renderedDiagramStepsHtml = `
            <div style="margin-top: 10px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 8px; page-break-inside: avoid;">
              <div style="font-weight: 700; font-size: 12px; color: #0047AB; margin-bottom: 6px;">📐 Tactical Pitch Diagram:</div>
              <img src="${diagramImage}" style="width: 100%; max-width: 480px; height: auto; border-radius: 4px; border: 1px solid #9CA3AF; display: block; margin: 0 auto;" />
            </div>
          `;
        } else if (!renderedDiagramStepsHtml && parsedDiagram && ((parsedDiagram.elements && parsedDiagram.elements.length > 0) || (parsedDiagram.drawings && parsedDiagram.drawings.length > 0))) {
          const stepObj = this.generateDiagramStepDataUrl(parsedDiagram, 0, 520);
          if (stepObj && stepObj.dataUrl) {
            renderedDiagramStepsHtml = `
              <div style="margin-top: 10px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 8px; page-break-inside: avoid;">
                <div style="font-weight: 700; font-size: 12px; color: #0047AB; margin-bottom: 6px;">📐 Tactical Pitch Diagram:</div>
                <img src="${stepObj.dataUrl}" style="width: 100%; max-width: 480px; height: auto; border-radius: 4px; border: 1px solid #9CA3AF; display: block; margin: 0 auto;" />
              </div>
            `;
          }
        }

        return `
          <tr style="page-break-inside: avoid;">
            <td class="time-col">${d.time || ''}</td>
            <td>
              <div style="font-size: 15px; font-weight: bold; color: #0047AB; margin-bottom: 4px;">${d.name}</div>
              ${d.coachNotes ? `<div class="notes">💡 <strong>Coach Focus &amp; Notes:</strong><br/>${d.coachNotes}</div>` : ''}
              ${renderedDiagramStepsHtml}
            </td>
            <td class="dur-col">${d.duration}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="footer">
    Beaumont High School Athletics &bull; Boys Varsity Soccer Command Center
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${safeFileName}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  formatDuration(val) {
    if (!val) return '15 min';
    let trimmed = val.trim();
    // If it's a numeric string like "12", "18", or lacks min/hr suffix, append " min"
    if (/^\d+$/.test(trimmed) || (!trimmed.toLowerCase().includes('min') && !trimmed.toLowerCase().includes('hr'))) {
      return `${trimmed} min`;
    }
    return trimmed;
  },

  populateNewDrillLibrarySelect() {
    const select = document.getElementById('newDrillLibrarySelect');
    if (!select) return;
    const drills = this.data.drillsBank || [];
    select.innerHTML = `
      <option value="">-- Select Preset Drill from Library --</option>
      ${drills.map(d => `<option value="${d.id}">📚 ${d.name} (${d.category || 'General'} • ${d.duration})</option>`).join('')}
    `;
  },

  onSelectPresetDrillFromLibrary(drillId) {
    if (!drillId) return;
    const drills = this.data.drillsBank || [];
    const drill = drills.find(d => d.id === drillId);
    if (!drill) return;

    document.getElementById('newDrillName').value = drill.name;
    document.getElementById('newDrillDuration').value = drill.duration;
    
    // Sync duration dropdown if matching
    const select = document.getElementById('newDrillDurationSelect');
    if (select) {
      const hasOption = Array.from(select.options).some(o => o.value === drill.duration);
      select.value = hasOption ? drill.duration : 'custom';
    }

    if (drill.coachNotes) {
      document.getElementById('newDrillNotes').value = drill.coachNotes;
    }
  },

  openDrillsBankModal() {
    this.renderDrillsBankList();
    const modal = document.getElementById('drillsBankModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderDrillsBankList() {
    const container = document.getElementById('drillsBankListContainer');
    if (!container) return;

    const drills = (this.data.drillsBank || []).filter(d => !d.is_deleted && !d.isDeleted);

    if (drills.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:30px; background:rgba(0,0,0,0.2); border:1px solid var(--bhs-navy-border); border-radius:8px;">
          <p style="color:var(--text-muted); margin-bottom:12px;">No master drills in your library yet.</p>
          <button class="btn btn-gold" onclick="app.openCreateMasterDrillModal()">➕ Create Your First Master Drill</button>
        </div>
      `;
      return;
    }

    container.innerHTML = drills.map((d, index) => {
      return `
        <div class="drill-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.25); border:1px solid var(--bhs-navy-border); padding:14px; border-radius:8px; gap:14px; flex-wrap:wrap;">
          <div style="flex:1; min-width:240px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
              <strong style="color:#FFF; font-size:1.02rem;">${d.name}</strong>
              <span class="badge badge-coach">${d.category || 'General'}</span>
              ${d.duration ? `<span class="badge badge-win">⏱️ ${d.duration}</span>` : ''}
              <span class="badge badge-gold">⭐ ${Number(d.points ?? 3)} weight</span>
              ${d.diagramImage ? `<span class="badge badge-role">🎨 Diagram Attached</span>` : ''}
            </div>
            ${d.coachNotes ? `<p style="color:var(--text-muted); font-size:0.82rem; margin:4px 0 0 0;">${d.coachNotes}</p>` : ''}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-gold" style="font-size:0.8rem; padding:6px 10px;" onclick="app.addMasterDrillToPlan('${d.id}')">➕ Use in Active Plan</button>
            <button class="btn btn-secondary" style="font-size:0.8rem; padding:6px 10px;" onclick="app.openCreateMasterDrillModal('${d.id}')">✏️ Edit</button>
            <button class="btn btn-secondary" style="font-size:0.8rem; padding:6px 10px; background:rgba(239,68,68,0.2); color:var(--color-danger); border-color:var(--color-danger);" onclick="app.deleteMasterDrill('${d.id}')">🗑️ Delete</button>
          </div>
        </div>
      `;
    }).join('');
  },

  setMasterDiagramTool(tool) {
    if (this.masterDiagrammer) {
      this.masterDiagrammer.setTool(tool);
    }
  },

  openCreateMasterDrillModal(drillId = null) {
    this.populateCategoryDropdowns();

    document.getElementById('masterDrillFormId').value = '';
    document.getElementById('masterDrillFormName').value = '';
    document.getElementById('masterDrillFormCategory').value = 'Tactical / Attacking';
    document.getElementById('masterDrillFormDuration').value = '20 min';
    document.getElementById('masterDrillFormPoints').value = 3;
    document.getElementById('masterDrillFormMeasure').value = 'head_to_head';
    document.getElementById('masterDrillFormNotes').value = '';

    const titleEl = document.getElementById('masterDrillFormTitle');
    let targetDrill = null;

    if (drillId) {
      const drills = this.data.drillsBank || [];
      targetDrill = drills.find(item => item.id === drillId);
      if (targetDrill) {
        document.getElementById('masterDrillFormId').value = targetDrill.id;
        document.getElementById('masterDrillFormName').value = targetDrill.name;
        document.getElementById('masterDrillFormCategory').value = targetDrill.category || 'Tactical / Attacking';
        document.getElementById('masterDrillFormDuration').value = targetDrill.duration || '20 min';
        document.getElementById('masterDrillFormPoints').value = targetDrill.points ?? 3;
        document.getElementById('masterDrillFormMeasure').value = targetDrill.measure || 'head_to_head';
        document.getElementById('masterDrillFormNotes').value = targetDrill.coachNotes || '';
        if (titleEl) titleEl.textContent = '✏️ EDIT MASTER DRILL';
      }
    } else {
      if (titleEl) titleEl.textContent = '➕ CREATE NEW MASTER DRILL';
    }

    const catSelect = document.getElementById('masterDrillFormCategory');
    if (catSelect) {
      this.updateCategoryDescriptionTooltip(catSelect.value, 'masterDrillCategoryDesc');
    }

    const modal = document.getElementById('masterDrillFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }

    // Initialize tactical pitch diagrammer for master drill creation
    setTimeout(() => {
      if (this.masterDiagrammer) {
        this.masterDiagrammer.init('masterDrillCanvas');
        if (targetDrill && targetDrill.diagramData) {
          this.masterDiagrammer.loadDiagramData(targetDrill.diagramData);
        } else {
          this.masterDiagrammer.clear();
        }
      }
    }, 50);
  },

  openCreateMasterDrillModalForPlanDrill(idx) {
    const planDrill = (this.data.currentPracticePlan || [])[idx];
    if (!planDrill) return;

    if (!this.data.drillsBank) this.data.drillsBank = [];
    let masterDrill = this.data.drillsBank.find(d => d.name.toLowerCase() === (planDrill.name || '').toLowerCase());
    if (!masterDrill) {
      masterDrill = {
        id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: planDrill.name,
        category: 'General',
        coachNotes: planDrill.coachNotes || '',
        diagramImage: planDrill.diagramImage || null,
        diagramData: planDrill.diagramData || null
      };
      this.data.drillsBank.push(masterDrill);
      this.saveData();
    }
    this.openCreateMasterDrillModal(masterDrill.id);
  },

  async saveMasterDrillForm() {
    const id = document.getElementById('masterDrillFormId')?.value || '';
    const name = (document.getElementById('masterDrillFormName')?.value || '').trim();
    const category = document.getElementById('masterDrillFormCategory')?.value || 'General';
    const duration = (document.getElementById('masterDrillFormDuration')?.value || '20 min').trim();
    const points = parseFloat(document.getElementById('masterDrillFormPoints')?.value);
    const measure = document.getElementById('masterDrillFormMeasure')?.value || 'head_to_head';
    const coachNotes = (document.getElementById('masterDrillFormNotes')?.value || '').trim();

    if (!name) {
      alert('Please enter a valid Drill Name.');
      return;
    }

    if (!this.data.drillsBank) this.data.drillsBank = [];

    const existingIdx = id ? this.data.drillsBank.findIndex(d => d.id === id) : -1;
    let drillObj = existingIdx !== -1 ? { ...this.data.drillsBank[existingIdx] } : {};

    drillObj.id = id || ('d_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    drillObj.name = name;
    drillObj.category = category;
    drillObj.duration = duration;
    drillObj.points = Number.isFinite(points) ? points : 3;
    drillObj.measure = measure;
    drillObj.coachNotes = coachNotes;

    // Export pitch diagram drawings & elements
    if (this.masterDiagrammer) {
      if (this.masterDiagrammer.elements.length > 0 || this.masterDiagrammer.drawings.length > 0) {
        drillObj.diagramImage = this.masterDiagrammer.exportImage();
        drillObj.diagramData = this.masterDiagrammer.exportDiagramData();
      }
    }

    if (existingIdx !== -1) {
      this.data.drillsBank[existingIdx] = drillObj;
    } else {
      this.data.drillsBank.push(drillObj);
    }

    // Sync saved diagram to active practice plan timeline items matching this drill
    if (this.data.currentPracticePlan) {
      this.data.currentPracticePlan.forEach(p => {
        if ((p.name || '').toLowerCase() === name.toLowerCase()) {
          p.diagramImage = drillObj.diagramImage;
          p.diagramData = drillObj.diagramData;
          if (window.supabaseService && window.supabaseService.isConfigured()) {
            if (this.activeTeamId) {
              window.supabaseService.upsertPracticePlanItem(this.activeTeamId, p);
            } else {
              console.warn('Practice plan item not synced to the database — no team is selected.');
            }
          }
        }
      });
    }

    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      const saved = await window.supabaseService.upsertDrillBankItem('bhs', drillObj);
      if (saved && saved.id) {
        drillObj.id = saved.id;
        this.saveData();
      }
    }

    this.closeModal('masterDrillFormModal');
    this.renderDrillsBankList();
    this.renderCurrentView();
    alert(`✅ Master Drill "${name}" & Tactical Pitch Diagram saved to Master Library & Practice Planner!`);
  },

  async deleteMasterDrill(drillId) {
    if (!drillId) return;

    this.showConfirmModal({
      title: '🗑️ DELETE MASTER DRILL',
      message: 'Are you sure you want to delete this master drill from your library?',
      confirmText: '🗑️ Delete Drill',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        if (this.data.drillsBank) {
          const drill = this.data.drillsBank.find(d => d.id === drillId);
          if (drill) {
            drill.isDeleted = true;
            drill.is_deleted = true;
          }
          this.data.drillsBank = this.data.drillsBank.filter(d => d.id !== drillId);
          this.saveData();
        }

        if (window.supabaseService && window.supabaseService.isConfigured()) {
          await window.supabaseService.deleteDrillBankItem(drillId);
        }

        this.renderDrillsBankList();
        this.renderCurrentView();
      }
    });
  },

  async addMasterDrillToPlan(drillId) {
    const drills = this.data.drillsBank || [];
    const drill = drills.find(d => d.id === drillId);
    if (!drill) return;

    const planLen = (this.data.currentPracticePlan || []).length;
    const defaultTime = `${planLen * 20}:00 - ${(planLen + 1) * 20}:00`;

    const newPlanDrill = {
      time: defaultTime,
      name: drill.name,
      duration: drill.duration,
      coachNotes: drill.coachNotes,
      diagramImage: drill.diagramImage || null,
      diagramData: drill.diagramData || null
    };

    let dbSaved = true;
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      if (this.activeTeamId) {
        const saved = await window.supabaseService.savePracticePlanItem(this.activeTeamId, newPlanDrill);
        if (saved && saved.id) newPlanDrill.id = saved.id;
      } else {
        // savePracticePlanItem now refuses a non-uuid/absent team_id, so
        // sending nothing would silently drop this drill on the floor.
        dbSaved = false;
        console.warn('Drill not saved to the database — no team is selected.');
      }
    }

    this.data.currentPracticePlan.push(newPlanDrill);
    this.tagWorkingPlanTeam();
    this.saveData();
    this.closeModal('drillsBankModal');
    this.renderCurrentView();
    alert(dbSaved
      ? `➕ "${drill.name}" added to today's active practice timeline!`
      : `⚠️ "${drill.name}" added to today's timeline, but NOT saved to the database — no team is selected. Choose a team in the header first; it will disappear on reload.`);
  },

  calculateDrillTimeSlotAndDuration(prefix = 'new') {
    const startEl = document.getElementById(`${prefix}DrillStartTime`);
    const endEl = document.getElementById(`${prefix}DrillEndTime`);
    const timeSlotEl = document.getElementById(`${prefix}DrillTime`);
    const durationEl = document.getElementById(`${prefix}DrillDuration`);
    const selectEl = document.getElementById(`${prefix}DrillDurationSelect`);

    if (!startEl || !endEl) return;

    const startTimeVal = startEl.value; // e.g. "16:00"
    const endTimeVal = endEl.value;     // e.g. "16:20"

    if (!startTimeVal || !endTimeVal) return;

    const startParts = startTimeVal.split(':').map(n => parseInt(n, 10));
    const endParts = endTimeVal.split(':').map(n => parseInt(n, 10));

    if (startParts.length < 2 || endParts.length < 2) return;

    let startMins = startParts[0] * 60 + startParts[1];
    let endMins = endParts[0] * 60 + endParts[1];

    if (endMins < startMins) {
      endMins += 24 * 60; // Rollover
    }

    const diffMinutes = endMins - startMins;
    const displayStart = this.format24hTo12h(startTimeVal);
    const displayEnd = this.format24hTo12h(endTimeVal);

    if (timeSlotEl) {
      timeSlotEl.value = `${displayStart} - ${displayEnd}`;
    }

    if (durationEl) {
      durationEl.value = `${diffMinutes} min`;
    }

    if (selectEl) {
      const durStr = `${diffMinutes} min`;
      const hasOption = Array.from(selectEl.options).some(o => o.value === durStr);
      selectEl.value = hasOption ? durStr : 'custom';
    }
  },

  onDurationSelectChange(val, prefix = 'new') {
    const durationEl = document.getElementById(`${prefix}DrillDuration`);
    if (durationEl && val && val !== 'custom') {
      durationEl.value = val;
    }

    const startEl = document.getElementById(`${prefix}DrillStartTime`);
    const endEl = document.getElementById(`${prefix}DrillEndTime`);

    if (startEl && startEl.value && val && val !== 'custom') {
      const match = val.match(/(\d+)/);
      if (match) {
        const addedMins = parseInt(match[1], 10);
        const parts = startEl.value.split(':').map(n => parseInt(n, 10));
        let totalMins = parts[0] * 60 + parts[1] + addedMins;
        totalMins = totalMins % (24 * 60);

        const endHrs = String(Math.floor(totalMins / 60)).padStart(2, '0');
        const endMins = String(totalMins % 60).padStart(2, '0');
        if (endEl) {
          endEl.value = `${endHrs}:${endMins}`;
          this.calculateDrillTimeSlotAndDuration(prefix);
        }
      }
    }
  },

  openAddPlanDrillModal() {
    this.populateNewDrillLibrarySelect();

    const startEl = document.getElementById('newDrillStartTime');
    const endEl = document.getElementById('newDrillEndTime');

    // Default start time to end of last drill, or 16:00
    let startHrs = 16;
    let startMins = 0;

    const plan = this.data.currentPracticePlan || [];
    if (plan.length > 0) {
      const lastDrill = plan[plan.length - 1];
      if (lastDrill.time && lastDrill.time.includes('-')) {
        const parts = lastDrill.time.split('-');
        const lastEndTimeStr = parts[parts.length - 1].trim();
        const converted24h = this.format12hTo24h(lastEndTimeStr);
        if (converted24h && converted24h.includes(':')) {
          const p = converted24h.split(':').map(n => parseInt(n, 10));
          startHrs = p[0];
          startMins = p[1];
        }
      }
    }

    let totalEndMins = startHrs * 60 + startMins + 20;
    totalEndMins = totalEndMins % (24 * 60);

    const sHrsStr = String(startHrs).padStart(2, '0');
    const sMinsStr = String(startMins).padStart(2, '0');
    const eHrsStr = String(Math.floor(totalEndMins / 60)).padStart(2, '0');
    const eMinsStr = String(totalEndMins % 60).padStart(2, '0');

    if (startEl) startEl.value = `${sHrsStr}:${sMinsStr}`;
    if (endEl) endEl.value = `${eHrsStr}:${eMinsStr}`;

    this.calculateDrillTimeSlotAndDuration('new');

    const modal = document.getElementById('addPlanDrillModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async addPlanDrill(time, name, duration, coachNotes) {
    const formattedDuration = this.formatDuration(duration);
    const newDrill = { time, name, duration: formattedDuration, coachNotes };

    // Save to Supabase first to get the DB-assigned id
    let dbSaved = true;
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      if (this.activeTeamId) {
        const saved = await window.supabaseService.savePracticePlanItem(this.activeTeamId, newDrill);
        if (saved && saved.id) newDrill.id = saved.id;
      } else {
        // savePracticePlanItem now refuses a non-uuid/absent team_id. This is
        // an explicit modal Save action, so the coach must be told -- the
        // drill would otherwise appear to save and vanish on reload.
        dbSaved = false;
        console.warn('Drill not saved to the database — no team is selected.');
      }
    }

    this.data.currentPracticePlan.push(newDrill);
    this.tagWorkingPlanTeam();
    this.saveData();
    this.renderCurrentView();
    this.closeModals();
    if (!dbSaved) {
      alert(`⚠️ "${name}" added to today's timeline, but NOT saved to the database — no team is selected. Choose a team in the header first; it will disappear on reload.`);
    }
  },

  openEditPlanDrillModal(index) {
    const drill = this.data.currentPracticePlan[index];
    if (!drill) return;

    document.getElementById('editDrillIndex').value = index;
    document.getElementById('editDrillTime').value = drill.time;
    document.getElementById('editDrillName').value = drill.name;
    document.getElementById('editDrillDuration').value = drill.duration;
    
    // Parse time slot to populate start and end time pickers
    if (drill.time && drill.time.includes('-')) {
      const parts = drill.time.split('-');
      const start24h = this.format12hTo24h(parts[0].trim());
      const end24h = this.format12hTo24h(parts[1].trim());

      const startEl = document.getElementById('editDrillStartTime');
      const endEl = document.getElementById('editDrillEndTime');
      if (startEl && start24h) startEl.value = start24h;
      if (endEl && end24h) endEl.value = end24h;
    }

    // Sync duration select dropdown
    const select = document.getElementById('editDrillDurationSelect');
    if (select) {
      const hasOption = Array.from(select.options).some(o => o.value === drill.duration);
      select.value = hasOption ? drill.duration : 'custom';
    }

    document.getElementById('editDrillNotes').value = drill.coachNotes;

    const modal = document.getElementById('editPlanDrillModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  submitEditPlanDrill() {
    const index = parseInt(document.getElementById('editDrillIndex').value);
    const time = document.getElementById('editDrillTime').value;
    const name = document.getElementById('editDrillName').value;
    const duration = document.getElementById('editDrillDuration').value;
    const coachNotes = document.getElementById('editDrillNotes').value;
    this.saveEditPlanDrill(index, time, name, duration, coachNotes);
  },

  async saveEditPlanDrill(index, time, name, duration, coachNotes) {
    if (this.data.currentPracticePlan[index]) {
      const formattedDuration = this.formatDuration(duration);
      const updated = { ...this.data.currentPracticePlan[index], time, name, duration: formattedDuration, coachNotes };
      this.data.currentPracticePlan[index] = updated;
      this.saveData();

      // Upsert to Supabase (uses existing id if present)
      let dbSaved = true;
      if (window.supabaseService && window.supabaseService.isConfigured()) {
        if (this.activeTeamId) {
          await window.supabaseService.upsertPracticePlanItem(this.activeTeamId, updated);
        } else {
          // upsertPracticePlanItem now refuses a non-uuid/absent team_id. This
          // is an explicit modal Save action, so the coach must be told -- the
          // edit would otherwise appear to save and revert on reload.
          dbSaved = false;
          console.warn('Drill edit not saved to the database — no team is selected.');
        }
      }

      this.renderCurrentView();
      this.closeModals();
      if (!dbSaved) {
        alert(`⚠️ "${name}" updated on this screen, but NOT saved to the database — no team is selected. Choose a team in the header first; the edit will revert on reload.`);
      }
    }
  },

  async deletePlanDrill(index) {
    this.showConfirmModal({
      title: '🗑️ REMOVE DRILL FROM TIMELINE',
      message: 'Remove this drill from today\'s practice plan?',
      confirmText: '🗑️ Remove Drill',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        const drill = this.data.currentPracticePlan[index];
        if (!drill) return;

        this.data.currentPracticePlan.splice(index, 1);

        if (this.selectedDrillIndex >= this.data.currentPracticePlan.length) {
          this.selectedDrillIndex = Math.max(0, this.data.currentPracticePlan.length - 1);
        }

        this.saveData();

        const container = document.getElementById('mainAppContainer');
        if (container) {
          container.innerHTML = this.renderPlannerView();
          setTimeout(() => {
            if (this.diagrammer) {
              this.diagrammer.init('soccerBoardCanvas');
              const selectedDrill = (this.data.currentPracticePlan || [])[this.selectedDrillIndex || 0];
              const masterDrill = (this.data.drillsBank || []).find(d => d.name.toLowerCase() === (selectedDrill?.name || '').toLowerCase());
              const targetData = selectedDrill?.diagramData || masterDrill?.diagramData;
              if (targetData) this.diagrammer.loadDiagramData(targetData);
            }
          }, 80);
        }

        if (drill && drill.id && window.supabaseService && window.supabaseService.isConfigured()) {
          await window.supabaseService.deletePracticePlanItem(drill.id);
        }
      }
    });
  },

  handleDrillDragStart(e, idx) {
    this.draggedDrillIndex = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
    if (e.currentTarget) e.currentTarget.classList.add('dragging');
  },

  handleDrillDragOver(e, idx) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  },

  handleDrillDragEnter(e, idx) {
    e.preventDefault();
    if (this.draggedDrillIndex !== undefined && this.draggedDrillIndex !== idx && e.currentTarget) {
      e.currentTarget.classList.add('drag-over');
    }
  },

  handleDrillDragLeave(e, idx) {
    if (e.currentTarget) e.currentTarget.classList.remove('drag-over');
  },

  handleDrillDrop(e, targetIdx) {
    e.preventDefault();
    if (e.currentTarget) e.currentTarget.classList.remove('drag-over');

    const sourceIdx = this.draggedDrillIndex;
    if (sourceIdx === undefined || sourceIdx === targetIdx) return;

    const plan = this.data.currentPracticePlan;
    const [movedDrill] = plan.splice(sourceIdx, 1);
    plan.splice(targetIdx, 0, movedDrill);

    if (this.selectedDrillIndex === sourceIdx) {
      this.selectedDrillIndex = targetIdx;
    } else if (sourceIdx < this.selectedDrillIndex && targetIdx >= this.selectedDrillIndex) {
      this.selectedDrillIndex--;
    } else if (sourceIdx > this.selectedDrillIndex && targetIdx <= this.selectedDrillIndex) {
      this.selectedDrillIndex++;
    }

    this.recalculatePlanTimelineTimes();
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      if (this.activeTeamId) {
        window.supabaseService.saveFullPracticePlan(this.activeTeamId, {
          name: this.data.activePlanName || 'Current Practice Session',
          items: this.data.currentPracticePlan
        });
      } else {
        console.warn('Practice plan reorder not synced to the database — no team is selected.');
      }
    }

    this.renderCurrentView();
  },

  handleDrillDragEnd(e) {
    this.draggedDrillIndex = undefined;
    document.querySelectorAll('.drill-item').forEach(el => {
      el.classList.remove('dragging', 'drag-over');
    });
  },

  recalculatePlanTimelineTimes() {
    const plan = this.data.currentPracticePlan || [];
    if (plan.length === 0) return;

    let currentMins = 16 * 60; // 4:00 PM default
    if (plan[0].time && plan[0].time.includes('-')) {
      const parts = plan[0].time.split('-');
      const firstStartStr = parts[0].trim();
      const converted24h = this.format12hTo24h(firstStartStr);
      if (converted24h && converted24h.includes(':')) {
        const p = converted24h.split(':').map(n => parseInt(n, 10));
        currentMins = p[0] * 60 + p[1];
      }
    }

    for (const drill of plan) {
      let durationMins = 20;
      if (drill.duration) {
        const match = drill.duration.match(/(\d+)/);
        if (match) durationMins = parseInt(match[1], 10);
      }

      const startHrsStr = String(Math.floor(currentMins / 60) % 24).padStart(2, '0');
      const startMinsStr = String(currentMins % 60).padStart(2, '0');

      const endMinsTotal = currentMins + durationMins;
      const endHrsStr = String(Math.floor(endMinsTotal / 60) % 24).padStart(2, '0');
      const endMinsStr = String(endMinsTotal % 60).padStart(2, '0');

      const displayStart = this.format24hTo12h(`${startHrsStr}:${startMinsStr}`);
      const displayEnd = this.format24hTo12h(`${endHrsStr}:${endMinsStr}`);

      drill.time = `${displayStart} - ${displayEnd}`;
      currentMins = endMinsTotal % (24 * 60);
    }
  }


});
