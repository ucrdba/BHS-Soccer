/**
 * The quiz form and its marking, now built from data.
 *
 * The dangerous part of this change is the marking. It used to compare against
 * a key written into planner.view.js -- ['B','A','A','B','C'] -- so editing a
 * question in the database would have marked players against the old answer
 * with nothing erroring. These execute the real script and check what a player
 * is actually shown and scored.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import plannerSrc from '../../public/js/views/planner.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, plannerSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const Q1 = '11111111-1111-1111-1111-111111111111';
const Q2 = '22222222-2222-2222-2222-222222222222';

// Options arrive as rows now (0019), attached by fetchTeamQuiz as `answers`.
const opts = (texts: string[], correct: string) =>
  texts.map((text, i) => {
    const letter = String.fromCharCode(65 + i);
    return { letter, text, isCorrect: letter === correct };
  });

const QUESTIONS = [
  {
    question_id: Q1, question: 'Primary tactical objective?',
    correct_option: 'B', explanation: 'Pressing wins the ball high up the pitch.',
    answers: opts(['Low block', 'High press', 'Dribble', 'Long balls'], 'B')
  },
  {
    question_id: Q2, question: 'Possession under pressure?',
    correct_option: 'A', explanation: null,
    answers: opts(['Simple quick pass', 'Hold it', 'Kick it out', 'Stop'], 'A')
  }
];

let savedAttempt: any;

function makeApp(questions = QUESTIONS): any {
  const app = Object.create(ctor.prototype);
  app.data = { quizQuestions: questions, quizAttempts: [], dailyThoughts: [] };
  app.activeTeamId = TEAM;
  app.saveData = vi.fn();
  // The modal renders the day's message above the questions, so it needs a
  // real one rather than null.
  app.getActiveThought = () => ({ coachName: 'Coach B', text: 'Press high today.', isActive: true });
  app.renderQuizLeaderboardHTML = () => '';
  return app;
}

function quizDom() {
  document.body.innerHTML = `
    <div id="quizModalContent"></div>
    <div id="takeQuizModal"></div>
    <div id="quizScoreResult"></div>`;
}

beforeEach(() => {
  savedAttempt = null;
  quizDom();
  (globalThis as any).window = globalThis as any;
  (window as any).auth = {
    getCurrentUser: () => ({ id: 'player-1', name: 'Kai Nakamura', role: 'player' }),
    isCoach: () => false, isAdmin: () => false, isLoggedIn: () => true
  };
  (window as any).supabaseService = {
    isConfigured: () => true,
    saveQuizAttempt: async (...args: any[]) => { savedAttempt = args; return { attempt_id: 'a1' }; }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('rendering the form', () => {
  it('renders one block per question, from the data', () => {
    makeApp().openTakeQuizModal('quiz');
    const html = document.getElementById('quizModalContent')!.innerHTML;
    expect(html).toContain('Primary tactical objective?');
    expect(html).toContain('Possession under pressure?');
  });

  it('names each radio group by the question uuid', () => {
    // Was name="q1".."q5", which cannot survive a variable question set.
    makeApp().openTakeQuizModal('quiz');
    expect(document.querySelectorAll(`input[name="quiz_${Q1}"]`).length).toBe(4);
  });

  it('never reveals which option is correct in the markup', () => {
    // A player reading the page source must not be handed the answer key.
    makeApp().openTakeQuizModal('quiz');
    const html = document.getElementById('quizModalContent')!.innerHTML;
    expect(html).not.toContain('correct_option');
    expect(html).not.toContain('Pressing wins the ball high');
  });

  it('escapes a question containing markup instead of rendering it', () => {
    const app = makeApp([{ ...QUESTIONS[0], question: 'Is 1 < 2 <script>bad()</script>?' }]);
    app.openTakeQuizModal('quiz');
    const html = document.getElementById('quizModalContent')!.innerHTML;
    expect(html).not.toContain('<script>bad()');
    expect(document.querySelectorAll('script').length).toBe(0);
  });

  it('says so plainly when the team has no questions', () => {
    makeApp([]).openTakeQuizModal('quiz');
    const html = document.getElementById('quizModalContent')!.innerHTML;
    expect(html).toContain('No quiz questions for this team yet');
    // and offers no submit button to press
    expect(html).not.toContain('Submit &amp; Grade Quiz');
  });
});

describe('marking', () => {
  const answer = (qid: string, letter: string) => {
    const el = document.querySelector(`input[name="quiz_${qid}"][value="${letter}"]`) as HTMLInputElement;
    el.checked = true;
  };

  it('marks against the stored correct_option, not a key in the code', async () => {
    const app = makeApp();
    app.openTakeQuizModal('quiz');
    answer(Q1, 'B');   // correct
    answer(Q2, 'A');   // correct
    await app.submitQuizAnswer();
    expect(savedAttempt[2]).toBe(2);          // score
    expect(savedAttempt[3]).toBe(2);          // out of
  });

  it('follows a changed answer key rather than the old hardcoded one', async () => {
    // The old code always treated 'B' as right for question one. If the coach
    // edits the question so 'C' is right, marking must follow.
    const app = makeApp([{
      ...QUESTIONS[0], correct_option: 'C',
      answers: opts(['Low block', 'High press', 'Dribble', 'Long balls'], 'C')
    }]);
    app.openTakeQuizModal('quiz');
    answer(Q1, 'B');
    await app.submitQuizAnswer();
    expect(savedAttempt[2]).toBe(0);
  });

  it('scores out of however many questions the team has', async () => {
    // Was hardcoded to 5, so a 2-question quiz would have reported 2/5.
    const app = makeApp();
    app.openTakeQuizModal('quiz');
    answer(Q1, 'B'); answer(Q2, 'A');
    await app.submitQuizAnswer();
    expect(savedAttempt[3]).toBe(2);
    expect(document.getElementById('quizScoreResult')!.innerHTML).toContain('2 / 2');
  });

  it('sends the real question uuid with each answer', async () => {
    const app = makeApp();
    app.openTakeQuizModal('quiz');
    answer(Q1, 'B'); answer(Q2, 'C');
    await app.submitQuizAnswer();
    expect(savedAttempt[1].map((a: any) => a.questionId)).toEqual([Q1, Q2]);
  });

  it('sends the team the attempt belongs to', async () => {
    const app = makeApp();
    app.openTakeQuizModal('quiz');
    answer(Q1, 'B'); answer(Q2, 'A');
    await app.submitQuizAnswer();
    expect(savedAttempt[4]).toBe(TEAM);
  });

  it('counts an unanswered question as wrong rather than throwing', async () => {
    const app = makeApp();
    app.openTakeQuizModal('quiz');
    answer(Q1, 'B');   // Q2 left blank
    await app.submitQuizAnswer();
    expect(savedAttempt[2]).toBe(1);
    expect(savedAttempt[1][1].selectedOption).toBeNull();
  });
});

describe('after marking', () => {
  const answer = (qid: string, letter: string) => {
    (document.querySelector(`input[name="quiz_${qid}"][value="${letter}"]`) as HTMLInputElement).checked = true;
  };

  it('shows the explanation for a question that was missed', async () => {
    // Nothing displayed explanations before, though the column has always
    // existed and the coach's CSV has them written.
    const app = makeApp();
    app.openTakeQuizModal('quiz');
    answer(Q1, 'A');   // wrong
    answer(Q2, 'A');
    await app.submitQuizAnswer();
    expect(document.getElementById('quizScoreResult')!.innerHTML)
      .toContain('Pressing wins the ball high up the pitch.');
  });

  it('does not explain a question the player got right', async () => {
    const app = makeApp();
    app.openTakeQuizModal('quiz');
    answer(Q1, 'B');   // right
    answer(Q2, 'A');
    await app.submitQuizAnswer();
    expect(document.getElementById('quizScoreResult')!.innerHTML)
      .not.toContain('Pressing wins the ball high');
  });

  it('calls a full score perfect at whatever length the quiz is', async () => {
    // Was `score === 5`, so a 2-question quiz could never read as perfect.
    const app = makeApp();
    app.openTakeQuizModal('quiz');
    answer(Q1, 'B'); answer(Q2, 'A');
    await app.submitQuizAnswer();
    expect(document.getElementById('quizScoreResult')!.innerHTML).toContain('PERFECT SCORE');
  });
});
