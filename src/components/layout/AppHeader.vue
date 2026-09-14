<script setup lang="ts">
/**
 * The crest: who you are looking at, and who you are.
 *
 * Every word of the branding comes from the organization's row. The mark is
 * the organization's initial inside a keyline drawn in its own colour — the
 * one place on the paper ground the organization's primary appears, as
 * stroke. The team switcher groups teams by organization because that
 * distinction is the point: a person may coach a school team and a club
 * team, and confusing the two is the failure the control exists to prevent.
 */
import { computed, ref, onMounted, watch } from 'vue';
import AuthModal from '../auth/AuthModal.vue';
import { useAuthStore } from '../../stores/auth';
import { useOrganizationStore } from '../../stores/organization';
import { useScheduleStore } from '../../stores/schedule';
import { teamGroups } from '../../domain/team-switcher';
import { readSignupEmail } from '../../domain/signup-link';

const auth = useAuthStore();
const org = useOrganizationStore();
const schedule = useScheduleStore();
const authOpen = ref(false);
const authTab = ref<'signin' | 'register'>('signin');
const signupEmail = ref('');

/**
 * An invited person arrives on ?signup=<address>: open registration with it
 * filled in. The link connects nobody -- the invitation in the database does,
 * when they confirm the address.
 */
onMounted(() => {
  let email: string | null = null;
  try { email = readSignupEmail(window.location.search); } catch { email = null; }
  if (email === null) return;
  signupEmail.value = email;
  authTab.value = 'register';
  authOpen.value = true;
});

/** A reset link signs the person in; the header opens the modal to ask for the new password. */
watch(() => auth.recovering, (recovering) => { if (recovering) authOpen.value = true; }, { immediate: true });

/** The first letter of the organization's name; nothing before it loads. */
const initial = computed(() => (org.branding.name || '').trim().charAt(0).toUpperCase());

const groups = computed(() => teamGroups(org.teams, org.schools));
const showSwitcher = computed(() => org.teams.length > 1);

const activeTeamText = computed(() => {
  const t: any = org.activeTeam;
  if (!t) return '';
  return t.season ? `${t.name} · ${t.season}` : String(t.name || '');
});

/**
 * Nothing is claimed about the season until the schedule has actually been
 * read for this team. The header does not load it: the home and schedule
 * screens do, and a record that appears as you reach them is honest. The
 * record is shown only for the team the schedule was actually read for —
 * after a switch, a stale record for the previous team must not linger
 * under the new organization's crest.
 */
const record = computed(() => (
  schedule.loadedTeamId && schedule.loadedTeamId === org.activeTeamId ? schedule.record : null
));
const showRecord = computed(() => !!record.value && record.value.gamesPlayed > 0);

/**
 * Signed in is not the same as not a guest: a fan and an account waiting for
 * approval both hold the guest role, and were offered "Sign in" with no way to
 * sign out.
 */
const accountLabel = computed(() => auth.isSignedIn ? 'Sign out' : 'Sign in');
const badgeText = computed(() => String(auth.role || '').toUpperCase());

function onTeamChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value;
  org.setActiveTeam(value || null);
}

async function onAccountClick(): Promise<void> {
  if (!auth.isSignedIn) { authTab.value = 'signin'; authOpen.value = true; return; }
  await auth.logout();
}
</script>

<template>
  <header class="crest">
    <div class="crest__row">
      <span v-if="initial" class="crest__mark" aria-hidden="true" data-crest-mark>{{ initial }}</span>

      <div class="crest__names">
        <p class="crest__org kicker tnum" data-org-name>{{ org.branding.name || ' ' }}</p>
        <p v-if="org.branding.mascot" class="crest__mascot" data-org-mascot>
          {{ org.branding.mascot }}
        </p>
      </div>

      <div class="crest__account">
        <span v-if="!auth.isGuest" class="crest__badge" data-role-badge>{{ badgeText }}</span>
        <button type="button" class="crest__btn" data-account-btn @click="onAccountClick">
          {{ accountLabel }}
        </button>
      </div>
    </div>

    <div class="crest__row crest__row--meta">
      <label v-if="showSwitcher" class="switcher">
        <span class="sr-only">Team</span>
        <select
          class="switcher__select"
          data-team-switcher
          :value="org.activeTeamId || ''"
          @change="onTeamChange"
        >
          <optgroup v-for="g in groups" :key="g.id" :label="g.label">
            <option v-for="t in g.teams" :key="t.id" :value="t.id">
              {{ t.season ? `${t.name} · ${t.season}` : t.name }}
            </option>
          </optgroup>
        </select>
        <span class="switcher__caret" aria-hidden="true">▾</span>
      </label>
      <span v-else-if="activeTeamText" class="switcher__static" data-team-name>{{ activeTeamText }}</span>
      <span v-else />

      <span v-if="showRecord" class="record tnum" data-season-record role="group" aria-label="Season record">
        <span>{{ record!.wins }}<em>W</em></span>
        <span>{{ record!.losses }}<em>L</em></span>
        <span>{{ record!.draws }}<em>D</em></span>
      </span>
    </div>

    <AuthModal
      :open="authOpen" :initial-tab="authTab" :initial-email="signupEmail"
      @close="authOpen = false" />
  </header>
</template>

<style scoped>
.crest {
  padding: var(--space-4) var(--space-4) var(--space-3);
  border-bottom: 1px solid var(--rule);
  background: var(--ground);
}

.crest__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  max-width: 64rem;
  margin: 0 auto;
}

.crest__row--meta {
  justify-content: space-between;
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule);
}

/* The organization's initial in a keyline of its own colour. Stroke only. */
.crest__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 38px;
  height: 38px;
  border: 1.5px solid var(--mark);
  border-radius: var(--radius-sm);
  color: var(--mark);
  font-family: var(--heading-face);
  font-size: 19px;
  line-height: 1;
}

.crest__names { flex: 1; min-width: 0; }

.crest__org {
  line-height: 1.3;
  color: var(--ink-muted);
  letter-spacing: 0.14em;
}

.crest__mascot {
  font-family: var(--heading-face);
  font-size: 26px;
  font-weight: 500;
  line-height: 1.1;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.crest__account {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.crest__badge {
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.crest__btn {
  min-height: 34px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 14px;
  cursor: pointer;
}

.crest__btn:hover,
.crest__btn:focus-visible { border-color: var(--live); color: var(--live); }

/* The switcher reads as text with a caret, not as a form control. */
.switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ink);
  font-size: 12.5px;
}

/*
 * The control stays transparent so it reads as text with a caret rather than
 * as a form control -- but the OPTIONS must not.
 *
 * Both dark grounds declare `color-scheme: dark`, which is what normally
 * makes a browser paint a native dropdown dark. Setting `background:
 * transparent` on the select overrides that for the list, which then falls
 * back to a pale surface while the options inherit the header's near-#F8FAFC
 * text -- unreadable except under the hover highlight. Styling the options
 * directly fixes the list without giving the control a visible box.
 */
.switcher__select {
  appearance: none;
  -webkit-appearance: none;
  padding: 6px 18px 6px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.switcher__select option {
  background: var(--surface-deep);
  color: var(--ink);
}

.switcher__caret {
  position: absolute;
  right: 0;
  color: var(--live);
  pointer-events: none;
}

.switcher__static { font-size: 12.5px; color: var(--ink); }

.record {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
  color: var(--ink);
}

.record em {
  font-style: normal;
  color: var(--ink-muted);
}
</style>
