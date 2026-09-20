/**
 * The team quiz.
 *
 * Two rules carry this screen.
 *
 * It is marked against the STORED answers. The original version held
 * ['B','A','A','B','C'] in the view, so editing a question in the database
 * silently broke the marking -- a player answering correctly was told they
 * were wrong, and the attempt was recorded that way. A test here would fail
 * if a key came back.
 *
 * And an attempt names a person, so a signed-out visitor can read the
 * questions and cannot submit. A row attributed to somebody who does not
 * exist is worse than a lost attempt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import QuizView from './QuizView.vue';

const fetchTeamQuiz = vi.fn();
const saveQuizAttempt = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchTeamQuiz: (...a: any[]) => fetchTeamQuiz(...a),
    saveQuizAttempt: (...a: any[]) => saveQuizAttempt(...a)
  }
}));

const TEAM = 't1';

const QUESTIONS = [
  {
    question_id: 'q1', question: 'Where does the ball go?',
    answers: [
      { letter: 'A', answer_text: 'Wide', is_correct: false },
      { letter: 'B', answer_text: 'Through the lines', is_correct: true }
    ]
  },
  {
    question_id: 'q2', question: 'When do we press?',
    answers: [
      { letter: 'A', answer_text: 'On the trigger', is_correct: true },
      { letter: 'B', answer_text: 'Always', is_correct: false }
    ]
  }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountQuiz(
  opts: { questions?: any; guest?: boolean; rosterEntry?: string | null; role?: string } = {}
) {
  const { questions = QUESTIONS, guest = false, rosterEntry = 'p1', role = 'player' } = opts;
  fetchTeamQuiz.mockResolvedValue(questions);

  const w = mount(QuizView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: {
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: TEAM, name: 'U16', school_id: 's1' }],
            activeTeamId: TEAM
          },
          auth: {
            isGuest: guest,
            // id is the ACCOUNT; playerId is the roster entry an attempt is
            // recorded against. They are different ids, and the attempt takes
            // the roster one -- quiz_attempts.player_id points at players.
            user: guest ? null : { id: 'u1', name: 'Ana Ruiz', playerId: rosterEntry, role }
          }
        }
      })]
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const answer = async (w: any, qid: string, letter: string) => {
  await w.find(`[data-quiz-option="${qid}:${letter}"] input`).trigger('change');
  await w.vm.$nextTick();
};

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  saveQuizAttempt.mockResolvedValue({ attempt_id: 'a1' });
});

describe('the questions', () => {
  it('asks whatever the client returns for this team', async () => {
    // Including the active-thought filtering, which the client already does:
    // a question naming last week's message is not asked, and this view does
    // not invent it back.
    const w = await mountQuiz();
    expect(fetchTeamQuiz).toHaveBeenCalledWith(TEAM);
    expect(w.findAll('[data-quiz-question]')).toHaveLength(2);
  });

  it('shows every option', async () => {
    const w = await mountQuiz();
    expect(w.findAll('[data-quiz-option="q1:A"]')).toHaveLength(1);
    expect(w.findAll('[data-quiz-option="q1:B"]')).toHaveLength(1);
  });

  it('SAYS when a question has no options rather than rendering it silently', async () => {
    // Which is visible and fixable in the editor, unlike an unanswerable
    // question that just sits there.
    const w = await mountQuiz({
      questions: [{ question_id: 'q9', question: 'Half-written', answers: [] }]
    });
    expect(w.find('[data-quiz-no-options]').exists()).toBe(true);
  });

  it('says when nothing is being asked', async () => {
    const w = await mountQuiz({ questions: [] });
    expect(w.find('[data-quiz-empty]').exists()).toBe(true);
  });

  it('REPORTS a failed read rather than saying there are no questions', async () => {
    // Which would tell a player there is nothing to do when there is.
    const w = await mountQuiz({ questions: null });
    expect(w.find('[data-quiz-error]').exists()).toBe(true);
    expect(w.find('[data-quiz-empty]').exists()).toBe(false);
  });

  it('counts what has been answered', async () => {
    const w = await mountQuiz();
    expect(w.find('[data-quiz-progress]').text()).toContain('0 of 2');

    await answer(w, 'q1', 'B');
    expect(w.find('[data-quiz-progress]').text()).toContain('1 of 2');
  });
});

describe('A SIGNED-OUT VISITOR', () => {
  it('is told why signing in matters', async () => {
    const w = await mountQuiz({ guest: true });
    expect(w.find('[data-quiz-signin]').text()).toMatch(/recorded/i);
  });

  it('can read the questions', async () => {
    // Reading is not the problem; attributing an attempt is.
    const w = await mountQuiz({ guest: true });
    expect(w.findAll('[data-quiz-question]')).toHaveLength(2);
  });

  it('CANNOT submit', async () => {
    const w = await mountQuiz({ guest: true });
    expect((w.find('[data-quiz-submit]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('records nothing even if the control is reached', async () => {
    const w = await mountQuiz({ guest: true });
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();

    expect(saveQuizAttempt).not.toHaveBeenCalled();
  });
});

describe('MARKING AGAINST THE STORED ANSWERS', () => {
  it('marks a right answer right', async () => {
    const w = await mountQuiz();
    await answer(w, 'q1', 'B');
    await answer(w, 'q2', 'A');
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();

    expect(w.find('[data-quiz-score]').text()).toContain('2 of 2');
  });

  it('marks a wrong answer wrong', async () => {
    const w = await mountQuiz();
    await answer(w, 'q1', 'A');
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();

    expect(w.find('[data-quiz-score]').text()).toContain('0 of 2');
  });

  it('FOLLOWS THE DATA when the correct option changes', async () => {
    // The test that would fail if a key came back into the view. Same
    // question, same choice, opposite stored answer.
    const flipped = [{
      question_id: 'q1', question: 'Where does the ball go?',
      answers: [
        { letter: 'A', answer_text: 'Wide', is_correct: true },
        { letter: 'B', answer_text: 'Through the lines', is_correct: false }
      ]
    }];
    const w = await mountQuiz({ questions: flipped });
    await answer(w, 'q1', 'A');
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();

    expect(w.find('[data-quiz-score]').text()).toContain('1 of 1');
  });

  it('marks each question on screen', async () => {
    const w = await mountQuiz();
    await answer(w, 'q1', 'B');
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();

    expect(w.find('[data-quiz-mark="q1"]').text()).toMatch(/correct/i);
    expect(w.find('[data-quiz-mark="q2"]').text()).toMatch(/not this time/i);
  });
});

describe('recording the attempt', () => {
  it('sends the player, the answers, the score and the team', async () => {
    const w = await mountQuiz();
    await answer(w, 'q1', 'B');
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();

    const [player, answers, score, total, teamId] = saveQuizAttempt.mock.calls[0];
    // The roster entry, not the account: player_id points at players, so the
    // account's id was refused by the foreign key and every attempt was lost.
    expect(player).toEqual({ id: 'p1', name: 'Ana Ruiz' });
    expect(answers).toHaveLength(2);
    expect(score).toBe(1);
    expect(total).toBe(2);
    expect(teamId).toBe(TEAM);
  });

  it('says so when the attempt was not recorded', async () => {
    // The score is still shown -- it is real; only the record failed.
    saveQuizAttempt.mockResolvedValue(null);
    const w = await mountQuiz();
    await answer(w, 'q1', 'B');
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();

    expect(w.find('[data-quiz-notice]').text()).toMatch(/not recorded/i);
    expect(w.find('[data-quiz-score]').exists()).toBe(true);
  });

  it('offers another go rather than leaving the quiz spent', async () => {
    const w = await mountQuiz();
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();

    expect(w.find('[data-quiz-again]').exists()).toBe(true);
  });
});

describe('an account with no roster entry', () => {
  // A coach, or a player whose account is not linked yet. quiz_attempts names
  // a roster entry, so there is nothing to record the score against -- and
  // saying "not recorded" would read as a fault rather than as the reason.
  it('tells a player their coach can link it, which is true for them', async () => {
    const w = await mountQuiz({ rosterEntry: null, role: 'player' });
    await answer(w, 'q1', 'B');
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();
    const said = w.find('[data-quiz-notice]').text();
    expect(said).toMatch(/not linked to a roster entry/i);
    expect(said).toMatch(/coach can link/i);
  });

  it('tells a coach or an admin the reason without advice they cannot take', async () => {
    // Nobody links a coach to a roster entry: they are not on the squad.
    for (const role of ['coach', 'admin']) {
      const w = await mountQuiz({ rosterEntry: null, role });
      await answer(w, 'q1', 'B');
      await w.find('[data-quiz-submit]').trigger('click');
      await flush();
      const said = w.find('[data-quiz-notice]').text();
      expect(said).toMatch(/coaches and admins have no roster entry/i);
      expect(said).not.toMatch(/coach can link/i);
      expect(w.find('[data-quiz-score]').exists()).toBe(true);
      w.unmount();
    }
  });

  it('is marked all the same, and nothing is sent', async () => {
    const w = await mountQuiz({ rosterEntry: null });
    await answer(w, 'q1', 'B');
    await w.find('[data-quiz-submit]').trigger('click');
    await flush();
    expect(w.find('[data-quiz-score]').exists()).toBe(true);
    expect(saveQuizAttempt).not.toHaveBeenCalled();
  });
});
