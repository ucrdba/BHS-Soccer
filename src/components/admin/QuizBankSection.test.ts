/**
 * The question bank.
 *
 * Two assertions carry this file.
 *
 * A question NO SQUAD ASKS is shown and marked. fetchTeamQuiz returns what one
 * squad is asked right now, so a question nobody has switched on appears in
 * no quiz at all -- this is the only place a coach can find it.
 *
 * And which option is correct is EXPLICIT rather than positional: the coach
 * marks a letter, and that letter is what gets written as correct. A form
 * that assumed "the first one" would silently mark the wrong answer on any
 * question whose options were reordered.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import QuizBankSection from './QuizBankSection.vue';

const fetchQuizBank = vi.fn();
const upsertQuizQuestion = vi.fn();
const retireQuizQuestion = vi.fn();
const setTeamQuizQuestion = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchQuizBank: (...a: any[]) => fetchQuizBank(...a),
    upsertQuizQuestion: (...a: any[]) => upsertQuizQuestion(...a),
    retireQuizQuestion: (...a: any[]) => retireQuizQuestion(...a),
    setTeamQuizQuestion: (...a: any[]) => setTeamQuizQuestion(...a)
  }
}));

const SCHOOL = '11111111-2222-3333-4444-555555555555';
const TEAMS = [{ id: 't1', name: 'Varsity' }, { id: 't2', name: 'JV' }];

const BANK = [
  {
    question_id: 'q1', question: 'Where does the ball go?',
    teamIds: ['t1'], thought_id: null,
    answers: [
      { letter: 'A', answer_text: 'Wide', is_correct: false },
      { letter: 'B', answer_text: 'Through the lines', is_correct: true }
    ]
  },
  {
    // Nobody asks this one, and it names a daily message.
    question_id: 'q2', question: 'What is the pressing trigger?',
    teamIds: [], thought_id: 'd1',
    answers: [{ letter: 'A', answer_text: 'A back pass', is_correct: true }]
  }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountBank(opts: { bank?: any; schoolId?: string | null } = {}) {
  const { bank = BANK, schoolId = SCHOOL } = opts;
  fetchQuizBank.mockResolvedValue(bank);

  const w = mount(QuizBankSection, {
    props: { schoolId, teams: TEAMS },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  upsertQuizQuestion.mockResolvedValue({ ok: true, id: 'q3' });
  retireQuizQuestion.mockResolvedValue({ ok: true });
  setTeamQuizQuestion.mockResolvedValue({ ok: true });
});

describe('the bank', () => {
  it('reads it for the ORGANIZATION', async () => {
    await mountBank();
    expect(fetchQuizBank).toHaveBeenCalledWith(SCHOOL);
  });

  it('lists every question', async () => {
    const w = await mountBank();
    expect(w.findAll('[data-bank-row]')).toHaveLength(2);
  });

  it('SHOWS a question no squad asks, and marks it', async () => {
    // fetchTeamQuiz returns what one squad is asked, so this is the only
    // place such a question is visible at all.
    const w = await mountBank();
    expect(w.findAll('[data-bank-unused]')).toHaveLength(1);
  });

  it('names the squads that do ask a question', async () => {
    const w = await mountBank();
    expect(w.find('[data-bank-team]').text()).toBe('Varsity');
  });

  it('says when a question is tied to a daily message', async () => {
    // The likeliest reason a question a coach wrote is not appearing.
    const w = await mountBank();
    expect(w.find('[data-bank-thought]').text()).toMatch(/daily message/i);
  });

  it('reports a failed read rather than an empty bank', async () => {
    const w = await mountBank({ bank: null });
    expect(w.find('[data-bank-error]').exists()).toBe(true);
    expect(w.find('[data-bank-empty]').exists()).toBe(false);
  });

  it('says so without an organization rather than reading bare', async () => {
    const w = await mountBank({ schoolId: null });
    expect(fetchQuizBank).not.toHaveBeenCalled();
    expect(w.find('[data-bank-error]').text()).toMatch(/organization/i);
  });
});

describe('switching a question on and off per squad', () => {
  it('switches it ON for a squad that does not ask it', async () => {
    const w = await mountBank();
    await w.find('[data-bank-team-pick="q1"]').setValue('t2');
    await flush();

    expect(setTeamQuizQuestion).toHaveBeenCalledWith('t2', 'q1', true);
  });

  it('switches it OFF for a squad that does', async () => {
    const w = await mountBank();
    await w.find('[data-bank-team-pick="q1"]').setValue('t1');
    await flush();

    expect(setTeamQuizQuestion).toHaveBeenCalledWith('t1', 'q1', false);
  });

  it('names the squad in what it says afterwards', async () => {
    const w = await mountBank();
    await w.find('[data-bank-team-pick="q1"]').setValue('t2');
    await flush();

    expect(w.find('[data-bank-notice]').text()).toContain('JV');
  });
});

describe('WHICH OPTION IS CORRECT', () => {
  it('is sent as the letter the coach marked', async () => {
    // Explicit, not positional. A form that assumed "the first one" would
    // silently mark the wrong answer on a reordered question.
    const w = await mountBank();
    await w.find('[data-bank-new]').trigger('click');
    await w.find('[data-bank-question-input]').setValue('When do we drop off?');
    await w.find('[data-bank-option="A"]').setValue('Never');
    await w.find('[data-bank-option="B"]').setValue('On the second phase');
    await w.find('[data-bank-correct="B"]').trigger('change');
    await w.find('[data-bank-form]').trigger('submit');
    await flush();

    const sent = upsertQuizQuestion.mock.calls[0][0];
    expect(sent.correct_option).toBe('B');
    expect(sent.answers.find((a: any) => a.letter === 'B').isCorrect).toBe(true);
    expect(sent.answers.find((a: any) => a.letter === 'A').isCorrect).toBe(false);
  });

  it('REFUSES to save a question with nothing marked correct', async () => {
    // Which would be a question that can never be answered right.
    const w = await mountBank();
    await w.find('[data-bank-new]').trigger('click');
    await w.find('[data-bank-question-input]').setValue('Half-written');
    await w.find('[data-bank-option="C"]').setValue('Only option');
    await w.find('[data-bank-correct="C"]').trigger('change');
    // Now blank the only option that was marked correct.
    await w.find('[data-bank-option="C"]').setValue('');
    await w.find('[data-bank-form]').trigger('submit');
    await flush();

    expect(upsertQuizQuestion).not.toHaveBeenCalled();
    expect(w.find('[data-bank-action-error]').text()).toMatch(/correct one/i);
  });

  it('drops the options left blank rather than storing empties', async () => {
    const w = await mountBank();
    await w.find('[data-bank-new]').trigger('click');
    await w.find('[data-bank-question-input]').setValue('Two options only');
    await w.find('[data-bank-option="A"]').setValue('Yes');
    await w.find('[data-bank-option="B"]').setValue('No');
    await w.find('[data-bank-form]').trigger('submit');
    await flush();

    expect(upsertQuizQuestion.mock.calls[0][0].answers).toHaveLength(2);
  });

  it('will not save a question with no text', async () => {
    const w = await mountBank();
    await w.find('[data-bank-new]').trigger('click');
    await w.find('[data-bank-form]').trigger('submit');
    await flush();

    expect(upsertQuizQuestion).not.toHaveBeenCalled();
  });
});

describe('editing an existing question', () => {
  it('opens on its text, options and correct letter', async () => {
    const w = await mountBank();
    await w.find('[data-bank-edit="q1"]').trigger('click');
    await w.vm.$nextTick();

    expect((w.find('[data-bank-question-input]').element as HTMLTextAreaElement).value)
      .toBe('Where does the ball go?');
    expect((w.find('[data-bank-option="B"]').element as HTMLInputElement).value)
      .toBe('Through the lines');
    expect((w.find('[data-bank-correct="B"]').element as HTMLInputElement).checked).toBe(true);
  });

  it('keeps the question id, so it updates rather than duplicating', async () => {
    const w = await mountBank();
    await w.find('[data-bank-edit="q1"]').trigger('click');
    await w.find('[data-bank-form]').trigger('submit');
    await flush();

    expect(upsertQuizQuestion.mock.calls[0][0].question_id).toBe('q1');
  });
});

describe('retiring a question', () => {
  it('SAYS attempts keep their answers and it can come back', async () => {
    // Otherwise a coach assumes retiring destroys the record of who answered
    // what, and leaves a bad question in circulation instead.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountBank();
    await w.find('[data-bank-retire="q1"]').trigger('click');

    const asked = confirmSpy.mock.calls[0][0];
    expect(asked).toContain('Where does the ball go?');
    expect(asked).toMatch(/keep their answers/i);
    expect(retireQuizQuestion).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('retires and re-reads once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountBank();
    await w.find('[data-bank-retire="q1"]').trigger('click');
    await flush();

    expect(retireQuizQuestion).toHaveBeenCalledWith('q1');
    expect(fetchQuizBank).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });
});
