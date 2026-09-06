/**
 * Drawing a tactical board onto a 2D context.
 *
 * These were methods on `SoccerTacticalBoard`, but they never behaved like
 * methods: the print path already calls them as
 * `SoccerTacticalBoard.prototype.drawPitch.call({ ctx, pitchType }, w, h)`,
 * assembling a fake `this` out of exactly the fields they read. Making that
 * honest is the whole of this module — and it means a diagram can be
 * rasterized for print without instantiating a board.
 *
 * The one change from the originals: whether an element is selected is a
 * parameter rather than a comparison against `this.selectedElement`. The
 * print path relied on that comparison being against `undefined`.
 *
 * **The numbers here are a pitch's proportions.** They were moved verbatim;
 * tidying one moves a penalty spot.
 *
 * Ported from public/js/diagrammer.js during Phase 4b.
 */
export type PitchType = 'full' | 'half' | 'thirds' | 'blank';

export interface Point { x: number; y: number }

export interface Drawing {
  points: Point[];
  tool?: string;
  color?: string;
  width?: number;
}

export interface BoardElement {
  id?: any;
  type: string;
  x: number;
  y: number;
  color?: string;
  number?: string;
  text?: string;
}

/** The grass, the stripes, and whatever markings the pitch type calls for. */
export function drawPitch(
  ctx: CanvasRenderingContext2D, w: number, h: number, pitchType: PitchType = 'full'
): void {
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

  if (pitchType === 'full') {
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
  } else if (pitchType === 'half') {
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

/** A freehand line, a pass, a dribble or a shot. */
export function drawPath(
  ctx: CanvasRenderingContext2D, d: Drawing, selected = false
): void {
  if (!d.points || d.points.length < 2) return;
  ctx.save();

  if (selected) {
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
    // The wobble is what makes a dribble read as a dribble.
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
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A player, a ball, a cone, a goal or a label. */
export function drawElement(
  ctx: CanvasRenderingContext2D, el: BoardElement, selected = false
): void {
  ctx.save();

  if (el.type === 'attacker' || el.type === 'defender' || el.type === 'gk') {
    const radius = 14;
    if (selected) {
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
    ctx.fillStyle = el.color as string;
    ctx.fill();
    ctx.strokeStyle = selected ? '#FFD700' : '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.type === 'gk' ? 'GK' : (el.number || '10'), el.x, el.y);
  } else if (el.type === 'ball') {
    if (selected) {
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
    ctx.strokeStyle = selected ? '#FFD700' : '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚽', el.x, el.y + 1);
  } else if (el.type === 'cone') {
    if (selected) {
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
    ctx.strokeStyle = selected ? '#FFD700' : '#FFF';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (el.type === 'goal') {
    if (selected) {
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
    ctx.strokeStyle = selected ? '#FFD700' : 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.beginPath();
    // roundRect is recent; a browser without it still gets a box.
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(el.x - boxW / 2, el.y - boxH / 2, boxW, boxH, 4);
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

/** The whole board: ground, then lines, then the pieces on top. */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  pitchType: PitchType,
  drawings: Drawing[],
  elements: BoardElement[],
  selected: { drawing?: any; element?: any } = {}
): void {
  drawPitch(ctx, w, h, pitchType);
  (drawings || []).forEach(d => drawPath(ctx, d, selected.drawing === d));
  (elements || []).forEach(el => drawElement(ctx, el, selected.element === el));
}
