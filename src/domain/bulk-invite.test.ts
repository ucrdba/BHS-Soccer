/**
 * Inviting a whole squad from a pasted list.
 *
 * A coach has the addresses in a spreadsheet or an email, in whatever shape
 * that came in, so the reading is forgiving. What it does with each line is
 * not: every address is shown with the roster entry it matched and what will
 * happen, and a line it cannot place is named rather than guessed at. An
 * invitation is authorization to join a squad — a wrong match hands a
 * player's place to somebody else.
 */
import { describe, it, expect } from 'vitest';
import { parseInviteList, planBulkInvites, type PastedLine } from './bulk-invite';

const ROSTER = [
  { id: 'p1', name: 'Cesar Alva' },
  { id: 'p2', name: 'Tom Budde' },
  { id: 'p3', name: 'Alain Renteria' },
  { id: 'p4', name: 'Marco Diaz' },
  { id: 'p5', name: 'Marco Diaz' }      // two players of one name: a real squad
];

const plan = (text: string, over: Partial<{ linkedIds: string[]; invitations: any[] }> = {}) =>
  planBulkInvites({
    lines: parseInviteList(text),
    roster: ROSTER,
    linkedIds: over.linkedIds ?? [],
    invitations: over.invitations ?? []
  });

describe('reading the pasted list', () => {
  it('reads "address, name"', () => {
    expect(parseInviteList('cesar.alva@example.com, Cesar Alva'))
      .toEqual([{ line: 1, raw: 'cesar.alva@example.com, Cesar Alva', email: 'cesar.alva@example.com', name: 'Cesar Alva' }]);
  });

  it('reads "Name <address>"', () => {
    const [row] = parseInviteList('Tom Budde <tom.budde@example.com>');
    expect(row).toMatchObject({ email: 'tom.budde@example.com', name: 'Tom Budde' });
  });

  it('reads a bare address', () => {
    expect(parseInviteList('alain@example.com')[0]).toMatchObject({ email: 'alain@example.com', name: '' });
  });

  it('reads a tab-separated pair, as a spreadsheet pastes it', () => {
    expect(parseInviteList('Marco Diaz\tmarco@example.com')[0])
      .toMatchObject({ email: 'marco@example.com', name: 'Marco Diaz' });
  });

  it('keeps a surname-first name whole, comma and all', () => {
    expect(parseInviteList('alva@example.com, Alva, Cesar')[0])
      .toMatchObject({ email: 'alva@example.com', name: 'Alva, Cesar' });
  });

  it('lowercases the address and trims the name', () => {
    expect(parseInviteList('  Cesar.Alva@Example.COM ,  Cesar Alva  ')[0])
      .toMatchObject({ email: 'cesar.alva@example.com', name: 'Cesar Alva' });
  });

  it('skips blank lines and a header row, and numbers the lines it keeps', () => {
    const rows = parseInviteList('Email, Name\n\ncesar@example.com, Cesar Alva\n\ntom@example.com, Tom Budde');
    expect(rows.map(r => r.email)).toEqual(['cesar@example.com', 'tom@example.com']);
    expect(rows.map(r => r.line)).toEqual([3, 5]);
  });

  it('keeps a line with no address, so it can be reported rather than dropped', () => {
    expect(parseInviteList('Cesar Alva')[0]).toMatchObject({ email: '', name: 'Cesar Alva' });
  });

  it('reads nothing from nothing', () => {
    expect(parseInviteList('')).toEqual([]);
    expect(parseInviteList('   \n  ')).toEqual([]);
  });
});

describe('what each line will do', () => {
  it('invites an address whose name is on the roster', () => {
    expect(plan('cesar@example.com, Cesar Alva')[0])
      .toMatchObject({ outcome: 'invite', playerId: 'p1', playerName: 'Cesar Alva' });
  });

  it('matches a name however it is capitalised, spaced or punctuated', () => {
    expect(plan('a@example.com, cesar  ALVA')[0]).toMatchObject({ outcome: 'invite', playerId: 'p1' });
    expect(plan("b@example.com, O'Brien")[0]).toMatchObject({ outcome: 'no-match' });
  });

  it('matches a surname-first name', () => {
    expect(plan('a@example.com, Alva, Cesar')[0]).toMatchObject({ outcome: 'invite', playerId: 'p1' });
  });

  it('asks the coach to choose when the line has no name', () => {
    expect(plan('someone@example.com')[0]).toMatchObject({ outcome: 'choose', playerId: null });
  });

  it('names a line whose name is on nobody', () => {
    expect(plan('x@example.com, Nobody Here')[0]).toMatchObject({ outcome: 'no-match' });
  });

  it('refuses to guess between two players of the same name', () => {
    expect(plan('x@example.com, Marco Diaz')[0]).toMatchObject({ outcome: 'ambiguous', playerId: null });
  });

  it('skips a player who already has an account', () => {
    expect(plan('cesar@example.com, Cesar Alva', { linkedIds: ['p1'] })[0])
      .toMatchObject({ outcome: 'linked', playerId: 'p1' });
  });

  it('skips a roster entry that is already invited, leaving that invitation alone', () => {
    const invitations = [{ email: 'older@example.com', player_id: 'p1', role: 'player' }];
    expect(plan('cesar@example.com, Cesar Alva', { invitations })[0]).toMatchObject({ outcome: 'invited' });
  });

  it('skips an address that is already invited, whoever it was invited for', () => {
    const invitations = [{ email: 'cesar@example.com', player_id: 'p9', role: 'player' }];
    expect(plan('cesar@example.com, Cesar Alva', { invitations })[0]).toMatchObject({ outcome: 'invited' });
  });

  it('refuses something that is not an address', () => {
    expect(plan('Cesar Alva')[0]).toMatchObject({ outcome: 'bad-email' });
    expect(plan('cesar@, Cesar Alva')[0]).toMatchObject({ outcome: 'bad-email' });
  });

  it('keeps the first of a repeated address and marks the rest', () => {
    const rows = plan('cesar@example.com, Cesar Alva\ncesar@example.com, Tom Budde');
    expect(rows.map(r => r.outcome)).toEqual(['invite', 'duplicate']);
  });

  it('marks a second line for a player the list already invites', () => {
    const rows = plan('cesar@example.com, Cesar Alva\nsecond@example.com, Cesar Alva');
    expect(rows.map(r => r.outcome)).toEqual(['invite', 'duplicate']);
  });

  it('says what it will do in words a coach reads', () => {
    const rows = plan('x@example.com, Nobody Here');
    expect(rows[0].note).toBe('No player of that name on this squad.');
    expect(plan('cesar@example.com, Cesar Alva')[0].note).toBe('Will be invited as Cesar Alva.');
  });

  it('a coach\'s choice on a line with no name settles it', () => {
    const lines: PastedLine[] = parseInviteList('someone@example.com');
    const rows = planBulkInvites({ lines, roster: ROSTER, linkedIds: [], invitations: [], chosen: { 1: 'p3' } });
    expect(rows[0]).toMatchObject({ outcome: 'invite', playerId: 'p3', playerName: 'Alain Renteria' });
  });

  it('a choice cannot land on a player who already has an account', () => {
    const rows = planBulkInvites({
      lines: parseInviteList('someone@example.com'),
      roster: ROSTER, linkedIds: ['p3'], invitations: [], chosen: { 1: 'p3' }
    });
    expect(rows[0].outcome).toBe('linked');
  });
});

describe('the summary a coach reads before pressing send', () => {
  it('counts what will be sent and what will not', () => {
    const rows = plan([
      'cesar@example.com, Cesar Alva',
      'tom@example.com, Tom Budde',
      'x@example.com, Nobody Here',
      'cesar@example.com, Again'
    ].join('\n'));
    expect(rows.filter(r => r.outcome === 'invite')).toHaveLength(2);
    expect(rows.filter(r => r.outcome !== 'invite')).toHaveLength(2);
  });
});
