/**
 * Inviting the squad from one pasted list.
 *
 * Two promises. Nothing is sent until the coach has seen what each line would
 * do -- an invitation is a place on a squad, and a wrong match gives one
 * player's place to another. And only the lines it could place are sent: a
 * line it could not is reported and left, rather than guessed at or silently
 * dropped.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BulkInviteModal from './BulkInviteModal.vue';

const fetchTeamRoster = vi.fn();
const fetchLinkedPlayerIds = vi.fn();
const fetchTeamInvitations = vi.fn();
const createInvitation = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchTeamRoster: (...a: any[]) => fetchTeamRoster(...a),
    fetchLinkedPlayerIds: (...a: any[]) => fetchLinkedPlayerIds(...a),
    fetchTeamInvitations: (...a: any[]) => fetchTeamInvitations(...a),
    createInvitation: (...a: any[]) => createInvitation(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';

const ROSTER = [
  { players: { id: 'p1', name: 'Cesar Alva' } },
  { players: { id: 'p2', name: 'Tom Budde' } },
  { players: { id: 'p3', name: 'Alain Renteria' } }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountBulk(opts: { linked?: string[]; invitations?: any[] } = {}) {
  fetchTeamRoster.mockResolvedValue(ROSTER);
  fetchLinkedPlayerIds.mockResolvedValue(opts.linked ?? []);
  fetchTeamInvitations.mockResolvedValue(opts.invitations ?? []);

  const w = mount(BulkInviteModal, { props: { open: true, teamId: TEAM }, attachTo: document.body });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const paste = async (w: any, text: string) => {
  await w.find('[data-bulk-text]').setValue(text);
  await w.find('[data-bulk-preview]').trigger('click');
  await flush();
};

const rows = (w: any) => w.findAll('[data-bulk-row]');
const outcomes = (w: any) => rows(w).map((r: any) => r.attributes('data-bulk-outcome'));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  createInvitation.mockResolvedValue({ ok: true, data: { id: 'i1' } });
});

describe('before anything is sent', () => {
  it('sends nothing on the first press: it shows what each line would do', async () => {
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva\ntom@example.com, Tom Budde');
    expect(createInvitation).not.toHaveBeenCalled();
    expect(outcomes(w)).toEqual(['invite', 'invite']);
  });

  it('says which roster entry each address matched', async () => {
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva');
    expect(rows(w)[0].text()).toContain('Cesar Alva');
    expect(rows(w)[0].text()).toContain('cesar@example.com');
  });

  it('reports a line it cannot place rather than dropping it', async () => {
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva\nx@example.com, Nobody Here\nnot-an-address');
    expect(outcomes(w)).toEqual(['invite', 'no-match', 'bad-email']);
    expect(w.find('[data-bulk-row][data-bulk-outcome="no-match"]').text())
      .toContain('No player of that name');
  });

  it('skips a player who already has an account, and one already invited', async () => {
    const w = await mountBulk({
      linked: ['p1'],
      invitations: [{ email: 'older@example.com', player_id: 'p2', role: 'player' }]
    });
    await paste(w, 'cesar@example.com, Cesar Alva\ntom@example.com, Tom Budde');
    expect(outcomes(w)).toEqual(['linked', 'invited']);
  });

  it('counts what will be sent', async () => {
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva\nx@example.com, Nobody Here');
    expect(w.find('[data-bulk-count]').text()).toContain('1');
  });

  it('lets the coach place an address that came with no name', async () => {
    const w = await mountBulk();
    await paste(w, 'someone@example.com');
    expect(outcomes(w)).toEqual(['choose']);

    await w.find('[data-bulk-choose]').setValue('p3');
    await flush();
    expect(outcomes(w)).toEqual(['invite']);
    expect(rows(w)[0].text()).toContain('Alain Renteria');
  });

  it('offers only roster entries with no account to choose from', async () => {
    const w = await mountBulk({ linked: ['p1'] });
    await paste(w, 'someone@example.com');
    const offered = w.find('[data-bulk-choose]').findAll('option').map((o: any) => o.text());
    expect(offered).not.toContain('Cesar Alva');
    expect(offered).toContain('Tom Budde');
  });

  it('says so when the list is empty rather than showing an empty table', async () => {
    const w = await mountBulk();
    await paste(w, '   ');
    expect(w.find('[data-bulk-empty]').exists()).toBe(true);
    expect(rows(w)).toHaveLength(0);
  });
});

describe('sending', () => {
  it('invites each placed address, against its own roster entry', async () => {
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva\ntom@example.com, Tom Budde');
    await w.find('[data-bulk-send]').trigger('click');
    await flush();

    expect(createInvitation.mock.calls).toEqual([
      ['cesar@example.com', TEAM, 'player', 'p1'],
      ['tom@example.com', TEAM, 'player', 'p2']
    ]);
  });

  it('sends nothing for a line it could not place', async () => {
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva\nx@example.com, Nobody Here');
    await w.find('[data-bulk-send]').trigger('click');
    await flush();
    expect(createInvitation).toHaveBeenCalledTimes(1);
  });

  it('reports how many went, and how many were skipped', async () => {
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva\nx@example.com, Nobody Here');
    await w.find('[data-bulk-send]').trigger('click');
    await flush();
    const said = w.find('[data-bulk-result]').text();
    expect(said).toContain('1');
    expect(said).toMatch(/invited/i);
  });

  it('hands back the database\'s own words when it refuses one', async () => {
    createInvitation.mockResolvedValueOnce({ ok: false, error: 'Only a coach of this team can invite a player.' });
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva');
    await w.find('[data-bulk-send]').trigger('click');
    await flush();
    expect(w.find('[data-bulk-result]').text()).toContain('Only a coach of this team can invite a player.');
  });

  it('offers nothing to send when no line could be placed', async () => {
    const w = await mountBulk();
    await paste(w, 'x@example.com, Nobody Here');
    expect(w.find('[data-bulk-send]').attributes('disabled')).toBeDefined();
  });

  it('tells the squad what to do next, since no email is sent from here', async () => {
    const w = await mountBulk();
    await paste(w, 'cesar@example.com, Cesar Alva');
    await w.find('[data-bulk-send]').trigger('click');
    await flush();
    expect(w.find('[data-bulk-result]').text()).toMatch(/register/i);
  });

  it('says so when the team could not be read, rather than inviting into the dark', async () => {
    fetchTeamRoster.mockResolvedValue(null);
    fetchLinkedPlayerIds.mockResolvedValue([]);
    fetchTeamInvitations.mockResolvedValue([]);
    const w = mount(BulkInviteModal, { props: { open: true, teamId: TEAM }, attachTo: document.body });
    await flush();
    expect(w.find('[data-bulk-error]').exists()).toBe(true);
  });
});
