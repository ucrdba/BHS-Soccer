<script setup lang="ts">
/**
 * Sign in, register, verify.
 *
 * Three things differ from the flow this replaces.
 *
 * Feedback is inline. The legacy version announced success with
 * alert("🎉 Welcome back, …"), which blocks the page, cannot be styled, and
 * cannot be asserted in a test.
 *
 * The email check actually runs. checkEmail() has been imported into
 * src/auth.ts and never called, and coaches.view.js branches on a
 * `res.emailSuggestion` that RegisterResult never carries -- so a tested
 * module has been wired to nothing. It is called here, before registering.
 *
 * A suggestion is an OFFER. "Use what I typed" is a plain, equal button
 * rather than a buried option: the check cannot know every legitimate domain,
 * a club coach's address is ordinary and unknowable from here, and the person
 * overruling it must have an easy path rather than a fight.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { useAuthStore } from '../../stores/auth';
import { demoConfig, DEMO_ACCOUNTS } from '../../demo';
import { supabaseService } from '../../data/supabase';
import type { JoinableTeam } from '../../types';

const props = defineProps<{ open: boolean; initialTab?: 'signin' | 'register'; initialEmail?: string }>();
const emit = defineEmits<{ close: [] }>();

const auth = useAuthStore();

/**
 * On the demo deployment the modal is an account picker: nine buttons and
 * nothing to type. The shared password comes from the build, never from the
 * visitor. Off everywhere else.
 */
const demo = demoConfig();

type Tab = 'signin' | 'register' | 'sent';
const tab = ref<Tab>('signin');
const busy = ref(false);
const feedback = ref('');
const feedbackKind = ref<'error' | 'info'>('error');

const email = ref('');
const password = ref('');

const regName = ref('');
const regEmail = ref('');
const regPassword = ref('');
const regRole = ref('coach');

/** Set when checkEmail offers a correction; both answers are then on screen. */
const suggestion = ref<string | null>(null);
const suggestionReason = ref<string | null>(null);

const ROLES = [
  { value: 'coach', label: 'Coach or staff' },
  { value: 'player', label: 'Player' },
  { value: 'guest', label: 'Fan or parent — public pages only' }
];

const regTeam = ref('');
const teams = ref<JoinableTeam[]>([]);
const sentTo = ref('');
const needsTeam = computed(() => regRole.value !== 'guest');

/** Teams grouped under their organization, which is how a person recognises their own. */
const teamGroups = computed(() => {
  const groups: { school: string; teams: JoinableTeam[] }[] = [];
  for (const t of teams.value) {
    let g = groups.find(x => x.school === t.schoolName);
    if (!g) { g = { school: t.schoolName, teams: [] }; groups.push(g); }
    g.teams.push(t);
  }
  return groups;
});

async function loadTeams(): Promise<void> {
  if (teams.value.length) return;
  teams.value = (await supabaseService.fetchJoinableTeams()) || [];
}

watch(() => props.open, (open) => {
  if (!open) return;
  setTab(props.initialTab || 'signin');
  if (props.initialEmail) regEmail.value = props.initialEmail;
}, { immediate: true });

const title = computed(() =>
  demo.enabled ? 'Try the demo'
    : tab.value === 'register' ? 'Create an account'
      : tab.value === 'sent' ? 'Check your email'
        : 'Sign in');

function setTab(next: Tab): void {
  tab.value = next;
  feedback.value = '';
  suggestion.value = null;
  if (next === 'register') void loadTeams();
}

function fail(message: string): void {
  feedback.value = message;
  feedbackKind.value = 'error';
}

async function onSignIn(): Promise<void> {
  busy.value = true;
  feedback.value = '';
  try {
    const res: any = await auth.login(email.value.trim(), password.value);
    if (res?.success) { emit('close'); return; }
    if (res?.isPendingVerification) { fail(res.message); return; }
    fail(res?.message || 'Could not sign in.');
  } finally {
    busy.value = false;
  }
}

/** Register with a specific address, once the suggestion has been settled. */
async function submitRegistration(withEmail: string): Promise<void> {
  busy.value = true;
  suggestion.value = null;
  feedback.value = '';
  try {
    const res: any = await auth.register({
      name: regName.value.trim(),
      email: withEmail,
      password: regPassword.value,
      role: regRole.value,
      teamId: needsTeam.value ? regTeam.value : null
    });
    if (res?.success) {
      sentTo.value = withEmail;
      tab.value = 'sent';
      return;
    }
    fail(res?.message || 'Could not create the account.');
  } finally {
    busy.value = false;
  }
}

function onRegister(): void {
  if (needsTeam.value && !regTeam.value) { fail('Choose the team you are joining.'); return; }

  const typed = regEmail.value.trim().toLowerCase();
  const check = auth.inspectEmail(typed);

  // Not an address at all: nothing to send anywhere. A testing-pinia stub with
  // no return value configured yields no check at all -- treated the same as
  // a check that raised no objection, rather than crashing on it.
  if (check && !check.valid) { fail(check.reason || 'That does not look like an email address.'); return; }

  // A near miss. Offered, never enforced -- both answers go on screen and
  // nothing is sent until one is chosen.
  if (check?.suggestion) {
    suggestion.value = check.suggestion;
    suggestionReason.value = check.reason;
    return;
  }

  void submitRegistration(typed);
}

async function onPickAccount(email: string): Promise<void> {
  busy.value = true;
  feedback.value = '';
  try {
    const res: any = await auth.login(email, demo.password);
    if (res?.success) { emit('close'); return; }
    fail(res?.message || 'Could not sign in to that demo account.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" :title="title" @close="emit('close')">
    <div v-if="!demo.enabled" class="tabs" role="tablist">
      <button
        type="button" class="tabs__btn" :class="{ 'is-on': tab === 'signin' }"
        role="tab" :aria-selected="tab === 'signin'" data-tab="signin"
        @click="setTab('signin')"
      >Sign in</button>
      <button
        type="button" class="tabs__btn" :class="{ 'is-on': tab === 'register' }"
        role="tab" :aria-selected="tab === 'register'" data-tab="register"
        @click="setTab('register')"
      >Register</button>
    </div>

    <p
      v-if="feedback"
      class="note"
      :class="feedbackKind === 'error' ? 'note--bad' : ''"
      :role="feedbackKind === 'error' ? 'alert' : 'status'"
      data-feedback
    >{{ feedback }}</p>

    <!-- The demo: pick an account. The chain below continues with v-else-if. -->
    <div v-if="demo.enabled" class="demo-accounts" data-demo-accounts>
      <p class="demo-accounts__intro">Pick an account to explore. Everything here is made up.</p>
      <button
        v-for="a in DEMO_ACCOUNTS" :key="a.n" type="button" class="demo-account"
        :data-demo-account="a.n" :disabled="busy" @click="onPickAccount(a.email)"
      >
        <span class="demo-account__label">{{ a.label }}</span>
        <span class="demo-account__sees">{{ a.sees }}</span>
      </button>
    </div>

    <!-- Sign in -->
    <form v-else-if="tab === 'signin'" data-tab-panel="signin" data-signin-submit
          @submit.prevent="onSignIn">
      <label class="field">
        <span class="kicker">Email</span>
        <input v-model="email" type="email" class="input" required
               autocomplete="email" data-field="email" />
      </label>
      <label class="field">
        <span class="kicker">Password</span>
        <input v-model="password" type="password" class="input" required
               autocomplete="current-password" data-field="password" />
      </label>
      <button type="submit" class="btn btn--go" :disabled="busy">
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <!-- Register -->
    <form v-else-if="tab === 'register'" data-tab-panel="register" data-register-submit
          @submit.prevent="onRegister">
      <label class="field">
        <span class="kicker">Name</span>
        <input v-model="regName" type="text" class="input" required
               autocomplete="name" data-field="regName" />
      </label>
      <label class="field">
        <span class="kicker">Email</span>
        <input v-model="regEmail" type="email" class="input" required
               autocomplete="email" data-field="regEmail" />
      </label>
      <label class="field">
        <span class="kicker">Password</span>
        <input v-model="regPassword" type="password" class="input" required
               autocomplete="new-password" minlength="6" data-field="regPassword" />
      </label>
      <label class="field">
        <span class="kicker">I am a</span>
        <select v-model="regRole" class="input" data-field="regRole">
          <option v-for="r in ROLES" :key="r.value" :value="r.value" data-role-option>
            {{ r.label }}
          </option>
        </select>
      </label>

      <label v-if="needsTeam" class="field">
        <span class="kicker">Team</span>
        <select v-model="regTeam" class="input" data-field="regTeam">
          <option value="">— choose your team —</option>
          <optgroup v-for="g in teamGroups" :key="g.school" :label="g.school">
            <option v-for="t in g.teams" :key="t.id" :value="t.id">
              {{ t.name }}<template v-if="t.season"> · {{ t.season }}</template>
            </option>
          </optgroup>
        </select>
      </label>

      <!--
        Both answers, equally reachable. The check cannot know every
        legitimate domain, so overruling it must not be a fight.
      -->
      <div v-if="suggestion" class="suggest">
        <p class="suggest__text">{{ suggestionReason || 'Did you mean:' }}</p>
        <div class="suggest__actions">
          <button type="button" class="btn btn--go" data-use-suggestion
                  @click="submitRegistration(suggestion!)">
            Use {{ suggestion }}
          </button>
          <button type="button" class="btn btn--plain" data-keep-typed
                  @click="submitRegistration(regEmail.trim().toLowerCase())">
            No, use what I typed
          </button>
        </div>
      </div>

      <button v-else type="submit" class="btn btn--go" :disabled="busy">
        {{ busy ? 'Creating…' : 'Create account' }}
      </button>
    </form>

    <!-- Sent -->
    <div v-else data-tab-panel="sent" class="sent">
      <p>We sent a link to <strong>{{ sentTo }}</strong>. Open it to confirm your account.</p>
      <p class="note">
        If a coach invited this address, confirming connects you to your team. Otherwise
        your request goes to the team's coach, or to an admin for a coach's request.
      </p>
      <button type="button" class="btn btn--go" @click="emit('close')">Done</button>
    </div>
  </BaseModal>
</template>

<style scoped>
form { display: flex; flex-direction: column; gap: var(--space-3); }

.tabs { display: flex; gap: var(--space-3); margin-bottom: var(--space-4); border-bottom: 1px solid var(--rule); }
.tabs__btn {
  padding: var(--space-2) 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--ink-muted);
  font-family: var(--heading-face);
  font-size: 15px;
  cursor: pointer;
}
.tabs__btn.is-on { border-bottom-color: var(--live); color: var(--live); }

.suggest {
  padding: var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-md);
}
.suggest__text { margin: 0 0 var(--space-2); color: var(--rule-strong); font-size: 13px; }
.suggest__actions { display: flex; flex-direction: column; gap: var(--space-2); }

.sent { display: flex; flex-direction: column; gap: var(--space-2); }

.demo-accounts { display: flex; flex-direction: column; gap: var(--space-2); }
.demo-accounts__intro { margin: 0 0 var(--space-2); color: var(--ink-muted); font-size: 14px; }
.demo-account {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-md);
  background: none;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.demo-account:hover:not(:disabled) { border-color: var(--live); }
.demo-account__label { font-family: var(--heading-face); font-size: 16px; }
.demo-account__sees { color: var(--ink-muted); font-size: 13px; }
</style>
