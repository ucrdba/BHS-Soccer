/**
 * Coaching Staff.
 *
 * The approval queue is the part with teeth: it lets somebody into the
 * application. A visitor must not see it, and must not have its controls in
 * the document — hidden is a CSS property, and RLS is the real enforcement,
 * but neither substitutes for the other.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import CoachesView from './CoachesView.vue';
import { toCoach } from '../domain/coach-row';

const coach = (over: any = {}) => toCoach({
  id: 'c1', school_id: 's1', name: 'Head Person', level: 'Head Coach',
  phone: '', address: '', email: 'head@club.test', photo_url: null,
  bio: 'Twenty years on the touchline.', ...over
});

const STAFF = [
  coach(),
  coach({ id: 'c2', name: 'Assistant Person', level: 'Assistant Coach', email: '' })
];

const PENDING = [
  { id: 'u1', name: 'New Player', email: 'player@club.test', role: 'player' }
];

function mountCoaches(opts: {
  coaches?: any[]; pending?: any[]; canEdit?: boolean;
  loading?: boolean; loadedSchoolId?: string | null; loadError?: string | null;
} = {}) {
  const {
    coaches = STAFF, pending = [], canEdit = false,
    loading = false, loadedSchoolId = 's1', loadError = null
  } = opts;

  return mount(CoachesView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: {
          coaches: { coaches, pending, loading, loadError, loadedSchoolId },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          auth: {
            isCoach: canEdit, isAdmin: false,
            isGuest: !canEdit, canAccessRatings: canEdit
          }
        }
      })],
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
    }
  });
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the staff list', () => {
  it('renders each coach with their role', () => {
    const w = mountCoaches();
    expect(w.findAll('[data-coach]')).toHaveLength(2);
    expect(w.text()).toContain('Head Person');
    expect(w.text()).toContain('Head Coach');
  });

  it('shows a bio and a contact link when there is one', () => {
    const w = mountCoaches();
    expect(w.text()).toContain('Twenty years on the touchline.');
    expect(w.find('a[href="mailto:head@club.test"]').exists()).toBe(true);
  });

  it('names the organization, with no hardcoded name', () => {
    const w = mountCoaches();
    expect(w.text()).toContain('Legends FC');
    expect(w.text()).not.toMatch(/beaumont|cougars/i);
  });

  it('says the staff is empty only once it has loaded', () => {
    expect(mountCoaches({ coaches: [], loading: true, loadedSchoolId: null })
      .find('[data-empty]').exists()).toBe(false);
    expect(mountCoaches({ coaches: [], loadedSchoolId: 's1' })
      .find('[data-empty]').exists()).toBe(true);
  });

  it('surfaces a load failure', () => {
    expect(mountCoaches({ loadError: 'offline' }).find('[data-load-error]').text())
      .toContain('offline');
  });
});

describe('what a visitor may do', () => {
  it('sees no add, edit or remove control', () => {
    const w = mountCoaches({ canEdit: false });
    expect(w.find('[data-add-coach]').exists()).toBe(false);
    expect(w.find('[data-coach-edit]').exists()).toBe(false);
    expect(w.find('[data-coach-remove]').exists()).toBe(false);
  });

  it('does not see the approval queue at all, even if it has entries', () => {
    // This queue lets somebody into the application.
    const w = mountCoaches({ canEdit: false, pending: PENDING });
    expect(w.find('[data-pending-queue]').exists()).toBe(false);
    expect(w.find('[data-pending-review]').exists()).toBe(false);
    expect(w.text()).not.toContain('player@club.test');
  });
});

describe('what a coach may do', () => {
  it('sees add, edit and remove', () => {
    const w = mountCoaches({ canEdit: true });
    expect(w.find('[data-add-coach]').exists()).toBe(true);
    expect(w.findAll('[data-coach-edit]')).toHaveLength(2);
  });

  it('opens an empty form to add', async () => {
    const w = mountCoaches({ canEdit: true });
    await w.find('[data-add-coach]').trigger('click');
    expect((w.find('[data-field="name"]').element as HTMLInputElement).value).toBe('');
  });

  it('opens the form filled in to edit', async () => {
    const w = mountCoaches({ canEdit: true });
    await w.findAll('[data-coach-edit]')[0].trigger('click');
    expect((w.find('[data-field="name"]').element as HTMLInputElement).value)
      .toBe('Head Person');
  });

  it('requires a name and a role in the markup', async () => {
    // Both columns are NOT NULL, and upsertCoach would substitute 'Coach' and
    // 'Staff' for blanks rather than refusing.
    const w = mountCoaches({ canEdit: true });
    await w.find('[data-add-coach]').trigger('click');
    expect(w.find('[data-field="name"]').attributes('required')).toBeDefined();
    expect(w.find('[data-field="level"]').attributes('required')).toBeDefined();
  });

  it('offers no organization picker', async () => {
    // A coach belongs to the organization being looked at. The legacy form
    // offered a dropdown of every school, which invites filing them wrongly.
    const w = mountCoaches({ canEdit: true });
    await w.find('[data-add-coach]').trigger('click');
    expect(w.find('[data-field="schoolCode"]').exists()).toBe(false);
    expect(w.findAll('select')).toHaveLength(0);
  });

  it('asks before removing', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountCoaches({ canEdit: true });
    await w.findAll('[data-coach-remove]')[0].trigger('click');
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Head Person'));
    confirmSpy.mockRestore();
  });
});

describe('the approval queue', () => {
  it('says how many are waiting and links to the admin panel', () => {
    const w = mountCoaches({ canEdit: true, pending: PENDING });
    expect(w.find('[data-pending-queue]').exists()).toBe(true);
    expect(w.find('[data-pending-review]').exists()).toBe(true);
    expect(w.find('[data-pending-count]').text()).toBe('1 account is waiting for approval.');
  });

  it('is absent when nobody is waiting', () => {
    const w = mountCoaches({ canEdit: true, pending: [] });
    expect(w.find('[data-pending-queue]').exists()).toBe(false);
    expect(w.find('[data-pending-review]').exists()).toBe(false);
  });
});
