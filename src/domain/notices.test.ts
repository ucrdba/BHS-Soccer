/**
 * Failures, said where somebody will read them.
 *
 * The data layer returns `null` on a failure and writes the reason to the
 * console. A coach never opens the console, so a roster that will not load
 * is a blank screen and no explanation. This is the channel that carries the
 * failure to the screen instead.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  describeFailure, describeDetail, reportFailure, currentNotices,
  dismissNotice, clearNotices, subscribeToNotices, resetNotices,
  reportConnection, currentConnection, subscribeToConnection, explainCondition
} from './notices';

beforeEach(() => { resetNotices(); });

describe('what a coach reads', () => {
  it('says what did not happen, not which function failed', () => {
    expect(describeFailure('fetchTeamRoster')).toBe('The roster could not be loaded.');
    expect(describeFailure('saveFullPracticePlan')).toBe('The practice plan could not be saved.');
    expect(describeFailure('deleteMatrixSession')).toBe('That Matrix session could not be removed.');
    expect(describeFailure('renameSoccerCategory')).toBe('That drill category could not be changed.');
  });

  /*
   * Ninety-nine methods report failures. A table of ninety-nine sentences
   * drifts the first time one is renamed, so the verb picks the phrasing and
   * the rest of the name is the subject -- and a method nobody listed still
   * reads as English.
   */
  it('phrases a method it has never been told about', () => {
    expect(describeFailure('fetchTrainingBlocks'))
      .toBe('The training blocks could not be loaded.');
    expect(describeFailure('deleteFixtureNote'))
      .toBe('The fixture note could not be removed.');
  });

  it('treats an unrecognised verb as a write, which is the answer that matters', () => {
    // Wrongly saying "could not be loaded" about a failed write tells a coach
    // their change is safe when it was lost.
    expect(describeFailure('publishSquadSheet')).toMatch(/could not be saved\.$/);
  });

  it('opens with a capital, wherever the sentence came from', () => {
    expect(describeFailure('fetchPlayers')[0]).toBe('T');
    expect(describeFailure('init')[0]).toBe('T');
  });

  it('takes a whole sentence for the names no rule reaches', () => {
    // `init` is not a save, and the auth methods put their subject in the verb.
    expect(describeFailure('init')).toBe('The app could not connect to the database.');
    expect(describeFailure('signIn')).toBe('You could not be signed in.');
  });

  it('never leaves a method name in front of a coach', () => {
    const methods = [
      'fetchTeamRoster', 'upsertDrillBankItem', 'init', 'signOut',
      'fetchAllTeams', 'setActiveDailyThought', 'retagDrills'
    ];
    methods.forEach(m => {
      expect(describeFailure(m)).not.toContain(m);
      expect(describeFailure(m)).not.toMatch(/[a-z][A-Z]/);
    });
  });
});

describe('the technical detail', () => {
  it('takes a string, an Error or a Postgres error object', () => {
    expect(describeDetail('column x does not exist')).toBe('column x does not exist');
    expect(describeDetail(new Error('boom'))).toBe('boom');
    expect(describeDetail({ message: '42703' })).toBe('42703');
  });

  it('is nothing when there is nothing to say', () => {
    expect(describeDetail(null)).toBeNull();
    expect(describeDetail(undefined)).toBeNull();
    expect(describeDetail('   ')).toBeNull();
  });

  it('caps a runaway payload rather than putting a wall on screen', () => {
    const detail = describeDetail('x'.repeat(5000))!;
    expect(detail.length).toBeLessThan(500);
    expect(detail.endsWith('…')).toBe(true);
  });
});

describe('reporting a failure', () => {
  it('carries the sentence, the detail and the method that failed', () => {
    reportFailure('fetchTeamRoster', 'permission denied for table team_players');
    const [n] = currentNotices();

    expect(n.message).toBe('The roster could not be loaded.');
    expect(n.detail).toBe('permission denied for table team_players');
    // Kept so a coach can say which one, and so a developer can grep for it.
    expect(n.method).toBe('fetchTeamRoster');
  });

  /*
   * A store retrying against a connection that is still down reports the same
   * failure over and over. Twenty identical boxes say nothing that one box
   * does not.
   */
  it('folds a repeat into a count rather than stacking it', () => {
    reportFailure('fetchTeamRoster', 'timeout');
    reportFailure('fetchTeamRoster', 'timeout');
    reportFailure('fetchTeamRoster', 'timeout');

    expect(currentNotices()).toHaveLength(1);
    expect(currentNotices()[0].count).toBe(3);
  });

  it('keeps a different failure separate, even from the same method', () => {
    reportFailure('fetchTeamRoster', 'timeout');
    reportFailure('fetchTeamRoster', 'permission denied');

    expect(currentNotices()).toHaveLength(2);
  });

  it('caps what it holds, so a dead connection cannot grow without bound', () => {
    for (let i = 0; i < 40; i += 1) reportFailure('fetchTeamRoster', `attempt ${i}`);
    expect(currentNotices().length).toBeLessThanOrEqual(12);
    // The newest survive: the oldest failure is the least useful one.
    expect(currentNotices().slice(-1)[0].detail).toBe('attempt 39');
  });
});

describe('reading the channel', () => {
  it('tells a reader what is already there, so a late reader is not empty', () => {
    // The app mounts after the first fetches have run.
    reportFailure('fetchSchedule', 'timeout');

    const seen = vi.fn();
    subscribeToNotices(seen);

    expect(seen).toHaveBeenCalledWith([expect.objectContaining({ method: 'fetchSchedule' })]);
  });

  it('tells every reader about each new failure', () => {
    const seen = vi.fn();
    subscribeToNotices(seen);
    seen.mockClear();

    reportFailure('fetchSchedule', 'timeout');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('stops telling a reader that has gone', () => {
    const seen = vi.fn();
    const off = subscribeToNotices(seen);
    off();
    seen.mockClear();

    reportFailure('fetchSchedule', 'timeout');
    expect(seen).not.toHaveBeenCalled();
  });

  it('keeps reporting when one reader throws', () => {
    // An unmounting component that throws must not silence the channel for
    // everything else on the page.
    const bad = vi.fn(() => { throw new Error('nope'); });
    const good = vi.fn();
    subscribeToNotices(bad);
    subscribeToNotices(good);
    good.mockClear();

    expect(() => reportFailure('fetchSchedule', 'timeout')).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('hands out a copy, so a reader cannot edit the record', () => {
    reportFailure('fetchSchedule', 'timeout');
    currentNotices().length = 0;
    expect(currentNotices()).toHaveLength(1);
  });
});

describe('dismissing', () => {
  it('drops the one dismissed and tells the readers', () => {
    reportFailure('fetchSchedule', 'a');
    reportFailure('fetchPlayers', 'b');
    const seen = vi.fn();
    subscribeToNotices(seen);
    seen.mockClear();

    dismissNotice(currentNotices()[0].id);

    expect(currentNotices().map(n => n.method)).toEqual(['fetchPlayers']);
    expect(seen).toHaveBeenCalled();
  });

  it('says nothing when there was nothing to dismiss', () => {
    reportFailure('fetchSchedule', 'a');
    const seen = vi.fn();
    subscribeToNotices(seen);
    seen.mockClear();

    dismissNotice(9999);
    expect(seen).not.toHaveBeenCalled();
  });

  it('clears the lot', () => {
    reportFailure('fetchSchedule', 'a');
    reportFailure('fetchPlayers', 'b');
    clearNotices();
    expect(currentNotices()).toHaveLength(0);
  });
});

describe('the connection', () => {
  /*
   * A state, not an event. A hundred and seven service methods return null
   * without a word when the client is unconfigured, so an app with no
   * credentials loads empty and reports nothing -- which is the usual cause
   * of "nothing loaded from the DB". One failure per method would be a
   * hundred boxes saying the same thing.
   */
  it('assumes it is working, so no banner flashes during startup', () => {
    expect(currentConnection().configured).toBe(true);
  });

  it('carries why, for whoever can fix it', () => {
    reportConnection(false, 'Needs a .supabase.co URL. Got: (no URL).');
    expect(currentConnection()).toEqual({
      configured: false,
      reason: 'Needs a .supabase.co URL. Got: (no URL).'
    });
  });

  it('clears the reason once it connects', () => {
    reportConnection(false, 'no key');
    reportConnection(true);
    expect(currentConnection()).toEqual({ configured: true, reason: null });
  });

  it('tells a reader the state it is already in', () => {
    // The client is built at module-evaluation time, long before the app
    // mounts, so a reader that only heard changes would never hear this one.
    reportConnection(false, 'no key');

    const seen = vi.fn();
    subscribeToConnection(seen);
    expect(seen).toHaveBeenCalledWith({ configured: false, reason: 'no key' });
  });

  it('tells its readers when it goes down and when it comes back', () => {
    const seen = vi.fn();
    subscribeToConnection(seen);
    seen.mockClear();

    reportConnection(false, 'no key');
    reportConnection(true);

    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenLastCalledWith({ configured: true, reason: null });
  });

  it('says nothing when nothing changed', () => {
    // setCredentials re-runs the client builder, which reports either way.
    // Re-rendering the same banner on every attempt would be noise.
    reportConnection(false, 'no key');
    const seen = vi.fn();
    subscribeToConnection(seen);
    seen.mockClear();

    reportConnection(false, 'no key');
    expect(seen).not.toHaveBeenCalled();
  });

  it('stops telling a reader that has gone', () => {
    const seen = vi.fn();
    const off = subscribeToConnection(seen);
    off();
    seen.mockClear();

    reportConnection(false, 'no key');
    expect(seen).not.toHaveBeenCalled();
  });

  it('hands out a copy, so a reader cannot edit the state', () => {
    reportConnection(false, 'no key');
    const c = currentConnection();
    c.configured = true;
    expect(currentConnection().configured).toBe(false);
  });

  it('keeps reporting when one reader throws', () => {
    const bad = vi.fn(() => { throw new Error('nope'); });
    const good = vi.fn();
    subscribeToConnection(bad);
    subscribeToConnection(good);
    good.mockClear();

    expect(() => reportConnection(false, 'no key')).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});

describe('what a database failure means', () => {
  it('names the refusal a coach will actually hit, rather than the policy', () => {
    const n = reportFailure('openStatMatch',
      'new row violates row-level security policy for table "stat_matches"');
    expect(n.message).toBe('The match record could not be loaded.');
    expect(n.meaning).toMatch(/does not have rights over that team/i);
    // The raw text survives: it is what gets forwarded.
    expect(n.detail).toContain('row-level security policy');
  });

  it('reads a database that is behind its migrations, both ways it says so', () => {
    expect(explainCondition('column soccer_categories.school_id does not exist'))
      .toMatch(/missing a column/i);
    expect(explainCondition('there is no unique or exclusion constraint matching the ON CONFLICT specification'))
      .toMatch(/missing an index/i);
  });

  it('translates the other conditions worth acting on', () => {
    expect(explainCondition('duplicate key value violates unique constraint')).toMatch(/already there/i);
    expect(explainCondition('violates foreign key constraint')).toMatch(/no longer there/i);
    expect(explainCondition('null value in column "id" violates not-null constraint')).toMatch(/left empty/i);
    expect(explainCondition('JWT expired')).toMatch(/sign in again/i);
  });

  // A guess would be worse than silence: the box already says what failed.
  it('says nothing about a failure it does not recognise', () => {
    expect(explainCondition('connection terminated unexpectedly')).toBeNull();
    expect(reportFailure('fetchTeamRoster', 'connection terminated unexpectedly').meaning).toBeNull();
    expect(reportFailure('fetchTeamRoster').meaning).toBeNull();
  });
});
