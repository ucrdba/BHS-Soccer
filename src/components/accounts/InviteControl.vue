<script setup lang="ts">
/**
 * Invite a player to a roster entry, or a coach to a team.
 *
 * An invitation is authorization and nothing more: the person who signs up
 * with that address and confirms it is connected to the team. The app sends no
 * email, because that needs a server-held key, so this shows the sign-up link
 * for the coach to send and says outright that nothing was emailed.
 *
 * Who may invite whom is decided by create_invitation(), not here: a coach
 * invites players to their own team, an admin invites coaches.
 */
import { ref, computed, onMounted, watch } from 'vue';
import { supabaseService } from '../../data/supabase';
import { signupLink } from '../../domain/signup-link';
import type { Invitation } from '../../types';

const props = defineProps<{
  teamId: string;
  role: 'player' | 'coach';
  playerId?: string | null;
  /** Who or what the invitation is for, in sentences: a player's or a team's name. */
  subject: string;
}>();

const invitations = ref<Invitation[]>([]);
const linked = ref(false);
const email = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const open = computed(() => invitations.value.filter(i =>
  i.role === props.role && (props.role === 'coach' || i.player_id === props.playerId)));

/** A player has one place on a roster; a team may take several coaches. */
const showForm = computed(() => props.role === 'coach' || open.value.length === 0);

function linkFor(address: string): string {
  let origin = '';
  try { origin = window.location.origin; } catch { origin = ''; }
  return signupLink(origin, address);
}

async function load(): Promise<void> {
  error.value = null;
  const [found, linkedIds] = await Promise.all([
    supabaseService.fetchTeamInvitations(props.teamId),
    props.role === 'player' ? supabaseService.fetchLinkedPlayerIds(props.teamId) : Promise.resolve([] as string[])
  ]);
  if (found === null || linkedIds === null) {
    error.value = 'Could not load the invitations for this team.';
    return;
  }
  invitations.value = found;
  linked.value = props.role === 'player' && !!props.playerId && linkedIds.includes(props.playerId);
}

onMounted(load);
watch(() => [props.teamId, props.playerId], load);

async function onInvite(): Promise<void> {
  error.value = null;
  notice.value = null;
  const address = email.value.trim();
  if (!address) { error.value = 'Enter the email address to invite.'; return; }

  busy.value = true;
  try {
    const res = await supabaseService.createInvitation(
      address, props.teamId, props.role, props.role === 'player' ? (props.playerId || null) : null);
    if (!res.ok) { error.value = res.error || 'That invitation was refused.'; return; }
    notice.value = `Invited ${address.toLowerCase()}. The app does not email it — send them the link below. If they already have an account, they are connected the next time they sign in.`;
    email.value = '';
    await load();
  } finally {
    busy.value = false;
  }
}

async function onRevoke(i: Invitation): Promise<void> {
  error.value = null;
  notice.value = null;
  if (!window.confirm(`Withdraw the invitation for ${i.email}?\n\nThe link will stop connecting them to ${props.subject}.`)) return;
  const res = await supabaseService.revokeInvitation(i.id);
  if (!res.ok) { error.value = res.error || 'That could not be withdrawn.'; return; }
  notice.value = `Invitation for ${i.email} withdrawn.`;
  await load();
}

async function onCopy(address: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(linkFor(address));
    notice.value = 'Link copied.';
  } catch {
    notice.value = 'Select the link and copy it.';
  }
}
</script>

<template>
  <div class="invite" data-invite>
    <p v-if="linked" class="note" data-invite-linked>Account linked.</p>

    <template v-else>
      <div v-for="i in open" :key="i.id" class="invite__open" data-invite-open>
        <p class="invite__who">Invited <strong>{{ i.email }}</strong> — waiting for them to sign up.</p>
        <div class="invite__link">
          <input class="input" readonly :value="linkFor(i.email)" data-invite-link
                 @focus="($event.target as HTMLInputElement).select()" />
          <button type="button" class="btn" data-invite-copy @click="onCopy(i.email)">Copy</button>
          <button type="button" class="btn" data-invite-revoke @click="onRevoke(i)">Withdraw</button>
        </div>
      </div>

      <form v-if="showForm" class="invite__form" data-invite-form @submit.prevent="onInvite">
        <label class="field">
          <span class="kicker">{{ role === 'coach' ? 'Invite a coach' : 'Invite by email' }}</span>
          <input v-model="email" type="email" class="input" autocomplete="off" data-invite-email />
        </label>
        <button type="submit" class="btn btn--go" :disabled="busy" data-invite-submit>
          {{ busy ? 'Inviting…' : 'Invite' }}
        </button>
      </form>
    </template>

    <p v-if="error" class="note note--bad" role="alert" data-invite-error>{{ error }}</p>
    <p v-if="notice" class="note" role="status" data-invite-notice>{{ notice }}</p>
  </div>
</template>

<style scoped>
.invite { display: flex; flex-direction: column; gap: var(--space-2); }
.invite__who { margin: 0; color: var(--ink); font-size: 13px; }
.invite__link { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.invite__link .input { flex: 1; min-width: 14rem; }
.invite__form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2); }
</style>
