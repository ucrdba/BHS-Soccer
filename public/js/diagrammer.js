/**
 * BHS Soccer - Tactical Pitch Diagrammer (SoccerTacticalBoard class)
 * Extracted from app.js during fix/refactor branch.
 */

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
    this.selectedElement = null;
    this.selectedDrawing = null;
    this.dragOffset = { x: 0, y: 0 };
    this.hasAttached = false;
    this.hasKeydownAttached = false;

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
    this.selectedElement = null;
    this.selectedDrawing = null;
    this.saveCurrentFrameState();
    this.render();
  }

  reindexNumbers() {
    let aCount = 1;
    let dCount = 1;
    this.elements.forEach(el => {
      if (el.type === 'attacker') {
        el.number = String(aCount++);
      } else if (el.type === 'defender') {
        el.number = String(dCount++);
      }
    });
  }

  deleteSelected() {
    if (this.selectedElement) {
      const idx = this.elements.findIndex(el => el.id === this.selectedElement.id);
      if (idx !== -1) {
        this.saveState();
        this.elements.splice(idx, 1);
        this.reindexNumbers();
        this.selectedElement = null;
        this.saveCurrentFrameState();
        this.render();
        return true;
      }
    }
    if (this.selectedDrawing) {
      const idx = this.drawings.indexOf(this.selectedDrawing);
      if (idx !== -1) {
        this.saveState();
        this.drawings.splice(idx, 1);
        this.selectedDrawing = null;
        this.saveCurrentFrameState();
        this.render();
        return true;
      }
    }
    // If nothing explicitly selected, delete the last added element or line
    if (this.elements.length > 0) {
      this.saveState();
      this.elements.pop();
      this.reindexNumbers();
      this.selectedElement = null;
      this.saveCurrentFrameState();
      this.render();
      return true;
    } else if (this.drawings.length > 0) {
      this.saveState();
      this.drawings.pop();
      this.selectedDrawing = null;
      this.saveCurrentFrameState();
      this.render();
      return true;
    }
    return false;
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
    const isMaster = (this.app && this.app.masterDiagrammer === this);
    const badgeId = isMaster ? 'masterTimelineFrameBadge' : 'timelineFrameBadge';
    const btnPlayId = isMaster ? 'masterBtnPlayAnim' : 'btnPlayAnim';
    const containerId = isMaster ? 'masterKeyframeButtonsContainer' : 'keyframeButtonsContainer';
    const instanceName = isMaster ? 'masterDiagrammer' : 'diagrammer';

    const badge = document.getElementById(badgeId);
    if (badge && this.keyframes[this.currentFrameIndex]) {
      badge.textContent = this.keyframes[this.currentFrameIndex].label;
    }

    const btnPlay = document.getElementById(btnPlayId);
    if (btnPlay) {
      btnPlay.innerHTML = this.isPlaying ? '⏸️ Pause' : '▶️ Play Animation';
      btnPlay.className = this.isPlaying ? 'btn btn-gold active' : 'btn btn-gold';
    }

    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = this.keyframes.map((kf, idx) => {
        const isActive = (idx === this.currentFrameIndex);
        return `
          <button type="button" class="btn ${isActive ? 'btn-gold' : 'btn-secondary'}" style="padding: 6px 12px; font-size: 0.8rem; font-weight: 700; border: ${isActive ? '2px solid var(--bhs-gold-accent)' : '1px solid var(--bhs-navy-border)'}; flex-shrink: 0;" onclick="app.${instanceName}.goToKeyframe(${idx})">
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

    // Parse stringified JSON diagram data if retrieved from database or localstorage
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.warn('⚠️ loadDiagramData JSON parse error:', e);
      }
    }

    if (data && data.keyframes && Array.isArray(data.keyframes) && data.keyframes.length > 0) {
      this.keyframes = JSON.parse(JSON.stringify(data.keyframes));
      this.currentFrameIndex = Math.min(data.currentFrameIndex || 0, this.keyframes.length - 1);
      const frame = this.keyframes[this.currentFrameIndex];
      this.elements = frame && frame.elements ? JSON.parse(JSON.stringify(frame.elements)) : (data.elements ? JSON.parse(JSON.stringify(data.elements)) : []);
      this.drawings = frame && frame.drawings ? JSON.parse(JSON.stringify(frame.drawings)) : (data.drawings ? JSON.parse(JSON.stringify(data.drawings)) : []);
    } else if (data) {
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

    this.pitchType = (data && data.pitchType) || 'full';
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

        const newEl = {
          id: Date.now() + Math.random(),
          type: this.activeTool,
          x: pos.x,
          y: pos.y,
          color: this.activeTool === 'attacker' ? '#0047AB' : this.activeTool === 'defender' ? '#EF4444' : this.activeTool === 'gk' ? '#FFD700' : '#FF8C00',
          number: num
        };
        this.elements.push(newEl);
        this.selectedElement = newEl;
        this.selectedDrawing = null;
        this.reindexNumbers();
        this.render();
      } else if (this.activeTool === 'text') {
        app.showPromptModal({
          title: '📝 TACTICAL TEXT LABEL',
          message: 'Enter tactical text label (e.g. "Overlapping Run", "3-Touch Limit", "Pressing Trigger"):',
          defaultValue: 'Overlapping Run',
          onConfirm: (input) => {
            if (input && input.trim()) {
              this.saveState();
              const newEl = {
                id: Date.now() + Math.random(),
                type: 'text',
                text: input.trim(),
                x: pos.x,
                y: pos.y,
                color: '#FFD700'
              };
              this.elements.push(newEl);
              this.selectedElement = newEl;
              this.selectedDrawing = null;
              this.render();
            }
          }
        });
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
            this.reindexNumbers();
            this.selectedElement = null;
            this.selectedDrawing = null;
            this.saveCurrentFrameState();
            this.render();
          } else {
            this.draggedElement = this.elements[elIdx];
            this.selectedElement = this.elements[elIdx];
            this.selectedDrawing = null;
            this.dragOffset = { x: pos.x - this.draggedElement.x, y: pos.y - this.draggedElement.y };
            this.render();
          }
        } else {
          // Proximity hit-test for drawn lines, arrows, dribbles, and sprint lines
          const drawIdx = this.drawings.findIndex(d => this.isPointNearDrawing(pos, d, 18));
          if (drawIdx !== -1) {
            this.saveState();
            if (this.activeTool === 'eraser') {
              this.drawings.splice(drawIdx, 1);
              this.selectedElement = null;
              this.selectedDrawing = null;
              this.saveCurrentFrameState();
              this.render();
            } else {
              this.draggedDrawing = this.drawings[drawIdx];
              this.selectedDrawing = this.drawings[drawIdx];
              this.selectedElement = null;
              this.lastDragPos = pos;
              this.render();
            }
          } else {
            this.selectedElement = null;
            this.selectedDrawing = null;
            this.render();
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
        this.selectedDrawing = this.currentPath;
        this.selectedElement = null;
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

    if (!this.hasKeydownAttached) {
      this.hasKeydownAttached = true;
      window.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (['input', 'textarea', 'select'].includes(activeTag)) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (this.selectedElement || this.selectedDrawing) {
            e.preventDefault();
            this.deleteSelected();
          }
        }
      });
    }
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

    const isSelected = (this.selectedDrawing === d);
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = (d.width || 3) + 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(d.points[0].x, d.points[0].y);
      for (let i = 1; i < d.points.length; i++) {
        ctx.lineTo(d.points[i].x, d.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

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

    const isSelected = (this.selectedElement === el);

    if (el.type === 'attacker' || el.type === 'defender' || el.type === 'gk') {
      const radius = 14;
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(el.x, el.y, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(el.x, el.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = el.color;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#FFD700' : '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.type === 'gk' ? 'GK' : (el.number || '10'), el.x, el.y);
    } else if (el.type === 'ball') {
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(el.x, el.y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(el.x, el.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#FFD700' : '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#000';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚽', el.x, el.y + 1);
    } else if (el.type === 'cone') {
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(el.x, el.y, 15, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(el.x, el.y - 12);
      ctx.lineTo(el.x + 10, el.y + 8);
      ctx.lineTo(el.x - 10, el.y + 8);
      ctx.closePath();
      ctx.fillStyle = el.color || '#FF8C00';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#FFD700' : '#FFF';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (el.type === 'goal') {
      if (isSelected) {
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(el.x - 19, el.y - 13, 38, 26);
      }
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
      ctx.strokeStyle = isSelected ? '#FFD700' : 'rgba(255, 215, 0, 0.6)';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
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

