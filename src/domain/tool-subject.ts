/**
 * Whether a tool route can render its screen yet.
 *
 * The touchline screens and the session grid are real URLs, reached from a
 * bookmark or a reload as readily as from a link, so each has to tell three
 * situations apart: the source has not loaded, the id names nothing, and the
 * subject is here. Keeping the difference between the first two is the point
 * — a screen that says "that fixture is gone" while its own schedule is
 * still loading is lying, and a coach on a touchline believes it.
 *
 * `idOptional` is for the lineup, which may legitimately be a sheet tied to
 * no fixture at all.
 */
export type SubjectState = 'loading' | 'missing' | 'ready';

export interface SubjectQuery {
  /** Has the source of the subject actually been read? */
  settled: boolean;
  /** The id from the route. */
  id: string | null | undefined;
  /** What the lookup returned for that id. */
  found: unknown;
  /** True when a screen without an id is still a screen. */
  idOptional?: boolean;
}

export function subjectState(opts: SubjectQuery): SubjectState {
  if (!opts || !opts.settled) return 'loading';
  if (opts.found) return 'ready';
  if (!opts.id) return opts.idOptional ? 'ready' : 'missing';
  return 'missing';
}
