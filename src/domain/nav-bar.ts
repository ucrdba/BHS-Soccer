/**
 * Which items sit in a phone's bottom bar, and which go behind More.
 *
 * `max` tabs fit. When the visible list is within it, every item is in the
 * bar and there is no More. When it is not, the first `max - 1` are in the
 * bar and the rest overflow, so More takes the last slot rather than
 * replacing an item it would then have to hide.
 */
export interface BarSplit<T> {
  bar: T[];
  overflow: T[];
}

export function barItems<T>(visible: T[], max = 5): BarSplit<T> {
  if (visible.length <= max) return { bar: visible.slice(), overflow: [] };
  return { bar: visible.slice(0, max - 1), overflow: visible.slice(max - 1) };
}
