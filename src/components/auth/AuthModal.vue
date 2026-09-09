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
import { ref, computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { useAuthStore } from '../../stores/auth';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const auth = useAuthStore();

type Tab = 'signin' | 'register' | 'verify';
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

const otp = ref('');
const verifyEmail = ref('');

/** Set when checkEmail offers a correction; both answers are then on screen. */
const suggestion = ref<string | null>(null);
const suggestionReason = ref<string | null>(null);

const ROLES = [
  { value: 'coach', label: '👔 Coach / Staff Member (Full Access)' },
  { value: 'player', label: '⚽ Player (Roster & Ratings)' },
  { value: 'guest', label: '👤 Public Visitor / Fan (Public Matches Only)' }
];

const title = computed(() =>
  tab.value === 'register' ? 'Create an account'
    : tab.value === 'verify' ? 'Verify your email'
      : 'Sign in');

function setTab(next: Tab): void {
  tab.value = next;
  feedback.value = '';
  suggestion.value = null;
}

function fail(message: string): void {
  feedback.value = message;
  feedbackKind.value = 'error';
}

function openVerify(target: string): void {
  verifyEmail.value = target;
  tab.value = 'verify';
  feedback.value = 'We emailed you a 6-digit verification code. Enter it below.';
  feedbackKind.value = 'info';
}

async function onSignIn(): Promise<void> {
  busy.value = true;
  feedback.value = '';
  try {
    const res: any = await auth.login(email.value.trim(), password.value);
    if (res?.success) { emit('close'); return; }
    if (res?.isPendingVerification) { openVerify(res.user?.email || email.value.trim()); return; }
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
      role: regRole.value
    });
    if (res?.success) {
      if (res.requiresVerification) openVerify(withEmail);
      else emit('close');
      return;
    }
    fail(res?.message || 'Could not create the account.');
  } finally {
    busy.value = false;
  }
}

function onRegister(): void {
  const typed = regEmail.value.trim().toLowerCase();
  const check = auth.inspectEmail(typed);

  // Not an address at all: nothing to send anywhere.
  if (!check.valid) { fail(check.reason || 'That does not look like an email address.'); return; }

  // A near miss. Offered, never enforced -- both answers go on screen and
  // nothing is sent until one is chosen.
  if (check.suggestion) {
    suggestion.value = check.suggestion;
    suggestionReason.value = check.reason;
    return;
  }

  void submitRegistration(typed);
}

async function onVerify(): Promise<void> {
  busy.value = true;
  feedback.value = '';
  try {
    const res: any = await auth.verifyOtp(verifyEmail.value, otp.value.trim());
    if (res?.success) { emit('close'); return; }
    fail(res?.message || 'That code was not accepted.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" :title="title" @close="emit('close')">
    <div class="tabs" role="tablist">
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

    <!-- Sign in -->
    <form v-if="tab === 'signin'" data-tab-panel="signin" data-signin-submit
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

    <!-- Verify -->
    <form v-else data-tab-panel="verify" data-verify-submit @submit.prevent="onVerify">
      <p class="verify__target">
        Code sent to <strong data-verify-target>{{ verifyEmail }}</strong>
      </p>
      <label class="field">
        <span class="kicker">6-digit code</span>
        <input v-model="otp" type="text" inputmode="numeric" class="input"
               required autocomplete="one-time-code" maxlength="6" data-field="otp" />
      </label>
      <button type="submit" class="btn btn--go" :disabled="busy">
        {{ busy ? 'Checking…' : 'Verify' }}
      </button>
      <button type="button" class="btn btn--plain" @click="setTab('signin')">
        Back to sign in
      </button>
    </form>
  </BaseModal>
</template>

<style scoped>
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

.verify__target { margin: 0 0 var(--space-3); color: var(--ink-muted); font-size: 14px; }
</style>
