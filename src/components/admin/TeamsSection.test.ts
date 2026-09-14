/**
 * Squads and organizations.
 *
 * The assertions that matter are about what is NOT defaulted. Creating a team
 * asks which organization it belongs to, and creating an organization asks
 * whether it is a school or a club and what its mascot is -- because a squad
 * filed under the wrong organization is invisible until somebody notices the
 * roster is somebody else's, and schools.mascot is NOT NULL with no default
 * and renders in every page heading.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TeamsSection from './TeamsSection.vue';

const fetchAllTeams = vi.fn();
const fetchTeamCoaches = vi.fn();
const fetchAssignableCoaches = vi.fn();
const createSchool = vi.fn();
const createTeam = vi.fn();
const assignCoachToTeam = vi.fn();
const removeCoachFromTeam = vi.fn();
const updateTeam = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchAllTeams: (...a: any[]) => fetchAllTeams(...a),
    fetchTeamCoaches: (...a: any[]) => fetchTeamCoaches(...a),
    fetchAssignableCoaches: (...a: any[]) => fetchAssignableCoaches(...a),
    createSchool: (...a: any[]) => createSchool(...a),
    createTeam: (...a: any[]) => createTeam(...a),
    assignCoachToTeam: (...a: any[]) => assignCoachToTeam(...a),
    removeCoachFromTeam: (...a: any[]) => removeCoachFromTeam(...a),
    updateTeam: (...a: any[]) => updateTeam(...a)
  }
}));

const TEAMS = [
  { id: 't1', school_id: 's1', name: 'Varsity', season: '2026', match_minutes: 80, school_name: 'Beaumont High', school_kind: 'school' },
  { id: 't2', school_id: 's2', name: 'U16', season: '2026', match_minutes: null, school_name: 'Legends FC', school_kind: 'club' }
];

const COACHES = [
  { team_id: 't1', profile_id: 'c1', profiles: { name: 'Coach Bob', email: 'bob@example.com' } }
];

const ASSIGNABLE = [
  { id: 'c1', name: 'Coach Bob', email: 'bob@example.com', role: 'coach' },
  { id: 'c2', name: 'Ana Ruiz', email: 'ana@example.com', role: 'coach' }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountTeams() {
  const w = mount(TeamsSection, {
    attachTo: document.body,
    global: { stubs: { InviteControl: true } }
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchAllTeams.mockResolvedValue(TEAMS);
  fetchTeamCoaches.mockResolvedValue(COACHES);
  fetchAssignableCoaches.mockResolvedValue(ASSIGNABLE);
  createSchool.mockResolvedValue({ ok: true, id: 's3' });
  createTeam.mockResolvedValue({ ok: true, id: 't3' });
  assignCoachToTeam.mockResolvedValue({ ok: true });
  removeCoachFromTeam.mockResolvedValue({ ok: true });
  updateTeam.mockResolvedValue({ ok: true });
});

describe('the list', () => {
  it('shows every team ACROSS organizations', async () => {
    // fetchAllTeams exists because the organization store holds only the
    // teams the viewer belongs to.
    const w = await mountTeams();
    expect(w.findAll('[data-team-row]')).toHaveLength(2);
  });

  it('names each team\'s organization and kind', async () => {
    // The school/club distinction is what the multi-tenant model rests on.
    const w = await mountTeams();
    const row = w.findAll('[data-team-row]')[1];

    expect(row.find('[data-team-org]').text()).toBe('Legends FC');
    expect(row.find('[data-team-kind]').text()).toBe('club');
  });

  it('shows who coaches each team', async () => {
    const w = await mountTeams();
    expect(w.find('[data-team-coach]').text()).toContain('Coach Bob');
  });

  it('says when a team has no coach', async () => {
    const w = await mountTeams();
    expect(w.findAll('[data-team-row]')[1].text()).toMatch(/no coach/i);
  });

  it('reports a failed read rather than showing no squads', async () => {
    fetchAllTeams.mockResolvedValue(null);
    const w = await mountTeams();

    expect(w.find('[data-teams-error]').exists()).toBe(true);
    expect(w.find('[data-team-row]').exists()).toBe(false);
  });

  it('offers a coach invitation on every team', async () => {
    const w = await mountTeams();
    expect(w.findAll('[data-team-invite]')).toHaveLength(w.findAll('[data-team-row]').length);
  });

  it('does not mount the invite control before its disclosure is opened', async () => {
    const w = await mountTeams();
    expect(w.findAllComponents({ name: 'InviteControl' })).toHaveLength(0);
  });

  it('mounts the invite control for a team once its disclosure is opened', async () => {
    const w = await mountTeams();
    const details = w.find('[data-team-invite]');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');

    expect(w.findAllComponents({ name: 'InviteControl' })).toHaveLength(1);
  });
});

describe('creating an organization', () => {
  it('sends the name, code, kind and mascot', async () => {
    const w = await mountTeams();
    await w.find('[data-org-name]').setValue('Redlands United');
    await w.find('[data-org-code]').setValue('rlu');
    await w.find('[data-org-mascot]').setValue('Terriers');
    await w.find('[data-org-kind]').setValue('club');
    await w.find('[data-new-org]').trigger('submit');
    await flush();

    expect(createSchool).toHaveBeenCalledWith('rlu', 'Redlands United', 'club', 'Terriers');
  });

  it('ASKS for a mascot rather than defaulting one', async () => {
    // schools.mascot is NOT NULL with no default and renders in every page
    // heading; defaulting it ships an organization branded with a placeholder
    // nobody remembers to correct.
    const w = await mountTeams();
    expect(w.find('[data-org-mascot]').exists()).toBe(true);
  });

  it('ASKS whether it is a school or a club', async () => {
    const w = await mountTeams();
    const kinds = w.find('[data-org-kind]').findAll('option').map((o: any) => o.attributes('value'));
    expect(kinds).toEqual(['school', 'club']);
  });

  it('reports the database\'s refusal', async () => {
    createSchool.mockResolvedValue({ ok: false, error: 'The code "rlu" is already in use.' });
    const w = await mountTeams();
    await w.find('[data-org-name]').setValue('Redlands United');
    await w.find('[data-new-org]').trigger('submit');
    await flush();

    expect(w.find('[data-teams-form-error]').text()).toMatch(/already in use/i);
  });
});

describe('creating a team', () => {
  it('REFUSES without an organization rather than defaulting one', async () => {
    // A squad filed under the wrong organization is invisible until somebody
    // notices the roster is somebody else's.
    const w = await mountTeams();
    await w.find('[data-team-name-input]').setValue('JV');
    await w.find('[data-new-team]').trigger('submit');
    await flush();

    expect(createTeam).not.toHaveBeenCalled();
    expect(w.find('[data-teams-form-error]').text()).toMatch(/pick the organization/i);
  });

  it('offers every organization that has a team', async () => {
    const w = await mountTeams();
    // Two organizations plus the empty prompt.
    expect(w.find('[data-team-org-pick]').findAll('option')).toHaveLength(3);
  });

  it('sends the organization, the name and the season', async () => {
    const w = await mountTeams();
    await w.find('[data-team-org-pick]').setValue('s2');
    await w.find('[data-team-name-input]').setValue('U14');
    await w.find('[data-team-season]').setValue('2026');
    await w.find('[data-new-team]').trigger('submit');
    await flush();

    expect(createTeam).toHaveBeenCalledWith('s2', 'U14', '2026');
  });

  it('re-reads afterwards, so the new team appears', async () => {
    const w = await mountTeams();
    await w.find('[data-team-org-pick]').setValue('s2');
    await w.find('[data-team-name-input]').setValue('U14');
    await w.find('[data-new-team]').trigger('submit');
    await flush();

    expect(fetchAllTeams).toHaveBeenCalledTimes(2);
  });
});

describe('assigning a coach', () => {
  it('sends the team and the coach', async () => {
    const w = await mountTeams();
    await w.find('[data-team-coach-pick="t2"]').setValue('c2');
    await w.find('[data-team-assign="t2"]').trigger('click');
    await flush();

    expect(assignCoachToTeam).toHaveBeenCalledWith('t2', 'c2');
  });

  it('refuses with nobody picked', async () => {
    const w = await mountTeams();
    await w.find('[data-team-assign="t2"]').trigger('click');
    await flush();

    expect(assignCoachToTeam).not.toHaveBeenCalled();
    expect(w.find('[data-teams-form-error]').text()).toMatch(/pick a coach/i);
  });
});

describe('removing a coach', () => {
  it('NAMES the coach and the team, and says what they keep', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountTeams();
    await w.find('[data-team-coach-remove="c1"]').trigger('click');

    const asked = confirmSpy.mock.calls[0][0];
    expect(asked).toContain('Coach Bob');
    expect(asked).toContain('Varsity');
    expect(asked).toMatch(/keep their account/i);
    expect(removeCoachFromTeam).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('removes once confirmed and re-reads', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountTeams();
    await w.find('[data-team-coach-remove="c1"]').trigger('click');
    await flush();

    expect(removeCoachFromTeam).toHaveBeenCalledWith('t1', 'c1');
    expect(fetchAllTeams).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });
});

describe('editing a team', () => {
  const openEditor = async (w: any, index = 0) => {
    await w.findAll('[data-team-edit]')[index].trigger('click');
    await w.vm.$nextTick();
    return w.findAll('[data-team-row]')[index];
  };

  it('opens with what the team says now', async () => {
    const w = await mountTeams();
    const row = await openEditor(w);

    expect((row.find('[data-team-edit-name]').element as HTMLInputElement).value).toBe('Varsity');
    expect((row.find('[data-team-edit-season]').element as HTMLInputElement).value).toBe('2026');
    expect((row.find('[data-team-edit-minutes]').element as HTMLInputElement).value).toBe('80');
  });

  // Null means nobody has said, and the app falls back to 80. An editor that
  // showed 80 here would write it back as though someone had chosen it.
  it('leaves an unstated match length blank rather than showing the fallback', async () => {
    const w = await mountTeams();
    const row = await openEditor(w, 1);
    expect((row.find('[data-team-edit-minutes]').element as HTMLInputElement).value).toBe('');
  });

  it('saves the fields as the service names them', async () => {
    const w = await mountTeams();
    const row = await openEditor(w);

    await row.find('[data-team-edit-name]').setValue('Varsity Boys');
    await row.find('[data-team-edit-season]').setValue('2027');
    await row.find('[data-team-edit-minutes]').setValue('70');
    await row.find('[data-team-edit-save]').trigger('click');
    await flush();

    expect(updateTeam).toHaveBeenCalledWith('t1', { name: 'Varsity Boys', season: '2027', matchMinutes: 70 });
    expect(fetchAllTeams).toHaveBeenCalledTimes(2);
  });

  it('sends null for a match length cleared, not the fallback', async () => {
    const w = await mountTeams();
    const row = await openEditor(w);

    await row.find('[data-team-edit-minutes]').setValue('');
    await row.find('[data-team-edit-save]').trigger('click');
    await flush();

    expect(updateTeam.mock.calls[0][1].matchMinutes).toBeNull();
  });

  it('refuses an empty name before it asks the database', async () => {
    const w = await mountTeams();
    const row = await openEditor(w);

    await row.find('[data-team-edit-name]').setValue('   ');
    await row.find('[data-team-edit-save]').trigger('click');
    await flush();

    expect(updateTeam).not.toHaveBeenCalled();
    expect(w.find('[data-teams-form-error]').text()).toMatch(/name/i);
  });

  // 0034's check refuses these too; catching them here makes it a sentence
  // rather than a constraint violation.
  it('refuses a match length that is not a whole number above zero', async () => {
    const w = await mountTeams();

    for (const bad of ['0', '-5', '45.5']) {
      const row = await openEditor(w);
      await row.find('[data-team-edit-minutes]').setValue(bad);
      await row.find('[data-team-edit-save]').trigger('click');
      await flush();

      expect(updateTeam, bad).not.toHaveBeenCalled();
      expect(w.find('[data-teams-form-error]').text()).toMatch(/minutes/i);
    }
  });

  it('says what the database said when it refuses', async () => {
    updateTeam.mockResolvedValue({ ok: false, error: 'There is already a team called "JV" in that organization.' });
    const w = await mountTeams();
    const row = await openEditor(w);

    await row.find('[data-team-edit-name]').setValue('JV');
    await row.find('[data-team-edit-save]').trigger('click');
    await flush();

    expect(w.find('[data-teams-form-error]').text()).toContain('already a team called');
  });

  it('closes without saving on cancel', async () => {
    const w = await mountTeams();
    const row = await openEditor(w);

    await row.find('[data-team-edit-name]').setValue('Something else');
    await row.find('[data-team-edit-cancel]').trigger('click');
    await w.vm.$nextTick();

    expect(updateTeam).not.toHaveBeenCalled();
    expect(w.find('[data-team-edit-name]').exists()).toBe(false);
    expect(w.findAll('[data-team-row]')[0].find('[data-team-name]').text()).toBe('Varsity');
  });

  it('edits one team at a time', async () => {
    const w = await mountTeams();
    await openEditor(w, 0);
    await openEditor(w, 1);

    expect(w.findAll('[data-team-edit-name]')).toHaveLength(1);
  });
});
