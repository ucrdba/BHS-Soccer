<script setup lang="ts">
/**
 * The tactical board, with its toolbar and its keyframe strip.
 *
 * The engine owns the canvas and nothing else; everything a reader sees
 * around it is rendered from here, off the board's `onChange`. That split is
 * the point of the port — the legacy engine drew its own controls, which is
 * why it had to know there were two boards on the page and switch between
 * two sets of element ids.
 */
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue';
import { TacticalBoard as Engine, type Tool } from '../../diagram/board';
import type { PitchType } from '../../diagram/draw';

const props = defineProps<{
  /** The stored blob to open on. */
  diagram?: any;
  /** Hidden while the modal holding it is closed, so it fits when shown. */
  active?: boolean;
}>();

const emit = defineEmits<{ change: [] }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const engine = shallowRef<Engine | null>(null);

/** Mirrors of the engine's state, refreshed by its onChange. */
const tool = ref<Tool>('attacker');
const pitch = ref<PitchType>('full');
const frames = ref<{ label: string }[]>([]);
const frameIndex = ref(0);
const playing = ref(false);
const notice = ref<string | null>(null);

const PIECES: [Tool, string][] = [
  ['attacker', 'Attacker'], ['defender', 'Defender'], ['gk', 'Keeper'],
  ['ball', 'Ball'], ['cone', 'Cone'], ['goal', 'Goal'], ['text', 'Label']
];

const LINES: [Tool, string][] = [
  ['line_solid', 'Run'], ['line_arrow', 'Pass'], ['line_dribble', 'Dribble'],
  ['line_dashed', 'Movement'], ['line_shot', 'Shot']
];

const PITCHES: [PitchType, string][] = [
  ['full', 'Full pitch'], ['half', 'Half'], ['blank', 'Blank']
];

function sync(): void {
  const board = engine.value;
  if (!board) return;

  tool.value = board.activeTool;
  pitch.value = board.pitchType;
  frames.value = board.keyframes.map(f => ({ label: f.label }));
  frameIndex.value = board.currentFrameIndex;
  playing.value = board.isPlaying;
  emit('change');
}

function onTextRequest(pos: { x: number; y: number }): void {
  // The engine does not own a dialog; asking is the component's job.
  const text = window.prompt('Label (for example "Overlapping run")', 'Overlapping run');
  if (text) engine.value?.placeText(pos, text);
}

onMounted(() => {
  if (!canvasEl.value) return;

  const board = new Engine({ onChange: sync, onTextRequest });
  board.attach(canvasEl.value);
  if (props.diagram) board.fromDiagramData(props.diagram);
  engine.value = board;
  sync();
});

onBeforeUnmount(() => { engine.value?.detach(); });

watch(() => props.diagram, (data) => { engine.value?.fromDiagramData(data); });

// Shown after being hidden: the wrapper had no width, so the board was
// sized for nothing.
watch(() => props.active, (on) => { if (on) engine.value?.resize(); });

function pick(next: Tool): void { engine.value?.setTool(next); }
function setPitch(next: PitchType): void { engine.value?.setPitchType(next); }

function onPlay(): void {
  const res = engine.value?.togglePlay();
  notice.value = res?.ok ? null : (res?.error || null);
}

function onDeleteFrame(): void {
  const res = engine.value?.deleteCurrentKeyframe();
  notice.value = res?.ok ? null : (res?.error || null);
}

/** What the parent saves. */
function diagramData(): any { return engine.value?.toDiagramData() ?? null; }
function image(): string | null { return engine.value?.exportImage() ?? null; }

defineExpose({ diagramData, image });
</script>

<template>
  <div class="board">
    <div class="tools" role="group" aria-label="Pieces">
      <button
        v-for="[value, label] in PIECES" :key="value"
        type="button" class="tool" :class="{ 'is-on': tool === value }"
        :data-tool="value" @click="pick(value)"
      >{{ label }}</button>
    </div>

    <div class="tools" role="group" aria-label="Lines">
      <button
        v-for="[value, label] in LINES" :key="value"
        type="button" class="tool" :class="{ 'is-on': tool === value }"
        :data-tool="value" @click="pick(value)"
      >{{ label }}</button>
      <button
        type="button" class="tool" :class="{ 'is-on': tool === 'select' }"
        data-tool="select" @click="pick('select')"
      >Move</button>
      <button
        type="button" class="tool" :class="{ 'is-on': tool === 'eraser' }"
        data-tool="eraser" @click="pick('eraser')"
      >Erase</button>
    </div>

    <div class="tools">
      <button
        v-for="[value, label] in PITCHES" :key="value"
        type="button" class="tool" :class="{ 'is-on': pitch === value }"
        :data-pitch="value" @click="setPitch(value)"
      >{{ label }}</button>
      <span class="spacer" />
      <button type="button" class="tool" data-board-undo @click="engine?.undo()">Undo</button>
      <button type="button" class="tool" data-board-clear @click="engine?.clear()">Clear</button>
    </div>

    <div class="wrap">
      <canvas ref="canvasEl" class="canvas" data-board-canvas />
    </div>

    <div class="frames">
      <button
        v-for="(f, i) in frames" :key="i"
        type="button" class="frame" :class="{ 'is-on': i === frameIndex }"
        data-frame @click="engine?.goToKeyframe(i)"
      >{{ f.label }}</button>

      <button type="button" class="tool" data-frame-add @click="engine?.addKeyframe()">
        + Time frame
      </button>
      <button type="button" class="tool" data-frame-delete @click="onDeleteFrame">
        Delete frame
      </button>
      <button
        type="button" class="tool" :disabled="frames.length < 2"
        :title="frames.length < 2 ? 'Add a second time frame to animate the movement.' : ''"
        data-board-play @click="onPlay"
      >{{ playing ? 'Pause' : 'Play' }}</button>
    </div>

    <p v-if="notice" class="notice" role="status" data-board-notice>{{ notice }}</p>
  </div>
</template>

<style scoped>
.board { display: flex; flex-direction: column; gap: var(--space-2); }

.tools { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }
.spacer { flex: 1; }

.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  min-height: 34px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.tool.is-on { border-color: var(--live); color: var(--live); }
.tool:disabled { opacity: 0.4; cursor: default; }

.wrap { display: flex; justify-content: center; }
.canvas { max-width: 100%; border: 1px solid var(--rule); border-radius: 6px; touch-action: none; }

.frames { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }

.frame {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.frame.is-on { border-color: var(--live); color: var(--live); }

.notice { margin: var(--space-1) 0 0; color: var(--live); font-size: 13px; line-height: 1.5; }
</style>
