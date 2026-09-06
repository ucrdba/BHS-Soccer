/**
 * The board's controls.
 *
 * The engine owns the canvas; everything a reader sees around it is rendered
 * here from the engine's onChange. That split is the point of the port -- the
 * legacy engine drew its own toolbar and keyframe strip, which is why it had
 * to know there were two boards on the page and switch between two sets of
 * hard-coded element ids.
 *
 * These tests do not paint anything: getContext returns null under jsdom. They
 * assert the controls reflect the engine's state and drive it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TacticalBoard from './TacticalBoard.vue';

vi.mock('../../data/supabase', () => ({ supabaseService: {} }));

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountBoard(diagram: any = null) {
  const w = mount(TacticalBoard, {
    props: { diagram, active: true },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  (window as any).matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe('the toolbar', () => {
  it('offers the pieces and the lines', async () => {
    const w = await mountBoard();
    expect(w.find('[data-tool="attacker"]').exists()).toBe(true);
    expect(w.find('[data-tool="line_arrow"]').exists()).toBe(true);
    expect(w.find('[data-tool="eraser"]').exists()).toBe(true);
  });

  it('marks the tool that is active', async () => {
    const w = await mountBoard();
    await w.find('[data-tool="ball"]').trigger('click');

    expect(w.find('[data-tool="ball"]').classes()).toContain('is-on');
    expect(w.find('[data-tool="attacker"]').classes()).not.toContain('is-on');
  });

  it('marks the pitch that is chosen', async () => {
    const w = await mountBoard();
    await w.find('[data-pitch="half"]').trigger('click');
    expect(w.find('[data-pitch="half"]').classes()).toContain('is-on');
  });

  it('offers undo and clear', async () => {
    const w = await mountBoard();
    expect(w.find('[data-board-undo]').exists()).toBe(true);
    expect(w.find('[data-board-clear]').exists()).toBe(true);
  });
});

describe('the keyframe strip', () => {
  it('starts with one frame, marked as current', async () => {
    const w = await mountBoard();
    const frames = w.findAll('[data-frame]');

    expect(frames).toHaveLength(1);
    expect(frames[0].classes()).toContain('is-on');
  });

  it('grows when a frame is added, and follows the board', async () => {
    const w = await mountBoard();
    await w.find('[data-frame-add]').trigger('click');

    const frames = w.findAll('[data-frame]');
    expect(frames).toHaveLength(2);
    expect(frames[1].classes()).toContain('is-on');
  });

  it('moves the board when a frame is clicked', async () => {
    const w = await mountBoard();
    await w.find('[data-frame-add]').trigger('click');
    await w.findAll('[data-frame]')[0].trigger('click');

    expect(w.findAll('[data-frame]')[0].classes()).toContain('is-on');
  });

  it('refuses to delete the only frame, on screen rather than in an alert', async () => {
    // An alert cannot be styled, cannot be tested, and blocks the page.
    const w = await mountBoard();
    await w.find('[data-frame-delete]').trigger('click');

    expect(w.find('[data-board-notice]').text()).toMatch(/start position/i);
    expect(w.findAll('[data-frame]')).toHaveLength(1);
  });

  it('deletes a later frame without complaint', async () => {
    const w = await mountBoard();
    await w.find('[data-frame-add]').trigger('click');
    await w.find('[data-frame-delete]').trigger('click');

    expect(w.findAll('[data-frame]')).toHaveLength(1);
    expect(w.find('[data-board-notice]').exists()).toBe(false);
  });
});

describe('playing', () => {
  it('is disabled with one frame, and says why', async () => {
    // Rather than offering a control that can only produce an error.
    const w = await mountBoard();
    const play = w.find('[data-board-play]');

    expect((play.element as HTMLButtonElement).disabled).toBe(true);
    expect(play.attributes('title')).toMatch(/second time frame/i);
  });

  it('is enabled once there are two', async () => {
    const w = await mountBoard();
    await w.find('[data-frame-add]').trigger('click');

    expect((w.find('[data-board-play]').element as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('an existing diagram', () => {
  it('opens on the one it was given', async () => {
    const w = await mountBoard({
      keyframes: [
        { time: 0, label: 'Time 0 (Start Position)', elements: [], drawings: [] },
        { time: 1, label: 'Time 1', elements: [], drawings: [] }
      ],
      currentFrameIndex: 0, elements: [], drawings: [], pitchType: 'half'
    });

    expect(w.findAll('[data-frame]')).toHaveLength(2);
    expect(w.find('[data-pitch="half"]').classes()).toContain('is-on');
  });

  it('hands its data back for saving', async () => {
    const w = await mountBoard();
    const data = (w.vm as any).diagramData();

    expect(data).toHaveProperty('keyframes');
    expect(data).toHaveProperty('pitchType');
  });

  it('opens an empty board when it is given nothing', async () => {
    const w = await mountBoard(null);
    expect(w.findAll('[data-frame]')).toHaveLength(1);
  });
});
