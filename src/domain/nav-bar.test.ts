/**
 * Which items sit in the bottom bar.
 *
 * A phone's bottom bar holds five tabs comfortably and seven not at all. A
 * guest's four public items fit; a coach's seven become four plus More. The
 * strip that scrolled sideways with its scrollbar hidden was rejected once
 * already — the items past the edge were there and nothing said so.
 */
import { describe, it, expect } from 'vitest';
import { barItems } from './nav-bar';

const items = (n: number) => Array.from({ length: n }, (_, i) => `item${i + 1}`);

describe('barItems', () => {
  it('puts everything in the bar when it fits', () => {
    expect(barItems(items(4))).toEqual({ bar: items(4), overflow: [] });
    expect(barItems(items(5))).toEqual({ bar: items(5), overflow: [] });
  });

  it('keeps the first four and overflows the rest when it does not', () => {
    expect(barItems(items(7))).toEqual({
      bar: ['item1', 'item2', 'item3', 'item4'],
      overflow: ['item5', 'item6', 'item7']
    });
  });

  it('never overflows a single item — More would replace what it hides', () => {
    expect(barItems(items(6))).toEqual({
      bar: ['item1', 'item2', 'item3', 'item4'],
      overflow: ['item5', 'item6']
    });
  });

  it('honours a different capacity', () => {
    expect(barItems(items(4), 3)).toEqual({ bar: ['item1', 'item2'], overflow: ['item3', 'item4'] });
  });

  it('handles nothing', () => {
    expect(barItems([])).toEqual({ bar: [], overflow: [] });
  });
});
