/**
 * Resolving the organization from the active team.
 *
 * The failure this guards against is silent: showing one organization's name
 * and colours over another's roster looks like data corruption rather than a
 * scoping bug. It matters because a player can be on a school team and a club
 * team at once, and the two have different branding.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const BHS = { id: 's1', name: 'Beaumont High School', mascot: 'Cougars', colors: { primary: '#0047AB', secondary: '#FFD700' } };
const CLUB = { id: 's2', name: 'Legends FC', mascot: 'Lions', colors: { primary: '#123456', secondary: '#abcdef' } };

const VARSITY = { id: 't1', name: 'Varsity', school_id: 's1' };
const U16 = { id: 't2', name: 'U16', school_id: 's2' };

const fetchSchools = vi.fn();
const fetchTeamsForViewer = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchSchools: () => fetchSchools(),
    fetchTeamsForViewer: () => fetchTeamsForViewer()
  }
}));

// Imported after the mock so the store picks it up.
const { useOrganizationStore } = await import('./organization');

describe('the organization store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    fetchSchools.mockResolvedValue([BHS, CLUB]);
    fetchTeamsForViewer.mockResolvedValue([VARSITY, U16]);
  });

  it('resolves the organization from the active team, not a school code', async () => {
    localStorage.setItem('bhs_active_team_id', 't2');
    const store = useOrganizationStore();
    await store.load();

    expect(store.activeTeamId).toBe('t2');
    expect(store.school.name).toBe('Legends FC');
  });

  it('gives the club its own branding, not the school\'s', async () => {
    localStorage.setItem('bhs_active_team_id', 't2');
    const store = useOrganizationStore();
    await store.load();

    expect(store.branding).toEqual({
      name: 'Legends FC', mascot: 'Lions',
      primary: '#123456', secondary: '#abcdef', logoUrl: ''
    });
  });

  it('honours a stored team only while the viewer still has access', async () => {
    // A coach removed from a team must not keep seeing it because
    // localStorage remembers.
    localStorage.setItem('bhs_active_team_id', 'gone');
    const store = useOrganizationStore();
    await store.load();

    expect(store.activeTeamId).toBe('t1');
  });

  it('falls back to the first school when the team names none', async () => {
    fetchTeamsForViewer.mockResolvedValue([{ id: 't9', name: 'Orphan' }]);
    const store = useOrganizationStore();
    await store.load();

    expect(store.school.name).toBe('Beaumont High School');
  });

  it('does not invent a name when nothing has loaded', () => {
    const store = useOrganizationStore();
    expect(store.school).toBeNull();
    expect(store.branding.name).toBe('');
  });

  it('records an error rather than throwing when the load fails', async () => {
    fetchSchools.mockRejectedValue(new Error('offline'));
    const store = useOrganizationStore();
    await store.load();

    expect(store.loadError).toBe('offline');
    expect(store.loading).toBe(false);
  });

  it('remembers a team switch for next time', async () => {
    const store = useOrganizationStore();
    await store.load();
    store.setActiveTeam('t2');

    expect(localStorage.getItem('bhs_active_team_id')).toBe('t2');
    expect(store.school.name).toBe('Legends FC');
  });

  it('paints the organization colours onto the document', async () => {
    localStorage.setItem('bhs_active_team_id', 't2');
    const store = useOrganizationStore();
    await store.load();
    await Promise.resolve();

    expect(document.documentElement.style.getPropertyValue('--org-primary'))
      .toBe('#123456');
    expect(document.documentElement.style.getPropertyValue('--org-secondary'))
      .toBe('#abcdef');
  });

  it('PUTS THE ORGANIZATION IN THE BROWSER TAB', async () => {
    // index.html ships a neutral title because the document is static and the
    // organization is not known until the teams load. Leaving it there means
    // a club coach's tab never says their club.
    localStorage.setItem('bhs_active_team_id', 't2');
    const store = useOrganizationStore();
    await store.load();
    await Promise.resolve();

    expect(document.title).toBe('Legends FC');
  });
});
