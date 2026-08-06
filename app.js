/**
 * Beaumont High School Cougars Soccer - Core Application Engine
 * Includes Public Roster/Schedule, Competitive Matrix, & Practice Planner
 */

// Initial Sample Data for Beaumont High School
const DEFAULT_BHS_DATA = {
  school: {
    id: 'bhs',
    name: 'Beaumont High School',
    mascot: 'Cougars',
    city: 'Beaumont, CA',
    colors: { primary: '#0047AB', secondary: '#FFFFFF', navy: '#0A1428' },
    record: { wins: 9, losses: 1, draws: 2 }
  },
  players: [
    {
      id: 'p101',
      number: 10,
      name: 'Alex Rivera',
      position: 'Forward / CAM',
      classYear: 'Senior (2027)',
      height: "5'11\"",
      photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 14, assists: 8, games: 12 },
      ratings: { technical: 92, tactical: 88, physical: 85, mental: 90 },
      matrixStats: { wins: 28, losses: 6, points: 94, rank: 1, drillScore: 92.4 }
    },
    {
      id: 'p102',
      number: 7,
      name: 'Marcus Vance',
      position: 'Winger',
      classYear: 'Junior (2028)',
      height: "5'9\"",
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 9, assists: 11, games: 12 },
      ratings: { technical: 89, tactical: 84, physical: 91, mental: 86 },
      matrixStats: { wins: 25, losses: 8, points: 86, rank: 2, drillScore: 89.1 }
    },
    {
      id: 'p103',
      number: 4,
      name: 'Ethan Thorne',
      position: 'Center Back',
      classYear: 'Senior (2027)',
      height: "6'2\"",
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 2, assists: 3, tackles: 42, games: 12 },
      ratings: { technical: 80, tactical: 92, physical: 94, mental: 91 },
      matrixStats: { wins: 23, losses: 9, points: 81, rank: 3, drillScore: 86.5 }
    },
    {
      id: 'p104',
      number: 1,
      name: 'Mateo Sandoval',
      position: 'Goalkeeper',
      classYear: 'Junior (2028)',
      height: "6'1\"",
      photo: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
      seasonStats: { saves: 68, cleanSheets: 7, games: 12 },
      ratings: { technical: 86, tactical: 89, physical: 88, mental: 93 },
      matrixStats: { wins: 22, losses: 10, points: 79, rank: 4, drillScore: 84.8 }
    },
    {
      id: 'p105',
      number: 6,
      name: 'Lucas Sterling',
      position: 'Defensive Mid',
      classYear: 'Sophomore (2029)',
      height: "5'10\"",
      photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 3, assists: 6, games: 11 },
      ratings: { technical: 85, tactical: 87, physical: 86, mental: 85 },
      matrixStats: { wins: 20, losses: 11, points: 72, rank: 5, drillScore: 81.2 }
    },
    {
      id: 'p106',
      number: 9,
      name: 'Jordan Brooks',
      position: 'Striker',
      classYear: 'Senior (2027)',
      height: "6'0\"",
      photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 11, assists: 2, games: 12 },
      ratings: { technical: 87, tactical: 82, physical: 88, mental: 84 },
      matrixStats: { wins: 19, losses: 12, points: 69, rank: 6, drillScore: 79.5 }
    }
  ],
  schedule: [
    {
      id: 'm201',
      date: 'AUG 12, 2026',
      time: '6:30 PM',
      opponent: 'Yucaipa Thunderbirds',
      location: 'Home - Cougar Stadium',
      status: 'UPCOMING',
      isHome: true
    },
    {
      id: 'm202',
      date: 'AUG 18, 2026',
      time: '5:00 PM',
      opponent: 'Citrus Valley Blackhawks',
      location: 'Away - Redlands, CA',
      status: 'UPCOMING',
      isHome: false
    },
    {
      id: 'm203',
      date: 'JUL 28, 2026',
      time: 'FINAL',
      opponent: 'Redlands East Valley',
      location: 'Home - Cougar Stadium',
      status: 'COMPLETED',
      score: '3 - 1',
      result: 'WIN'
    },
    {
      id: 'm204',
      date: 'JUL 22, 2026',
      time: 'FINAL',
      opponent: 'Palm Springs Indians',
      location: 'Away - Palm Springs',
      status: 'COMPLETED',
      score: '2 - 0',
      result: 'WIN'
    }
  ],
  drillsBank: [
    { id: 'd1', name: '1v1 Gauntlet (Continuous)', category: 'Competitive Matrix 1v1', coachNotes: 'Log 1v1 win/loss scores into Matrix' },
    { id: 'd2', name: '2v2 Flying Scrimmage with Bumpers', category: 'Small Sided', coachNotes: 'High intensity transition' },
    { id: 'd3', name: 'Finishing under High Pressure', category: 'Technical / Shooting', coachNotes: 'Focus on clean striking and follow-through under defensive pressure.' },
    { id: 'd4', name: '12-Minute Cooper Fitness Test', category: 'Physical Conditioning', coachNotes: 'Maximum aerobic effort test' },
    { id: 'd5', name: '7v7 Tactical Match Play', category: 'Full Scrimmage', coachNotes: 'Applying press triggers' },
    { id: 'd_dummy_1', name: 'Dummy Drill A: High Pressing Counter', category: 'Tactical / Pressing', coachNotes: 'Trigger high press on wide fullback touch.' },
    { id: 'd_dummy_2', name: 'Dummy Drill B: Overlapping Fullbacks 3v2', category: 'Attacking Width', coachNotes: 'Overlap timing from LB/RB into crossing zone.' },
    { id: 'd_dummy_3', name: 'Dummy Drill C: Quick Wall-Pass Combination', category: 'Technical / Passing', coachNotes: '1-touch wall pass combination in tight central space.' }
  ],
  currentPracticePlan: [
    { time: '4:00 PM - 4:15 PM', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
    { time: '4:15 PM - 4:35 PM', name: 'Dummy Drill A: High Pressing Counter', duration: '20 min', coachNotes: 'Trigger high press on wide fullback touch.' },
    { time: '4:35 PM - 5:00 PM', name: 'Dummy Drill B: Overlapping Fullbacks 3v2', duration: '25 min', coachNotes: 'Overlap timing from LB/RB into crossing zone.' },
    { time: '5:00 PM - 5:15 PM', name: 'Dummy Drill C: Quick Wall-Pass Combination', duration: '15 min', coachNotes: '1-touch wall pass combination in tight central space.' },
    { time: '5:15 PM - 5:40 PM', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers in game scenario.' },
    { time: '5:40 PM - 5:45 PM', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
  ],
  savedPlans: [
    {
      id: 'plan_dummy_1',
      name: 'dummy_practice_1',
      date: 'AUG 6, 2026',
      drills: [
        { time: '4:00 PM - 4:15 PM', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
        { time: '4:15 PM - 4:35 PM', name: 'Dummy Drill A: High Pressing Counter', duration: '20 min', coachNotes: 'Trigger high press on wide fullback touch.' },
        { time: '4:35 PM - 5:00 PM', name: 'Dummy Drill B: Overlapping Fullbacks 3v2', duration: '25 min', coachNotes: 'Overlap timing from LB/RB into crossing zone.' },
        { time: '5:00 PM - 5:15 PM', name: 'Dummy Drill C: Quick Wall-Pass Combination', duration: '15 min', coachNotes: '1-touch wall pass combination in tight central space.' },
        { time: '5:15 PM - 5:40 PM', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers in game scenario.' },
        { time: '5:40 PM - 5:45 PM', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
      ]
    },
    {
      id: 'plan_default_1',
      name: 'Standard Varsity 90-Min High Intensity',
      date: 'AUG 1, 2026',
      drills: [
        { time: '4:00 PM - 4:15 PM', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
        { time: '4:15 PM - 4:35 PM', name: '1v1 Gauntlet (Continuous)', duration: '20 min', coachNotes: 'Log 1v1 win/loss scores into Matrix' },
        { time: '4:35 PM - 5:00 PM', name: '2v2 Flying Scrimmage with Bumpers', duration: '25 min', coachNotes: 'High intensity transition' },
        { time: '5:00 PM - 5:25 PM', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers' },
        { time: '5:25 PM - 5:30 PM', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
      ]
    }
  ],
  activePlanName: 'dummy_practice_1',
  coaches: [
    {
      id: 'c1',
      name: 'Coach Bob Miller',
      level: 'Boys Varsity Head Coach',
      phone: '(951) 555-0199',
      address: '39139 Cherry Valley Blvd, Beaumont, CA 92223',
      email: 'bob.miller@bhs-cougars.org',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      bio: 'Head Varsity Soccer Coach entering 8th season at Beaumont High School.'
    },
    {
      id: 'c2',
      name: 'Coach Dave Ramirez',
      level: 'JV Head Coach / Assistant Varsity',
      phone: '(951) 555-0188',
      address: '39139 Cherry Valley Blvd, Beaumont, CA 92223',
      email: 'dave.ramirez@bhs-cougars.org',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      bio: 'JV Head Coach focusing on tactical development, pressing triggers, and player progression.'
    }
  ],
  dailyThoughts: [
    {
      id: 'dt1',
      coachId: 'c1',
      coachName: 'Coach Bob Miller',
      text: 'Focus on high-intensity transition, quick 1-touch ball circulation, and aggressive pressing triggers ahead of our upcoming Citrus Belt League match. Hydrate well and bring maximum energy to practice today!',
      isActive: true,
      createdAt: 'AUG 2, 2026'
    }
  ]
};

class SoccerTacticalBoard {
  constructor(appInstance) {
    this.app = appInstance;
    this.canvas = null;
    this.ctx = null;
    this.pitchType = 'full';
    this.activeTool = 'attacker';
    this.activeColor = '#0047AB';
    this.elements = [];
    this.drawings = [];
    this.history = [];
    this.redoStack = [];
    this.isDrawing = false;
    this.currentPath = null;
    this.draggedElement = null;
    this.dragOffset = { x: 0, y: 0 };
    this.hasAttached = false;

    // Tactical Keyframe Animation Properties
    this.keyframes = [
      { time: 0, label: 'Time 0 (Start Position)', elements: [], drawings: [] }
    ];
    this.currentFrameIndex = 0;
    this.isPlaying = false;
    this.animReqId = null;
  }

  init(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    const wrapper = this.canvas.parentElement;
    const w = Math.min(840, (wrapper ? wrapper.clientWidth : 800) - 20 || 800);
    const h = Math.round(w * 0.6);
    this.canvas.width = w;
    this.canvas.height = h;

    this.attachEvents();
    this.render();
    this.updateToolbarUI();
    this.updateTimelineUI();
  }

  setPitchType(type) {
    this.pitchType = type;
    this.saveState();
    this.render();
    this.updateToolbarUI();
  }

  setTool(tool) {
    this.activeTool = tool;
    this.updateToolbarUI();
  }

  updateToolbarUI() {
    document.querySelectorAll('.diagrammer-toolbar .tool-btn').forEach(btn => {
      const tool = btn.getAttribute('data-tool');
      const pitch = btn.getAttribute('data-pitch');
      if (tool) {
        if (tool === this.activeTool) btn.classList.add('active');
        else btn.classList.remove('active');
      }
      if (pitch) {
        if (pitch === this.pitchType) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
  }

  saveState() {
    this.history.push({
      elements: JSON.parse(JSON.stringify(this.elements)),
      drawings: JSON.parse(JSON.stringify(this.drawings)),
      pitchType: this.pitchType
    });
    if (this.history.length > 30) this.history.shift();
    this.redoStack = [];
    this.saveCurrentFrameState();
  }

  undo() {
    if (this.history.length === 0) return;
    this.redoStack.push({
      elements: JSON.parse(JSON.stringify(this.elements)),
      drawings: JSON.parse(JSON.stringify(this.drawings)),
      pitchType: this.pitchType
    });
    const state = this.history.pop();
    this.elements = state.elements;
    this.drawings = state.drawings;
    this.pitchType = state.pitchType || 'full';
    this.saveCurrentFrameState();
    this.render();
  }

  clear() {
    this.saveState();
    this.elements = [];
    this.drawings = [];
    this.saveCurrentFrameState();
    this.render();
  }

  saveCurrentFrameState() {
    if (!this.keyframes || !this.keyframes[this.currentFrameIndex]) return;
    this.keyframes[this.currentFrameIndex].elements = JSON.parse(JSON.stringify(this.elements));
    this.keyframes[this.currentFrameIndex].drawings = JSON.parse(JSON.stringify(this.drawings));
    this.propagateNewElementsForward();
  }

  propagateNewElementsForward() {
    if (!this.keyframes || this.keyframes.length <= 1) return;

    const currentFrame = this.keyframes[this.currentFrameIndex];
    if (!currentFrame || !currentFrame.elements) return;

    for (let k = this.currentFrameIndex + 1; k < this.keyframes.length; k++) {
      const nextFrame = this.keyframes[k];
      if (!nextFrame || !nextFrame.elements) continue;

      currentFrame.elements.forEach(el => {
        const exists = nextFrame.elements.some(nextEl => nextEl.id === el.id);
        if (!exists) {
          nextFrame.elements.push(JSON.parse(JSON.stringify(el)));
        }
      });
    }
  }

  addKeyframe() {
    this.saveCurrentFrameState();
    this.stopAnimation();

    const newIndex = this.keyframes.length;
    const prevFrame = this.keyframes[this.currentFrameIndex] || { elements: [], drawings: [] };
    
    this.keyframes.push({
      time: newIndex,
      label: `Time ${newIndex}`,
      elements: JSON.parse(JSON.stringify(prevFrame.elements)),
      drawings: JSON.parse(JSON.stringify(prevFrame.drawings))
    });

    this.currentFrameIndex = newIndex;
    this.elements = JSON.parse(JSON.stringify(this.keyframes[newIndex].elements));
    this.drawings = JSON.parse(JSON.stringify(this.keyframes[newIndex].drawings));
    
    this.render();
    this.updateTimelineUI();
  }

  goToKeyframe(index) {
    if (index < 0 || index >= this.keyframes.length) return;
    this.saveCurrentFrameState();
    this.stopAnimation();
    
    this.currentFrameIndex = index;
    const target = this.keyframes[index];
    this.elements = JSON.parse(JSON.stringify(target.elements || []));
    this.drawings = JSON.parse(JSON.stringify(target.drawings || []));
    
    this.render();
    this.updateTimelineUI();
  }

  deleteCurrentKeyframe() {
    if (this.keyframes.length <= 1) {
      alert('Cannot delete the initial Time 0 frame.');
      return;
    }
    this.stopAnimation();
    this.keyframes.splice(this.currentFrameIndex, 1);
    // Re-index time labels
    this.keyframes.forEach((kf, idx) => {
      kf.time = idx;
      kf.label = idx === 0 ? 'Time 0 (Start Position)' : `Time ${idx}`;
    });
    this.currentFrameIndex = Math.max(0, this.currentFrameIndex - 1);
    const target = this.keyframes[this.currentFrameIndex];
    this.elements = JSON.parse(JSON.stringify(target.elements || []));
    this.drawings = JSON.parse(JSON.stringify(target.drawings || []));

    this.render();
    this.updateTimelineUI();
  }

  updateTimelineUI() {
    const badge = document.getElementById('timelineFrameBadge');
    if (badge && this.keyframes[this.currentFrameIndex]) {
      badge.textContent = this.keyframes[this.currentFrameIndex].label;
    }

    const btnPlay = document.getElementById('btnPlayAnim');
    if (btnPlay) {
      btnPlay.innerHTML = this.isPlaying ? '⏸️ Pause' : '▶️ Play Animation';
      btnPlay.className = this.isPlaying ? 'btn btn-gold active' : 'btn btn-gold';
    }

    const container = document.getElementById('keyframeButtonsContainer');
    if (container) {
      container.innerHTML = this.keyframes.map((kf, idx) => {
        const isActive = (idx === this.currentFrameIndex);
        return `
          <button class="btn ${isActive ? 'btn-gold' : 'btn-secondary'}" style="padding: 6px 12px; font-size: 0.8rem; font-weight: 700; border: ${isActive ? '2px solid var(--bhs-gold-accent)' : '1px solid var(--bhs-navy-border)'}; flex-shrink: 0;" onclick="app.diagrammer.goToKeyframe(${idx})">
            ⏱️ ${kf.label}
          </button>
        `;
      }).join('');
    }
  }

  togglePlayAnimation() {
    if (this.isPlaying) {
      this.stopAnimation();
    } else {
      // If at the end of the timeline sequence, rewind to Time 0 before starting play
      if (this.currentFrameIndex >= this.keyframes.length - 1) {
        this.goToKeyframe(0);
      }
      this.playAnimation();
    }
  }

  playAnimation() {
    if (this.keyframes.length < 2) {
      alert('Please add at least 2 time frames (e.g. Time 0 and Time 1) using "+ Add Time Frame" to create movement animation!');
      return;
    }

    this.saveCurrentFrameState();
    this.isPlaying = true;
    this.updateTimelineUI();

    const totalSteps = this.keyframes.length - 1;
    const durationPerStepMs = 1200; // 1.2s per step
    const totalDuration = totalSteps * durationPerStepMs;
    let startTime = null;

    const animate = (timestamp) => {
      if (!this.isPlaying) return;
      if (!startTime) startTime = timestamp;

      const elapsed = timestamp - startTime;

      if (elapsed >= totalDuration) {
        // Reached the end of the movement sequence: stop on final frame
        this.currentFrameIndex = totalSteps;
        const lastFrame = this.keyframes[totalSteps];
        this.elements = JSON.parse(JSON.stringify(lastFrame.elements || []));
        this.drawings = JSON.parse(JSON.stringify(lastFrame.drawings || []));
        this.isPlaying = false;
        if (this.animReqId) {
          cancelAnimationFrame(this.animReqId);
          this.animReqId = null;
        }
        this.render();
        this.updateTimelineUI();
        return;
      }

      const currentStep = Math.min(Math.floor(elapsed / durationPerStepMs), totalSteps - 1);
      const stepProgress = (elapsed % durationPerStepMs) / durationPerStepMs;

      const frameA = this.keyframes[currentStep];
      const frameB = this.keyframes[currentStep + 1];

      this.elements = this.interpolateFrames(frameA.elements, frameB.elements, stepProgress);
      this.drawings = stepProgress < 0.5 ? frameA.drawings : frameB.drawings;
      this.currentFrameIndex = currentStep;

      this.render();
      this.updateTimelineUI();

      this.animReqId = requestAnimationFrame(animate);
    };

    this.animReqId = requestAnimationFrame(animate);
  }

  stopAnimation() {
    const wasPlaying = this.isPlaying;
    this.isPlaying = false;
    if (this.animReqId) {
      cancelAnimationFrame(this.animReqId);
      this.animReqId = null;
    }
    if (wasPlaying && this.keyframes[this.currentFrameIndex]) {
      this.elements = JSON.parse(JSON.stringify(this.keyframes[this.currentFrameIndex].elements || []));
      this.drawings = JSON.parse(JSON.stringify(this.keyframes[this.currentFrameIndex].drawings || []));
    }
    this.render();
    this.updateTimelineUI();
  }

  interpolateFrames(elementsA, elementsB, t) {
    const lerp = (a, b, progress) => a + (b - a) * progress;

    const result = [];
    const usedB = new Set();

    (elementsA || []).forEach(elA => {
      let matchB = (elementsB || []).find(elB => elB.id === elA.id);
      if (!matchB && elA.type && elA.number) {
        matchB = (elementsB || []).find(elB => !usedB.has(elB) && elB.type === elA.type && elB.number === elA.number);
      }
      if (!matchB && elA.type === 'ball') {
        matchB = (elementsB || []).find(elB => !usedB.has(elB) && elB.type === 'ball');
      }

      if (matchB) {
        usedB.add(matchB);
        result.push({
          ...elA,
          x: lerp(elA.x, matchB.x, t),
          y: lerp(elA.y, matchB.y, t)
        });
      } else {
        result.push({ ...elA });
      }
    });

    (elementsB || []).forEach(elB => {
      if (!usedB.has(elB)) {
        result.push({ ...elB });
      }
    });

    return result;
  }

  exportDiagramData() {
    this.saveCurrentFrameState();
    return {
      keyframes: JSON.parse(JSON.stringify(this.keyframes)),
      currentFrameIndex: this.currentFrameIndex,
      elements: JSON.parse(JSON.stringify(this.elements)),
      drawings: JSON.parse(JSON.stringify(this.drawings)),
      pitchType: this.pitchType
    };
  }

  loadDiagramData(data) {
    if (!data) {
      this.elements = [];
      this.drawings = [];
      this.keyframes = [{
        time: 0,
        label: 'Time 0 (Start Position)',
        elements: [],
        drawings: []
      }];
      this.currentFrameIndex = 0;
      this.render();
      this.updateTimelineUI();
      return;
    }
    if (data.keyframes && Array.isArray(data.keyframes) && data.keyframes.length > 0) {
      this.keyframes = JSON.parse(JSON.stringify(data.keyframes));
      this.currentFrameIndex = Math.min(data.currentFrameIndex || 0, this.keyframes.length - 1);
      const frame = this.keyframes[this.currentFrameIndex];
      this.elements = frame.elements ? JSON.parse(JSON.stringify(frame.elements)) : [];
      this.drawings = frame.drawings ? JSON.parse(JSON.stringify(frame.drawings)) : [];
    } else {
      this.elements = data.elements ? JSON.parse(JSON.stringify(data.elements)) : [];
      this.drawings = data.drawings ? JSON.parse(JSON.stringify(data.drawings)) : [];
      this.keyframes = [{
        time: 0,
        label: 'Time 0 (Start Position)',
        elements: JSON.parse(JSON.stringify(this.elements)),
        drawings: JSON.parse(JSON.stringify(this.drawings))
      }];
      this.currentFrameIndex = 0;
    }
    this.pitchType = data.pitchType || 'full';
    this.render();
    this.updateTimelineUI();
    this.updateToolbarUI();
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
    const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (this.canvas.width / rect.width),
      y: (clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  distToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  isPointNearDrawing(pos, drawing, maxDist = 18) {
    const pts = drawing.points;
    if (!pts || pts.length === 0) return false;
    if (pts.length === 1) return Math.hypot(pos.x - pts[0].x, pos.y - pts[0].y) <= maxDist;
    for (let i = 0; i < pts.length - 1; i++) {
      if (this.distToSegment(pos, pts[i], pts[i + 1]) <= maxDist) {
        return true;
      }
    }
    return false;
  }

  attachEvents() {
    if (!this.canvas || this.boundCanvas === this.canvas) return;
    this.boundCanvas = this.canvas;

    const start = (e) => {
      if (!this.canvas) return;
      const pos = this.getPos(e);

      if (['attacker', 'defender', 'gk', 'ball', 'cone', 'goal'].includes(this.activeTool)) {
        this.saveState();
        let num = '';
        if (this.activeTool === 'attacker') {
          const count = this.elements.filter(el => el.type === 'attacker').length;
          num = String(count + 1);
        } else if (this.activeTool === 'defender') {
          const count = this.elements.filter(el => el.type === 'defender').length;
          num = String(count + 1);
        }

        this.elements.push({
          id: Date.now() + Math.random(),
          type: this.activeTool,
          x: pos.x,
          y: pos.y,
          color: this.activeTool === 'attacker' ? '#0047AB' : this.activeTool === 'defender' ? '#EF4444' : this.activeTool === 'gk' ? '#FFD700' : '#FF8C00',
          number: num
        });
        this.render();
      } else if (this.activeTool === 'text') {
        const input = prompt('Enter tactical text label (e.g. "Overlapping Run", "3-Touch Limit", "Pressing Trigger"):', 'Overlapping Run');
        if (input && input.trim()) {
          this.saveState();
          this.elements.push({
            id: Date.now() + Math.random(),
            type: 'text',
            text: input.trim(),
            x: pos.x,
            y: pos.y,
            color: '#FFD700'
          });
          this.render();
        }
      } else if (this.activeTool === 'select' || this.activeTool === 'eraser') {
        const elIdx = this.elements.findIndex(el => {
          if (el.type === 'text') {
            return Math.abs(el.x - pos.x) < 40 && Math.abs(el.y - pos.y) < 15;
          }
          return Math.hypot(el.x - pos.x, el.y - pos.y) < 22;
        });
        if (elIdx !== -1) {
          this.saveState();
          if (this.activeTool === 'eraser') {
            this.elements.splice(elIdx, 1);
            this.render();
          } else {
            this.draggedElement = this.elements[elIdx];
            this.dragOffset = { x: pos.x - this.draggedElement.x, y: pos.y - this.draggedElement.y };
          }
        } else {
          // Proximity hit-test for drawn lines, arrows, dribbles, and sprint lines
          const drawIdx = this.drawings.findIndex(d => this.isPointNearDrawing(pos, d, 18));
          if (drawIdx !== -1) {
            this.saveState();
            if (this.activeTool === 'eraser') {
              this.drawings.splice(drawIdx, 1);
              this.render();
            } else {
              this.draggedDrawing = this.drawings[drawIdx];
              this.lastDragPos = pos;
            }
          }
        }
      } else if (['line_solid', 'line_arrow', 'line_dribble', 'line_dashed', 'line_shot'].includes(this.activeTool)) {
        this.saveState();
        this.isDrawing = true;
        this.currentPath = {
          tool: this.activeTool,
          color: this.activeTool === 'line_shot' ? '#EF4444' : (this.activeTool === 'line_dashed' ? '#FFD700' : this.activeTool === 'line_dribble' ? '#10B981' : '#FFFFFF'),
          width: this.activeTool === 'line_shot' ? 4 : 3,
          points: [pos]
        };
        this.drawings.push(this.currentPath);
      }
    };

    const move = (e) => {
      if (!this.canvas) return;
      const pos = this.getPos(e);
      if (this.draggedElement) {
        this.draggedElement.x = pos.x - this.dragOffset.x;
        this.draggedElement.y = pos.y - this.dragOffset.y;
        this.render();
      } else if (this.draggedDrawing && this.lastDragPos) {
        const dx = pos.x - this.lastDragPos.x;
        const dy = pos.y - this.lastDragPos.y;
        this.draggedDrawing.points.forEach(pt => {
          pt.x += dx;
          pt.y += dy;
        });
        this.lastDragPos = pos;
        this.render();
      } else if (this.isDrawing && this.currentPath) {
        this.currentPath.points.push(pos);
        this.render();
      }
    };

    const end = () => {
      this.isDrawing = false;
      this.currentPath = null;
      this.draggedElement = null;
      this.draggedDrawing = null;
      this.lastDragPos = null;
    };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); });
    this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); });
    window.addEventListener('touchend', end);
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.drawPitch(w, h);
    this.drawings.forEach(d => this.drawPath(d));
    this.elements.forEach(el => this.drawElement(el));
  }

  drawPitch(w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = '#163d16';
    ctx.fillRect(0, 0, w, h);

    const stripeW = w / 10;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let i = 0; i < 10; i += 2) {
      ctx.fillRect(i * stripeW, 0, stripeW, h);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;

    const pad = 16;
    const fw = w - pad * 2;
    const fh = h - pad * 2;

    ctx.strokeRect(pad, pad, fw, fh);

    if (this.pitchType === 'full') {
      ctx.beginPath();
      ctx.moveTo(w / 2, pad);
      ctx.lineTo(w / 2, h - pad);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w / 2, h / 2, fh * 0.22, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF';
      ctx.fill();

      const boxH = fh * 0.55;
      const boxW = fw * 0.18;
      const boxY = pad + (fh - boxH) / 2;

      ctx.strokeRect(pad, boxY, boxW, boxH);
      ctx.strokeRect(w - pad - boxW, boxY, boxW, boxH);

      const gboxH = fh * 0.28;
      const gboxW = fw * 0.07;
      const gboxY = pad + (fh - gboxH) / 2;

      ctx.strokeRect(pad, gboxY, gboxW, gboxH);
      ctx.strokeRect(w - pad - gboxW, gboxY, gboxW, gboxH);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(pad - 6, pad + (fh - gboxH * 0.7) / 2, 6, gboxH * 0.7);
      ctx.fillRect(w - pad, pad + (fh - gboxH * 0.7) / 2, 6, gboxH * 0.7);
    } else if (this.pitchType === 'half') {
      ctx.beginPath();
      ctx.arc(w / 2, pad, fh * 0.3, 0, Math.PI);
      ctx.stroke();

      const boxH = fh * 0.6;
      const boxW = fw * 0.5;
      const boxX = pad + (fw - boxW) / 2;
      const boxY = h - pad - boxH;

      ctx.strokeRect(boxX, boxY, boxW, boxH);

      const gboxH = fh * 0.25;
      const gboxW = fw * 0.22;
      const gboxX = pad + (fw - gboxW) / 2;
      ctx.strokeRect(gboxX, h - pad - gboxH, gboxW, gboxH);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(gboxX + (gboxW - 60) / 2, h - pad, 60, 6);
    }
  }

  drawPath(d) {
    if (!d.points || d.points.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = d.color || '#FFF';
    ctx.lineWidth = d.width || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (d.tool === 'line_dashed') {
      ctx.setLineDash([8, 6]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(d.points[0].x, d.points[0].y);

    if (d.tool === 'line_dribble') {
      for (let i = 1; i < d.points.length; i++) {
        const p = d.points[i];
        const offset = (i % 2 === 0 ? 4 : -4);
        ctx.lineTo(p.x + offset, p.y + offset);
      }
    } else {
      for (let i = 1; i < d.points.length; i++) {
        ctx.lineTo(d.points[i].x, d.points[i].y);
      }
    }
    ctx.stroke();

    if (d.tool === 'line_arrow' || d.tool === 'line_dashed' || d.tool === 'line_shot') {
      const p1 = d.points[d.points.length - 2];
      const p2 = d.points[d.points.length - 1];
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const headLen = d.tool === 'line_shot' ? 18 : 14;

      ctx.fillStyle = d.color || (d.tool === 'line_shot' ? '#EF4444' : '#FFF');
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      if (d.tool === 'line_shot') {
        // Draw target crosshair / ring at the end of the shot on goal
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawElement(el) {
    const ctx = this.ctx;
    ctx.save();

    if (el.type === 'attacker' || el.type === 'defender' || el.type === 'gk') {
      const radius = 14;
      ctx.beginPath();
      ctx.arc(el.x, el.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = el.color;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.type === 'gk' ? 'GK' : (el.number || '10'), el.x, el.y);
    } else if (el.type === 'ball') {
      ctx.beginPath();
      ctx.arc(el.x, el.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#000';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚽', el.x, el.y + 1);
    } else if (el.type === 'cone') {
      ctx.beginPath();
      ctx.moveTo(el.x, el.y - 12);
      ctx.lineTo(el.x + 10, el.y + 8);
      ctx.lineTo(el.x - 10, el.y + 8);
      ctx.closePath();
      ctx.fillStyle = el.color || '#FF8C00';
      ctx.fill();
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (el.type === 'goal') {
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 3;
      ctx.strokeRect(el.x - 16, el.y - 10, 32, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(el.x - 16, el.y - 10, 32, 20);
    } else if (el.type === 'text') {
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textWidth = ctx.measureText(el.text || 'Label').width;
      const padX = 8;
      const padY = 5;
      const boxW = textWidth + padX * 2;
      const boxH = 22;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(el.x - boxW / 2, el.y - boxH / 2, boxW, boxH, 4);
      } else {
        ctx.rect(el.x - boxW / 2, el.y - boxH / 2, boxW, boxH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFD700';
      ctx.fillText(el.text || 'Label', el.x, el.y);
    }
    ctx.restore();
  }

  exportImage() {
    return this.canvas ? this.canvas.toDataURL('image/png') : null;
  }
}

class BHSSoccerApp {
  constructor() {
    this.data = this.loadData();
    this.currentView = 'home';
    this.activeFilter = 'ALL';
    this.diagrammer = new SoccerTacticalBoard(this);
    this.masterDiagrammer = new SoccerTacticalBoard(this);
    this.init();
  }

  loadData() {
    let data = DEFAULT_BHS_DATA;
    const saved = localStorage.getItem('bhs_soccer_app_data');
    if (saved) {
      try { data = JSON.parse(saved); } catch (e) { data = DEFAULT_BHS_DATA; }
    }
    if (!data.savedPlans) data.savedPlans = DEFAULT_BHS_DATA.savedPlans;
    if (!data.activePlanName) data.activePlanName = DEFAULT_BHS_DATA.activePlanName;
    if (!data.coaches || !Array.isArray(data.coaches) || data.coaches.length === 0) data.coaches = DEFAULT_BHS_DATA.coaches;
    if (!data.dailyThoughts || !Array.isArray(data.dailyThoughts) || data.dailyThoughts.length === 0) {
      data.dailyThoughts = DEFAULT_BHS_DATA.dailyThoughts;
    }
    return data;
  }

  saveData() {
    localStorage.setItem('bhs_soccer_app_data', JSON.stringify(this.data));
  }

  async init() {
    window.auth.subscribe(() => {
      this.updateAuthUI();
      this.renderCurrentView();
    });

    this.bindEvents();
    this.updateAuthUI();
    this.renderCurrentView();
    this.startCountdownTimer();

    // Dynamically load live data from Supabase Cloud Database if configured
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await this.syncFromSupabase();
    }
  }

  async syncFromSupabase() {
    try {
      // Sync School Profile & Multi-tenant Schools list from Supabase DB
      const currentCode = this.data.school?.code || 'bhs';
      const dbSchool = await window.supabaseService.fetchSchool(currentCode);
      if (dbSchool) {
        this.data.school = {
          id: dbSchool.id,
          code: dbSchool.code,
          name: dbSchool.name,
          mascot: dbSchool.mascot,
          city: dbSchool.city,
          colors: dbSchool.colors || { primary: '#0047AB', secondary: '#FFD700' },
          record: dbSchool.record || { wins: 0, losses: 0, draws: 0 }
        };
      }

      const dbSchools = await window.supabaseService.fetchSchools();
      if (dbSchools && dbSchools.length > 0) {
        this.data.schools = dbSchools.map(s => ({
          id: s.id,
          code: s.code,
          name: s.name,
          mascot: s.mascot,
          city: s.city,
          colors: s.colors || { primary: '#0047AB', secondary: '#FFD700' },
          record: s.record || { wins: 0, losses: 0, draws: 0 }
        }));
      }

      const dbDrillsBank = await window.supabaseService.fetchDrillsBank('bhs');
      if (dbDrillsBank && dbDrillsBank.length > 0) {
        this.data.drillsBank = dbDrillsBank.map(d => ({
          id: d.id,
          name: d.name,
          duration: d.duration,
          category: d.category,
          points: d.points,
          coachNotes: d.coach_notes || '',
          diagramImage: d.diagram_image || null,
          diagramData: d.diagram_data || null
        }));
      }

      this.saveData();
      this.updateHeaderBranding();

      const dbPlayers = await window.supabaseService.fetchPlayers('bhs');
      if (dbPlayers && dbPlayers.length > 0) {
        this.data.players = dbPlayers
          .filter(p => !p.is_deleted)
          .map(p => ({
            id: p.id,
            number: p.number,
            name: p.name,
            position: p.position,
            classYear: p.class_year,
            height: p.height,
            photo: p.photo_url,
            seasonStats: p.season_stats || {},
            ratings: p.ratings || {},
            matrixStats: p.matrix_stats || {},
            isDeleted: p.is_deleted || false
          }));
      }

      const dbSchedule = await window.supabaseService.fetchSchedule('bhs');
      if (dbSchedule && dbSchedule.length > 0) {
        this.data.schedule = dbSchedule.map(s => ({
          id: s.id,
          date: s.match_date,
          time: s.match_time,
          opponent: s.opponent,
          location: s.location,
          status: s.status,
          isHome: s.is_home,
          score: s.score,
          result: s.result
        }));
      }

      const dbPlans = await window.supabaseService.fetchPracticePlans('bhs');
      if (dbPlans && dbPlans.length > 0) {
        const planMap = {};

        dbPlans.forEach(plan => {
          const notes = plan.coach_notes || '';
          let planName = plan.name || 'Practice Plan';
          let drillName = plan.drill || plan.name || 'Soccer Drill';
          let cleanNotes = notes;

          const match = notes.match(/^\[Plan:\s*([^\]]+)\]\s*(.*)/i);
          if (match) {
            planName = match[1].trim();
            cleanNotes = match[2].trim();
          }

          if (planName) {
            if (!planMap[planName]) {
              planMap[planName] = {
                id: 'plan_db_' + planName.replace(/\s+/g, '_').toLowerCase(),
                name: planName,
                date: new Date(plan.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
                drills: []
              };
            }
            planMap[planName].drills.push({
              id: plan.id,
              time: plan.time_slot,
              name: drillName,
              duration: plan.duration,
              coachNotes: cleanNotes,
              diagramImage: plan.diagram_image || null,
              diagramData: plan.diagram_data || null
            });
          }
        });

        // Merge DB saved plans into local savedPlans
        Object.values(planMap).forEach(dbPlan => {
          if (!this.data.savedPlans) this.data.savedPlans = [];
          const idx = this.data.savedPlans.findIndex(sp => sp.name.toLowerCase() === dbPlan.name.toLowerCase());
          if (idx !== -1) {
            this.data.savedPlans[idx] = dbPlan;
          } else {
            this.data.savedPlans.push(dbPlan);
          }
        });
      }

      const dbCoaches = await window.supabaseService.fetchCoaches('bhs');
      if (dbCoaches && dbCoaches.length > 0) {
        this.data.coaches = dbCoaches.map(c => ({
          id: c.id,
          name: c.name,
          level: c.level,
          phone: c.phone,
          address: c.address,
          email: c.email,
          photo: c.photo_url,
          bio: c.bio
        }));
      }

      const dbThoughts = await window.supabaseService.fetchDailyThoughts('bhs');
      if (dbThoughts && dbThoughts.length > 0) {
        this.data.dailyThoughts = dbThoughts.map(t => ({
          id: t.id,
          coachId: t.coach_id,
          coachName: t.coach_name || 'Coach Bob Miller',
          text: t.thoughts_text,
          isActive: !!t.is_active,
          createdAt: new Date(t.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
        }));
      }

      console.log('⚡ Successfully loaded live data from Supabase Cloud!');
      this.renderCurrentView();
    } catch (e) {
      console.warn('Supabase data sync notice:', e);
    }
  }

  bindEvents() {
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = item.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Auth Switcher button
    const authBtn = document.getElementById('authSwitchBtn');
    if (authBtn) {
      authBtn.addEventListener('click', () => this.openAuthModal());
    }

    // Modal Close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeModals());
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModals();
      });
    });
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.getAttribute('data-view') === viewName) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    this.renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateAuthUI() {
    const currentUser = window.auth.getCurrentUser();
    const isGuest = !currentUser || currentUser.role === 'guest';
    const isCoachOrAdmin = window.auth.isCoach() || window.auth.isAdmin();
    const canAccessRatings = window.auth.canAccessRatings();

    const roleBadge = document.getElementById('navUserBadge');
    const roleName = document.getElementById('navUserName');
    
    if (roleBadge && roleName) {
      roleName.textContent = currentUser ? currentUser.name : 'Public Visitor';
      roleBadge.textContent = currentUser ? currentUser.role.toUpperCase() : 'GUEST';
      
      roleBadge.className = 'badge ';
      if (currentUser && currentUser.role === 'coach') roleBadge.classList.add('badge-coach');
      else if (currentUser && currentUser.role === 'admin') roleBadge.classList.add('badge-admin');
      else if (currentUser && currentUser.role === 'player') roleBadge.classList.add('badge-role');
      else roleBadge.classList.add('badge-win');
    }

    // Hide / Show Navigation Items based on Public Access vs Authenticated Role
    document.querySelectorAll('.nav-item').forEach(item => {
      const view = item.getAttribute('data-view');
      if (view === 'matrix') {
        item.style.display = canAccessRatings ? '' : 'none';
      } else if (view === 'planner') {
        item.style.display = isCoachOrAdmin ? '' : 'none';
      } else if (view === 'coaches') {
        item.style.display = isCoachOrAdmin ? '' : 'none';
      } else {
        item.style.display = '';
      }
    });

    // Single Primary Auth / Admin Control Button
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
      if (isGuest) {
        adminBtn.innerHTML = '🔑 Sign In / Register';
        adminBtn.className = 'btn btn-gold';
        adminBtn.onclick = () => this.openLoginModal();
      } else if (isCoachOrAdmin) {
        adminBtn.innerHTML = '⚙️ Admin Center';
        adminBtn.className = 'btn btn-gold';
        adminBtn.onclick = () => this.openAdminModal();
      } else {
        adminBtn.innerHTML = '👤 My Account';
        adminBtn.className = 'btn btn-secondary';
        adminBtn.onclick = () => this.openAdminModal();
      }
    }

    // Fallback to Home if guest attempts to view a restricted tab
    if (isGuest && (this.currentView === 'matrix' || this.currentView === 'planner' || this.currentView === 'coaches')) {
      this.switchView('home');
    }
  }

  renderCurrentView() {
    const container = document.getElementById('mainAppContainer');
    if (!container) return;

    const role = window.auth.getRole();
    const canAccessRatings = window.auth.canAccessRatings();

    if (this.currentView === 'home') {
      container.innerHTML = this.renderHomeView();
    } else if (this.currentView === 'roster') {
      container.innerHTML = this.renderRosterView();
    } else if (this.currentView === 'schedule') {
      container.innerHTML = this.renderScheduleView();
    } else if (this.currentView === 'matrix') {
      if (!canAccessRatings) {
        container.innerHTML = this.renderRestrictedAccess('Player Ratings', 'Coaches and players are the only team members authorized to view practice ratings and rankings.');
      } else {
        container.innerHTML = this.renderMatrixView();
      }
    } else if (this.currentView === 'planner') {
      if (!window.auth.isCoach()) {
        container.innerHTML = this.renderRestrictedAccess('Coach Practice Planner', 'Access to practice planning tools is restricted to Head Coaches and Coaching Staff.');
      } else {
        container.innerHTML = this.renderPlannerView();
        setTimeout(() => {
          if (this.diagrammer) this.diagrammer.init('soccerBoardCanvas');
        }, 80);
      }
    } else if (this.currentView === 'coaches') {
      container.innerHTML = this.renderCoachesView();
    }
    
    this.attachDynamicListeners();
  }

  renderHomeView() {
    // --- Compute season stats from completed schedule entries ---
    const completed = this.data.schedule.filter(m => m.status === 'COMPLETED' && m.score);
    let wins = 0, draws = 0, losses = 0, goalsFor = 0, cleanSheets = 0;

    completed.forEach(m => {
      // Parse score strings like "BHS 3 – 1", "BHS 2-0", "3:1" etc.
      const raw = (m.score || '').replace(/BHS\s*/i, '').replace(/–|-|:/g, ' ');
      const nums = raw.match(/\d+/g);
      if (nums && nums.length >= 2) {
        const gf = parseInt(nums[0]);
        const ga = parseInt(nums[1]);
        goalsFor += gf;
        if (ga === 0) cleanSheets++;
        if (gf > ga) wins++;
        else if (gf === ga) draws++;
        else losses++;
      }
    });

    const gamesPlayed = completed.length;
    const goalsPerGame = gamesPlayed > 0 ? (goalsFor / gamesPlayed).toFixed(2) : '0.00';
    const recordStr = `${wins} - ${losses} - ${draws}`;

    // Next upcoming match & countdown
    const nextMatch = this.data.schedule.find(m => m.status !== 'COMPLETED');
    const countdown = this.getNextMatchCountdown();
    const cdDaysStr = countdown ? countdown.days : '00';
    const cdHoursStr = countdown ? countdown.hours : '00';
    const cdMinsStr = countdown ? countdown.mins : '00';

    const currentUser = window.auth.getCurrentUser();
    const isPublicGuest = !currentUser || currentUser.role === 'guest';
    const activeThought = this.getActiveThought();

    return `
      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-content">
          <span class="hero-tag">BEAUMONT HIGH SCHOOL • BOYS VARSITY</span>
          <h1 class="hero-title brand-font">HOME OF THE <span class="text-cyan">COUGARS</span></h1>
          <p class="hero-sub">Driven by discipline, tactical excellence, and relentless competition on the field.</p>
          
          <div class="countdown-box">
            <div class="match-info">
              ${nextMatch ? `
                <h4>NEXT MATCH vs ${nextMatch.opponent.toUpperCase()}</h4>
                <p>${nextMatch.isHome ? 'Home' : 'Away'} • ${nextMatch.location} | ${nextMatch.date}, ${nextMatch.time}</p>
              ` : `
                <h4>SEASON COMPLETE</h4>
                <p>All scheduled matches have been played. Final record: ${recordStr}</p>
              `}
            </div>
            <div class="timer-digits">
              <div class="timer-unit"><div class="timer-num" id="cdDays">${cdDaysStr}</div><div class="timer-label">Days</div></div>
              <div class="timer-unit"><div class="timer-num" id="cdHours">${cdHoursStr}</div><div class="timer-label">Hrs</div></div>
              <div class="timer-unit"><div class="timer-num" id="cdMins">${cdMinsStr}</div><div class="timer-label">Min</div></div>
            </div>
          </div>
        </div>
      </section>

      <div class="container" style="margin-top: 30px;">
        <!-- Side-by-Side (Team Members) or Full Width (Public Guest) -->
        <div style="display: grid; grid-template-columns: ${!isPublicGuest ? 'minmax(300px, 360px) 1fr' : '1fr'}; gap: 24px; margin-bottom: 50px; align-items: stretch;">
          
          ${!isPublicGuest ? `
            <!-- Left Column: Coach's Thoughts For The Day (Team Members Only) -->
            <div class="player-card" style="padding: 24px; background: linear-gradient(145deg, rgba(0, 71, 171, 0.25), rgba(15, 23, 42, 0.85)); border: 1px solid var(--bhs-gold-accent); display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 10px;">
                  <h3 style="color: var(--bhs-gold-accent); margin: 0; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
                    <span>💡</span> COACH'S DAILY THOUGHTS
                  </h3>
                  ${(window.auth.isCoach() || window.auth.isAdmin()) ? `<button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" onclick="app.openManageThoughtsModal()">⚙️ Manage</button>` : ''}
                </div>
                <div style="max-height: 140px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin; margin-bottom: 14px;">
                  <p style="color: #FFF; font-size: 0.92rem; line-height: 1.6; white-space: pre-wrap; margin: 0;">${activeThought.text}</p>
                </div>
                <div>
                  <button class="btn btn-gold" style="width: 100%; padding: 8px 14px; font-size: 0.88rem; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="app.openTakeQuizModal()">📝 Take Quiz</button>
                </div>
              </div>
              <div style="margin-top: 14px; pt-8; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.78rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                <span>— ${activeThought.coachName || 'Coach Bob Miller'}</span>
                <span class="badge badge-coach">HEAD COACH</span>
              </div>
            </div>
          ` : ''}

          <!-- Right Column: Season Spotlight Stats Grid -->
          <div>
            <div class="section-header" style="margin-bottom: 16px;">
              <div>
                <h2 class="section-title">SEASON SPOTLIGHT</h2>
                <p class="text-muted">Beaumont Cougars 2026 Campaign Record</p>
              </div>
              <button class="btn btn-primary" onclick="app.switchView('schedule')">Full Fixtures &amp; Results</button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
              <div class="player-card" style="padding: 20px; text-align: center;">
                <h3 style="color: var(--bhs-gold-accent); font-size: 2.5rem; margin-bottom: 4px;" class="brand-font">${recordStr}</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Overall Record (W-L-D)</p>
                <p class="text-muted" style="font-size: 0.72rem; margin-top:4px;">${gamesPlayed} games played</p>
              </div>
              <div class="player-card" style="padding: 20px; text-align: center;">
                <h3 style="color: var(--bhs-cyan-accent); font-size: 2.5rem; margin-bottom: 4px;" class="brand-font">${goalsFor}</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Goals Scored (${goalsPerGame} / Game)</p>
              </div>
              <div class="player-card" style="padding: 20px; text-align: center;">
                <h3 style="color: var(--color-success); font-size: 2.5rem; margin-bottom: 4px;" class="brand-font">${cleanSheets}</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Clean Sheets Recorded</p>
              </div>
              <div class="player-card" style="padding: 20px; text-align: center;">
                <h3 style="color: #FFF; font-size: 2.5rem; margin-bottom: 4px;" class="brand-font">${this.data.schedule.filter(m => m.status === 'UPCOMING').length}</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Upcoming Matches</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Competitor Spotlight (If logged in as Player/Coach) -->
        ${window.auth.canAccessRatings() ? `
          <div class="portal-header" style="margin-bottom: 0;">
            <div class="portal-title">
              <h2>⚡ PRACTICE COMPETITOR OF THE WEEK</h2>
              <p>Top overall competitor ranked by practice wins, 1v1 performance, and training matrix index.</p>
            </div>
            <button class="btn btn-gold" onclick="app.switchView('matrix')">View Full Matrix Board</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderRosterView() {
    const canAccessRatings = window.auth.canAccessRatings();
    const isCoach = window.auth.isCoach();
    
    return `
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">BEAUMONT COUGARS ROSTER</h2>
            <p class="text-muted">2026 Varsity Boys Soccer Squad</p>
          </div>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            ${isCoach ? `<button class="btn btn-gold" onclick="app.openAddPlayerModal()">+ Add New Player</button>` : ''}
            <div class="filters-bar">
              <span class="filter-chip active" data-filter="ALL" onclick="app.filterRoster('ALL')">All Players</span>
              <span class="filter-chip" data-filter="FWD" onclick="app.filterRoster('FWD')">Forwards</span>
              <span class="filter-chip" data-filter="MID" onclick="app.filterRoster('MID')">Midfielders</span>
              <span class="filter-chip" data-filter="DEF" onclick="app.filterRoster('DEF')">Defenders</span>
              <span class="filter-chip" data-filter="GK" onclick="app.filterRoster('GK')">Goalkeepers</span>
            </div>
          </div>
        </div>

        <div id="rosterGrid" class="roster-grid">
          ${(this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted).map(p => `
            <div class="player-card" data-player-id="${p.id}" data-position="${p.position}">
              <div class="player-card-header" onclick="app.openPlayerModal('${p.id}')">
                <span class="jersey-number">#${p.number}</span>
                <img src="${p.photo}" class="player-photo" alt="${p.name}" />
              </div>
              <div class="player-card-body">
                <h3 class="player-name" style="cursor:pointer;" onclick="app.openPlayerModal('${p.id}')">${p.name}</h3>
                <div class="player-meta">
                  <span class="badge-pos">${p.position}</span>
                  <span class="badge-class">${p.classYear}</span>
                </div>
                
                <div class="player-stats-row">
                  ${p.seasonStats.goals !== undefined ? `
                    <div class="stat-item"><div class="val">${p.seasonStats.goals}</div><div class="lbl">Goals</div></div>
                    <div class="stat-item"><div class="val">${p.seasonStats.assists}</div><div class="lbl">Assists</div></div>
                  ` : `
                    <div class="stat-item"><div class="val">${p.seasonStats.saves || 0}</div><div class="lbl">Saves</div></div>
                    <div class="stat-item"><div class="val">${p.seasonStats.cleanSheets || 0}</div><div class="lbl">Clean St</div></div>
                  `}
                  <div class="stat-item">
                    <div class="val text-gold">${canAccessRatings ? '#' + p.matrixStats.rank : '🔒'}</div>
                    <div class="lbl">Matrix</div>
                  </div>
                </div>

                ${isCoach ? `
                  <div class="player-card-actions">
                    <button class="btn-card-edit" onclick="event.stopPropagation(); app.openEditPlayerModal('${p.id}')">✏️ Edit</button>
                    <button class="btn-card-delete" onclick="event.stopPropagation(); app.deletePlayer('${p.id}')">🗑️ Delete</button>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  filterRoster(filter) {
    // Update active chip styling
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-filter') === filter);
    });

    // Position keyword map
    const filterMap = {
      ALL: null,
      FWD: ['forward', 'winger', 'cam', 'striker'],
      MID: ['midfield', 'mid'],
      DEF: ['back', 'defender', 'def'],
      GK:  ['goalkeeper', 'keeper', 'gk']
    };

    const keywords = filterMap[filter];

    document.querySelectorAll('#rosterGrid .player-card').forEach(card => {
      if (!keywords) {
        card.style.display = '';
      } else {
        const pos = (card.getAttribute('data-position') || '').toLowerCase();
        const match = keywords.some(kw => pos.includes(kw));
        card.style.display = match ? '' : 'none';
      }
    });
  }

  openAddPlayerModal() {
    const modal = document.getElementById('addPlayerModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async addPlayer(playerData) {
    const newPlayer = {
      id: 'p_' + Date.now(),
      number: parseInt(playerData.number),
      name: playerData.name,
      position: playerData.position,
      classYear: playerData.classYear,
      height: playerData.height || "5'10\"",
      photo: playerData.photo || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
      seasonStats: playerData.position.includes('Goalkeeper') ? { saves: parseInt(playerData.stat1 || 0), cleanSheets: parseInt(playerData.stat2 || 0), games: 1 } : { goals: parseInt(playerData.stat1 || 0), assists: parseInt(playerData.stat2 || 0), games: 1 },
      ratings: {
        technical: parseInt(playerData.tech || 80),
        tactical: parseInt(playerData.tact || 80),
        physical: parseInt(playerData.phys || 80),
        mental: parseInt(playerData.ment || 80)
      },
      matrixStats: { wins: 0, losses: 0, points: 0, rank: this.data.players.length + 1, drillScore: 75.0 }
    };

    this.data.players.push(newPlayer);
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.upsertPlayer('bhs', newPlayer);
    }

    this.renderCurrentView();
    this.closeModals();
  }

  openEditPlayerModal(playerId) {
    console.log('[BHS] openEditPlayerModal called with id:', playerId);
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) {
      console.warn('[BHS] Player not found for id:', playerId);
      return;
    }
    console.log('[BHS] Found player:', player.name);

    const fields = {
      editPlayerId: player.id,
      editPlayerNumber: player.number,
      editPlayerName: player.name,
      editPlayerPosition: player.position,
      editPlayerClass: player.classYear,
      editPlayerHeight: player.height || '',
      editPlayerPhoto: player.photo || '',
      editPlayerStat1: player.seasonStats.goals !== undefined ? player.seasonStats.goals : (player.seasonStats.saves || 0),
      editPlayerStat2: player.seasonStats.assists !== undefined ? player.seasonStats.assists : (player.seasonStats.cleanSheets || 0),
      editPlayerTech: player.ratings ? player.ratings.technical : 80,
      editPlayerTact: player.ratings ? player.ratings.tactical : 80,
      editPlayerPhys: player.ratings ? player.ratings.physical : 80,
      editPlayerMent: player.ratings ? player.ratings.mental : 80
    };

    for (const [id, val] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (el) {
        el.value = val;
      } else {
        console.warn('[BHS] DOM element not found:', id);
      }
    }

    const modal = document.getElementById('editPlayerModal');
    if (modal) {
      modal.style.display = '';
      modal.classList.add('active');
      console.log('[BHS] Edit modal opened');
    } else {
      console.error('[BHS] editPlayerModal element NOT found in DOM!');
    }
  }

  async saveEditPlayer(playerId, playerData) {
    const idx = this.data.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const existing = this.data.players[idx];
      existing.number = parseInt(playerData.number);
      existing.name = playerData.name;
      existing.position = playerData.position;
      existing.classYear = playerData.classYear;
      existing.height = playerData.height;
      existing.photo = playerData.photo;

      if (playerData.position.includes('Goalkeeper')) {
        existing.seasonStats = { saves: parseInt(playerData.stat1), cleanSheets: parseInt(playerData.stat2), games: existing.seasonStats.games || 1 };
      } else {
        existing.seasonStats = { goals: parseInt(playerData.stat1), assists: parseInt(playerData.stat2), games: existing.seasonStats.games || 1 };
      }

      existing.ratings = {
        technical: parseInt(playerData.tech),
        tactical: parseInt(playerData.tact),
        physical: parseInt(playerData.phys),
        mental: parseInt(playerData.ment)
      };

      this.data.players[idx] = existing;
      this.saveData();

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.upsertPlayer('bhs', existing);
      }

      this.renderCurrentView();
      this.closeModals();
    }
  }

  async deletePlayer(playerId) {
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) return;

    // Soft delete player (sets is_deleted = true in database, preserves record)
    player.isDeleted = true;
    this.data.players = this.data.players.filter(p => p.id !== playerId);
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.deletePlayer(playerId);
    }

    this.renderCurrentView();
    this.closeModals();
  }

  renderScheduleView() {
    const isCoachOrAdmin = true; // Always enable schedule management
    return `
      <div class="container">
        <div class="section-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 class="section-title">SCHEDULE &amp; GAME RESULTS</h2>
            <p class="text-muted">Beaumont High School Cougars Season Fixtures &amp; Match Results</p>
          </div>
          <button class="btn btn-gold" onclick="app.openAddMatchModal()" style="font-weight:700;">➕ Add New Match</button>
        </div>

        <div class="schedule-list" style="display:flex; flex-direction:column; gap:12px;">
          ${(this.data.schedule || []).filter(m => !m.is_deleted && !m.isDeleted).map(m => `
            <div class="schedule-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px 18px; border-radius: 10px;">
              <div class="game-date" style="min-width:120px;">
                <strong style="color:var(--bhs-gold-accent); font-size:1rem; display:block;">${m.date}</strong>
                <div class="time text-muted" style="font-size:0.82rem;">⏱️ ${m.time}</div>
              </div>
              <div class="game-matchup" style="flex:1; min-width:180px;">
                <div>
                  <div class="opponent-name" style="font-weight:700; color:#FFF; font-size:1.05rem;">vs ${m.opponent}</div>
                  <div class="location-tag text-muted" style="font-size:0.82rem;">📍 ${m.location}</div>
                </div>
              </div>
              <div>
                <span class="badge ${m.isHome ? 'badge-win' : 'badge-role'}" style="font-weight:700;">${m.isHome ? '🏠 HOME' : '✈️ AWAY'}</span>
              </div>
              <div>
                ${m.status === 'COMPLETED' ? `
                  <div class="result-badge result-win" style="background:rgba(40,167,69,0.2); color:var(--color-success); border:1px solid rgba(40,167,69,0.5); padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85rem;">FINAL: ${m.score || m.result || 'W'}</div>
                ` : `
                  <div class="result-badge result-upcoming" style="background:rgba(0,71,171,0.2); color:var(--bhs-cyan-accent); border:1px solid var(--bhs-blue-electric); padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85rem;">UPCOMING</div>
                `}
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="app.openEditMatchModal('${m.id}')">✏️ Edit</button>
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem; background:rgba(239, 68, 68, 0.2); color:var(--color-danger); border-color:rgba(239, 68, 68, 0.4);" onclick="app.deleteMatch('${m.id}')">🗑️ Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  formatIsoToDisplayDate(isoStr) {
    if (!isoStr) return '';
    if (!isoStr.includes('-') && isoStr.length < 15) return isoStr;
    const d = new Date(isoStr + 'T00:00:00');
    if (isNaN(d.getTime())) return isoStr;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  formatDisplayDateToIso(displayStr) {
    if (!displayStr) return '';
    if (displayStr.includes('-') && displayStr.length === 10) return displayStr;
    const d = new Date(displayStr);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  format24hTo12h(timeStr) {
    if (!timeStr) return '';
    if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) return timeStr;
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hrs = parseInt(parts[0], 10);
    const mins = parts[1];
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12;
    if (hrs === 0) hrs = 12;
    return `${hrs}:${mins} ${ampm}`;
  }

  format12hTo24h(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes(':') && !timeStr.toLowerCase().includes('am') && !timeStr.toLowerCase().includes('pm')) return timeStr;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return '';
    let hrs = parseInt(match[1], 10);
    const mins = match[2];
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && hrs < 12) hrs += 12;
    if (ampm === 'AM' && hrs === 12) hrs = 0;
    return `${String(hrs).padStart(2, '0')}:${mins}`;
  }

  openAddMatchModal() {
    ['newMatchDate','newMatchTime','newMatchOpponent','newMatchLocation','newMatchScore'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const dateEl = document.getElementById('newMatchDate');
    if (dateEl) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateEl.value = `${yyyy}-${mm}-${dd}`;
    }

    const timeEl = document.getElementById('newMatchTime');
    if (timeEl) timeEl.value = '18:30';

    const statusEl = document.getElementById('newMatchStatus');
    if (statusEl) statusEl.value = 'UPCOMING';
    const homeEl = document.getElementById('newMatchIsHome');
    if (homeEl) homeEl.value = 'true';

    const modal = document.getElementById('addMatchModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async addMatch(matchData) {
    const displayDate = this.formatIsoToDisplayDate(matchData.date);
    const displayTime = this.format24hTo12h(matchData.time);

    const newMatch = {
      id: 'm_' + Date.now(),
      date: displayDate || (matchData.date || '').toUpperCase(),
      rawDate: matchData.date,
      time: displayTime || matchData.time,
      rawTime: matchData.time,
      opponent: matchData.opponent,
      location: matchData.location,
      status: matchData.status,
      isHome: matchData.isHome === 'true' || matchData.isHome === true,
      score: matchData.score || null,
      result: matchData.status === 'COMPLETED' ? (matchData.score || '') : null
    };

    this.data.schedule.push(newMatch);
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      const cloudRes = await window.supabaseService.upsertMatch(this.data.school?.code || 'bhs', newMatch);
      if (cloudRes && cloudRes.id) newMatch.id = cloudRes.id;
    }

    this.renderCurrentView();
    this.closeModals();
    alert(`✅ SUCCESS!\n\nMatch vs "${newMatch.opponent}" added to Schedule & Database!`);
  }

  openEditMatchModal(matchId) {
    const match = (this.data.schedule || []).find(m => String(m.id) === String(matchId));
    if (!match) return;

    const idEl = document.getElementById('editMatchId');
    const dateEl = document.getElementById('editMatchDate');
    const timeEl = document.getElementById('editMatchTime');
    const oppEl = document.getElementById('editMatchOpponent');
    const locEl = document.getElementById('editMatchLocation');
    const statusEl = document.getElementById('editMatchStatus');
    const homeEl = document.getElementById('editMatchIsHome');
    const scoreEl = document.getElementById('editMatchScore');

    if (idEl) idEl.value = match.id;
    if (dateEl) dateEl.value = match.rawDate || this.formatDisplayDateToIso(match.date) || '';
    if (timeEl) timeEl.value = match.rawTime || this.format12hTo24h(match.time) || '';
    if (oppEl) oppEl.value = match.opponent || '';
    if (locEl) locEl.value = match.location || '';
    if (statusEl) statusEl.value = match.status || 'UPCOMING';
    if (homeEl) homeEl.value = String(match.isHome);
    if (scoreEl) scoreEl.value = match.score || '';

    const modal = document.getElementById('editMatchModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async saveEditMatch(matchData) {
    const idx = (this.data.schedule || []).findIndex(m => String(m.id) === String(matchData.id));
    if (idx !== -1) {
      const displayDate = this.formatIsoToDisplayDate(matchData.date);
      const displayTime = this.format24hTo12h(matchData.time);

      const updated = {
        ...this.data.schedule[idx],
        date: displayDate || (matchData.date || '').toUpperCase(),
        rawDate: matchData.date,
        time: displayTime || matchData.time,
        rawTime: matchData.time,
        opponent: matchData.opponent,
        location: matchData.location,
        status: matchData.status,
        isHome: matchData.isHome === 'true' || matchData.isHome === true,
        score: matchData.score || null,
        result: matchData.status === 'COMPLETED' ? (matchData.score || '') : null
      };
      this.data.schedule[idx] = updated;
      this.saveData();

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.upsertMatch(this.data.school?.code || 'bhs', updated);
      }

      this.renderCurrentView();
      this.closeModals();
      alert(`✅ SUCCESS!\n\nMatch changes for vs "${updated.opponent}" saved to Schedule & Database!`);
    }
  }

  submitEditMatch() {
    const matchData = {
      id: document.getElementById('editMatchId')?.value,
      date: document.getElementById('editMatchDate')?.value,
      time: document.getElementById('editMatchTime')?.value,
      opponent: document.getElementById('editMatchOpponent')?.value,
      location: document.getElementById('editMatchLocation')?.value,
      status: document.getElementById('editMatchStatus')?.value,
      isHome: document.getElementById('editMatchIsHome')?.value,
      score: document.getElementById('editMatchScore')?.value
    };
    this.saveEditMatch(matchData);
  }

  async deleteMatch(matchId) {
    const match = (this.data.schedule || []).find(m => String(m.id) === String(matchId));
    if (!match) return;
    if (confirm(`Are you sure you want to delete the match vs "${match.opponent}" on ${match.date}?`)) {
      this.data.schedule = this.data.schedule.filter(m => String(m.id) !== String(matchId));
      this.saveData();

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.deleteMatch(matchId);
      }

      this.renderCurrentView();
      alert(`🗑️ Match vs "${match.opponent}" removed from Schedule & Database.`);
    }
  }

  renderMatrixView() {
    const isCoach = window.auth.isCoach();

    return `
      <div class="container">
        <div class="portal-header">
          <div class="portal-title">
            <h2>🏆 COMPETITIVE RATING MATRIX</h2>
            <p>Objective practice competition tracker modeling competitive player performance ratings and rankings.</p>
          </div>
          ${isCoach ? `<button class="btn btn-gold" onclick="app.openAddDrillModal()">+ Record Practice Drill Scores</button>` : ''}
        </div>

        <div class="matrix-grid">
          <div class="matrix-table-container">
            <div class="table-title">
              <h3 style="color:#FFF">CURRENT PRACTICE MATRIX LEADERBOARD</h3>
              <span class="badge badge-coach">UPDATED DAILY</span>
            </div>
            
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>RANK</th>
                  <th>PLAYER</th>
                  <th>POS</th>
                  <th>PRACTICE WINS</th>
                  <th>WIN %</th>
                  <th>MATRIX INDEX</th>
                </tr>
              </thead>
              <tbody>
                ${(this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted).sort((a,b) => (a.matrixStats?.rank || 99) - (b.matrixStats?.rank || 99)).map(p => `
                  <tr>
                    <td>
                      <div class="rank-pill ${p.matrixStats.rank <= 3 ? 'rank-' + p.matrixStats.rank : 'rank-other'}">
                        ${p.matrixStats.rank}
                      </div>
                    </td>
                    <td>
                      <strong>${p.name}</strong> <span class="text-muted">(#${p.number})</span>
                    </td>
                    <td><span class="badge-pos">${p.position}</span></td>
                    <td>${p.matrixStats.wins} W - ${p.matrixStats.losses} L</td>
                    <td>${((p.matrixStats.wins / (p.matrixStats.wins + p.matrixStats.losses)) * 100).toFixed(1)}%</td>
                    <td>
                      <strong>${p.matrixStats.drillScore}</strong>
                      <div class="score-progress">
                        <div class="score-bar" style="width: ${p.matrixStats.drillScore}%;"></div>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div>
            <div class="planner-card">
              <h3 style="color: var(--bhs-gold-accent); margin-bottom: 12px;">📊 ABOUT THE SYSTEM</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
                Inspired by Hall of Fame UNC Coach <strong>Anson Dorrance</strong>, every practice session is measured competitively. 
                1v1 gauntlets, small-sided games, shooting drills, and fitness tests award points directly impacting player matrix ranks and starting lineup selection.
              </p>
            </div>

            <div class="planner-card">
              <h3 style="color: var(--bhs-cyan-accent); margin-bottom: 12px;">⚽ DRILLS IN CURRENT MATRIX</h3>
              ${this.data.currentPracticePlan.length === 0 ? `
                <p style="color:var(--text-muted); font-size:0.85rem;">No drills in today's practice plan yet. Add drills in the Coach Practice Planner.</p>
              ` : this.data.currentPracticePlan.map(d => `
                <div style="border-bottom: 1px solid var(--bhs-navy-border); padding: 8px 0;">
                  <strong style="color:#FFF">${d.name}</strong>
                  <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                    <span>⏱ ${d.time || ''} &nbsp;·&nbsp; ${d.duration}</span>
                    <span style="color:var(--bhs-cyan-accent);">${d.coachNotes ? '📝 ' + d.coachNotes.substring(0, 40) + (d.coachNotes.length > 40 ? '…' : '') : ''}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderPlannerView() {
    const savedCount = (this.data.savedPlans || []).length;
    const activeName = this.data.activePlanName || 'Standard Practice Session';

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
          </div>
        </div>

        <div class="planner-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 14px;">
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                <h3 style="color: #FFF; margin: 0;">TODAY'S PRACTICE TIMELINE</h3>
                <span class="badge badge-coach">ACTIVE PLAN</span>
              </div>
              <div style="color: var(--bhs-gold-accent); font-size: 0.95rem; font-weight: 700;">
                "${activeName}"
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
                        <button class="btn ${isSelected ? 'btn-gold' : 'btn-secondary'}" style="padding: 4px 8px; font-size: 0.8rem;" onclick="event.stopPropagation(); app.selectPracticeDrill(${idx})">🎨 View / Draw Diagram</button>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="event.stopPropagation(); app.openEditPlanDrillModal(${idx})">✏️ Edit</button>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.2); color: var(--color-danger); border-color: var(--color-danger);" onclick="event.stopPropagation(); app.deletePlanDrill(${idx})">🗑️</button>
                      </div>
                    </div>
                  </div>

                  ${p.diagramImage ? `
                    <div style="margin-top: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-gold-accent); padding: 10px; border-radius: 8px; text-align: left;">
                      <div style="font-size: 0.75rem; color: var(--bhs-gold-accent); margin-bottom: 6px; font-weight: 700; display:flex; justify-content:space-between; align-items:center;">
                        <span>🎨 SAVED TACTICAL DRILL DIAGRAM</span>
                        <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.72rem; background: rgba(239,68,68,0.2); color: var(--color-danger);" onclick="event.stopPropagation(); app.removeDrillDiagram(${idx})">🗑️ Remove Diagram</button>
                      </div>
                      <img src="${p.diagramImage}" style="max-width: 100%; max-height: 260px; border-radius: 6px; object-fit: contain; background: #163d16; border: 1px solid var(--bhs-gold-accent);" />
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
        </div>

        <!-- Interactive Tactical Drill Diagrammer Card -->
        ${(() => {
          const selectedDrill = this.data.currentPracticePlan[this.selectedDrillIndex || 0];
          return `
            <div class="diagrammer-card" id="diagrammerCard">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 12px;">
                <div>
                  <h3 style="color: #FFF; margin: 0; display: flex; align-items: center; gap: 8px;">
                    <span>🎨</span> TACTICAL SOCCER DRILL DIAGRAMMER
                  </h3>
                  <p class="text-muted" style="font-size: 0.85rem; margin-top: 4px; margin-bottom: 0;">
                    Target Drill: <strong style="color: var(--bhs-gold-accent);">${selectedDrill ? selectedDrill.name : 'Select a practice drill above'}</strong>
                  </p>
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                  <button class="btn btn-gold" onclick="app.attachDiagramToDrill(${this.selectedDrillIndex || 0})">💾 Save Diagram to "${selectedDrill ? selectedDrill.name : 'Drill'}"</button>
                  <button class="btn btn-secondary" onclick="app.downloadDiagramPNG()">📥 Download PNG</button>
                </div>
              </div>
          `;
        })()}

          <!-- Diagrammer Toolbar -->
          <div class="diagrammer-toolbar">
            <div class="tool-group">
              <span class="tool-group-label">Pitch View:</span>
              <button class="tool-btn active" data-pitch="full" onclick="app.diagrammer.setPitchType('full')">🏟️ Full Field</button>
              <button class="tool-btn" data-pitch="half" onclick="app.diagrammer.setPitchType('half')">⚽ Half Field</button>
            </div>

            <div class="tool-group">
              <span class="tool-group-label">Stamps / Items:</span>
              <button class="tool-btn active" data-tool="attacker" onclick="app.setDiagramTool('attacker')">🔵 Attacker</button>
              <button class="tool-btn" data-tool="defender" onclick="app.setDiagramTool('defender')">🔴 Defender</button>
              <button class="tool-btn" data-tool="gk" onclick="app.setDiagramTool('gk')">🟡 GK</button>
              <button class="tool-btn" data-tool="ball" onclick="app.setDiagramTool('ball')">⚽ Ball</button>
              <button class="tool-btn" data-tool="cone" onclick="app.setDiagramTool('cone')">🦺 Cone</button>
              <button class="tool-btn" data-tool="goal" onclick="app.setDiagramTool('goal')">🥅 Goal</button>
              <button class="tool-btn" data-tool="text" onclick="app.setDiagramTool('text')">📝 Text Label</button>
            </div>

            <div class="tool-group">
              <span class="tool-group-label">Drawing Tools:</span>
              <button class="tool-btn" data-tool="line_arrow" onclick="app.setDiagramTool('line_arrow')">➡️ Arrow / Pass</button>
              <button class="tool-btn" data-tool="line_dashed" onclick="app.setDiagramTool('line_dashed')">⚡ Run / Sprint</button>
              <button class="tool-btn" data-tool="line_dribble" onclick="app.setDiagramTool('line_dribble')">〰️ Dribble</button>
              <button class="tool-btn" data-tool="line_shot" onclick="app.setDiagramTool('line_shot')">🎯 Shot on Goal</button>
              <button class="tool-btn" data-tool="line_solid" onclick="app.setDiagramTool('line_solid')">✏️ Pen</button>
            </div>

            <div class="tool-group">
              <span class="tool-group-label">Actions:</span>
              <button class="tool-btn" data-tool="select" onclick="app.setDiagramTool('select')">🖐️ Move Item</button>
              <button class="tool-btn" data-tool="eraser" onclick="app.setDiagramTool('eraser')">🧽 Delete</button>
              <button class="tool-btn" onclick="app.diagrammer.undo()">↩️ Undo</button>
              <button class="tool-btn" onclick="app.diagrammer.clear()">🧹 Clear Field</button>
            </div>
          </div>

          <!-- Pitch Canvas Wrapper -->
          <div class="canvas-wrapper">
            <canvas id="soccerBoardCanvas" width="800" height="500"></canvas>
          </div>

          <!-- Tactical Movement Timeline & Animator Controls -->
          <div style="margin-top: 16px; background: rgba(0, 0, 0, 0.4); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.1rem;">⏱️</span>
                <strong style="color: var(--bhs-gold-accent); font-size: 0.9rem;">TACTICAL MOVEMENT TIMELINE</strong>
                <span id="timelineFrameBadge" class="badge badge-gold" style="font-size: 0.75rem;">Time 0 (Start Position)</span>
              </div>
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <button class="btn btn-gold" id="btnPlayAnim" style="padding: 6px 14px; font-size: 0.85rem; font-weight: 700;" onclick="app.diagrammer.togglePlayAnimation()">▶️ Play Animation</button>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="app.diagrammer.addKeyframe()">➕ Add Time Frame</button>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem; background: rgba(239, 68, 68, 0.2); color: var(--color-danger);" onclick="app.diagrammer.deleteCurrentKeyframe()">🗑️ Delete Frame</button>
              </div>
            </div>

            <!-- Keyframe Sequence Bar -->
            <div id="keyframeButtonsContainer" style="display: flex; gap: 8px; overflow-x: auto; padding: 4px 0;">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </div>
      </div>
    `;
  }

  selectPracticeDrill(idx) {
    if (!this.data.currentPracticePlan || idx < 0 || idx >= this.data.currentPracticePlan.length) return;
    this.selectedDrillIndex = idx;
    const drill = this.data.currentPracticePlan[idx];
    if (drill && this.diagrammer) {
      if (drill.diagramData) {
        this.diagrammer.loadDiagramData(drill.diagramData);
      } else {
        this.diagrammer.clear();
      }
    }
    this.renderCurrentView();

    const card = document.getElementById('diagrammerCard');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  setDiagramTool(tool) {
    if (this.diagrammer) {
      this.diagrammer.setTool(tool);
    }
  }

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
      const selectedIdxStr = prompt(`Select practice drill number to attach this tactical diagram to:\n\n${options}`, '1');
      if (!selectedIdxStr) return;
      selectedIdx = parseInt(selectedIdxStr) - 1;
    }

    if (isNaN(selectedIdx) || selectedIdx < 0 || selectedIdx >= this.data.currentPracticePlan.length) {
      alert('Invalid drill selection.');
      return;
    }

    const drill = this.data.currentPracticePlan[selectedIdx];
    drill.diagramImage = dataUrl;
    drill.diagramData = diagramData;
    this.selectedDrillIndex = selectedIdx;

    this.saveData();

    // Persist to Supabase Database if configured
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.upsertPracticePlanItem('bhs', drill);
    }

    this.renderCurrentView();
    alert(`🎉 Tactical drill diagram successfully saved and stored in database for "${drill.name}"!`);
  }

  async removeDrillDiagram(idx) {
    if (this.data.currentPracticePlan && this.data.currentPracticePlan[idx]) {
      const drill = this.data.currentPracticePlan[idx];
      delete drill.diagramImage;
      delete drill.diagramData;
      this.saveData();

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.upsertPracticePlanItem('bhs', drill);
      }

      this.renderCurrentView();
    }
  }

  downloadDiagramPNG() {
    if (!this.diagrammer) return;
    const dataUrl = this.diagrammer.exportImage();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `bhs_cougars_drill_diagram_${Date.now()}.png`;
    a.click();
  }

  getActiveThought() {
    const thoughts = this.data.dailyThoughts || [];
    return thoughts.find(t => t.isActive) || thoughts[0] || {
      id: 'dt_default',
      coachId: 'c1',
      coachName: 'Coach Bob Miller',
      text: 'No coach thoughts entered for today.',
      isActive: true
    };
  }

  openManageThoughtsModal() {
    this.renderThoughtsList();
    const modal = document.getElementById('manageThoughtsModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  renderThoughtsList() {
    const container = document.getElementById('thoughtsListContainer');
    if (!container) return;

    const thoughts = this.data.dailyThoughts || [];
    if (thoughts.length === 0) {
      container.innerHTML = `<p class="text-muted" style="text-align: center; padding: 20px;">No daily thoughts recorded yet. Click <strong>+ Add New Thought</strong> above to create one!</p>`;
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
            <button class="btn btn-secondary" style="padding:3px 8px; font-size:0.75rem; background:rgba(239,68,68,0.2); color:var(--color-danger); border-color:var(--color-danger);" onclick="app.deleteThought('${t.id}')">🗑️ Delete</button>
          </div>
        </div>
        <p style="color: #DDD; font-size: 0.88rem; line-height: 1.5; margin: 0; white-space: pre-wrap;">${t.text}</p>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 8px;">Posted: ${t.createdAt || 'Recent'}</div>
      </div>
    `).join('');
  }

  openAddThoughtModal() {
    const currentUser = window.auth.getCurrentUser();
    document.getElementById('thoughtEditId').value = '';
    document.getElementById('thoughtFormModalTitle').textContent = '➕ ADD NEW DAILY THOUGHT';
    document.getElementById('thoughtCoachNameInput').value = (currentUser && currentUser.name) ? currentUser.name : 'Coach Bob Miller';
    document.getElementById('thoughtTextInput').value = '';
    document.getElementById('thoughtIsActiveInput').checked = true;

    const modal = document.getElementById('editThoughtFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  openEditThoughtFormModal(thoughtId) {
    const thought = (this.data.dailyThoughts || []).find(t => t.id === thoughtId);
    if (!thought) return;

    document.getElementById('thoughtEditId').value = thought.id;
    document.getElementById('thoughtFormModalTitle').textContent = '✏️ EDIT DAILY THOUGHT';
    document.getElementById('thoughtCoachNameInput').value = thought.coachName || 'Coach Bob Miller';
    document.getElementById('thoughtTextInput').value = thought.text || '';
    document.getElementById('thoughtIsActiveInput').checked = !!thought.isActive;

    const modal = document.getElementById('editThoughtFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async submitThoughtForm() {
    const id = document.getElementById('thoughtEditId').value;
    const coachName = document.getElementById('thoughtCoachNameInput').value.trim() || 'Coach Bob Miller';
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
        targetThought.text = text;
        targetThought.isActive = isActive;
      }
    } else {
      targetThought = {
        id: 'dt_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        coachId: coachId,
        coachName: coachName,
        text: text,
        isActive: isActive,
        createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
      };
      if (!this.data.dailyThoughts) this.data.dailyThoughts = [];
      this.data.dailyThoughts.unshift(targetThought);
    }

    this.saveData();

    let cloudResult = null;
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      cloudResult = await window.supabaseService.upsertDailyThought('bhs', {
        id: targetThought.id,
        coachId: coachId,
        coachName: coachName,
        text: text,
        isActive: isActive
      });

      if (cloudResult && cloudResult.data && cloudResult.data.id) {
        targetThought.id = cloudResult.data.id;
        if (isActive) {
          await window.supabaseService.setActiveDailyThought('bhs', cloudResult.data.id);
        }
      }
    }

    this.saveData();
    this.renderThoughtsList();
    this.renderCurrentView();
    const formModal = document.getElementById('editThoughtFormModal');
    if (formModal) { formModal.style.display = 'none'; formModal.classList.remove('active'); }

    if (cloudResult && cloudResult.error) {
      alert(`⚠️ Saved locally, but Supabase Cloud error:\n${cloudResult.error}\n\nMake sure the "daily_thoughts" table exists in your Supabase SQL Editor!`);
    } else {
      alert('✅ Daily thought saved to Supabase Cloud & Local Storage successfully!');
    }
  }

  async setActiveThought(thoughtId) {
    (this.data.dailyThoughts || []).forEach(t => {
      t.isActive = (t.id === thoughtId);
    });
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.setActiveDailyThought('bhs', thoughtId);
    }

    this.renderThoughtsList();
    this.renderCurrentView();
  }

  async deleteThought(thoughtId) {
    if (!confirm('Are you sure you want to delete this daily thought entry?')) return;

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

  openTakeQuizModal(tab = 'quiz') {
    const activeThought = this.getActiveThought();
    const container = document.getElementById('quizModalContent');
    if (!container) return;

    const currentUser = window.auth.getCurrentUser() || { name: 'Alex Rivera (#10)', id: 'p_guest' };
    const modal = document.getElementById('takeQuizModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }

    const isLeaderboard = tab === 'leaderboard';

    container.innerHTML = `
      <div style="display: flex; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 10px;">
        <button class="btn ${!isLeaderboard ? 'btn-gold' : 'btn-secondary'}" onclick="app.openTakeQuizModal('quiz')" style="font-size: 0.82rem; font-weight: 700;">📝 Take 5-Question Quiz</button>
        <button class="btn ${isLeaderboard ? 'btn-gold' : 'btn-secondary'}" onclick="app.openTakeQuizModal('leaderboard')" style="font-size: 0.82rem; font-weight: 700;">🏆 Quiz Results Leaderboard</button>
      </div>

      ${isLeaderboard ? this.renderQuizLeaderboardHTML() : `
        <div style="background: rgba(0, 71, 171, 0.2); border: 1px solid var(--bhs-navy-border); padding: 12px 14px; border-radius: 8px; margin-bottom: 16px;">
          <div style="font-size: 0.78rem; color: var(--bhs-gold-accent); font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">
            📌 Today's Tactical Focus (${activeThought.coachName || 'Coach Bob Miller'})
          </div>
          <div style="font-size: 0.86rem; color: #FFF; font-style: italic; line-height: 1.4; max-height: 75px; overflow-y: auto;">
            "${activeThought.text}"
          </div>
        </div>

        <form id="dailyQuizForm" onsubmit="event.preventDefault(); app.submitQuizAnswer();" style="max-height: 440px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin;">
          <!-- Player Identity Header -->
          <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">Player Taking Quiz:</span>
            <strong style="color: var(--bhs-gold-accent); font-size: 0.95rem;">⚽ ${currentUser.name}</strong>
          </div>

          <!-- Question 1 -->
          <div class="form-group" style="margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border-left: 3px solid var(--bhs-gold-accent);">
            <label style="color: #FFF; font-weight: 600; margin-bottom: 8px; display: block; font-size: 0.9rem;">
              1. What is the primary tactical objective emphasized in Coach's Daily Thoughts?
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q1" value="A" required /> A) Drop back into low-block passive defense
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #FFF;">
                <input type="radio" name="q1" value="B" required /> B) High intensity pressing &amp; quick 2-touch passing transitions
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q1" value="C" required /> C) Dribble individually without passing options
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q1" value="D" required /> D) Long high balls into penalty box only
              </label>
            </div>
          </div>

          <!-- Question 2 -->
          <div class="form-group" style="margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border-left: 3px solid var(--bhs-cyan-accent);">
            <label style="color: #FFF; font-weight: 600; margin-bottom: 8px; display: block; font-size: 0.9rem;">
              2. How should players handle possession under pressure according to today's focus?
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #FFF;">
                <input type="radio" name="q2" value="A" required /> A) Make the simple, quick pass as first option
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q2" value="B" required /> B) Hold the ball until surrounded by defenders
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q2" value="C" required /> C) Turn around and kick the ball out of bounds
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q2" value="D" required /> D) Stop moving completely and wait for whistle
              </label>
            </div>
          </div>

          <!-- Question 3 -->
          <div class="form-group" style="margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border-left: 3px solid var(--bhs-gold-accent);">
            <label style="color: #FFF; font-weight: 600; margin-bottom: 8px; display: block; font-size: 0.9rem;">
              3. According to Coach's Daily Focus, what is faster than any dribble on the pitch?
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #FFF;">
                <input type="radio" name="q3" value="A" required /> A) A passing ball moving twenty yards
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q3" value="B" required /> B) Juggling in place
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q3" value="C" required /> C) Throw-ins from sideline
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q3" value="D" required /> D) Running backwards
              </label>
            </div>
          </div>

          <!-- Question 4 -->
          <div class="form-group" style="margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border-left: 3px solid var(--bhs-cyan-accent);">
            <label style="color: #FFF; font-weight: 600; margin-bottom: 8px; display: block; font-size: 0.9rem;">
              4. What is the primary tactical formation for Beaumont Varsity 11v11 matches?
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q4" value="A" required /> A) 5-4-1 Ultra Defensive Park-the-Bus
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #FFF;">
                <input type="radio" name="q4" value="B" required /> B) 4-3-3 High Press / Attack-Minded
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q4" value="C" required /> C) 2-2-6 All-Out Attack
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q4" value="D" required /> D) No tactical formation
              </label>
            </div>
          </div>

          <!-- Question 5 -->
          <div class="form-group" style="margin-bottom: 20px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border-left: 3px solid var(--bhs-gold-accent);">
            <label style="color: #FFF; font-weight: 600; margin-bottom: 8px; display: block; font-size: 0.9rem;">
              5. What is the minimum practice participation requirement for starting lineup consideration?
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q5" value="A" required /> A) 25%
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q5" value="B" required /> B) 50%
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #FFF;">
                <input type="radio" name="q5" value="C" required /> C) 90%+ Match Readiness &amp; Practice Participation
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted);">
                <input type="radio" name="q5" value="D" required /> D) 10%
              </label>
            </div>
          </div>

          <button type="submit" class="btn btn-gold" style="width: 100%; font-weight: 700; padding: 10px; font-size: 0.95rem;">🎯 Submit &amp; Grade Quiz</button>
        </form>
        <div id="quizScoreResult" style="margin-top: 14px;"></div>
      `}
    `;
  }

  async submitQuizAnswer() {
    const currentUser = window.auth.getCurrentUser() || { name: 'Alex Rivera (#10)', id: 'p_guest' };

    const q1 = document.querySelector('input[name="q1"]:checked')?.value;
    const q2 = document.querySelector('input[name="q2"]:checked')?.value;
    const q3 = document.querySelector('input[name="q3"]:checked')?.value;
    const q4 = document.querySelector('input[name="q4"]:checked')?.value;
    const q5 = document.querySelector('input[name="q5"]:checked')?.value;

    const answerKeys = [
      { questionId: 1, correct: 'B', selected: q1 },
      { questionId: 2, correct: 'A', selected: q2 },
      { questionId: 3, correct: 'A', selected: q3 },
      { questionId: 4, correct: 'B', selected: q4 },
      { questionId: 5, correct: 'C', selected: q5 }
    ];

    let score = 0;
    const playerAnswers = answerKeys.map(a => {
      const isCorrect = a.selected === a.correct;
      if (isCorrect) score += 1;
      return {
        questionId: a.questionId,
        selectedOption: a.selected || 'A',
        isCorrect: isCorrect
      };
    });

    const totalQuestions = 5;
    const percentage = Math.round((score / totalQuestions) * 100);

    // Save attempt to local memory
    if (!this.data.quizAttempts) this.data.quizAttempts = [];
    const attemptRecord = {
      attempt_id: Date.now(),
      player_id: currentUser.id || 'p_guest',
      player_name: currentUser.name || 'Alex Rivera (#10)',
      score: score,
      total_questions: totalQuestions,
      percentage: percentage,
      completed_at: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
    };
    this.data.quizAttempts.unshift(attemptRecord);
    this.saveData();

    // Save attempt & individual player_answers to Supabase Cloud
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.saveQuizAttempt(currentUser, playerAnswers, score, totalQuestions);
    }

    const resultDiv = document.getElementById('quizScoreResult');
    if (resultDiv) {
      resultDiv.innerHTML = `
        <div style="background: ${score === 5 ? 'rgba(34, 197, 94, 0.25)' : 'rgba(234, 179, 8, 0.25)'}; border: 2px solid ${score === 5 ? 'var(--color-success)' : 'var(--bhs-gold-accent)'}; padding: 16px; border-radius: 10px; text-align: center;">
          <h4 style="color: #FFF; margin-bottom: 6px;">
            ${score === 5 ? '🌟 PERFECT SCORE! 100%' : '🎯 QUIZ GRADED RESULT'}
          </h4>
          <div style="font-size: 1.8rem; font-weight: 800; color: ${score >= 4 ? 'var(--color-success)' : 'var(--bhs-gold-accent)'}; margin-bottom: 6px;">
            ${score} / ${totalQuestions} (${percentage}%)
          </div>
          <p style="font-size: 0.85rem; color: #FFF; margin: 0;">
            ${score === 5 ? 'Awesome job! Attempt saved to database table <strong>quiz_attempts</strong>.' : 'Review Coach Steele\'s Daily Thoughts and attempt again to reach 100%!'}
          </p>
          <button class="btn btn-gold" onclick="app.openTakeQuizModal('leaderboard')" style="margin-top: 12px; font-size: 0.8rem;">🏆 View Leaderboard &amp; Results</button>
        </div>
      `;
    }
  }

  renderQuizLeaderboardHTML() {
    const localAttempts = this.data.quizAttempts || [
      { player_name: 'Alex Rivera (#10)', score: 5, total_questions: 5, percentage: 100, completed_at: 'AUG 2, 6:15 PM' },
      { player_name: 'Coach Bob Miller', score: 5, total_questions: 5, percentage: 100, completed_at: 'AUG 2, 5:45 PM' }
    ];

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
  }

  renderCoachesView() {
    const isCoach = window.auth.isCoach();
    const coaches = this.data.coaches || [];

    return `
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">BEAUMONT COUGARS COACHING STAFF</h2>
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
                <img src="${c.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--bhs-gold-accent); object-fit: cover;" alt="${c.name}" />
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
  }

  openAddCoachModal() {
    const modal = document.getElementById('addCoachModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  getSchoolsList() {
    if (!this.data.schools || !Array.isArray(this.data.schools) || this.data.schools.length === 0) {
      this.data.schools = [this.data.school || DEFAULT_BHS_DATA.school];
    }
    return this.data.schools;
  }

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
  }

  handleCoachSchoolSelect(val, mode) {
    if (val === 'NEW_SCHOOL') {
      this.pendingCoachSchoolMode = mode;
      this.openSchoolFormModal();
    }
  }

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
  }

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
  }

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
  }

  openSchoolFormModal(schoolData = null) {
    const sData = schoolData || this.data.school || DEFAULT_BHS_DATA.school;
    this.populateSchoolFormSelect(sData.code || sData.id);
    this.fillSchoolFormFields(sData);

    const noticeEl = document.getElementById('schoolFormStatusNotice');
    if (noticeEl) {
      if (window.supabaseService?.isConfigured()) {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(40,167,69,0.2)';
        noticeEl.style.borderColor = 'rgba(40,167,69,0.4)';
        noticeEl.innerHTML = '⚡ <strong>Cloud DB Active:</strong> Changes will save to <strong>LocalStorage</strong> and sync live to <strong>Supabase DB</strong> (`schools` table).';
      } else {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(255,193,7,0.2)';
        noticeEl.style.borderColor = 'rgba(255,193,7,0.4)';
        noticeEl.innerHTML = '📦 <strong>Local Mode Active:</strong> Saving directly to browser <strong>LocalStorage</strong>. (Provide Supabase key in Admin Center to enable cloud sync).';
      }
    }

    const modal = document.getElementById('schoolFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async submitSchoolForm() {
    const statusNotice = document.getElementById('schoolFormStatusNotice');
    const submitBtn = document.querySelector('#schoolFormModal button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '💾 Save to LocalStorage &amp; Database';

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

      // 2. Save persistently to LocalStorage
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
          statusNotice.innerHTML = `✅ <strong>Saved to LocalStorage &amp; Supabase DB!</strong><br/>School "${name}" (${code}) successfully updated in cloud database.`;
        }
        alert(`✅ SUCCESS!\n\nSchool profile for "${name} ${mascot}" has been saved to LocalStorage and synced to your Supabase Cloud Database!`);
        this.closeModal('schoolFormModal');
      } else if (cloudRes && cloudRes.error) {
        if (statusNotice) {
          statusNotice.style.display = 'block';
          statusNotice.style.background = 'rgba(220,53,69,0.25)';
          statusNotice.style.borderColor = 'rgba(220,53,69,0.6)';
          statusNotice.innerHTML = `⚠️ <strong>LocalStorage Saved, but Cloud DB Error:</strong> ${cloudRes.error}`;
        }
        alert(`⚠️ SAVED LOCALLY ONLY\n\nSchool data saved to browser LocalStorage, but Supabase Cloud error occurred:\n${cloudRes.error}\n\nMake sure the "schools" table and RLS policies are created in your Supabase SQL Editor.`);
      } else {
        if (statusNotice) {
          statusNotice.style.display = 'block';
          statusNotice.style.background = 'rgba(255,193,7,0.25)';
          statusNotice.style.borderColor = 'rgba(255,193,7,0.6)';
          statusNotice.innerHTML = `📦 <strong>Saved to LocalStorage!</strong><br/>Supabase cloud DB is not configured. Enter your Supabase Anon key in Admin Center to enable cloud database sync.`;
        }
        alert(`📦 SAVED TO LOCAL STORAGE!\n\nSchool profile for "${name} ${mascot}" saved successfully to your browser's LocalStorage.\n\n(To save to Supabase Cloud DB, click "Sign In / Register" -> Admin Center and enter your Supabase Anon Key).`);
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
  }

  updateHeaderBranding() {
    const school = this.data.school || DEFAULT_BHS_DATA.school;
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
  }

  openAddCoachModal() {
    this.populateCoachSchoolDropdown('newCoachSchool', this.data.school?.code || 'bhs');
    const modal = document.getElementById('addCoachModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

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
      photo: data.photo?.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
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
  }

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
  }

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
      photo: document.getElementById('editCoachPhoto').value.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
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
  }

  async deleteCoach(coachId) {
    const coach = (this.data.coaches || []).find(c => c.id === coachId);
    if (!coach) return;

    if (confirm(`Are you sure you want to remove "${coach.name}" from the coaching staff?`)) {
      this.data.coaches = (this.data.coaches || []).filter(c => c.id !== coachId);
      this.saveData();

      if (window.supabaseService?.isConfigured()) {
        await window.supabaseService.deleteCoach(coachId);
      }

      this.renderCurrentView();
    }
  }

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
  }

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
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.saveFullPracticePlan('bhs', cleanName, planObj.drills);
    }

    this.renderCurrentView();
    this.closeModals();

    if (triggerDownload) {
      // Trigger native browser File Save dialog with Filename Box prefilled with cleanName
      this.downloadPracticePlan('html');
    } else {
      alert(`✅ Practice Plan "${cleanName}" saved to database successfully!`);
    }
  }

  openLoadPlanModal() {
    const container = document.getElementById('savedPlansContainer');
    const saved = this.data.savedPlans || [];

    if (container) {
      if (saved.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:30px; color:var(--text-muted);">
            <p style="font-size:1.1rem; margin-bottom:8px;">No saved practice plans found.</p>
            <p style="font-size:0.85rem;">Add drills to today's timeline and click <strong>💾 Save Practice Plan</strong> to record custom plans here.</p>
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
  }

  loadPracticePlan(planId) {
    const plan = (this.data.savedPlans || []).find(p => p.id === planId);
    if (!plan) return;

    if (confirm(`Load practice plan "${plan.name}"? This will replace today's practice timeline with the ${plan.drills.length} drills from this plan.`)) {
      this.data.currentPracticePlan = JSON.parse(JSON.stringify(plan.drills));
      this.data.activePlanName = plan.name;
      this.saveData();
      this.renderCurrentView();
      this.closeModals();
    }
  }

  deleteSavedPlan(planId) {
    const plan = (this.data.savedPlans || []).find(p => p.id === planId);
    if (!plan) return;

    if (confirm(`Are you sure you want to delete the saved plan "${plan.name}"?`)) {
      this.data.savedPlans = (this.data.savedPlans || []).filter(p => p.id !== planId);
      this.saveData();
      this.openLoadPlanModal();
    }
  }

  generateDiagramStepDataUrl(diagramData, stepIndex = 0, targetWidth = 800) {
    if (!diagramData) return null;

    let parsed = diagramData;
    if (typeof diagramData === 'string') {
      try { parsed = JSON.parse(diagramData); } catch (e) { return null; }
    }

    const pitchType = parsed.pitchType || 'full';
    const keyframes = parsed.keyframes || [];

    let elements = parsed.elements || [];
    let drawings = parsed.drawings || [];
    let stepLabel = 'Tactical Pitch Diagram';

    if (keyframes.length > 0 && stepIndex >= 0 && stepIndex < keyframes.length) {
      const kf = keyframes[stepIndex];
      elements = kf.elements || [];
      drawings = kf.drawings || [];
      stepLabel = kf.label || `Step ${stepIndex + 1}`;
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
  }

  printPracticePlan() {
    const activeName = this.data.activePlanName || 'Standard Practice Session';
    const plan = this.data.currentPracticePlan || [];

    if (plan.length === 0) {
      alert('Your current practice timeline is empty. Add at least one drill to the plan before printing.');
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
    <div>⏱️ Total Time: ${totalTimeStr}</div>
    <div>⚽ Total Drills: ${plan.length}</div>
    <div>📍 Location: Cougar Stadium Practice Field</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="time-col">TIME SLOT</th>
        <th>DRILL NAME &amp; COACH FOCUS NOTES</th>
        <th class="dur-col">DURATION</th>
      </tr>
    </thead>
    <tbody>
      ${plan.map(d => {
        let renderedDiagramStepsHtml = '';
        let parsedDiagram = d.diagramData;
        if (typeof parsedDiagram === 'string') {
          try { parsedDiagram = JSON.parse(parsedDiagram); } catch(e) { parsedDiagram = null; }
        }

        const keyframes = parsedDiagram?.keyframes || [];

        if (keyframes.length > 0) {
          const stepCards = keyframes.map((kf, stepIdx) => {
            const stepObj = this.generateDiagramStepDataUrl(parsedDiagram, stepIdx, 520);
            if (!stepObj) return '';
            return `
              <div style="background: #FFFFFF; border: 1px solid #D1D5DB; border-radius: 6px; padding: 10px; page-break-inside: avoid;">
                <div style="font-weight: 700; font-size: 11px; color: #0047AB; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #E5E7EB; padding-bottom: 4px;">
                  <span>📍 STEP ${stepIdx + 1} OF ${keyframes.length}: ${kf.label || `Step ${stepIdx + 1}`}</span>
                  <span style="color: #6B7280; font-size: 10px;">FRAME #${stepIdx + 1}</span>
                </div>
                <img src="${stepObj.dataUrl}" style="width: 100%; max-width: 480px; height: auto; border-radius: 4px; border: 1px solid #9CA3AF; display: block; margin: 0 auto;" />
              </div>
            `;
          }).filter(Boolean).join('');

          if (stepCards) {
            renderedDiagramStepsHtml = `
              <div style="margin-top: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; page-break-inside: avoid;">
                <div style="font-weight: 700; font-size: 12px; color: #1E293B; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                  📐 Tactical Pitch Diagram Step-by-Step Sequence (${keyframes.length} Step${keyframes.length > 1 ? 's' : ''}):
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
                  ${stepCards}
                </div>
              </div>
            `;
          }
        } else if (d.diagramImage || (parsedDiagram && ((parsedDiagram.elements && parsedDiagram.elements.length > 0) || (parsedDiagram.drawings && parsedDiagram.drawings.length > 0)))) {
          const stepObj = this.generateDiagramStepDataUrl(parsedDiagram || { elements: d.elements, drawings: d.drawings, pitchType: d.pitchType }, 0, 520);
          const imgUrl = stepObj?.dataUrl || d.diagramImage;
          if (imgUrl) {
            renderedDiagramStepsHtml = `
              <div style="margin-top: 10px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 8px; page-break-inside: avoid;">
                <div style="font-weight: 700; font-size: 12px; color: #0047AB; margin-bottom: 6px;">📐 Tactical Pitch Diagram:</div>
                <img src="${imgUrl}" style="width: 100%; max-width: 480px; height: auto; border-radius: 4px; border: 1px solid #9CA3AF; display: block; margin: 0 auto;" />
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

  <script>
    document.title = ${JSON.stringify(activeName)};
    window.onload = function() {
      document.title = ${JSON.stringify(activeName)};
      setTimeout(function() {
        document.title = ${JSON.stringify(activeName)};
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const printWin = window.open(url, '_blank', 'width=850,height=950');

    if (!printWin) {
      const origTitle = document.title;
      document.title = activeName;
      window.print();
      setTimeout(() => { document.title = origTitle; }, 3000);
    }
  }

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
        let parsedDiagram = d.diagramData;
        if (typeof parsedDiagram === 'string') {
          try { parsedDiagram = JSON.parse(parsedDiagram); } catch(e) { parsedDiagram = null; }
        }

        const keyframes = parsedDiagram?.keyframes || [];

        if (keyframes.length > 0) {
          const stepCards = keyframes.map((kf, stepIdx) => {
            const stepObj = this.generateDiagramStepDataUrl(parsedDiagram, stepIdx, 520);
            if (!stepObj) return '';
            return `
              <div style="background: #FFFFFF; border: 1px solid #D1D5DB; border-radius: 6px; padding: 10px; page-break-inside: avoid;">
                <div style="font-weight: 700; font-size: 11px; color: #0047AB; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #E5E7EB; padding-bottom: 4px;">
                  <span>📍 STEP ${stepIdx + 1} OF ${keyframes.length}: ${kf.label || `Step ${stepIdx + 1}`}</span>
                  <span style="color: #6B7280; font-size: 10px;">FRAME #${stepIdx + 1}</span>
                </div>
                <img src="${stepObj.dataUrl}" style="width: 100%; max-width: 480px; height: auto; border-radius: 4px; border: 1px solid #9CA3AF; display: block; margin: 0 auto;" />
              </div>
            `;
          }).filter(Boolean).join('');

          if (stepCards) {
            renderedDiagramStepsHtml = `
              <div style="margin-top: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; page-break-inside: avoid;">
                <div style="font-weight: 700; font-size: 12px; color: #1E293B; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                  📐 Tactical Pitch Diagram Step-by-Step Sequence (${keyframes.length} Step${keyframes.length > 1 ? 's' : ''}):
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
                  ${stepCards}
                </div>
              </div>
            `;
          }
        } else if (d.diagramImage || (parsedDiagram && ((parsedDiagram.elements && parsedDiagram.elements.length > 0) || (parsedDiagram.drawings && parsedDiagram.drawings.length > 0)))) {
          const stepObj = this.generateDiagramStepDataUrl(parsedDiagram || { elements: d.elements, drawings: d.drawings, pitchType: d.pitchType }, 0, 520);
          const imgUrl = stepObj?.dataUrl || d.diagramImage;
          if (imgUrl) {
            renderedDiagramStepsHtml = `
              <div style="margin-top: 10px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 8px; page-break-inside: avoid;">
                <div style="font-weight: 700; font-size: 12px; color: #0047AB; margin-bottom: 6px;">📐 Tactical Pitch Diagram:</div>
                <img src="${imgUrl}" style="width: 100%; max-width: 480px; height: auto; border-radius: 4px; border: 1px solid #9CA3AF; display: block; margin: 0 auto;" />
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
  }

  formatDuration(val) {
    if (!val) return '15 min';
    let trimmed = val.trim();
    // If it's a numeric string like "12", "18", or lacks min/hr suffix, append " min"
    if (/^\d+$/.test(trimmed) || (!trimmed.toLowerCase().includes('min') && !trimmed.toLowerCase().includes('hr'))) {
      return `${trimmed} min`;
    }
    return trimmed;
  }

  populateNewDrillLibrarySelect() {
    const select = document.getElementById('newDrillLibrarySelect');
    if (!select) return;
    const drills = this.data.drillsBank || [];
    select.innerHTML = `
      <option value="">-- Select Preset Drill from Library --</option>
      ${drills.map(d => `<option value="${d.id}">📚 ${d.name} (${d.category || 'General'} • ${d.duration})</option>`).join('')}
    `;
  }

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
  }

  openDrillsBankModal() {
    this.renderDrillsBankList();
    const modal = document.getElementById('drillsBankModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

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
              <span class="badge badge-win">⏱️ ${d.duration}</span>
              <span class="badge badge-gold">⭐ ${d.points || 3} Pts</span>
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
  }

  setMasterDiagramTool(tool) {
    if (this.masterDiagrammer) {
      this.masterDiagrammer.setTool(tool);
    }
  }

  openCreateMasterDrillModal(drillId = null) {
    document.getElementById('masterDrillFormId').value = '';
    document.getElementById('masterDrillFormName').value = '';
    document.getElementById('masterDrillFormCategory').value = 'Tactical / Attacking';
    document.getElementById('masterDrillFormDuration').value = '20 min';
    document.getElementById('masterDrillFormPoints').value = 3;
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
        document.getElementById('masterDrillFormPoints').value = targetDrill.points || 3;
        document.getElementById('masterDrillFormNotes').value = targetDrill.coachNotes || '';
        if (titleEl) titleEl.textContent = '✏️ EDIT MASTER DRILL';
      }
    } else {
      if (titleEl) titleEl.textContent = '➕ CREATE NEW MASTER DRILL';
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
  }

  async saveMasterDrillForm() {
    const id = document.getElementById('masterDrillFormId')?.value || '';
    const name = (document.getElementById('masterDrillFormName')?.value || '').trim();
    const category = document.getElementById('masterDrillFormCategory')?.value || 'General';
    const duration = (document.getElementById('masterDrillFormDuration')?.value || '20 min').trim();
    const points = parseInt(document.getElementById('masterDrillFormPoints')?.value || 3, 10);
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
    drillObj.points = points;
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
    alert(`✅ Master Drill "${name}" & Tactical Pitch Diagram saved to Master Library & Database!`);
  }

  async deleteMasterDrill(drillId) {
    if (!drillId) return;
    if (!confirm('Are you sure you want to delete this master drill from your library?')) return;

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

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      const saved = await window.supabaseService.savePracticePlanItem('bhs', newPlanDrill);
      if (saved && saved.id) newPlanDrill.id = saved.id;
    }

    this.data.currentPracticePlan.push(newPlanDrill);
    this.saveData();
    this.closeModal('drillsBankModal');
    this.renderCurrentView();
    alert(`➕ "${drill.name}" added to today's active practice timeline!`);
  }

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
  }

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
  }

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
  }

  async addPlanDrill(time, name, duration, coachNotes) {
    const formattedDuration = this.formatDuration(duration);
    const newDrill = { time, name, duration: formattedDuration, coachNotes };

    // Save to Supabase first to get the DB-assigned id
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      const saved = await window.supabaseService.savePracticePlanItem('bhs', newDrill);
      if (saved && saved.id) newDrill.id = saved.id;
    }

    this.data.currentPracticePlan.push(newDrill);
    this.saveData();
    this.renderCurrentView();
    this.closeModals();
  }

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
  }

  submitEditPlanDrill() {
    const index = parseInt(document.getElementById('editDrillIndex').value);
    const time = document.getElementById('editDrillTime').value;
    const name = document.getElementById('editDrillName').value;
    const duration = document.getElementById('editDrillDuration').value;
    const coachNotes = document.getElementById('editDrillNotes').value;
    this.saveEditPlanDrill(index, time, name, duration, coachNotes);
  }

  async saveEditPlanDrill(index, time, name, duration, coachNotes) {
    if (this.data.currentPracticePlan[index]) {
      const formattedDuration = this.formatDuration(duration);
      const updated = { ...this.data.currentPracticePlan[index], time, name, duration: formattedDuration, coachNotes };
      this.data.currentPracticePlan[index] = updated;
      this.saveData();

      // Upsert to Supabase (uses existing id if present)
      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.upsertPracticePlanItem('bhs', updated);
      }

      this.renderCurrentView();
      this.closeModals();
    }
  }

  async deletePlanDrill(index) {
    if (confirm('Are you sure you want to delete this drill from today\'s practice plan?')) {
      const drill = this.data.currentPracticePlan[index];
      this.data.currentPracticePlan.splice(index, 1);
      this.saveData();

      // Delete from Supabase using the drill's db id
      if (drill && drill.id && window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.deletePracticePlanItem(drill.id);
      }

      this.renderCurrentView();
    }
  }

  handleDrillDragStart(e, idx) {
    this.draggedDrillIndex = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
    if (e.currentTarget) e.currentTarget.classList.add('dragging');
  }

  handleDrillDragOver(e, idx) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  handleDrillDragEnter(e, idx) {
    e.preventDefault();
    if (this.draggedDrillIndex !== undefined && this.draggedDrillIndex !== idx && e.currentTarget) {
      e.currentTarget.classList.add('drag-over');
    }
  }

  handleDrillDragLeave(e, idx) {
    if (e.currentTarget) e.currentTarget.classList.remove('drag-over');
  }

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
      window.supabaseService.saveFullPracticePlan(this.data.school?.code || 'bhs', {
        name: this.data.activePlanName || 'Current Practice Session',
        items: this.data.currentPracticePlan
      });
    }

    this.renderCurrentView();
  }

  handleDrillDragEnd(e) {
    this.draggedDrillIndex = undefined;
    document.querySelectorAll('.drill-item').forEach(el => {
      el.classList.remove('dragging', 'drag-over');
    });
  }

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

  renderRestrictedAccess(featureName, reason) {
    return `
      <div class="container">
        <div class="restricted-box">
          <div class="restricted-icon">🔒</div>
          <h2 style="color: #FFF; margin-bottom: 8px;">RESTRICTED TEAM AREA</h2>
          <h4 style="color: var(--bhs-gold-accent); margin-bottom: 16px;">${featureName}</h4>
          <p class="text-muted" style="margin-bottom: 24px; font-size: 0.95rem;">${reason}</p>
          <button class="btn btn-primary" onclick="app.openAuthModal()">🔑 Sign In / Switch Role</button>
        </div>
      </div>
    `;
  }

  openAuthModal() {
    const currentUser = window.auth.getCurrentUser();
    if (!currentUser || currentUser.role === 'guest') {
      this.openLoginModal();
    } else {
      this.openAdminModal();
    }
  }

  openLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
    const feedback = document.getElementById('authFormFeedback');
    if (feedback) feedback.textContent = '';
  }

  switchAuthTab(tab) {
    const signInForm = document.getElementById('signInForm');
    const registerForm = document.getElementById('registerForm');
    const verifyForm = document.getElementById('verifyForm');
    const tabSignInBtn = document.getElementById('tabSignInBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');

    if (tab === 'register') {
      if (signInForm) signInForm.style.display = 'none';
      if (registerForm) registerForm.style.display = '';
      if (verifyForm) verifyForm.style.display = 'none';
      if (tabSignInBtn) tabSignInBtn.className = 'btn btn-secondary';
      if (tabRegisterBtn) tabRegisterBtn.className = 'btn btn-cyan';
    } else if (tab === 'verify') {
      if (signInForm) signInForm.style.display = 'none';
      if (registerForm) registerForm.style.display = 'none';
      if (verifyForm) verifyForm.style.display = '';
      if (tabSignInBtn) tabSignInBtn.className = 'btn btn-secondary';
      if (tabRegisterBtn) tabRegisterBtn.className = 'btn btn-secondary';
    } else {
      if (signInForm) signInForm.style.display = '';
      if (registerForm) registerForm.style.display = 'none';
      if (verifyForm) verifyForm.style.display = 'none';
      if (tabSignInBtn) tabSignInBtn.className = 'btn btn-gold';
      if (tabRegisterBtn) tabRegisterBtn.className = 'btn btn-secondary';
    }
  }

  quickLogin(email, password) {
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = password || 'password';
    this.handleSignIn();
  }

  handleSignIn() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const feedback = document.getElementById('authFormFeedback');

    const res = window.auth.loginUser(email, password);
    if (res.success) {
      this.updateAuthUI();
      this.renderCurrentView();
      this.closeModals();
      alert(`🎉 Welcome back, ${res.user.name}!`);
    } else {
      if (res.isPendingVerification) {
        this.openVerifyTab(res.user.email, res.user.verificationCode);
      } else if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  }

  handleRegister() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;
    const feedback = document.getElementById('authFormFeedback');

    const res = window.auth.registerUser({ name, email, password, role });
    if (res.success) {
      if (res.requiresVerification) {
        this.openVerifyTab(email, res.otpCode);
      } else {
        this.updateAuthUI();
        this.renderCurrentView();
        this.closeModals();
        alert(`🎉 Account created successfully! Welcome, ${res.user.name}.`);
      }
    } else {
      if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  }

  openVerifyTab(email, otpCode) {
    this.switchAuthTab('verify');
    this.pendingVerifyEmail = email;
    const targetEl = document.getElementById('verifyTargetEmail');
    const bannerEl = document.getElementById('simulatedCodeBanner');
    if (targetEl) targetEl.textContent = email;
    if (bannerEl && otpCode) {
      bannerEl.innerHTML = `⚡ DEMO VERIFICATION OTP CODE: <span style="font-size:1.1rem; letter-spacing:2px;">${otpCode}</span> (or enter 123456)`;
    }
  }

  handleVerifyOtp() {
    const code = document.getElementById('verifyOtpCode').value;
    const feedback = document.getElementById('authFormFeedback');
    const email = this.pendingVerifyEmail || document.getElementById('regEmail').value || document.getElementById('loginEmail').value;

    const res = window.auth.verifyUserOtp(email, code);
    if (res.success) {
      this.updateAuthUI();
      this.renderCurrentView();
      if (res.status === 'pending_approval') {
        alert(res.message);
        this.closeModals();
      } else {
        alert(`🎉 Email verified! Account activated for ${res.user.name}.`);
        this.closeModals();
      }
    } else {
      if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  }

  approveUserAccess(userId) {
    const ok = window.auth.approveUserAccess(userId);
    if (ok) {
      this.updateAuthUI();
      this.renderCurrentView();
      this.renderAdminModalContent();
      alert('🎉 User access approved successfully!');
    }
  }

  rejectUserAccess(userId) {
    const ok = window.auth.rejectUserAccess(userId);
    if (ok) {
      this.renderAdminModalContent();
      alert('User request rejected.');
    }
  }

  renderPlayerAccountModalContent() {
    const currentUser = window.auth.getCurrentUser();
    const container = document.getElementById('adminModalContent');
    const titleEl = document.getElementById('adminModalTitle');
    if (!container) return;

    if (titleEl) {
      titleEl.innerHTML = '👤 MY PLAYER ACCOUNT &amp; PROFILE';
    }

    // Find matching player in team roster
    const player = (this.data && this.data.players && this.data.players.find(p => p.id === currentUser.playerId || (currentUser.name && p.name.toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0])))) || {
      name: currentUser ? currentUser.name : 'Varsity Player',
      number: 10,
      position: 'Forward / CAM',
      classYear: 'Senior (2027)',
      height: "5'11\"",
      photo: currentUser.avatar || 'assets/bhs_cougars_logo.png',
      seasonStats: { goals: 14, assists: 8, games: 12 },
      ratings: { technical: 92, tactical: 88, physical: 85, mental: 90 },
      matrixStats: { rank: 1, points: 94, wins: 28, losses: 6 }
    };

    container.innerHTML = `
      <!-- Player Banner Card -->
      <div style="background: linear-gradient(135deg, rgba(0, 71, 171, 0.4), rgba(10, 20, 40, 0.8)); border: 1px solid var(--bhs-blue-electric); padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center; position: relative;">
        <img src="${player.photo || currentUser.avatar || 'assets/bhs_cougars_logo.png'}" style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid var(--bhs-gold-accent); object-fit: cover; box-shadow: 0 4px 14px rgba(0,0,0,0.5);" />
        <h2 style="color: #FFF; margin-top: 10px; margin-bottom: 2px;">${player.number ? '#' + player.number + ' ' : ''}${player.name}</h2>
        <p class="text-cyan" style="font-weight: 700; margin-bottom: 6px;">${player.position} &bull; ${player.classYear}</p>
        <span class="badge badge-role">BEAUMONT HIGH SCHOOL VARSITY SOCCER</span>
      </div>

      <!-- Account Info Row -->
      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="color: var(--bhs-gold-accent); margin-bottom: 10px; font-size: 0.9rem;">📧 ACCOUNT CREDENTIALS &amp; PROFILE INFO</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem;">
          <div><span style="color: var(--text-muted);">Email:</span> <strong style="color: #FFF;">${currentUser.email || 'N/A'}</strong></div>
          <div><span style="color: var(--text-muted);">Account Role:</span> <span class="badge badge-role">PLAYER</span></div>
          <div><span style="color: var(--text-muted);">School:</span> <strong style="color: #FFF;">Beaumont High School</strong></div>
          <div><span style="color: var(--text-muted);">Team:</span> <strong style="color: #FFF;">Boys Varsity Soccer</strong></div>
        </div>
      </div>

      <!-- Season Stats Summary -->
      <div style="margin-bottom: 20px;">
        <h4 style="color: var(--bhs-gold-accent); margin-bottom: 12px; font-size: 0.9rem;">⚽ MY SEASON PERFORMANCE STATS</h4>
        <div class="player-stats-row" style="margin-bottom: 0;">
          <div class="stat-item"><div class="val">${player.seasonStats?.goals ?? 0}</div><div class="lbl">Goals</div></div>
          <div class="stat-item"><div class="val">${player.seasonStats?.assists ?? 0}</div><div class="lbl">Assists</div></div>
          <div class="stat-item"><div class="val">${player.seasonStats?.games ?? 0}</div><div class="lbl">Games Played</div></div>
          <div class="stat-item"><div class="val text-gold">#${player.matrixStats?.rank ?? '1'}</div><div class="lbl">Team Rank</div></div>
        </div>
      </div>

      <!-- Coach Ratings Breakdown -->
      ${player.ratings ? `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-navy-border); padding: 16px; border-radius: 10px; margin-bottom: 20px;">
          <h4 style="color: var(--bhs-cyan-accent); margin-bottom: 12px; font-size: 0.9rem;">📊 MY COACH EVALUATION RATINGS</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.88rem;">
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Technical Skill</span><strong style="color: var(--bhs-gold-accent);">${player.ratings.technical}/100</strong></div>
              <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px;"><div style="background: var(--bhs-gold-accent); height: 100%; width: ${player.ratings.technical}%; border-radius: 3px;"></div></div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Tactical IQ</span><strong style="color: var(--bhs-gold-accent);">${player.ratings.tactical}/100</strong></div>
              <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px;"><div style="background: var(--bhs-gold-accent); height: 100%; width: ${player.ratings.tactical}%; border-radius: 3px;"></div></div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Physical Speed &amp; Power</span><strong style="color: var(--bhs-gold-accent);">${player.ratings.physical}/100</strong></div>
              <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px;"><div style="background: var(--bhs-gold-accent); height: 100%; width: ${player.ratings.physical}%; border-radius: 3px;"></div></div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Mental Drive</span><strong style="color: var(--bhs-gold-accent);">${player.ratings.mental}/100</strong></div>
              <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px;"><div style="background: var(--bhs-gold-accent); height: 100%; width: ${player.ratings.mental}%; border-radius: 3px;"></div></div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Action Buttons -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--bhs-navy-border); padding-top: 16px;">
        <button class="btn btn-secondary" onclick="window.auth.logout(); app.updateAuthUI(); app.renderCurrentView(); app.closeModals();">🚪 Sign Out</button>
        <button class="btn btn-gold" onclick="app.closeModals(); app.switchView('roster');">👥 View Team Roster</button>
      </div>
    `;
  }

  renderAdminModalContent() {
    const currentUser = window.auth.getCurrentUser();
    if (currentUser && currentUser.role === 'player') {
      return this.renderPlayerAccountModalContent();
    }

    const titleEl = document.getElementById('adminModalTitle');
    if (titleEl) {
      titleEl.innerHTML = '⚙️ ADMIN &amp; ROLE CONTROL CENTER';
    }

    const isGuest = !currentUser || currentUser.role === 'guest';
    const isCoachOrAdmin = window.auth.isCoach() || window.auth.isAdmin();

    const sampleUsers = [
      { id: 'user_coach_bob', name: 'Coach Bob', role: 'Coach', icon: '👔', desc: 'Head Coach: full practice planning, match crud, roster & ratings' },
      { id: 'user_admin_sam', name: 'Admin Sam', role: 'Admin', icon: '⚡', desc: 'Athletic Director: full system & administrative control' },
      { id: 'user_player_alex', name: 'Alex Rivera (#10)', role: 'Player', icon: '⚽', desc: 'Varsity Player: roster viewing, schedule & ratings matrix' },
      { id: 'user_guest', name: 'Public Visitor', role: 'Guest', icon: '👤', desc: 'Fan / Public: public matches, schedule & basic team bios' }
    ];

    const container = document.getElementById('adminModalContent');
    if (!container) return;

    container.innerHTML = `
      <!-- Current Account Header -->
      <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-navy-border); padding: 12px 16px; border-radius: 8px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${currentUser.avatar || 'assets/bhs_cougars_logo.png'}" style="height: 40px; width: 40px; border-radius: 50%; object-fit: cover; border: 1px solid var(--bhs-gold-accent);" />
          <div>
            <strong style="color: #FFF; font-size: 0.95rem; display: block;">${currentUser.name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${currentUser.email || 'Team Account'} &bull; <span style="color: var(--bhs-gold-accent); text-transform: uppercase; font-weight: 700;">${currentUser.role}</span></div>
          </div>
        </div>
        ${!isGuest ? `<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.auth.logout(); app.updateAuthUI(); app.renderCurrentView(); app.closeModals();">🚪 Sign Out</button>` : `<span class="badge badge-gold">PUBLIC ACCESS</span>`}
      </div>

      <!-- Section 1: Active User Role Switcher -->
      <details class="admin-accordion">
        <summary class="admin-accordion-summary">
          <span>🔑 ACTIVE USER ACCOUNT &amp; ROLE SWITCHER</span>
          <span class="badge badge-gold">${currentUser.name} (${currentUser.role.toUpperCase()})</span>
        </summary>
        <div class="admin-accordion-content">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            ${sampleUsers.map(u => {
              const isActive = currentUser && currentUser.id === u.id;
              return `
                <div onclick="app.switchUserRole('${u.id}')" style="cursor: pointer; background: ${isActive ? 'rgba(0, 71, 171, 0.35)' : 'rgba(0, 0, 0, 0.25)'}; border: ${isActive ? '2px solid var(--bhs-gold-accent)' : '1px solid var(--bhs-navy-border)'}; border-radius: 8px; padding: 12px; transition: all 0.2s ease;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <strong style="color: #FFF; font-size: 0.95rem;">${u.icon} ${u.name}</strong>
                    ${isActive ? `<span class="badge badge-gold">ACTIVE</span>` : `<span class="badge badge-secondary" style="font-size:0.7rem;">SWITCH</span>`}
                  </div>
                  <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.3;">${u.desc}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </details>

      <!-- Section 2: School & Club Profile Settings -->
      <details class="admin-accordion">
        <summary class="admin-accordion-summary">
          <span>🏫 SCHOOL &amp; CLUB PROFILE SETTINGS</span>
          <span class="badge badge-coach">${this.data.school?.name || 'Beaumont High School'}</span>
        </summary>
        <div class="admin-accordion-content">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px;">
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">School Code (e.g. bhs)</label>
              <input type="text" id="adminSchoolCode" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.code || this.data.school?.id || 'bhs'}" placeholder="bhs" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Official School / Club Name</label>
              <input type="text" id="adminSchoolName" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.name || 'Beaumont High School'}" placeholder="Beaumont High School" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Mascot / Team Nickname</label>
              <input type="text" id="adminSchoolMascot" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.mascot || 'Cougars'}" placeholder="Cougars" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">City &amp; State Location</label>
              <input type="text" id="adminSchoolCity" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.city || 'Beaumont, CA'}" placeholder="Beaumont, CA" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 14px;">
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Season Wins</label>
              <input type="number" id="adminSchoolWins" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.record?.wins ?? 9}" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Season Losses</label>
              <input type="number" id="adminSchoolLosses" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.record?.losses ?? 1}" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Season Draws</label>
              <input type="number" id="adminSchoolDraws" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.record?.draws ?? 2}" />
            </div>
          </div>

          <button class="btn btn-gold" style="width: 100%; font-weight:700; font-size:0.85rem; padding: 8px;" onclick="app.saveSchoolDataFromAdmin()">💾 Save School Profile to LocalStorage &amp; Database</button>
        </div>
      </details>

      ${isCoachOrAdmin ? `
        <!-- Section 3: Pending User Approvals Queue -->
        <details class="admin-accordion">
          <summary class="admin-accordion-summary">
            <span>👥 PENDING USER APPROVAL QUEUE</span>
            <span class="badge badge-gold">${window.auth.getPendingApprovals().length} REQUESTS</span>
          </summary>
          <div class="admin-accordion-content">
            ${window.auth.getPendingApprovals().length === 0 ? `
              <p class="text-muted" style="font-size: 0.85rem; margin: 0;">No pending account authorization requests. New signups requiring Coach/Player access will appear here.</p>
            ` : `
              <div style="display:flex; flex-direction:column; gap:10px;">
                ${window.auth.getPendingApprovals().map(p => `
                  <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-navy-border); padding: 10px 14px; border-radius: 8px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                    <div>
                      <strong style="color:#FFF; display:block; font-size:0.9rem;">${p.name}</strong>
                      <div style="font-size:0.78rem; color:var(--text-muted);">${p.email} &bull; Requested Role: <span class="badge badge-role">${p.requestedRole.toUpperCase()}</span></div>
                    </div>
                    <div style="display:flex; gap:8px;">
                      <button class="btn btn-gold" style="padding: 4px 10px; font-size:0.8rem;" onclick="app.approveUserAccess('${p.id}')">✅ Approve Access</button>
                      <button class="btn btn-secondary" style="padding: 4px 10px; font-size:0.8rem; background:rgba(239, 68, 68, 0.2); color:var(--color-danger);" onclick="app.rejectUserAccess('${p.id}')">❌ Reject</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </details>
      ` : ''}

      ${!isGuest ? `
        <!-- Section 4: Import & Export Data -->
        <details class="admin-accordion">
          <summary class="admin-accordion-summary">
            <span>📂 IMPORT &amp; EXPORT DATA (CSV / EXCEL)</span>
            <span class="badge badge-coach">EXCEL / CSV</span>
          </summary>
          <div class="admin-accordion-content">
            ${!isCoachOrAdmin ? `
              <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--color-danger); padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; color: #FFF; margin-bottom: 12px;">
                🔒 File import/export actions are reserved for Coach and Admin roles. Switch to <strong>Coach Bob</strong> or <strong>Admin Sam</strong> above to enable full import/export functions.
              </div>
            ` : ''}

            <!-- Export Data Card with Dropdown -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px; margin-bottom: 16px;">
              <h5 style="color: var(--bhs-gold-accent); margin-bottom: 8px;">📊 Export System Data to Excel (.xlsx)</h5>
              <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 12px;">
                Select a individual table or export all 10 database tables at once into a multi-sheet Excel workbook package.
              </p>

              <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px;">
                <select id="exportTarget" class="form-control" style="flex:1; min-width: 220px;" ${!isCoachOrAdmin ? 'disabled' : ''}>
                  <option value="all">📦 ALL TABLES AT ONCE (Complete Multi-Sheet Workbook)</option>
                  <option value="schools">🏫 Schools &amp; Team Config</option>
                  <option value="profiles">👤 User Profiles &amp; Roles</option>
                  <option value="players">👥 Players / Roster</option>
                  <option value="schedule">📅 Schedule &amp; Results</option>
                  <option value="drills">📚 Master Drills Library</option>
                  <option value="plan">📋 Practice Plans</option>
                  <option value="matrix">⚔️ Matrix Competition Logs</option>
                  <option value="coaches">👔 Coaching Staff</option>
                  <option value="thoughts">💡 Coach Daily Thoughts</option>
                  <option value="quiz">📝 Quiz Questions Bank</option>
                </select>
                <button class="btn btn-gold" onclick="app.exportXLSX(document.getElementById('exportTarget').value)" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📊 Export Selected Data</button>
              </div>

              <div style="display:flex; gap:10px; margin-top:8px;">
                <button class="btn btn-gold" style="width:100%; border-color:var(--bhs-cyan-accent); color:var(--bhs-cyan-accent);" onclick="app.exportXLSX('all')" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📦 Quick Export All 10 Tables at Once (.xlsx)</button>
              </div>
            </div>

            <!-- Import Data Card with Dropdown -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px;">
              <h5 style="color: var(--bhs-cyan-accent); margin-bottom: 8px;">📥 Import Data from CSV or Excel</h5>
              <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 12px;">
                Download a template first, fill in your data, then upload CSV or Multi-Sheet Excel files.
              </p>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 14px;">
                <button class="btn btn-secondary" onclick="app.downloadTemplate('all')" style="font-size:0.75rem; border-color:var(--bhs-gold-accent); color:var(--bhs-gold-accent);" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📦 All Tables Template</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('players')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Players</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('schedule')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Schedule</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('drills')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Drills</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('plan')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Plans</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('coaches')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Coaches</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('thoughts')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Thoughts</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('quiz')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Quiz</button>
              </div>

              <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                <select id="importTarget" class="form-control" style="flex:1; min-width: 220px;" ${!isCoachOrAdmin ? 'disabled' : ''}>
                  <option value="all">📦 ALL TABLES AT ONCE (Multi-Sheet Workbook / Package)</option>
                  <option value="schools">🏫 Schools &amp; Team Config</option>
                  <option value="profiles">👤 User Profiles &amp; Roles</option>
                  <option value="players">👥 Players / Roster</option>
                  <option value="schedule">📅 Schedule &amp; Results</option>
                  <option value="drills">📚 Master Drills Library</option>
                  <option value="plan">📋 Practice Plans</option>
                  <option value="matrix">⚔️ Matrix Competition Logs</option>
                  <option value="coaches">👔 Coaching Staff</option>
                  <option value="thoughts">💡 Coach Daily Thoughts</option>
                  <option value="quiz">📝 Quiz Questions Bank</option>
                </select>
                <button class="btn btn-gold" onclick="document.getElementById('importFileInput').click()" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📂 Choose &amp; Import Data</button>
              </div>
              <input type="file" id="importFileInput" accept=".csv,.xlsx,.xls" style="display:none;"
                onchange="app.handleImportFile(this.files[0], document.getElementById('importTarget').value); this.value='';" />
              <div id="importStatus" style="margin-top:10px; font-size:0.85rem; color: var(--color-success);"></div>
            </div>
          </div>
        </details>

        <!-- Section 5: System & Cloud Database Controls -->
        <details class="admin-accordion">
          <summary class="admin-accordion-summary">
            <span>⚡ SYSTEM &amp; CLOUD DATABASE CONTROLS</span>
            <span class="badge ${window.supabaseService && window.supabaseService.isConfigured() ? 'badge-win' : 'badge-gold'}">
              ${(window.supabaseService && window.supabaseService.isConfigured()) ? '⚡ CONNECTED' : '📦 LOCAL MODE'}
            </span>
          </summary>
          <div class="admin-accordion-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; flex-wrap:wrap; gap:8px;">
              <div>
                <strong>Cloud Sync Status:</strong> 
                ${(window.supabaseService && window.supabaseService.isConfigured()) 
                  ? `<span style="color: var(--color-success); font-weight:700;">⚡ Connected to Supabase Cloud DB</span>` 
                  : `<span style="color: var(--bhs-gold-accent); font-weight:700;">📦 Local Mode (Requires valid Supabase Anon JWT Key)</span>`}
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-gold" style="padding: 4px 10px; font-size:0.78rem;" onclick="app.pushAllLocalDataToSupabase()">⬆️ Sync Local Data to Cloud DB</button>
                <button class="btn btn-gold" style="padding: 4px 10px; font-size:0.78rem;" onclick="app.runLiveDatabaseTest()">🧪 Run Live Database Test</button>
                <button class="btn btn-secondary" style="padding: 4px 10px; font-size:0.78rem;" onclick="app.testProfilesTableInsert()">👤 Test Profile Insert</button>
                <button class="btn btn-secondary" style="padding: 4px 10px; font-size:0.78rem;" onclick="app.syncFromSupabase(); alert('✅ Synced latest data from Supabase Cloud!');">🔄 Reload Cloud Data</button>
              </div>
            </div>

            <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--bhs-navy-border); padding: 12px; border-radius: 6px; font-size: 0.82rem;">
              <div style="font-weight: 700; color: var(--bhs-gold-accent); margin-bottom: 6px;">🔑 Supabase Cloud Project Credentials</div>
              <div class="form-group" style="margin-bottom: 8px;">
                <label style="font-size:0.75rem;">Supabase Project URL</label>
                <input type="text" id="supabaseUrlInput" class="form-control" style="font-size:0.8rem;" value="${localStorage.getItem('bhs_supabase_url') || 'https://arsigevpgpbqluqbnhjr.supabase.co'}" placeholder="https://xyz.supabase.co" />
              </div>
              <div class="form-group" style="margin-bottom: 10px;">
                <label style="font-size:0.75rem;">Supabase Anon Key (JWT starting with eyJ...)</label>
                <input type="password" id="supabaseKeyInput" class="form-control" style="font-size:0.8rem;" value="${localStorage.getItem('bhs_supabase_anon_key') || ''}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
              </div>
              <button class="btn btn-gold" style="width:100%; font-size:0.8rem; padding: 6px;" onclick="app.saveSupabaseCredentials(document.getElementById('supabaseUrlInput').value, document.getElementById('supabaseKeyInput').value)">💾 Save Credentials &amp; Connect</button>
            </div>
          </div>
        </details>
      ` : ''}
    `;
  }

  async runAuthDiagnosticTest() {
    let report = [];

    // Test 1: Auth Engine
    if (window.auth) {
      report.push('✅ 1. AuthManager Engine: Active & Operational');
    } else {
      report.push('❌ 1. AuthManager Engine: Missing');
    }

    // Test 2: User Registration & OTP Generation
    const testEmail = `test_coach_${Date.now().toString().slice(-4)}@beaumont.edu`;
    const regRes = window.auth.registerUser({
      name: 'Diagnostic Coach',
      email: testEmail,
      password: 'TestPassword123!',
      role: 'coach'
    });

    if (regRes.success && regRes.requiresVerification) {
      report.push(`✅ 2. Registration Flow: Account created (${testEmail}). OTP Code generated: ${regRes.otpCode}. Status: pending_verification`);

      // Test 3: OTP Code Verification
      const verifyRes = window.auth.verifyUserOtp(testEmail, regRes.otpCode);
      if (verifyRes.success && verifyRes.status === 'pending_approval') {
        report.push(`✅ 3. OTP Verification: Code verified. Account status moved to: pending_approval`);

        // Test 4: Coach Approval Queue
        const pending = window.auth.getPendingApprovals();
        const found = pending.find(u => u.email === testEmail);
        if (found) {
          report.push(`✅ 4. Coach Approval Queue: Request found in pending queue.`);

          // Test 5: Approval Execution
          const approveOk = window.auth.approveUserAccess(found.id);
          if (approveOk) {
            report.push(`✅ 5. Access Approval: Coach Bob approved request. User account status: ACTIVE.`);

            // Test 6: User Login
            const loginRes = window.auth.loginUser(testEmail, 'TestPassword123!');
            if (loginRes.success && loginRes.user.status === 'active') {
              report.push(`✅ 6. Login Check: User successfully signed in. Role: ${loginRes.user.role.toUpperCase()}`);
            } else {
              report.push(`❌ 6. Login Check failed.`);
            }
          } else {
            report.push(`❌ 5. Access Approval failed.`);
          }
        } else {
          report.push(`❌ 4. Coach Approval Queue check failed.`);
        }
      } else {
        report.push(`❌ 3. OTP Verification failed.`);
      }
    } else {
      report.push(`❌ 2. Registration Flow failed.`);
    }

    // Test 7: Supabase Integration Check
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      report.push('⚡ 7. Supabase Cloud Connection: Connected & Active.');
    } else {
      report.push('📦 7. Supabase Cloud Connection: Operating in Local Fallback Mode (LocalStorage).');
    }

    alert('🧪 AUTHENTICATION & APPROVAL DIAGNOSTIC TEST RESULTS:\n\n' + report.join('\n\n'));
  }

  saveSupabaseCredentials(url, key) {
    if (!key || !key.startsWith('eyJ')) {
      alert('⚠️ Please enter a valid Supabase Anon Key (starts with "eyJ..."). You can copy it from your Supabase Dashboard -> Project Settings -> API.');
      return;
    }
    const ok = window.supabaseService.setCredentials(url, key);
    if (ok) {
      alert('⚡ Supabase Cloud Database connected successfully!');
      this.renderAdminModalContent();
    } else {
      alert('❌ Failed to connect to Supabase with provided credentials.');
    }
  }

  async pushAllLocalDataToSupabase() {
    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      alert('⚠️ Supabase Cloud Database is not connected.\n\nPlease enter your Supabase Anon Key (starts with "eyJ...") in the Admin Center, click "Save Credentials", then run this sync.');
      return;
    }

    const confirmSync = confirm(
      '⚡ ONE-TIME DATABASE OVERWRITE / SYNC\n\nThis will take all local data stored in your browser (School Info, Roster, Schedule, Practice Plans, Drills Library, Coaches, Daily Thoughts) and write it directly into your Supabase Cloud Database.\n\nDo you want to proceed?'
    );
    if (!confirmSync) return;

    const report = [];
    const schoolCode = this.data.school?.code || 'bhs';

    // 1. School Profile
    try {
      if (this.data.school) {
        const schoolRes = await window.supabaseService.upsertSchool(schoolCode, this.data.school);
        if (schoolRes && schoolRes.data) {
          if (schoolRes.data.id) this.data.school.id = schoolRes.data.id;
          report.push(`✅ 🏫 School Profile ('${this.data.school.name}') synced to DB`);
        } else {
          report.push(`⚠️ 🏫 School Profile sync warning: ${schoolRes?.error || 'Unknown error'}`);
        }
      }
    } catch (e) {
      report.push(`❌ 🏫 School Profile Exception: ${e.message}`);
    }

    // 2. Roster / Players
    try {
      const players = this.data.players || [];
      let playerSuccess = 0;
      for (const p of players) {
        const res = await window.supabaseService.upsertPlayer(schoolCode, p);
        if (res) {
          if (res.id) p.id = res.id;
          playerSuccess++;
        }
      }
      report.push(`✅ 👥 Players Roster: ${playerSuccess} / ${players.length} players synced to DB`);
    } catch (e) {
      report.push(`❌ 👥 Players Roster Exception: ${e.message}`);
    }

    // 3. Schedule / Matches
    try {
      const matches = this.data.schedule || [];
      let matchSuccess = 0;
      for (const m of matches) {
        const res = await window.supabaseService.upsertMatch(schoolCode, m);
        if (res) {
          if (res.id) m.id = res.id;
          matchSuccess++;
        }
      }
      report.push(`✅ 📅 Schedule: ${matchSuccess} / ${matches.length} matches synced to DB`);
    } catch (e) {
      report.push(`❌ 📅 Schedule Exception: ${e.message}`);
    }

    // 4. Drills Library Bank
    try {
      const drills = this.data.drillsBank || [];
      let drillSuccess = 0;
      for (const d of drills) {
        const res = await window.supabaseService.upsertDrillBankItem(schoolCode, d);
        if (res) {
          if (res.id) d.id = res.id;
          drillSuccess++;
        }
      }
      report.push(`✅ 📚 Master Drills Library: ${drillSuccess} / ${drills.length} drills synced to DB`);
    } catch (e) {
      report.push(`❌ 📚 Master Drills Library Exception: ${e.message}`);
    }

    // 5. Practice Plans (Saved Plans & Current Plan)
    try {
      const plans = this.data.savedPlans || [];
      let planSuccess = 0;
      for (const plan of plans) {
        const res = await window.supabaseService.saveFullPracticePlan(schoolCode, plan);
        if (res && res.success) {
          planSuccess++;
        }
      }
      if (this.data.currentPracticePlan && this.data.currentPracticePlan.length > 0) {
        await window.supabaseService.saveFullPracticePlan(schoolCode, {
          name: this.data.activePlanName || 'Current Practice Session',
          items: this.data.currentPracticePlan
        });
      }
      report.push(`✅ 📋 Practice Plans: ${planSuccess} saved plans synced to DB`);
    } catch (e) {
      report.push(`❌ 📋 Practice Plans Exception: ${e.message}`);
    }

    // 6. Coaching Staff
    try {
      const coaches = this.data.coaches || [];
      let coachSuccess = 0;
      for (const c of coaches) {
        const res = await window.supabaseService.upsertCoach(schoolCode, c);
        if (res) {
          if (res.id) c.id = res.id;
          coachSuccess++;
        }
      }
      report.push(`✅ 👔 Coaching Staff: ${coachSuccess} / ${coaches.length} coaches synced to DB`);
    } catch (e) {
      report.push(`❌ 👔 Coaching Staff Exception: ${e.message}`);
    }

    // 7. Daily Thoughts
    try {
      const thoughts = this.data.dailyThoughts || [];
      let thoughtSuccess = 0;
      for (const t of thoughts) {
        const res = await window.supabaseService.upsertDailyThought(schoolCode, t);
        if (res && res.data) {
          if (res.data.id) t.id = res.data.id;
          thoughtSuccess++;
        }
      }
      report.push(`✅ 💡 Coach Daily Thoughts: ${thoughtSuccess} / ${thoughts.length} thoughts synced to DB`);
    } catch (e) {
      report.push(`❌ 💡 Coach Daily Thoughts Exception: ${e.message}`);
    }

    // Save updated ID mappings locally
    this.saveData();

    alert(`⚡ LOCAL DATA TO SUPABASE CLOUD SYNC COMPLETE!\n\n${report.join('\n')}`);
  }

  async runLiveDatabaseTest() {
    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      alert('⚠️ Supabase Cloud Database is not connected.\n\nPlease enter your Supabase Anon Key (starts with "eyJ...") in the Admin Center, click "Save Credentials", then run this test.');
      return;
    }

    const modal = document.getElementById('dbDiagnosticModal');
    const headerEl = document.getElementById('dbDiagnosticSummaryHeader');
    const listEl = document.getElementById('dbDiagnosticTableList');

    if (modal) {
      modal.style.display = '';
      modal.classList.add('active');
    }

    if (headerEl) {
      headerEl.innerHTML = `
        <div style="text-align:center; padding:15px; color:var(--bhs-gold-accent);">
          <strong style="font-size:1rem;">⏳ Running live 9-table database diagnostic test against Supabase Cloud...</strong>
          <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 0 0;">Verifying SELECT reads, INSERT writes, and RLS policies for each table.</p>
        </div>
      `;
    }
    if (listEl) listEl.innerHTML = '';

    const res = await window.supabaseService.runFullDatabaseDiagnostic();

    if (!res.credentials) {
      if (headerEl) headerEl.innerHTML = `<div style="color:var(--color-danger);">${res.summaryText}</div>`;
      return;
    }

    const passedCount = (res.tableResults || []).filter(r => r.insertStatus === 'PASSED' || r.insertStatus === 'N/A').length;
    const totalCount = (res.tableResults || []).length;
    const isOverallSuccess = passedCount === totalCount;

    if (headerEl) {
      headerEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h4 style="margin:0 0 4px 0; color: ${isOverallSuccess ? 'var(--color-success)' : 'var(--bhs-gold-accent)'};">
              ${isOverallSuccess ? '🎉 ALL TABLES PASSED DATABASE WRITE & READ TESTS!' : `⚠️ ${totalCount - passedCount} OUT OF ${totalCount} TABLES RETURNED ERRORS`}
            </h4>
            <div style="font-size:0.82rem; color:var(--text-muted);">
              Project URL: <strong>${res.credentials.url}</strong> | Resolved School UUID: <strong style="color:#FFF;">${res.credentials.schoolUuid || 'Default Nullable'}</strong>
            </div>
          </div>
          <span class="badge ${isOverallSuccess ? 'badge-win' : 'badge-coach'}" style="font-size:0.9rem; padding:6px 12px;">
            ${passedCount} / ${totalCount} Tables Functional
          </span>
        </div>
      `;
    }

    if (listEl && res.tableResults) {
      listEl.innerHTML = res.tableResults.map(r => {
        const isPass = r.insertStatus === 'PASSED' || r.insertStatus === 'N/A';
        const badgeClass = isPass ? 'badge-win' : 'badge-role';
        const cardBorderColor = isPass ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.5)';

        return `
          <div style="background: rgba(0,0,0,0.3); border: 1px solid ${cardBorderColor}; padding: 14px; border-radius: 8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.2rem;">${r.icon}</span>
                <strong style="color:#FFF; font-size:1rem;">Table: '${r.table}'</strong>
                <span class="badge badge-coach">${r.operation}</span>
              </div>
              <span class="badge ${badgeClass}" style="font-weight:700;">
                ${isPass ? '✅ SUCCESS' : '❌ WRITE FAILED'}
              </span>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.82rem; margin-top:8px;">
              <div style="background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px; border:1px solid var(--bhs-navy-border);">
                <span style="color:var(--text-muted); display:block; font-weight:700; margin-bottom:2px;">📥 SELECT Query Test:</span>
                <span style="color:${r.selectStatus === 'PASSED' ? 'var(--color-success)' : 'var(--color-danger)'};">${r.selectDetails}</span>
              </div>

              <div style="background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px; border:1px solid var(--bhs-navy-border);">
                <span style="color:var(--text-muted); display:block; font-weight:700; margin-bottom:2px;">💾 INSERT / UPSERT Response:</span>
                <span style="color:${isPass ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight:700;">${r.responseDetails}</span>
              </div>
            </div>

            ${r.payload ? `
              <div style="margin-top:10px;">
                <details>
                  <summary style="cursor:pointer; color:var(--bhs-gold-accent); font-size:0.8rem; font-weight:700;">🔍 View Exact Test Data Payload Sent to Supabase</summary>
                  <pre style="background:#090d16; color:#a6accd; padding:8px 10px; border-radius:6px; font-size:0.75rem; margin-top:6px; overflow-x:auto; border:1px solid var(--bhs-navy-border);">${JSON.stringify(r.payload, null, 2)}</pre>
                </details>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }
  }

  async testProfilesTableInsert() {
    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      alert('⚠️ Supabase Cloud Database is not connected.\n\nPlease enter your Supabase Anon Key (starts with "eyJ...") in the Admin Center, click "Save Credentials", then run this test.');
      return;
    }

    const res = await window.supabaseService.testProfileInsert();
    if (res.success) {
      alert(`🎉 SUCCESS! Profile row inserted into Supabase 'profiles' table:\n\nEmail: ${res.data.email}\nName: ${res.data.name}\nRole: ${res.data.role}\nStatus: ${res.data.status}`);
    } else {
      alert(`❌ SUPABASE INSERT NOTICE:\n\n${res.error}\n\nMake sure to run the SQL table script provided in the Admin Center / schema file in your Supabase SQL Editor.`);
    }
  }

  async saveSchoolDataFromAdmin() {
    const code = (document.getElementById('adminSchoolCode')?.value || 'bhs').trim().toLowerCase();
    const name = (document.getElementById('adminSchoolName')?.value || 'Beaumont High School').trim();
    const mascot = (document.getElementById('adminSchoolMascot')?.value || 'Cougars').trim();
    const city = (document.getElementById('adminSchoolCity')?.value || 'Beaumont, CA').trim();
    const wins = parseInt(document.getElementById('adminSchoolWins')?.value || 0, 10);
    const losses = parseInt(document.getElementById('adminSchoolLosses')?.value || 0, 10);
    const draws = parseInt(document.getElementById('adminSchoolDraws')?.value || 0, 10);

    const schoolData = {
      code: code || 'bhs',
      name: name,
      mascot: mascot,
      city: city,
      colors: this.data.school?.colors || { primary: '#0047AB', secondary: '#FFD700' },
      record: { wins, losses, draws }
    };

    if (this.data.school?.id) schoolData.id = this.data.school.id;

    this.data.school = schoolData;

    const schools = this.getSchoolsList();
    const existingIdx = schools.findIndex(s => (s.code || s.id || '').toLowerCase() === code);
    if (existingIdx !== -1) {
      schools[existingIdx] = { ...schools[existingIdx], ...schoolData };
    } else {
      schools.push(schoolData);
    }
    this.data.schools = schools;

    this.saveData();

    let dbSuccess = false;
    if (window.supabaseService?.isConfigured()) {
      const res = await window.supabaseService.upsertSchool(code, schoolData);
      if (res) dbSuccess = true;
    }

    this.updateHeaderBranding();
    this.renderCurrentView();

    if (dbSuccess) {
      alert(`✅ School Profile saved for "${name} ${mascot}" in LocalStorage & synced to Supabase Database!`);
    } else {
      alert(`📦 School Profile saved for "${name} ${mascot}" in LocalStorage!`);
    }
  }

  switchUserRole(userId) {
    window.auth.switchRole(userId);
    this.renderAdminModalContent();
    this.renderCurrentView();
  }

  openAdminModal() {
    this.renderAdminModalContent();
    const modal = document.getElementById('adminModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  openImportExportModal() {
    this.openAdminModal();
  }

  openPlayerModal(playerId) {
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) return;

    const canAccessRatings = window.auth.canAccessRatings();
    const modal = document.getElementById('playerDetailModal');
    const content = document.getElementById('playerDetailContent');
    
    if (!modal || !content) return;

    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${player.photo}" style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid var(--bhs-blue-electric); object-fit: cover;" />
        <h2 style="color: #FFF; margin-top: 10px;">#${player.number} ${player.name}</h2>
        <p class="text-cyan" style="font-weight: 600;">${player.position} • ${player.classYear}</p>
      </div>

      <div class="player-stats-row" style="margin-bottom: 20px;">
        <div class="stat-item"><div class="val">${player.height}</div><div class="lbl">Height</div></div>
        <div class="stat-item"><div class="val">${player.seasonStats.goals || player.seasonStats.saves || 0}</div><div class="lbl">Primary Stat</div></div>
        <div class="stat-item"><div class="val text-gold">${canAccessRatings ? '#' + player.matrixStats.rank : '🔒 Private'}</div><div class="lbl">Matrix Rank</div></div>
      </div>

      ${canAccessRatings ? `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-navy-border); padding: 16px; border-radius: 10px; margin-bottom: 20px;">
          <h4 style="color: var(--bhs-gold-accent); margin-bottom: 10px;">COACH EVALUATION RATINGS</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">
            <div>Technical Skills: <strong>${player.ratings.technical}/100</strong></div>
            <div>Tactical IQ: <strong>${player.ratings.tactical}/100</strong></div>
            <div>Physicality & Speed: <strong>${player.ratings.physical}/100</strong></div>
            <div>Mental Drive: <strong>${player.ratings.mental}/100</strong></div>
          </div>
        </div>
      ` : `
        <p class="text-muted" style="text-align: center; font-size: 0.85rem;">🔒 Coach practice ratings are private to signed-in team members.</p>
      `}
    `;

    modal.style.display = '';
    modal.classList.add('active');
  }

  openAddDrillModal() {
    const modal = document.getElementById('addDrillScoreModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  // ─── Import / Export ─────────────────────────────────────────────────────

  openImportExportModal() {
    const modal = document.getElementById('importExportModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
    const status = document.getElementById('importStatus');
    if (status) status.textContent = '';
  }

  exportXLSX(type) {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded yet — please wait a moment and try again.'); return; }
    const wb = XLSX.utils.book_new();

    // 1. SCHOOLS SHEET
    if (type === 'schools' || type === 'all') {
      const rows = [{
        Code: this.data.schoolInfo?.code || 'bhs',
        Name: this.data.schoolInfo?.name || 'Beaumont High School',
        Mascot: this.data.schoolInfo?.mascot || 'Cougars',
        City: this.data.schoolInfo?.city || 'Beaumont, CA',
        PrimaryColor: this.data.schoolInfo?.colors?.primary || '#0047AB',
        SecondaryColor: this.data.schoolInfo?.colors?.secondary || '#FFD700',
        Wins: this.data.schoolInfo?.record?.wins || 0,
        Losses: this.data.schoolInfo?.record?.losses || 0,
        Draws: this.data.schoolInfo?.record?.draws || 0,
        IsDeleted: 'FALSE'
      }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Schools');
    }

    // 2. PROFILES SHEET
    if (type === 'profiles' || type === 'all') {
      const rows = (this.data.userProfiles || [
        { username: 'coach_bob', name: 'Coach Bob Miller', role: 'Coach', approved: true },
        { username: 'sam_admin', name: 'Admin Sam', role: 'Admin', approved: true }
      ]).map(u => ({
        Username: u.username || '', Name: u.name || '', Role: u.role || 'User',
        PlayerId: u.playerId || '', SchoolCode: u.schoolCode || 'bhs',
        Approved: u.approved !== false ? 'YES' : 'NO',
        IsDeleted: u.is_deleted || u.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Profiles');
    }

    // 3. PLAYERS SHEET
    if (type === 'players' || type === 'all') {
      const rows = (this.data.players || []).map(p => ({
        Number: p.number, Name: p.name, Position: p.position,
        Class: p.classYear || p.class_year || 'Senior', Height: p.height || '',
        Goals: p.seasonStats?.goals ?? '', Assists: p.seasonStats?.assists ?? '',
        Saves: p.seasonStats?.saves ?? '', CleanSheets: p.seasonStats?.cleanSheets ?? '',
        Tech: p.ratings?.technical ?? '', Tactical: p.ratings?.tactical ?? '',
        Physical: p.ratings?.physical ?? '', Mental: p.ratings?.mental ?? '',
        Photo: p.photo || '', IsDeleted: p.is_deleted || p.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Players');
    }

    // 4. SCHEDULE SHEET
    if (type === 'schedule' || type === 'all') {
      const rows = (this.data.schedule || []).map(m => ({
        Date: m.date, Time: m.time, Opponent: m.opponent,
        Location: m.location, Home: m.isHome ? 'Home' : 'Away',
        Status: m.status, Score: m.score || '',
        IsDeleted: m.is_deleted || m.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Schedule');
    }

    // 5. MASTER DRILLS SHEET
    if (type === 'drills' || type === 'all') {
      const rows = (this.data.drillsBank || []).map(d => ({
        Name: d.name, Category: d.category || 'General',
        CoachNotes: d.coachNotes || d.coach_notes || '',
        IsDeleted: d.is_deleted || d.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'MasterDrills');
    }

    // 6. PRACTICE PLANS SHEET
    if (type === 'plan' || type === 'all') {
      const rows = (this.data.currentPracticePlan || []).map(d => ({
        PlanName: this.data.activePlanName || 'Practice Plan',
        TimeSlot: d.time, DrillName: d.name, Duration: d.duration,
        CoachNotes: d.coachNotes || '',
        IsDeleted: d.is_deleted || d.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'PracticePlans');
    }

    // 7. MATRIX LOGS SHEET
    if (type === 'matrix' || type === 'all') {
      const rows = (this.data.matrixLogs || []).map(l => ({
        PlayerName: l.playerName || '', DrillName: l.drillName || '',
        Result: l.result || 'WIN', OpponentName: l.opponentName || '',
        ScoreText: l.scoreText || '', Date: l.date || '',
        IsDeleted: l.is_deleted || l.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ PlayerName:'Sample Player', DrillName:'1v1 Gauntlet', Result:'WIN', OpponentName:'Challenger', ScoreText:'3-1', Date:'AUG 6, 2026', IsDeleted:'FALSE' }]), 'MatrixLogs');
    }

    // 8. COACHES SHEET
    if (type === 'coaches' || type === 'all') {
      const rows = (this.data.coaches || []).map(c => ({
        Name: c.name, Level: c.level, Phone: c.phone || '',
        Email: c.email || '', Address: c.address || '', Bio: c.bio || '',
        Photo: c.photo || '', IsDeleted: c.is_deleted || c.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Coaches');
    }

    // 9. DAILY THOUGHTS SHEET
    if (type === 'thoughts' || type === 'all') {
      const rows = (this.data.dailyThoughts || []).map(t => ({
        CoachName: t.coachName || 'Coach Bob Miller',
        ThoughtsText: t.text || '',
        IsActive: t.isActive ? 'YES' : 'NO',
        CreatedAt: t.createdAt || '',
        IsDeleted: t.is_deleted || t.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'DailyThoughts');
    }

    // 10. QUIZ QUESTIONS SHEET
    if (type === 'quiz' || type === 'all') {
      const rows = [
        { QuestionText: 'What is the primary tactical objective emphasized in Coach\'s Daily Thoughts?', OptionA: 'Drop back into low-block passive defense', OptionB: 'High intensity pressing & quick 2-touch passing transitions', OptionC: 'Dribble individually without passing options', OptionD: 'Long high balls into penalty box only', CorrectAnswer: 'B', Explanation: 'High intensity press and quick transitions.', IsDeleted: 'FALSE' },
        { QuestionText: 'How should players handle possession under pressure according to today\'s focus?', OptionA: 'Make the simple, quick pass as first option', OptionB: 'Hold the ball until surrounded by defenders', OptionC: 'Turn around and kick the ball out of bounds', OptionD: 'Stop moving completely and wait for whistle', CorrectAnswer: 'A', Explanation: 'Make the simple quick pass early.', IsDeleted: 'FALSE' }
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'QuizQuestions');
    }

    const planNameClean = (this.data.activePlanName || 'PracticePlan').replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = type === 'all' ? 'BHS_Soccer_AllData_Complete.xlsx' :
      type === 'schools' ? 'BHS_Schools_Config.xlsx' :
      type === 'profiles' ? 'BHS_User_Profiles.xlsx' :
      type === 'players' ? 'BHS_Roster.xlsx' :
      type === 'schedule' ? 'BHS_Schedule.xlsx' :
      type === 'drills' ? 'BHS_Master_Drills_Library.xlsx' :
      type === 'matrix' ? 'BHS_Matrix_Logs.xlsx' :
      type === 'coaches' ? 'BHS_Coaching_Staff.xlsx' :
      type === 'thoughts' ? 'BHS_Coach_Daily_Thoughts.xlsx' :
      type === 'quiz' ? 'BHS_Quiz_Questions.xlsx' : `${planNameClean}.xlsx`;

    XLSX.writeFile(wb, fileName);
  }

  downloadTemplate(type) {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded yet — please wait a moment and try again.'); return; }
    const wb = XLSX.utils.book_new();

    if (type === 'all') {
      this.exportXLSX('all');
      return;
    }

    if (type === 'schools') {
      const headers = [{ Code:'bhs', Name:'Beaumont High School', Mascot:'Cougars', City:'Beaumont, CA', PrimaryColor:'#0047AB', SecondaryColor:'#FFD700', Wins:0, Losses:0, Draws:0, IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Schools');
      XLSX.writeFile(wb, 'BHS_Schools_Template.xlsx');
    } else if (type === 'profiles') {
      const headers = [{ Username:'johndoe', Name:'John Doe', Role:'Coach', PlayerId:'', SchoolCode:'bhs', Approved:'YES', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Profiles');
      XLSX.writeFile(wb, 'BHS_Profiles_Template.xlsx');
    } else if (type === 'players') {
      const headers = [{ Number:'', Name:'', Position:'', Class:'', Height:'', Goals:'', Assists:'', Saves:'', CleanSheets:'', Tech:'', Tactical:'', Physical:'', Mental:'', Photo:'', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Players');
      XLSX.writeFile(wb, 'BHS_Player_Template.xlsx');
    } else if (type === 'schedule') {
      const headers = [{ Date:'', Time:'', Opponent:'', Location:'', Home:'Home or Away', Status:'UPCOMING or COMPLETED', Score:'', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Schedule');
      XLSX.writeFile(wb, 'BHS_Schedule_Template.xlsx');
    } else if (type === 'drills') {
      const headers = [{ Name:'', Category:'General', CoachNotes:'', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'MasterDrills');
      XLSX.writeFile(wb, 'BHS_Master_Drills_Template.xlsx');
    } else if (type === 'plan') {
      const headers = [{ PlanName:'dummy_practice_1', TimeSlot:'4:00 PM - 4:15 PM', DrillName:'Dynamic Warmup', Duration:'15 min', CoachNotes:'', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'PracticePlans');
      XLSX.writeFile(wb, 'BHS_Practice_Plan_Template.xlsx');
    } else if (type === 'matrix') {
      const headers = [{ PlayerName:'Diego Silva', DrillName:'1v1 Gauntlet', Result:'WIN', OpponentName:'Mateo Rossi', ScoreText:'3-1', Date:'AUG 6, 2026', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'MatrixLogs');
      XLSX.writeFile(wb, 'BHS_Matrix_Logs_Template.xlsx');
    } else if (type === 'coaches') {
      const headers = [{ Name:'', Level:'Staff', Phone:'', Email:'', Address:'', Bio:'', Photo:'', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Coaches');
      XLSX.writeFile(wb, 'BHS_Coaching_Staff_Template.xlsx');
    } else if (type === 'thoughts') {
      const headers = [{ CoachName:'Coach Bob Miller', ThoughtsText:'Enter daily focus message here...', IsActive:'YES or NO', CreatedAt:'AUG 6, 2026', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'DailyThoughts');
      XLSX.writeFile(wb, 'BHS_Daily_Thoughts_Template.xlsx');
    } else if (type === 'quiz') {
      const headers = [{ QuestionText:'Sample Question?', OptionA:'Option 1', OptionB:'Option 2', OptionC:'Option 3', OptionD:'Option 4', CorrectAnswer:'B', Explanation:'Sample explanation', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'QuizQuestions');
      XLSX.writeFile(wb, 'BHS_Quiz_Questions_Template.xlsx');
    }
  }

  async handleImportFile(file, target) {
    if (!file) return;
    const status = document.getElementById('importStatus');
    if (status) status.textContent = '⏳ Reading & importing file package...';

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const toStr = (v) => String(v ?? '').trim();
        let totalCount = 0;

        let workbookSheets = {};

        if (file.name.endsWith('.csv')) {
          const text = e.target.result;
          const lines = text.trim().split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          const rows = lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, i) => obj[h] = vals[i] || '');
            return obj;
          });
          workbookSheets[target || 'Sheet1'] = rows;
        } else {
          if (typeof XLSX === 'undefined') throw new Error('SheetJS library not loaded');
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          wb.SheetNames.forEach(sName => {
            workbookSheets[sName] = XLSX.utils.sheet_to_json(wb.Sheets[sName], { defval: '' });
          });
        }

        const sheetsToProcess = target === 'all'
          ? Object.keys(workbookSheets)
          : [Object.keys(workbookSheets)[0]];

        for (const sheetName of sheetsToProcess) {
          const rows = workbookSheets[sheetName] || [];
          if (!rows || rows.length === 0) continue;

          const sLower = sheetName.toLowerCase();
          const activeTarget = (target !== 'all') ? target :
            sLower.includes('school') ? 'schools' :
            sLower.includes('profile') ? 'profiles' :
            sLower.includes('player') ? 'players' :
            sLower.includes('schedule') ? 'schedule' :
            sLower.includes('drill') ? 'drills' :
            sLower.includes('plan') ? 'plan' :
            sLower.includes('matrix') ? 'matrix' :
            sLower.includes('coach') ? 'coaches' :
            sLower.includes('thought') ? 'thoughts' :
            sLower.includes('quiz') ? 'quiz' : 'players';

          if (activeTarget === 'schools') {
            const r = rows[0];
            if (r) {
              this.data.schoolInfo = {
                code: toStr(r.Code) || 'bhs',
                name: toStr(r.Name) || 'Beaumont High School',
                mascot: toStr(r.Mascot) || 'Cougars',
                city: toStr(r.City) || 'Beaumont, CA',
                colors: { primary: toStr(r.PrimaryColor) || '#0047AB', secondary: toStr(r.SecondaryColor) || '#FFD700' },
                record: { wins: parseInt(r.Wins)||0, losses: parseInt(r.Losses)||0, draws: parseInt(r.Draws)||0 }
              };
              totalCount += 1;
              if (window.supabaseService?.isConfigured()) {
                await window.supabaseService.upsertSchool('bhs', this.data.schoolInfo);
              }
            }
          } else if (activeTarget === 'profiles') {
            const imported = rows.filter(r => r.Username || r.Name).map(r => ({
              id: 'prof_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              username: toStr(r.Username || r.Name).toLowerCase().replace(/\s+/g, '_'),
              name: toStr(r.Name || r.Username),
              role: toStr(r.Role) || 'User',
              schoolCode: toStr(r.SchoolCode) || 'bhs',
              approved: toStr(r.Approved).toUpperCase() !== 'NO',
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            if (!this.data.userProfiles) this.data.userProfiles = [];
            this.data.userProfiles.push(...imported);
            totalCount += imported.length;
          } else if (activeTarget === 'players') {
            const imported = rows.filter(r => r.Name).map(r => ({
              id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              number: parseInt(r.Number) || 0,
              name: toStr(r.Name), position: toStr(r.Position) || 'Midfielder',
              classYear: toStr(r.Class || r.ClassYear) || 'Junior', height: toStr(r.Height) || "5'10\"",
              photo: toStr(r.Photo || r.PhotoUrl) || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
              seasonStats: toStr(r.Position).includes('Goalkeeper')
                ? { saves: parseInt(r.Saves)||0, cleanSheets: parseInt(r.CleanSheets)||0, games: 1 }
                : { goals: parseInt(r.Goals)||0, assists: parseInt(r.Assists)||0, games: 1 },
              ratings: { technical: parseInt(r.Tech)||80, tactical: parseInt(r.Tactical)||80, physical: parseInt(r.Physical)||80, mental: parseInt(r.Mental)||80 },
              matrixStats: { wins: 0, losses: 0, points: 0, rank: 99, drillScore: 0 },
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            this.data.players.push(...imported);
            totalCount += imported.length;
            if (window.supabaseService?.isConfigured()) {
              for (const p of imported) await window.supabaseService.upsertPlayer('bhs', p);
            }
          } else if (activeTarget === 'schedule') {
            const imported = rows.filter(r => r.Opponent).map(r => ({
              id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              date: toStr(r.Date).toUpperCase(),
              time: toStr(r.Time) || '6:00 PM',
              opponent: toStr(r.Opponent),
              location: toStr(r.Location) || 'Home - Cougar Stadium',
              isHome: toStr(r.Home).toLowerCase() !== 'away',
              status: (toStr(r.Status) || 'UPCOMING').toUpperCase(),
              score: toStr(r.Score) || null,
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            this.data.schedule.push(...imported);
            totalCount += imported.length;
            if (window.supabaseService?.isConfigured()) {
              for (const m of imported) await window.supabaseService.upsertMatch('bhs', m);
            }
          } else if (activeTarget === 'drills') {
            const imported = rows.filter(r => r.Name || r.DrillName).map(r => ({
              id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              name: toStr(r.Name || r.DrillName),
              category: toStr(r.Category) || 'General',
              coachNotes: toStr(r.CoachNotes || r.coach_notes),
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            if (!this.data.drillsBank) this.data.drillsBank = [];
            this.data.drillsBank.push(...imported);
            totalCount += imported.length;
            if (window.supabaseService?.isConfigured()) {
              for (const d of imported) await window.supabaseService.upsertDrillBankItem('bhs', d);
            }
          } else if (activeTarget === 'plan') {
            const imported = rows.filter(r => r.DrillName || r.drill || r.Name || r.name).map(r => ({
              id: null,
              time: toStr(r.TimeSlot || r.Time || r.time),
              name: toStr(r.DrillName || r.drill || r.Name || r.name),
              duration: toStr(r.Duration || r.duration) || '15 min',
              coachNotes: toStr(r.CoachNotes || r.coachNotes),
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            this.data.currentPracticePlan.push(...imported);
            totalCount += imported.length;
          } else if (activeTarget === 'coaches') {
            const imported = rows.filter(r => r.Name).map(r => ({
              id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              name: toStr(r.Name),
              level: toStr(r.Level) || 'Staff',
              phone: toStr(r.Phone),
              email: toStr(r.Email),
              address: toStr(r.Address),
              bio: toStr(r.Bio),
              photo: toStr(r.Photo || r.PhotoUrl),
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            if (!this.data.coaches) this.data.coaches = [];
            this.data.coaches.push(...imported);
            totalCount += imported.length;
            if (window.supabaseService?.isConfigured()) {
              for (const c of imported) await window.supabaseService.upsertCoach('bhs', c);
            }
          } else if (activeTarget === 'thoughts') {
            const imported = rows.filter(r => r.ThoughtsText || r.text).map(r => ({
              id: 'dt_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              coachId: 'c1',
              coachName: toStr(r.CoachName || r.coachName) || 'Coach Bob Miller',
              text: toStr(r.ThoughtsText || r.text),
              isActive: toStr(r.IsActive || r.isActive).toLowerCase() === 'yes' || toStr(r.IsActive || r.isActive).toLowerCase() === 'true',
              createdAt: toStr(r.CreatedAt || r.createdAt) || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));

            if (imported.some(t => t.isActive)) {
              (this.data.dailyThoughts || []).forEach(t => t.isActive = false);
            }
            if (!this.data.dailyThoughts) this.data.dailyThoughts = [];
            this.data.dailyThoughts.unshift(...imported);
            totalCount += imported.length;

            if (window.supabaseService?.isConfigured()) {
              for (const t of imported) {
                await window.supabaseService.upsertDailyThought('bhs', {
                  id: t.id,
                  coachId: t.coachId,
                  coachName: t.coachName,
                  text: t.text,
                  isActive: t.isActive,
                  is_deleted: t.is_deleted
                });
              }
            }
          }
        }

        this.saveData();
        this.renderCurrentView();
        if (status) status.textContent = `✅ Successfully imported ${totalCount} records across your database tables!`;
      } catch (err) {
        console.error('Import error:', err);
        if (status) status.textContent = `❌ Import failed: ${err.message}`;
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }

  closeModal(modalId) {
    if (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        return;
      }
    }
    this.closeModals();
  }

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.classList.remove('active');
      modal.style.display = '';
    });
  }

  attachDynamicListeners() {
    // Role switcher choices inside modal
    document.querySelectorAll('.role-switch-card').forEach(card => {
      card.addEventListener('click', () => {
        const userId = card.getAttribute('data-userid');
        window.auth.switchRole(userId);
        this.closeModals();
      });
    });
  }

  parseMatchDateTime(dateStr, timeStr) {
    if (!dateStr) return null;
    const combined = `${dateStr} ${timeStr || ''}`.trim();
    const parsed = new Date(combined);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    try {
      const months = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
      const parts = dateStr.replace(/,/g, '').split(/\s+/);
      if (parts.length >= 3) {
        const monthIndex = months[parts[0].substring(0,3).toUpperCase()];
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        let hours = 18, minutes = 0;
        if (timeStr) {
          const timeMatch = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
          if (timeMatch) {
            hours = parseInt(timeMatch[1]);
            minutes = parseInt(timeMatch[2] || 0);
            const ampm = (timeMatch[3] || '').toUpperCase();
            if (ampm === 'PM' && hours < 12) hours += 12;
            if (ampm === 'AM' && hours === 12) hours = 0;
          }
        }
        if (monthIndex !== undefined && !isNaN(day) && !isNaN(year)) {
          return new Date(year, monthIndex, day, hours, minutes);
        }
      }
    } catch(e) {}
    return null;
  }

  getNextMatchCountdown() {
    const nextMatch = this.data.schedule.find(m => m.status !== 'COMPLETED');
    if (!nextMatch) return null;

    const targetDate = this.parseMatchDateTime(nextMatch.date, nextMatch.time);
    if (!targetDate) return null;

    const now = new Date();
    const diffMs = targetDate - now;

    if (diffMs <= 0) {
      return { days: '00', hours: '00', mins: '00' };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    return {
      days: String(days).padStart(2, '0'),
      hours: String(hours).padStart(2, '0'),
      mins: String(mins).padStart(2, '0')
    };
  }

  updateCountdownUI() {
    const daysEl = document.getElementById('cdDays');
    const hoursEl = document.getElementById('cdHours');
    const minsEl = document.getElementById('cdMins');

    if (daysEl && hoursEl && minsEl) {
      const countdown = this.getNextMatchCountdown();
      if (countdown) {
        daysEl.textContent = countdown.days;
        hoursEl.textContent = countdown.hours;
        minsEl.textContent = countdown.mins;
      } else {
        daysEl.textContent = '00';
        hoursEl.textContent = '00';
        minsEl.textContent = '00';
      }
    }
  }

  startCountdownTimer() {
    this.updateCountdownUI();
    setInterval(() => {
      this.updateCountdownUI();
    }, 10000);
  }
}

function initApp() {
  if (!window.app) {
    window.app = new BHSSoccerApp();
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initApp();
} else {
  document.addEventListener('DOMContentLoaded', initApp);
}
