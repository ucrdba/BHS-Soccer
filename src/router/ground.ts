/**
 * Which ground a route renders on.
 *
 * Three grounds exist (spec §2.2): `paper`, the light editorial ground the
 * public and desk screens use; `pitch`, the navy touchline ground; `ledger`,
 * navy with the editorial faces for the ratings. Each defines the same token
 * names in index.css under `[data-ground]`, so a component never needs to
 * know which it is on.
 *
 * The ground is a property of the route, which is why it lives in meta and
 * not in a store: nobody chooses it, the screen implies it.
 */
export type Ground = 'paper' | 'pitch' | 'ledger';

export const GROUNDS: Ground[] = ['paper', 'pitch', 'ledger'];

declare module 'vue-router' {
  interface RouteMeta {
    /** The ground this route renders on. Absent means paper. */
    ground?: Ground;
    /**
     * 'tool' hides the header, nav and footer: the touchline and session
     * screens draw their own top and bottom bars. Read by App.vue.
     */
    chrome?: 'tool';
  }
}

/** The ground a route's meta names, or paper when it names none or nonsense. */
export function groundFor(meta: { ground?: unknown } | null | undefined): Ground {
  const g = meta?.ground;
  return GROUNDS.includes(g as Ground) ? (g as Ground) : 'paper';
}

/** Stamp the ground on the document element, where index.css reads it. */
export function applyGround(
  doc: { documentElement: { dataset: DOMStringMap } } | undefined,
  ground: Ground
): void {
  if (!doc) return;
  doc.documentElement.dataset.ground = ground;
}
