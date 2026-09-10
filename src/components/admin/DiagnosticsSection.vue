<script setup lang="ts">
/**
 * Supabase credentials, and the live database diagnostic.
 *
 * The diagnostic exists so a misconfigured deployment can be diagnosed
 * **without a developer**, and that is why the report is rendered per table
 * with the database's own words rather than as a single pass/fail. "players:
 * SELECT passed, INSERT refused — new row violates row-level security policy
 * (42501)" tells an admin their RLS policy is missing; "failed" tells them to
 * find someone who can read logs.
 *
 * The read and the write are reported separately for the same reason: a table
 * that reads but will not write is the commonest RLS symptom, and one status
 * for both hides it.
 *
 * **Credentials are stored in `localStorage`, on one device.** Saving them
 * here does not configure the deployment for anybody else, and the form says
 * so — otherwise the next person to open the app sees empty screens with no
 * explanation. The stored key is never rendered back; only whether one is set.
 *
 * Extracted from the diagnostics panel in public/js/admin.js during Phase 6.
 */
import { ref, computed } from 'vue';
import SectionShell from './SectionShell.vue';
import { supabaseService } from '../../data/supabase';

const props = defineProps<{
  isAdmin: boolean;
  /** The team-scoped tables need a real team, not the legacy school lookup. */
  teamId: string | null;
  /** The active organization, so the school-scoped tables are not tested
   * against Beaumont's row. */
  schoolId: string | null;
}>();

const url = ref('');
const key = ref('');
const credError = ref<string | null>(null);
const credNotice = ref<string | null>(null);

const running = ref(false);
const report = ref<any>(null);
const diagError = ref<string | null>(null);

/**
 * What the collapsed header says about the connection.
 *
 * It reports only what is known without asking the database anything, which
 * is the same discipline the report below follows. A chip that went green
 * because a client object had been constructed would say all-clear while the
 * database was unreachable — the exact failure this section exists to
 * diagnose. So `Configured` means the credentials look usable, and
 * `Connected` is claimed only once something has actually talked to it.
 *
 * `Not configured` is the valuable one: it is the single fact that explains
 * every empty screen elsewhere in the app, and it costs nothing to know.
 */
const connection = computed<string>(() => {
  if (!supabaseService.isConfigured()) return 'Not configured';
  if (!report.value) return 'Configured';
  return report.value.success ? 'Connected' : 'Problems found';
});

/**
 * `Configured` stays plain deliberately: it is a statement about the
 * credentials, not an all-clear about the database, and colouring it green
 * would make it read as one.
 */
const connectionTone = computed<'plain' | 'live' | 'warn'>(() => {
  if (connection.value === 'Connected') return 'live';
  if (connection.value === 'Configured') return 'plain';
  return 'warn';
});

/** Whether a key is stored on this device — never the key itself. */
function hasStoredKey(): boolean {
  try {
    return !!localStorage.getItem('bhs_supabase_anon_key');
  } catch {
    return false;
  }
}

function onSaveCredentials(): void {
  credError.value = null;
  credNotice.value = null;

  const u = url.value.trim();
  const k = key.value.trim();

  // A malformed url produces a client that fails every call with no useful
  // message, so it is refused here rather than stored.
  let parsed: URL | null = null;
  try { parsed = new URL(u); } catch { parsed = null; }
  if (!parsed || !/^https?:$/.test(parsed.protocol)) {
    credError.value = 'That is not a project URL. It looks like https://yourproject.supabase.co';
    return;
  }
  if (!k) { credError.value = 'The anon key is needed as well.'; return; }

  const ok = supabaseService.setCredentials(u, k);
  credNotice.value = ok
    ? 'Saved on this device. Reload the page for them to take effect.'
    : 'Saved, but the client still reports itself unconfigured — check both values.';
  key.value = '';
}

async function onRunDiagnostic(): Promise<void> {
  running.value = true;
  diagError.value = null;
  report.value = null;
  try {
    report.value = await supabaseService.runFullDatabaseDiagnostic(
      props.teamId as any, props.schoolId as any);
  } catch (e: any) {
    diagError.value = e?.message || 'The diagnostic could not be run.';
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <SectionShell title="Connection and diagnostics" :badge="connection" :tone="connectionTone">

    <p v-if="!isAdmin" class="note">
      Only an admin can change the database connection or run the diagnostic.
    </p>

    <template v-else>
      <div class="panel__sub" data-credentials>
        <h4>Supabase credentials</h4>
        <p class="note">
          These are stored in this browser, on this device only — saving them
          here does not configure the app for anyone else. Reload the page
          after saving for them to take effect.
        </p>
        <p class="note">
          An anon key is {{ hasStoredKey() ? 'stored on this device' : 'not stored on this device' }}.
        </p>

        <label class="field">
          <span class="kicker">Project URL</span>
          <input v-model="url" data-cred-url type="text" class="input"
                 placeholder="https://yourproject.supabase.co" />
        </label>
        <label class="field">
          <span class="kicker">Anon key</span>
          <input v-model="key" data-cred-key type="password" class="input"
                 placeholder="eyJ…" autocomplete="off" />
        </label>

        <button type="button" class="btn" data-cred-save @click="onSaveCredentials">
          Save credentials
        </button>

        <p v-if="credError" class="error" data-cred-error>{{ credError }}</p>
        <p v-if="credNotice" class="ok" data-cred-notice>{{ credNotice }}</p>
      </div>

      <div class="panel__sub">
        <h4>Database diagnostic</h4>
        <p class="note">
          Reads and writes a test row in each table, then removes it, and
          reports what the database said.
        </p>

        <button type="button" class="btn btn--go" data-run-diagnostic
                :disabled="running" @click="onRunDiagnostic">
          Run diagnostic
        </button>

        <p v-if="running" data-diag-running>Running against the database…</p>
        <p v-if="diagError" class="error" data-diag-error>{{ diagError }}</p>

        <div v-if="report && !running" data-diag-report>
          <p :class="report.success ? 'ok' : 'error'" data-diag-outcome>
            {{ report.success
              ? 'Every table read and wrote successfully.'
              : 'Some tables did not pass — each is listed below.' }}
          </p>

          <p v-if="report.credentials" class="note" data-diag-credentials>
            Tested {{ report.credentials.url }}
            with key {{ report.credentials.anonKeyPrefix }}…
            <span v-if="report.credentials.schoolUuid">
              (organization {{ report.credentials.schoolUuid }})
            </span>
          </p>

          <!-- No tables at all means the client never connected, and the
               summary carries the reason. -->
          <p v-if="!(report.tableResults || []).length" class="error" data-diag-summary>
            {{ report.summaryText }}
          </p>

          <div v-for="r in (report.tableResults || [])" :key="r.table"
               class="row" data-diag-table>
            <strong>{{ r.icon }} {{ r.table }}</strong>
            <span class="note">{{ r.operation }}</span>

            <span data-diag-select
                  :class="r.selectStatus === 'PASSED' ? 'ok' : 'error'">
              read {{ r.selectStatus }}<template v-if="r.selectDetails"> — {{ r.selectDetails }}</template>
            </span>

            <span data-diag-insert
                  :class="r.insertStatus === 'FAILED' ? 'error' : 'ok'">
              write {{ r.insertStatus }}<template v-if="r.responseDetails"> — {{ r.responseDetails }}</template>
            </span>

            <span v-if="r.cleanupStatus" class="note" data-diag-cleanup>
              test row cleanup {{ r.cleanupStatus }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </SectionShell>
</template>

<style scoped>

.panel__sub { margin-bottom: var(--space-4); }

h4 { margin: 0 0 var(--space-1); }
.field { margin-bottom: var(--space-2); }
.row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: var(--space-2) 0;
  border-top: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
  font-size: 13px;
}
.row .note { margin: 0; }
.error { color: var(--color-danger); }
.ok { color: var(--live); }
</style>
