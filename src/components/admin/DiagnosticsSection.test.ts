/**
 * Credentials and the database diagnostic.
 *
 * This screen exists so a misconfigured deployment can be diagnosed WITHOUT a
 * developer, which is why the report says what it found per table rather than
 * a single pass/fail: "schools SELECT ok, INSERT refused by row-level
 * security" is actionable and "failed" is not.
 *
 * Credentials are stored in localStorage, on one device. An admin who saves
 * them here has not configured the deployment for anyone else, and the form
 * says so -- otherwise the next person sees an app with no data and no
 * explanation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DiagnosticsSection from './DiagnosticsSection.vue';

const runFullDatabaseDiagnostic = vi.fn();
const setCredentials = vi.fn();
const isConfigured = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    runFullDatabaseDiagnostic: (...a: any[]) => runFullDatabaseDiagnostic(...a),
    setCredentials: (...a: any[]) => setCredentials(...a),
    isConfigured: (...a: any[]) => isConfigured(...a)
  }
}));

const REPORT = {
  success: false,
  credentials: { url: 'https://x.supabase.co', anonKeyPrefix: 'eyJhbGciOiJIUz', schoolUuid: 's1' },
  tableResults: [
    {
      table: 'schools', icon: '\u{1F3EB}', operation: 'UPSERT',
      selectStatus: 'PASSED', selectDetails: 'SELECT OK (1 rows found)',
      insertStatus: 'PASSED', responseDetails: 'ok', cleanupStatus: 'PASSED'
    },
    {
      table: 'players', icon: '\u{1F465}', operation: 'INSERT',
      selectStatus: 'PASSED', selectDetails: 'SELECT OK (0 rows found)',
      insertStatus: 'FAILED',
      responseDetails: 'INSERT/UPSERT Failed: new row violates row-level security policy (Postgres Code: 42501)',
      cleanupStatus: 'SKIPPED'
    }
  ],
  summaryText: 'a long report'
};

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

function mountIt(props: any = {}) {
  return mount(DiagnosticsSection, {
    props: { isAdmin: true, teamId: 't1', schoolId: 'lfc', ...props }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  runFullDatabaseDiagnostic.mockResolvedValue(REPORT);
  setCredentials.mockReturnValue(true);
  isConfigured.mockReturnValue(true);
});

describe('ADMIN ONLY', () => {
  it('offers neither the credentials nor the diagnostic to a coach', () => {
    const w = mountIt({ isAdmin: false });

    expect(w.find('[data-credentials]').exists()).toBe(false);
    expect(w.find('[data-run-diagnostic]').exists()).toBe(false);
  });

  it('says why rather than rendering an empty panel', () => {
    const w = mountIt({ isAdmin: false });
    expect(w.text()).toMatch(/admin/i);
  });

  it('offers both to an admin', () => {
    const w = mountIt();
    expect(w.find('[data-credentials]').exists()).toBe(true);
    expect(w.find('[data-run-diagnostic]').exists()).toBe(true);
  });
});

describe('the credentials editor', () => {
  it('SAYS THE KEY IS STORED ON THIS DEVICE ONLY', () => {
    // Otherwise an admin thinks they have configured the deployment.
    const w = mountIt();
    expect(w.find('[data-credentials]').text()).toMatch(/this device|this browser/i);
  });

  it('says what saving them changes', () => {
    const w = mountIt();
    expect(w.find('[data-credentials]').text()).toMatch(/reload|refresh/i);
  });

  it('saves what was typed', async () => {
    const w = mountIt();
    await w.find('[data-cred-url]').setValue('https://club.supabase.co');
    await w.find('[data-cred-key]').setValue('eyJhbGciOiJIUzI1NiJ9');
    await w.find('[data-cred-save]').trigger('click');

    expect(setCredentials).toHaveBeenCalledWith(
      'https://club.supabase.co', 'eyJhbGciOiJIUzI1NiJ9');
  });

  it('refuses a url that is not one, rather than breaking the client', async () => {
    const w = mountIt();
    await w.find('[data-cred-url]').setValue('supabase');
    await w.find('[data-cred-key]').setValue('eyJhbGciOiJIUzI1NiJ9');
    await w.find('[data-cred-save]').trigger('click');

    expect(setCredentials).not.toHaveBeenCalled();
    expect(w.find('[data-cred-error]').exists()).toBe(true);
  });

  it('NEVER SHOWS THE KEY BACK, only that one is set', () => {
    localStorage.setItem('bhs_supabase_anon_key', 'eyJsecretsecretsecret');
    const w = mountIt();

    expect(w.find('[data-credentials]').text()).not.toContain('eyJsecretsecretsecret');
  });
});

describe('THE REPORT SAYS WHAT IT FOUND, not only pass or fail', () => {
  it('lists every table it tested', async () => {
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();

    expect(w.findAll('[data-diag-table]')).toHaveLength(2);
  });

  it('names the table that failed and QUOTES THE DATABASE ERROR', async () => {
    // "failed" sends someone to a developer; the Postgres code does not.
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();

    const players = w.findAll('[data-diag-table]')[1];
    expect(players.text()).toContain('players');
    expect(players.text()).toMatch(/row-level security/i);
    expect(players.text()).toContain('42501');
  });

  it('reports the read separately from the write', async () => {
    // A table that reads but will not write is the commonest RLS symptom,
    // and one status for both hides it.
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();

    const players = w.findAll('[data-diag-table]')[1];
    expect(players.find('[data-diag-select]').text()).toMatch(/passed/i);
    expect(players.find('[data-diag-insert]').text()).toMatch(/failed/i);
  });

  it('shows which project and key prefix it tested, without the key', async () => {
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();

    expect(w.find('[data-diag-credentials]').text()).toContain('https://x.supabase.co');
    expect(w.find('[data-diag-credentials]').text()).toContain('eyJhbGciOiJIUz');
  });

  it('RUNS AGAINST THE ACTIVE TEAM AND ORGANIZATION', async () => {
    // The team-scoped tables need a real team, and the school-scoped ones
    // must not be tested against Beaumont's row.
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();

    expect(runFullDatabaseDiagnostic).toHaveBeenCalledWith('t1', 'lfc');
  });

  it('says it is running rather than looking broken', async () => {
    let release: any;
    runFullDatabaseDiagnostic.mockReturnValue(new Promise(r => { release = r; }));
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await w.vm.$nextTick();

    expect(w.find('[data-diag-running]').exists()).toBe(true);
    release(REPORT);
  });

  it('reports an unconfigured client as the reason rather than a crash', async () => {
    runFullDatabaseDiagnostic.mockResolvedValue({
      success: false, tableResults: [],
      summaryText: 'Supabase Database Client is NOT connected. Reason: Missing or invalid Supabase Anon Key.'
    });
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();

    expect(w.text()).toMatch(/not connected|anon key/i);
  });

  it('survives the diagnostic throwing', async () => {
    runFullDatabaseDiagnostic.mockRejectedValue(new Error('network'));
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();

    expect(w.find('[data-diag-error]').exists()).toBe(true);
    expect(w.find('[data-diag-running]').exists()).toBe(false);
  });
});

/**
 * The badge on the collapsed header.
 *
 * It says only what is known without asking the database anything. That is
 * the same discipline the report itself follows: this screen exists so a
 * misconfigured deployment can be diagnosed, and a chip that went green
 * because a client object had been constructed would say all-clear while the
 * database was unreachable — the exact failure the section is for.
 *
 * So "Configured" means the credentials look usable, and "Connected" is
 * claimed only once something has actually talked to the database.
 */
describe('the connection badge', () => {
  const badge = (w: any) => w.find('[data-section-badge]').text();

  it('says the credentials are missing, which explains every empty screen', () => {
    isConfigured.mockReturnValue(false);
    expect(badge(mountIt())).toBe('Not configured');
  });

  it('claims only "Configured" before anything has talked to the database', () => {
    expect(badge(mountIt())).toBe('Configured');
  });

  it('says Connected once a diagnostic has come back clean', async () => {
    runFullDatabaseDiagnostic.mockResolvedValue({ ...REPORT, success: true });
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();
    expect(badge(w)).toBe('Connected');
  });

  it('does not say Connected when the diagnostic found problems', async () => {
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();
    expect(badge(w)).toBe('Problems found');
  });

  it('is shown to a coach as well, who cannot run the diagnostic', () => {
    // A coach reaches /admin for the categories and the quiz bank. If the
    // database is unconfigured, that is why those are empty, and they should
    // be able to see it said even though the tools below are not theirs.
    isConfigured.mockReturnValue(false);
    expect(badge(mountIt({ isAdmin: false }))).toBe('Not configured');
  });
});

describe('the badge tone', () => {
  const tone = (w: any) => w.find('[data-section-badge]').classes();

  it('marks an unconfigured database as a problem, not a fact', () => {
    isConfigured.mockReturnValue(false);
    expect(tone(mountIt())).toContain('tag--warn');
  });

  it('marks a clean diagnostic as live', async () => {
    runFullDatabaseDiagnostic.mockResolvedValue({ ...REPORT, success: true });
    const w = mountIt();
    await w.find('[data-run-diagnostic]').trigger('click');
    await flush();
    expect(tone(w)).toContain('tag--live');
  });

  it('leaves "Configured" plain, because it is a fact and not an all-clear', () => {
    const cls = tone(mountIt());
    expect(cls).not.toContain('tag--live');
    expect(cls).not.toContain('tag--warn');
  });
});
