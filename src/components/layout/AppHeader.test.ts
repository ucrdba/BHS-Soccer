/**
 * The crest: who you are looking at, and who you are.
 *
 * Every word of the branding comes from the organization's row. The mark is
 * the organization's initial in a keyline; the switcher groups teams by
 * organization; the record appears only once the schedule has actually been
 * read for the active team.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import AppHeader from './AppHeader.vue';
import { useOrganizationStore } from '../../stores/organization';

const BHS = { id: 's1', name: 'Beaumont High School', mascot: 'Cougars', colors: {} };
const CLUB = { id: 's2', name: 'Legends FC', mascot: 'Lions', colors: {} };
const VARSITY = { id: 't1', school_id: 's1', name: 'Varsity', season: '2026' };
const JV = { id: 't2', school_id: 's1', name: 'JV', season: '2026' };
const U16 = { id: 't3', school_id: 's2', name: 'U16 Reds', season: '' };

function mountWith(opts: {
  schools?: any[]; teams?: any[]; activeTeamId?: string | null; auth?: Record<string, any>;
  matches?: any[]; loadedTeamId?: string | null;
} = {}) {
  return mount(AppHeader, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          organization: {
            schools: opts.schools ?? [BHS, CLUB],
            teams: opts.teams ?? [VARSITY, JV, U16],
            activeTeamId: opts.activeTeamId === undefined ? 't1' : opts.activeTeamId,
            loading: false, loadError: null
          },
          schedule: {
            matches: opts.matches ?? [],
            loading: false, loadError: null,
            loadedTeamId: opts.loadedTeamId === undefined ? null : opts.loadedTeamId
          },
          auth: {
            isCoach: false, isAdmin: false, canAccessRatings: false,
            isGuest: true, isSignedIn: false, isLoggedIn: false, role: 'guest', user: null,
            ...(opts.auth || {})
          }
        }
      })],
      stubs: { AuthModal: true }
    }
  });
}

describe('AppHeader', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('draws the organization\'s initial as the mark, and its name and mascot', () => {
    const w = mountWith();
    expect(w.find('[data-crest-mark]').text()).toBe('B');
    expect(w.find('[data-org-name]').text()).toBe('Beaumont High School');
    expect(w.find('[data-org-mascot]').text()).toBe('Cougars');
  });

  it('follows the active team to its organization', () => {
    const w = mountWith({ activeTeamId: 't3' });
    expect(w.find('[data-crest-mark]').text()).toBe('L');
    expect(w.find('[data-org-mascot]').text()).toBe('Lions');
  });

  it('draws no mark and no mascot before an organization has loaded', () => {
    // No fallback name: a visitor mid-load must not be told they are at
    // some other organization's team. The store's `school` falls back to
    // the first school, so seed none.
    const w = mountWith({ schools: [], teams: [], activeTeamId: null });
    expect(w.find('[data-crest-mark]').exists()).toBe(false);
    expect(w.find('[data-org-mascot]').exists()).toBe(false);
  });

  it('offers the switcher grouped by organization when there is more than one team', () => {
    const w = mountWith();
    const groups = w.findAll('[data-team-switcher] optgroup');
    expect(groups.map(g => g.attributes('label'))).toEqual(['Beaumont High School', 'Legends FC']);
    expect(w.findAll('[data-team-switcher] option').map(o => o.text()))
      .toEqual(['Varsity · 2026', 'JV · 2026', 'U16 Reds']);
    expect((w.find('[data-team-switcher]').element as HTMLSelectElement).value).toBe('t1');
  });

  it('switches the active team', async () => {
    const w = mountWith();
    await w.find('[data-team-switcher]').setValue('t3');
    // createTestingPinia stubs actions with spies; the hook returns that store.
    const org = useOrganizationStore();
    expect(org.setActiveTeam).toHaveBeenCalledWith('t3');
  });

  it('shows the one team as text when there is nothing to switch to', () => {
    const w = mountWith({ teams: [VARSITY] });
    expect(w.find('[data-team-switcher]').exists()).toBe(false);
    expect(w.find('[data-team-name]').text()).toBe('Varsity · 2026');
  });

  it('shows the record once the schedule has been read', () => {
    const w = mountWith({
      loadedTeamId: 't1',
      matches: [
        { status: 'COMPLETED', score: '3-1' },
        { status: 'COMPLETED', score: '1-1' },
        { status: 'COMPLETED', score: '0-2' },
        { status: 'SCHEDULED' }
      ]
    });
    // Vue condenses the whitespace between the spans, so compare without it.
    expect(w.find('[data-season-record]').text().replace(/\s+/g, '')).toBe('1W1L1D');
  });

  it('claims nothing about the season until the schedule has loaded', () => {
    expect(mountWith({ loadedTeamId: null }).find('[data-season-record]').exists()).toBe(false);
    expect(mountWith({ loadedTeamId: 't1', matches: [] }).find('[data-season-record]').exists()).toBe(false);
  });

  it('hides a record left over from the team the switcher just left', () => {
    const w = mountWith({
      activeTeamId: 't3',
      loadedTeamId: 't1',
      matches: [
        { status: 'COMPLETED', score: '3-1' },
        { status: 'COMPLETED', score: '1-1' },
        { status: 'COMPLETED', score: '0-2' }
      ]
    });
    expect(w.find('[data-season-record]').exists()).toBe(false);
  });

  it('offers a guest sign-in and a member sign-out with their role', () => {
    const guest = mountWith();
    expect(guest.find('[data-account-btn]').text()).toBe('Sign in');
    expect(guest.find('[data-role-badge]').exists()).toBe(false);

    const coach = mountWith({ auth: { isGuest: false, isSignedIn: true, isLoggedIn: true, role: 'coach', user: { name: 'Sam' } } });
    expect(coach.find('[data-account-btn]').text()).toBe('Sign out');
    expect(coach.find('[data-role-badge]').text()).toBe('COACH');
  });

  it('offers sign-out to a signed-in fan, who holds the guest role', async () => {
    const w = mountWith({ auth: { isGuest: true, isSignedIn: true, role: 'guest', user: { name: 'Fan' } } });
    expect(w.text()).toContain('Sign out');
  });

  it('names the record for assistive tech on a real group', () => {
    const w = mountWith({ loadedTeamId: 't1', matches: [{ status: 'COMPLETED', score: '2-0' }] });
    const record = w.find('[data-season-record]');
    expect(record.attributes('role')).toBe('group');
    expect(record.attributes('aria-label')).toBe('Season record');
  });

  it('opens registration from a sign-up link, then clears the address from the URL', async () => {
    // The address is often a minor's: it must not stay in the address bar or
    // the browser history.
    window.history.replaceState({}, '', '/roster?x=1#signup=kid%40example.com');
    const w = mountWith();
    await w.vm.$nextTick();
    const modal = w.findComponent({ name: 'AuthModal' });
    expect(modal.props('open')).toBe(true);
    expect(modal.props('initialTab')).toBe('register');
    expect(modal.props('initialEmail')).toBe('kid@example.com');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/roster?x=1');
    window.history.replaceState({}, '', '/');
  });

  it('opens the account modal when a password reset link was opened', async () => {
    const w = mountWith({ auth: { recovering: true, isSignedIn: true, isGuest: true, role: 'guest', user: { name: 'Fan' } } });
    await w.vm.$nextTick();
    expect(w.findComponent({ name: 'AuthModal' }).props('open')).toBe(true);
  });
});
