/**
 * Turning a route's fixture id into a fixture.
 *
 * The touchline screens are real URLs, so one can be reached from a
 * bookmark, a shared link or a reload long after the fixture was deleted or
 * while the schedule is still loading. Both cases arrive here as "not
 * found", and the screens distinguish them by whether the schedule has
 * settled — this function only answers whether the id names a fixture in the
 * list it was given.
 */
export function matchById(matches: any[], id: string | null | undefined): any | null {
  if (!id) return null;
  return (matches || []).find(m => m && String(m.id) === String(id)) || null;
}
