<script setup lang="ts">
/**
 * Tagging packing from video.
 *
 * A coach with the match video in another window types one row per completed
 * pass or dribble that took opponents out of play. Players are typed by SHIRT
 * number, because that is what the video shows.
 *
 * Enter moves to the next box and saves from the last — the session grid's
 * rule, for the same reason: the keyboard is faster than the mouse.
 *
 * Once a match has any video tag, the reports count the tags instead of the
 * live taps (domain/packing.ts). The screen says so before and after, because
 * nothing is lost and so nothing needs confirming.
 */
import { ref, computed, watch, nextTick } from 'vue';
import ToolScreen from '../layout/ToolScreen.vue';
import { supabaseService } from '../../data/supabase';
import { lineupShortName } from '../../domain/lineup';
import {
  parseVideoTime, formatVideoTime, orderTags, resolveShirtNumber,
  matchPacking, livePackingCount, validBypassed,
  type PackingAction, type PackingTag
} from '../../domain/packing';

const props = defineProps<{
  matchId: string | null;
  matchLabel?: string;
  teamId: string | null;
  schoolId: string | null;
  players: any[];
}>();

const squad = computed(() => (props.players || []).filter((p: any) => !p.is_deleted && !p.isDeleted));
const byId = computed(() => new Map(squad.value.map((p: any) => [p.id, p])));
const nameOf = (id: string | null) => (id && byId.value.get(id) ? lineupShortName(byId.value.get(id)) : '—');

const statMatchId = ref<string | null>(null);
const liveEvents = ref<any[]>([]);
const tags = ref<PackingTag[]>([]);
const loadError = ref<string | null>(null);
const rowError = ref('');
const saving = ref(false);

const action = ref<PackingAction>('pass');
const time = ref('');
const playerText = ref('');
const receiverText = ref('');
const bypassedText = ref('');
const playerPick = ref('');
const receiverPick = ref('');

const root = ref<HTMLElement | null>(null);

const fields = computed(() =>
  action.value === 'pass' ? ['time', 'player', 'receiver', 'bypassed'] : ['time', 'player', 'bypassed']);

function focusField(name: string): void {
  const el = root.value?.querySelector<HTMLInputElement>(`[data-pt-field="${name}"]`);
  el?.focus();
}

const playerLookup = computed(() => resolveShirtNumber(squad.value, playerText.value));
const receiverLookup = computed(() => resolveShirtNumber(squad.value, receiverText.value));

/** Offered when the number names nobody or more than one: the matches, else everyone. */
const choicesFor = (lookup: { candidates: any[] }) =>
  lookup.candidates.length > 1 ? lookup.candidates : squad.value;

const needsPlayerPick = computed(() => playerText.value.trim() !== '' && !playerLookup.value.player);
const needsReceiverPick = computed(() => receiverText.value.trim() !== '' && !receiverLookup.value.player);

const playerId = computed(() => playerLookup.value.player?.id ?? (playerPick.value || null));
const receiverId = computed(() => receiverLookup.value.player?.id ?? (receiverPick.value || null));

watch(playerText, () => { playerPick.value = ''; });
watch(receiverText, () => { receiverPick.value = ''; });

const liveTaps = computed(() => livePackingCount(liveEvents.value));
const ordered = computed(() => orderTags(tags.value));
const summary = computed(() =>
  matchPacking(liveEvents.value, tags.value, squad.value.map((p: any) => p.id)));

const notice = computed(() => {
  if (liveTaps.value === 0) return '';
  const taps = `${liveTaps.value} live packing tap${liveTaps.value === 1 ? '' : 's'}`;
  return tags.value.length === 0
    ? `This match has ${taps}. Once you save a video tag, the reports count the video tags instead.`
    : `Reports now count these video tags. The ${taps} are kept; removing every tag here brings them back.`;
});

async function load(): Promise<void> {
  loadError.value = null;
  if (!props.teamId || !props.matchId) { loadError.value = 'Choose a fixture first.'; return; }
  const found = await supabaseService.findStatMatch(props.teamId, props.matchId);
  if (!found.ok) { loadError.value = found.error || 'Could not open that fixture.'; return; }
  statMatchId.value = found.id;
  if (!found.id) { liveEvents.value = []; tags.value = []; return; }

  const [events, stored] = await Promise.all([
    supabaseService.fetchStatEvents(found.id),
    supabaseService.fetchPackingTags(found.id)
  ]);
  if (events === null || stored === null) {
    loadError.value = 'Could not load this match’s packing.';
    return;
  }
  liveEvents.value = events;
  tags.value = stored;
}

watch(() => [props.teamId, props.matchId], load, { immediate: true });

function refuse(message: string): void { rowError.value = message; }

async function save(): Promise<void> {
  if (saving.value) return;
  rowError.value = '';

  const t = parseVideoTime(time.value);
  if (t.ok === false) return refuse(t.error);
  if (!playerId.value) return refuse('Type the shirt number of the player who passed or dribbled.');
  const bypassed = Number(bypassedText.value.trim());
  if (!validBypassed(bypassed)) return refuse('Opponents bypassed is a whole number from 1 to 11.');

  let receiver: string | null = null;
  if (action.value === 'pass') {
    if (!receiverId.value) return refuse('Type the shirt number of the player who received the pass.');
    if (receiverId.value === playerId.value) return refuse('A pass is received by somebody else.');
    receiver = receiverId.value;
  }

  const tag: PackingTag = {
    playerId: playerId.value, receiverId: receiver, action: action.value,
    bypassed, videoSeconds: t.seconds
  };

  saving.value = true;
  try {
    if (!statMatchId.value) {
      const opened = await supabaseService.openStatMatch(
        props.teamId as string, props.schoolId as string, props.matchId, props.matchLabel);
      if (!opened?.ok || !opened.id) return refuse(opened?.error || 'Could not start tracking this fixture.');
      statMatchId.value = opened.id;
    }
    const res = await supabaseService.addPackingTag(statMatchId.value, tag);
    if (!res.ok) return refuse(res.error || 'That tag did not save.');
    tags.value = tags.value.concat([{ ...tag, id: res.id, createdAt: res.createdAt }]);

    playerText.value = '';
    receiverText.value = '';
    bypassedText.value = '';
    await nextTick();
    focusField('time');
  } finally {
    saving.value = false;
  }
}

async function onEnter(name: string): Promise<void> {
  const list = fields.value;
  const i = list.indexOf(name);
  if (i === list.length - 1) { await save(); return; }
  focusField(list[i + 1]);
}

async function setAction(a: PackingAction): Promise<void> {
  action.value = a;
  rowError.value = '';
  await nextTick();
}

async function remove(tag: PackingTag): Promise<void> {
  if (!tag.id) return;
  const res = await supabaseService.removePackingTag(tag.id);
  if (!res.ok) { rowError.value = res.error || 'That tag was not removed.'; return; }
  tags.value = tags.value.filter(t => t.id !== tag.id);
}

const dash = (v: number | null) => (v === null ? '—' : String(v));
</script>

<template>
  <ToolScreen
    title="Packing from video" :kicker="matchLabel ? `vs ${matchLabel}` : ''"
    :back-to="{ name: 'schedule' }" back-label="Schedule"
  >
    <div ref="root">
      <p v-if="loadError" class="hint hint--bad" role="alert" data-pt-load-error>{{ loadError }}</p>

      <p class="lede">
        One row for each completed pass or dribble that took opponents out of
        play. Type players by shirt number. Enter moves to the next box and
        saves from the last.
      </p>

      <p v-if="notice" class="notice" role="status" data-pt-notice>{{ notice }}</p>

      <div class="actions" role="group" aria-label="Action">
        <button
          v-for="a in (['pass', 'dribble'] as const)" :key="a" type="button"
          class="seg" :class="{ 'is-on': action === a }" :aria-pressed="action === a"
          :data-pt-action="a" @click="setAction(a)"
        >{{ a === 'pass' ? 'Pass' : 'Dribble' }}</button>
      </div>

      <div class="entry">
        <label class="box">
          <span>Video time</span>
          <input
            v-model="time" data-pt-field="time" inputmode="numeric" placeholder="23:41"
            @keydown.enter.prevent="onEnter('time')"
          >
        </label>
        <label class="box">
          <span>Player #</span>
          <input
            v-model="playerText" data-pt-field="player" inputmode="numeric"
            @keydown.enter.prevent="onEnter('player')"
          >
          <select v-if="needsPlayerPick" v-model="playerPick" data-pt-pick="player">
            <option value="">Who?</option>
            <option v-for="p in choicesFor(playerLookup)" :key="p.id" :value="p.id">
              {{ p.number ?? '—' }} · {{ p.name }}
            </option>
          </select>
        </label>
        <label v-if="action === 'pass'" class="box">
          <span>Receiver #</span>
          <input
            v-model="receiverText" data-pt-field="receiver" inputmode="numeric"
            @keydown.enter.prevent="onEnter('receiver')"
          >
          <select v-if="needsReceiverPick" v-model="receiverPick" data-pt-pick="receiver">
            <option value="">Who?</option>
            <option v-for="p in choicesFor(receiverLookup)" :key="p.id" :value="p.id">
              {{ p.number ?? '—' }} · {{ p.name }}
            </option>
          </select>
        </label>
        <label class="box">
          <span>Bypassed</span>
          <input
            v-model="bypassedText" data-pt-field="bypassed" inputmode="numeric"
            @keydown.enter.prevent="onEnter('bypassed')"
          >
        </label>
      </div>

      <p v-if="rowError" class="hint hint--bad" role="alert" data-pt-error>{{ rowError }}</p>

      <p class="kicker sec">Tags <span class="tnum">{{ tags.length }}</span></p>
      <ul class="tags">
        <li v-for="t in ordered" :key="t.id" class="tag" data-pt-tag>
          <span class="tag__time tnum">{{ formatVideoTime(t.videoSeconds) || '—' }}</span>
          <span class="tag__what">
            {{ t.action === 'pass' ? `${nameOf(t.playerId)} → ${nameOf(t.receiverId)}` : `${nameOf(t.playerId)} dribble` }}
          </span>
          <span class="tag__n tnum">{{ t.bypassed }}</span>
          <button type="button" class="minor" data-pt-remove @click="remove(t)">Remove</button>
        </li>
        <li v-if="tags.length === 0" class="hint">No tags yet.</li>
      </ul>

      <p class="kicker sec">This match · {{ summary.source === 'video' ? 'from video' : summary.source === 'live' ? 'from live taps' : 'nothing recorded' }}</p>
      <div class="wrap">
        <table class="tbl">
          <thead>
            <tr><th class="is-text">Player</th><th>Packing</th><th>Received</th><th>By pass</th><th>By dribble</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in squad" :key="p.id" data-pt-summary-row>
              <td class="is-text">{{ p.number ?? '—' }} · {{ p.name }}</td>
              <td class="tabular">{{ summary.players.get(p.id)?.packing ?? 0 }}</td>
              <td class="tabular">{{ dash(summary.players.get(p.id)?.received ?? null) }}</td>
              <td class="tabular">{{ dash(summary.players.get(p.id)?.byPass ?? null) }}</td>
              <td class="tabular">{{ dash(summary.players.get(p.id)?.byDribble ?? null) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ToolScreen>
</template>

<style scoped>
.lede { max-width: 44rem; font-size: 12.5px; line-height: 1.55; color: var(--ink-muted); }
.notice {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  border-left: 3px solid var(--mark);
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
}
.actions { display: flex; gap: var(--space-2); margin: var(--space-3) 0; }
.seg {
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1.5px solid var(--rule-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--ink-muted);
}
.seg.is-on { border-color: var(--mark); color: var(--ink); }
.entry { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.box { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-muted); }
.box input, .box select {
  width: 7.5rem;
  min-height: 40px;
  padding: 0 var(--space-2);
  border: 1px solid var(--rule-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  font-size: 16px;
}
.hint { font-size: 12.5px; color: var(--ink-muted); }
.hint--bad { color: var(--color-warning); }
.sec { margin-top: var(--space-6); }
.tags { list-style: none; margin: 0; padding: 0; }
.tag {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--rule);
  font-size: 13px;
  color: var(--ink);
}
.tag__time { width: 4.5rem; color: var(--ink-muted); }
.tag__what { flex: 1; min-width: 0; }
.tag__n { font-weight: 600; }
.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { padding: 8px 10px; border-bottom: 1px solid var(--rule); text-align: right; color: var(--ink); }
.tbl .is-text { text-align: left; }
.kicker { display: block; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.tnum, .tabular { font-variant-numeric: tabular-nums; }
.minor {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.minor:hover { color: var(--ink); }
</style>
