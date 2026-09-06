/**
 * Marking a quiz.
 *
 * The first block is the reason this module exists. The original
 * submitQuizAnswer hardcoded ['B','A','A','B','C'] in the view, so editing a
 * question in the database silently broke the marking -- a player answering
 * correctly was told they were wrong, and the attempt was recorded that way.
 * The correct answer comes from the stored row, and nothing here holds a key.
 *
 * The second thing worth reading twice: a question with no stored correct
 * answer marks NOTHING right. Defaulting to A would quietly award or deny a
 * point on a question nobody has finished writing.
 */
import { describe, it, expect } from 'vitest';
import { correctLetter, markQuiz, answerText } from './quiz';

const q = (over: any = {}) => ({
  question_id: 'q1',
  question: 'Where does the ball go?',
  answers: [
    { letter: 'A', text: 'Wide', isCorrect: false },
    { letter: 'B', text: 'Through the lines', isCorrect: true },
    { letter: 'C', text: 'Back', isCorrect: false }
  ],
  ...over
});

describe('which answer is correct', () => {
  it('comes from the row flagged correct', () => {
    // Not from a constant. That is the whole point.
    expect(correctLetter(q())).toBe('B');
  });

  it('reads the snake_case flag the database returns', () => {
    expect(correctLetter(q({
      answers: [
        { letter: 'A', answer_text: 'Wide', is_correct: false },
        { letter: 'C', answer_text: 'Back', is_correct: true }
      ]
    }))).toBe('C');
  });

  it('falls back to correct_option when the options are still columns', () => {
    // A question written before quiz_answers existed.
    expect(correctLetter(q({ answers: [], correct_option: 'D' }))).toBe('D');
  });

  it('prefers the flagged row over correct_option', () => {
    // The rows are the newer shape; a stale column must not win.
    expect(correctLetter(q({ correct_option: 'A' }))).toBe('B');
  });

  it('is NULL when nothing is stored as correct', () => {
    // A half-written question, rather than an implicit A.
    expect(correctLetter(q({ answers: [], correct_option: null }))).toBeNull();
    expect(correctLetter(q({
      answers: [{ letter: 'A', text: 'Wide' }, { letter: 'B', text: 'Back' }]
    }))).toBeNull();
  });

  it('normalises the case, since a stored letter may be lower', () => {
    expect(correctLetter(q({ answers: [], correct_option: 'b' }))).toBe('B');
  });
});

describe('marking', () => {
  const three = [
    q({ question_id: 'q1' }),
    q({ question_id: 'q2', answers: [{ letter: 'A', text: 'Yes', isCorrect: true }] }),
    q({ question_id: 'q3', answers: [{ letter: 'C', text: 'Maybe', isCorrect: true }] })
  ];

  it('counts the right answers', () => {
    const out = markQuiz(three, { q1: 'B', q2: 'A', q3: 'A' });
    expect(out.score).toBe(2);
    expect(out.total).toBe(3);
  });

  it('reports a percentage', () => {
    expect(markQuiz(three, { q1: 'B', q2: 'A', q3: 'C' }).percentage).toBe(100);
    expect(markQuiz(three, { q1: 'B' }).percentage).toBe(33);
  });

  it('RECORDS an unanswered question rather than dropping it', () => {
    // The attempt should show what was skipped, not a shorter quiz.
    const out = markQuiz(three, { q1: 'B' });

    expect(out.answers).toHaveLength(3);
    expect(out.answers[1]).toMatchObject({ questionId: 'q2', selectedOption: null, isCorrect: false });
  });

  it('marks NOTHING right on a question with no stored answer', () => {
    // Not even the option the player picked.
    const broken = [q({ question_id: 'qx', answers: [], correct_option: null })];
    const out = markQuiz(broken, { qx: 'A' });

    expect(out.score).toBe(0);
    expect(out.answers[0].isCorrect).toBe(false);
  });

  it('carries the question id and the choice, which is what is stored', () => {
    const out = markQuiz(three, { q1: 'B' });
    expect(out.answers[0]).toEqual({ questionId: 'q1', selectedOption: 'B', isCorrect: true });
  });

  it('accepts a lower-case selection', () => {
    expect(markQuiz(three, { q1: 'b' }).score).toBe(1);
  });

  it('does not divide by zero for a quiz with no questions', () => {
    const out = markQuiz([], {});
    expect(out).toMatchObject({ score: 0, total: 0, percentage: 0 });
  });

  it('copes with no selections at all', () => {
    const out = markQuiz(three, {});
    expect(out.score).toBe(0);
    expect(out.answers).toHaveLength(3);
  });
});

describe('reading an option', () => {
  it('handles both shapes the client returns', () => {
    expect(answerText({ letter: 'A', text: 'Wide' })).toBe('Wide');
    expect(answerText({ letter: 'A', answer_text: 'Wide' })).toBe('Wide');
  });

  it('gives an empty string rather than undefined', () => {
    expect(answerText({ letter: 'A' })).toBe('');
  });
});
