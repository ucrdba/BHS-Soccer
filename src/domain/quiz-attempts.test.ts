/**
 * Who has taken the quiz.
 *
 * Every player on the roster is listed, including the ones who have not taken
 * it — that is what a coach opens this to see, the same bargain the squad
 * report makes. A player's latest attempt is the one shown, because the quiz
 * is about the message currently up, and how many times they have taken it
 * sits beside it rather than being hidden.
 */
import { describe, it, expect } from 'vitest';
import { quizAttemptRows, quizTakenCount } from './quiz-attempts';

const ROSTER = [
  { id: 'p1', name: 'Cesar Alva' },
  { id: 'p2', name: 'Tom Budde' },
  { id: 'p3', name: 'Alain Renteria' }
];

const attempt = (over: any = {}) => ({
  attempt_id: 'a' + Math.random(), player_id: 'p1', player_name: 'Cesar Alva',
  score: 4, total_questions: 5, completed_at: '2026-09-18T18:00:00Z', ...over
});

describe('a row per player', () => {
  it('lists every player on the roster, in name order', () => {
    expect(quizAttemptRows(ROSTER, []).map(r => r.playerName))
      .toEqual(['Alain Renteria', 'Cesar Alva', 'Tom Budde']);
  });

  it('KEEPS a player who has never taken it, with nothing rather than a zero', () => {
    // Who has not taken it is the reading a coach came for.
    const row = quizAttemptRows(ROSTER, [])[0];
    expect(row).toMatchObject({ times: 0, score: null, total: null, percentage: null, lastTakenOn: null });
  });

  it('shows the latest attempt, not the first', () => {
    const rows = quizAttemptRows(ROSTER, [
      attempt({ score: 2, completed_at: '2026-09-01T18:00:00Z' }),
      attempt({ score: 5, completed_at: '2026-09-18T18:00:00Z' })
    ]);
    expect(rows.find(r => r.playerId === 'p1')).toMatchObject({ score: 5, times: 2 });
  });

  it('counts every attempt behind the latest one', () => {
    const rows = quizAttemptRows(ROSTER, [attempt(), attempt(), attempt()]);
    expect(rows.find(r => r.playerId === 'p1')!.times).toBe(3);
  });

  it('works the percentage out from the score', () => {
    const rows = quizAttemptRows(ROSTER, [attempt({ score: 4, total_questions: 5 })]);
    expect(rows.find(r => r.playerId === 'p1')!.percentage).toBe(80);
  });

  it('rounds a percentage rather than printing a fraction', () => {
    const rows = quizAttemptRows(ROSTER, [attempt({ score: 2, total_questions: 3 })]);
    expect(rows.find(r => r.playerId === 'p1')!.percentage).toBe(67);
  });

  it('has no percentage for an attempt at no questions', () => {
    const rows = quizAttemptRows(ROSTER, [attempt({ score: 0, total_questions: 0 })]);
    expect(rows.find(r => r.playerId === 'p1')!.percentage).toBeNull();
  });

  it('dates the latest attempt by when it was finished', () => {
    const rows = quizAttemptRows(ROSTER, [attempt({ completed_at: '2026-09-18T18:00:00Z' })]);
    expect(rows.find(r => r.playerId === 'p1')!.lastTakenOn).toBe('2026-09-18T18:00:00Z');
  });

  it('falls back to when it was started, for an attempt never finished', () => {
    const rows = quizAttemptRows(ROSTER, [
      attempt({ completed_at: null, started_at: '2026-09-17T18:00:00Z' })
    ]);
    expect(rows.find(r => r.playerId === 'p1')!.lastTakenOn).toBe('2026-09-17T18:00:00Z');
  });

  it('ignores an attempt by somebody no longer on this roster', () => {
    // A player who left still has attempts; the squad in front of the coach
    // is the roster as it is now.
    const rows = quizAttemptRows(ROSTER, [attempt({ player_id: 'gone', player_name: 'Departed' })]);
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.times === 0)).toBe(true);
  });

  it('survives an empty roster and a missing list', () => {
    expect(quizAttemptRows([], [attempt()])).toEqual([]);
    expect(quizAttemptRows(ROSTER, null as any)).toHaveLength(3);
  });
});

describe('the line above the table', () => {
  it('counts how many of the squad have taken it', () => {
    const rows = quizAttemptRows(ROSTER, [attempt(), attempt({ player_id: 'p2', player_name: 'Tom Budde' })]);
    expect(quizTakenCount(rows)).toEqual({ taken: 2, of: 3 });
  });

  it('counts nobody when nobody has', () => {
    expect(quizTakenCount(quizAttemptRows(ROSTER, []))).toEqual({ taken: 0, of: 3 });
  });
});
