<script setup lang="ts">
/**
 * The masthead: who you are looking at, and who you are.
 *
 * Every word of the branding comes from the organization's row. The legacy
 * hero read "BEAUMONT HIGH SCHOOL" and "HOME OF THE COUGARS" from literals in
 * a template string, which is wrong the moment a club coach opens it.
 */
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useOrganizationStore } from '../../stores/organization';

const auth = useAuthStore();
const org = useOrganizationStore();

/** The three states updateAuthUI() produces, in the same order. */
const accountLabel = computed(() => {
  if (auth.isGuest) return '🔑 Sign In / Register';
  if (auth.isCoach || auth.isAdmin) return '⚙️ Admin Center';
  return '👤 My Account';
});

const badgeText = computed(() =>
  auth.user ? String(auth.role || '').toUpperCase() : 'GUEST');

const displayName = computed(() => auth.user?.name || 'Public Visitor');

// TODO(Phase 2): the sign-in and account modals are not rebuilt yet. Until
// they are, this button says what it will do rather than doing nothing
// silently -- the legacy app still has both screens.
function onAccountClick(): void {
  console.info('Account actions are rebuilt in Phase 2 of the Vue migration.');
}
</script>

<template>
  <header class="masthead">
    <div class="masthead__brand">
      <span class="masthead__org">{{ org.branding.name || ' ' }}</span>
      <span v-if="org.branding.mascot" class="masthead__mascot">
        {{ org.branding.mascot }}
      </span>
      <span v-if="org.activeTeam" class="masthead__team">
        {{ org.activeTeam.name }}
      </span>
    </div>

    <div class="masthead__account">
      <span class="masthead__who">
        <span class="masthead__name">{{ displayName }}</span>
        <span class="masthead__badge">{{ badgeText }}</span>
      </span>
      <button type="button" class="masthead__btn" @click="onAccountClick">
        {{ accountLabel }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.masthead {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1rem;
  background: var(--bhs-navy-bg);
  border-bottom: 1px solid var(--bhs-navy-border);
}

.masthead__brand {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  min-width: 0;
}

.masthead__org {
  color: #fff;
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: 0.01em;
}

.masthead__mascot {
  color: var(--bhs-cyan-accent);
  font-weight: 600;
  font-size: 0.9rem;
}

.masthead__team {
  color: var(--text-muted, #94a3b8);
  font-size: 0.82rem;
}

.masthead__account {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.masthead__who {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.25;
}

.masthead__name {
  color: #fff;
  font-size: 0.85rem;
}

.masthead__badge {
  color: var(--bhs-gold-accent);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.masthead__btn {
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--bhs-gold-accent);
  border-radius: 6px;
  background: transparent;
  color: var(--bhs-gold-accent);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.masthead__btn:hover,
.masthead__btn:focus-visible {
  background: var(--bhs-gold-accent);
  color: var(--bhs-navy-bg);
}

@media (max-width: 640px) {
  .masthead { padding: 0.75rem 1rem; }
  .masthead__who { display: none; }
}
</style>
