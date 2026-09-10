/**
 * Failures, said where somebody will read them.
 *
 * Every service method in `src/data/supabase.ts` returns `null` when a query
 * fails and writes the reason to the console. The audience is coaches, so a
 * roster that will not load is a blank screen and no explanation, while the
 * sentence that explains it sits in a devtools panel nobody opens.
 *
 * This is the channel between the two: the data layer reports a failure here,
 * and the app renders it. Framework-free on purpose — `supabase.ts` is a plain
 * module imported from outside any Vue context, so it must not reach for a
 * Pinia store to say something went wrong.
 *
 * The console calls stay where they are. This is an additional reader, not a
 * replacement for the developer's one.
 */

export interface Notice {
  id: number;
  /** The service method that failed, e.g. `fetchDrillsBank`. */
  method: string;
  /** A sentence for whoever is looking at the screen. */
  message: string;
  /** The technical text, shown only on request. */
  detail: string | null;
  /** How many times this same failure has happened in a row. */
  count: number;
  at: number;
}

type Listener = (notices: Notice[]) => void;

/**
 * How many failures are kept.
 *
 * A store that retries on a dead connection can report the same failure
 * repeatedly; the cap stops that growing without bound, and the repeat
 * collapsing below means it rarely gets near it.
 */
const LIMIT = 12;

/** Long enough for a Postgres error, short enough not to be a wall. */
const DETAIL_LIMIT = 400;

let notices: Notice[] = [];
let listeners: Listener[] = [];
let seq = 0;

// ── phrasing ──────────────────────────────────────────────────────────────

/**
 * What the method was trying to do, in the words of the screen.
 *
 * Derived rather than tabulated: ninety-nine methods report failures, and a
 * table of ninety-nine sentences drifts the first time one is renamed. The
 * verb decides the phrasing and the rest of the name is the subject, so a
 * method added later is phrased correctly without being listed here at all.
 */
const LOADING = [
  'fetch', 'find', 'search', 'resolve', 'open', 'get', 'list', 'teams'
];

const REMOVING = ['delete', 'remove', 'retire', 'undo', 'reject'];

const CHANGING = ['merge', 'retag', 'rename', 'update', 'set'];

/**
 * Whole sentences, for the handful of methods no verb-plus-subject rule
 * reaches. `init` is not a save, and the auth methods put their subject in
 * the verb.
 */
const SENTENCES: Record<string, string> = Object.assign(Object.create(null), {
  init: 'The app could not connect to the database.',
  signin: 'You could not be signed in.',
  signup: 'The account could not be created.',
  signout: 'You could not be signed out.',
  verifyotp: 'That sign-in code could not be checked.'
});

/** Subjects whose derived wording reads badly. */
const SUBJECTS: Record<string, string> = Object.assign(Object.create(null), {
  drillsbank: 'the drill library',
  drillsforweighting: 'the drill weights',
  ownprofile: 'your account profile',
  matrixstandings: 'the Matrix board',
  matrixlogs: 'the Matrix history',
  soccercategories: 'the drill categories',
  soccercategory: 'that drill category',
  categoryusage: 'the drill category counts',
  teamroster: 'the roster',
  teamexercisepoints: 'the exercise scores',
  teamsessionhistory: 'the session history',
  activethoughtid: "the team's daily message",
  thoughtidbykey: 'the daily message',
  thoughtidbytitle: 'the daily message',
  dailythoughts: 'the daily messages',
  latestdailythoughts: 'the daily messages',
  dailythought: 'the daily message',
  statevent: 'the match event',
  statevents: 'the match events',
  statmatch: 'the match record',
  pendingapprovals: 'the accounts waiting for approval',
  unassignedplayers: 'the players not yet on a squad',
  allplayeridentities: 'the player list',
  playeridentity: 'that player',
  playerbreakdown: "that player's results",
  publicdefaultteamid: 'the default team',
  teamsforviewer: 'your teams',
  assignablecoaches: 'the coaches',
  coachtoteam: 'that coach',
  coachfromteam: 'that coach',
  coachrowid: 'that coach',
  teammembership: 'that squad membership',
  fullpracticeplan: 'the practice plan',
  practiceplanitem: 'that drill',
  practiceplans: 'the practice plans',
  practiceplan: 'the practice plan',
  recordingnumber: 'that recording number',
  uniformnumber: 'that shirt number',
  quizbank: 'the quiz bank',
  quizquestion: 'that quiz question',
  teamquizquestion: 'that quiz question',
  quizanswers: 'the quiz answers',
  quizattempt: 'that quiz attempt',
  answers: 'the quiz answers',
  timebands: 'the time standards',
  matrixresult: 'that Matrix result',
  matrixsession: 'that Matrix session',
  matrixsessions: 'the Matrix sessions',
  matrixsessionresults: 'the session results',
  seasonstats: 'the season statistics',
  profile: 'that account',
  profiles: 'that account',
  roles: 'the permissions',
  auth: 'your sign-in',
  init: 'the connection to the database',
  teamlookup: 'the team list',
  allteams: 'the team list',
  activedailythought: "the team's daily message",
  drillbankitem: 'that drill',
  teamlineups: 'the saved lineups',
  playersbyname: 'the player search'
});

const words = (subject: string): string =>
  subject
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The verb at the front of a method name, and everything after it. */
function split(method: string): { verb: string; subject: string } {
  const m = /^([a-z]+)(.*)$/.exec(method || '');
  if (!m) return { verb: '', subject: method || '' };
  return { verb: m[1], subject: m[2] };
}

function subjectOf(method: string, subject: string): string {
  // The whole name first: `fetchAllTeams` is "the team list", not "the all
  // teams", and only the full name says so.
  const whole = (method || '').toLowerCase();
  if (SUBJECTS[whole]) return SUBJECTS[whole];

  const key = (subject || method).toLowerCase();
  if (SUBJECTS[key]) return SUBJECTS[key];
  const plain = words(subject);
  return plain ? `the ${plain}` : 'that request';
}

/**
 * One sentence saying what did not happen.
 *
 * Deliberately says nothing about why: the why is the detail, which a coach
 * can open and forward but should not have to read to understand that the
 * roster is missing rather than empty.
 */
export function describeFailure(method: string): string {
  const whole = SENTENCES[(method || '').toLowerCase()];
  if (whole) return whole;

  const { verb, subject } = split(method);
  const what = subjectOf(method, subject);

  let ending = 'could not be saved.';
  if (REMOVING.includes(verb)) ending = 'could not be removed.';
  else if (CHANGING.includes(verb)) ending = 'could not be changed.';
  else if (LOADING.includes(verb)) ending = 'could not be loaded.';
  // Everything else writes: save, upsert, insert, log, import, copy, attach,
  // assign, approve, create, append.

  return capitalize(`${what} ${ending}`);
}

// ── the detail ────────────────────────────────────────────────────────────

/** Whatever the caller had, as text a person can forward. */
export function describeDetail(detail: unknown): string | null {
  if (detail === null || detail === undefined) return null;

  let text: string;
  if (typeof detail === 'string') text = detail;
  else if (detail instanceof Error) text = detail.message || String(detail);
  else if (typeof detail === 'object' && typeof (detail as any).message === 'string') {
    text = (detail as any).message;
  } else {
    try { text = JSON.stringify(detail); } catch { text = String(detail); }
  }

  text = (text || '').trim();
  if (!text) return null;
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}…` : text;
}

// ── the connection ────────────────────────────────────────────────────────

/**
 * Whether the app can reach its database at all.
 *
 * A state, not an event, and that is why it does not go through
 * `reportFailure`. A hundred and seven service methods return `null` without
 * a word when the client is unconfigured, so an app with no credentials loads
 * empty and reports nothing — which CLAUDE.md names as the usual cause of
 * "nothing loaded from the DB". One failure per method would be a hundred
 * boxes saying the same thing; one standing banner says it once, and goes
 * away by itself when the connection arrives.
 */
export interface Connection {
  configured: boolean;
  /** What was wrong, for whoever can fix it. */
  reason: string | null;
}

/*
 * Assumed working until the client says otherwise, so the banner never
 * flashes during startup. `initSupabaseClient()` reports the truth at
 * module-evaluation time, before anything has mounted.
 */
let connection: Connection = { configured: true, reason: null };
let connectionListeners: Array<(c: Connection) => void> = [];

function tellConnection(fn: (c: Connection) => void): void {
  try { fn({ ...connection }); } catch { /* a bad reader is not the reporter's problem */ }
}

/** Called by the data layer whenever it builds or fails to build a client. */
export function reportConnection(configured: boolean, reason?: string | null): void {
  const next: Connection = { configured, reason: configured ? null : (reason || null) };
  if (next.configured === connection.configured && next.reason === connection.reason) return;

  connection = next;
  connectionListeners.forEach(tellConnection);
}

export function currentConnection(): Connection {
  return { ...connection };
}

/** Returns the unsubscribe, which a component calls on unmount. */
export function subscribeToConnection(fn: (c: Connection) => void): () => void {
  connectionListeners = connectionListeners.concat(fn);
  // Replayed, because the client is built before the app mounts.
  tellConnection(fn);
  return () => { connectionListeners = connectionListeners.filter(l => l !== fn); };
}

// ── the channel ───────────────────────────────────────────────────────────

/** A reader that throws is its own problem, not the reporter's. */
function tell(fn: Listener): void {
  try { fn(notices.slice()); } catch { /* swallowed on purpose */ }
}

function publish(): void {
  listeners.forEach(tell);
}

/**
 * Something a person asked for did not happen.
 *
 * Returns the notice, or the one it was folded into. A failure repeated —
 * a store retrying against a connection that is still down — becomes one
 * entry with a count rather than a column of identical boxes.
 */
export function reportFailure(method: string, detail?: unknown): Notice {
  const text = describeDetail(detail);
  const last = notices[notices.length - 1];

  if (last && last.method === method && last.detail === text) {
    last.count += 1;
    last.at = Date.now();
    publish();
    return last;
  }

  const notice: Notice = {
    id: ++seq,
    method,
    message: describeFailure(method),
    detail: text,
    count: 1,
    at: Date.now()
  };

  notices = notices.concat(notice).slice(-LIMIT);
  publish();
  return notice;
}

export function currentNotices(): Notice[] {
  return notices.slice();
}

export function dismissNotice(id: number): void {
  const before = notices.length;
  notices = notices.filter(n => n.id !== id);
  if (notices.length !== before) publish();
}

export function clearNotices(): void {
  if (notices.length === 0) return;
  notices = [];
  publish();
}

/** Returns the unsubscribe, which a component calls on unmount. */
export function subscribeToNotices(fn: Listener): () => void {
  listeners = listeners.concat(fn);
  // Replayed immediately: the app mounts after the first fetches have run, so
  // a reader that only heard new failures would open blank over a broken one.
  tell(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

/** Test seam: forget every notice and every reader. */
export function resetNotices(): void {
  notices = [];
  listeners = [];
  seq = 0;
  connection = { configured: true, reason: null };
  connectionListeners = [];
}
