/**
 * Marking a quiz.
 *
 * **The correct answer comes from the database, never from a key in the
 * code.** The original `submitQuizAnswer` hardcoded `['B','A','A','B','C']`
 * in the view, so editing a question silently broke the marking — a player
 * answering correctly was told they were wrong, and the attempt was recorded
 * that way. Nothing here holds an answer.
 *
 * The letter comes from the `quiz_answers` row flagged `is_correct` (0019),
 * falling back to `correct_option` for a question whose options are still
 * columns.
 *
 * Extracted from public/js/views/planner.view.js during Phase 6.
 */
export interface QuizAnswer {
  letter: string;
  text?: string;
  answer_text?: string;
  isCorrect?: boolean;
  is_correct?: boolean;
}

export interface QuizQuestion {
  question_id: string;
  question?: string;
  answers?: QuizAnswer[];
  correct_option?: string | null;
  thought_id?: string | null;
  category?: string | null;
}

export interface MarkedAnswer {
  questionId: string;
  selectedOption: string | null;
  isCorrect: boolean;
}

export interface QuizResult {
  score: number;
  total: number;
  percentage: number;
  answers: MarkedAnswer[];
}

const isRight = (a: QuizAnswer): boolean => !!a?.isCorrect || !!a?.is_correct;

/**
 * Which letter is correct, or null.
 *
 * Null when nothing is stored as correct. A broken question then marks
 * nothing right, rather than defaulting to A and quietly awarding or denying
 * a point on a question nobody has finished writing.
 */
export function correctLetter(q: QuizQuestion): string | null {
  const flagged = (q?.answers || []).find(isRight);
  if (flagged?.letter) return String(flagged.letter).toUpperCase();

  const stored = q?.correct_option;
  return stored ? String(stored).toUpperCase() : null;
}

/** The text of one option, whichever shape it arrived in. */
export function answerText(a: QuizAnswer): string {
  return String(a?.text ?? a?.answer_text ?? '');
}

/**
 * Mark a set of selections.
 *
 * An unanswered question is wrong but still recorded, so the attempt shows
 * what was skipped rather than silently shortening the quiz.
 */
export function markQuiz(
  questions: QuizQuestion[], chosen: Record<string, string>
): QuizResult {
  const list = questions || [];
  const picks = chosen || {};

  const answers: MarkedAnswer[] = list.map(q => {
    const selected = picks[q.question_id] || null;
    const right = correctLetter(q);
    return {
      questionId: q.question_id,
      selectedOption: selected,
      // No stored answer means nothing is right, not that everything is.
      isCorrect: !!selected && !!right && selected.toUpperCase() === right
    };
  });

  const score = answers.filter(a => a.isCorrect).length;
  const total = list.length;

  return {
    score,
    total,
    percentage: total > 0 ? Math.round((score / total) * 100) : 0,
    answers
  };
}
