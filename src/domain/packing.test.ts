import { describe, it, expect } from 'vitest';
import {
  validBypassed, livePackingCount, packingSource, matchPacking,
  parseVideoTime, formatVideoTime, orderTags, resolveShirtNumber,
  type PackingTag, type LiveEventLike
} from './packing';

const tap = (playerId: string, bypassed: number, extra: Partial<LiveEventLike> = {}): LiveEventLike =>
  ({ kind: 'packing', playerId, bypassed, ...extra });
const pass = (playerId: string, receiverId: string, bypassed: number, extra: Partial<PackingTag> = {}): PackingTag =>
  ({ playerId, receiverId, action: 'pass', bypassed, videoSeconds: null, ...extra });
const dribble = (playerId: string, bypassed: number, extra: Partial<PackingTag> = {}): PackingTag =>
  ({ playerId, receiverId: null, action: 'dribble', bypassed, videoSeconds: null, ...extra });

describe('validBypassed', () => {
  it('accepts whole numbers from 1 to 11 and nothing else', () => {
    expect([1, 5, 11].every(validBypassed)).toBe(true);
    expect([0, 12, -1, 2.5, NaN, null, undefined, '3'].some(validBypassed)).toBe(false);
  });
});

describe('which record counts for a match', () => {
  it('is live when there are only live taps', () => {
    expect(packingSource([tap('a', 2)], [])).toBe('live');
  });

  it('is video as soon as there is one tag, however many live taps there are', () => {
    expect(packingSource([tap('a', 2), tap('b', 3)], [dribble('a', 1)])).toBe('video');
  });

  it('goes back to live when every tag is removed', () => {
    expect(packingSource([tap('a', 2)], [dribble('a', 1, { isDeleted: true })])).toBe('live');
  });

  it('is none when nothing was recorded, and ignores undone taps and other kinds', () => {
    expect(packingSource([], [])).toBe('none');
    expect(packingSource([tap('a', 2, { isDeleted: true }), { kind: 'plus', playerId: 'a' }], [])).toBe('none');
  });
});

describe('a match’s figures', () => {
  it('sums live taps and leaves what live entry never asked as null, not 0', () => {
    const m = matchPacking([tap('a', 2), tap('a', 3), tap('b', 1)], [], ['a', 'b', 'c']);
    expect(m.source).toBe('live');
    expect(m.players.get('a')).toEqual({ packing: 5, received: null, byPass: null, byDribble: null });
    expect(m.players.get('c')).toEqual({ packing: 0, received: null, byPass: null, byDribble: null });
  });

  it('counts video tags instead of live taps once any exist', () => {
    const m = matchPacking(
      [tap('a', 9)],
      [pass('a', 'b', 3), dribble('a', 2), pass('b', 'a', 1)],
      ['a', 'b', 'c']);
    expect(m.source).toBe('video');
    expect(m.players.get('a')).toEqual({ packing: 5, received: 1, byPass: 3, byDribble: 2 });
    expect(m.players.get('b')).toEqual({ packing: 1, received: 3, byPass: 1, byDribble: 0 });
    // Someone on the roster who did nothing on the video did nothing: zero.
    expect(m.players.get('c')).toEqual({ packing: 0, received: 0, byPass: 0, byDribble: 0 });
  });

  it('ignores a removed tag', () => {
    const m = matchPacking([], [pass('a', 'b', 3), pass('a', 'b', 4, { isDeleted: true })]);
    expect(m.players.get('a')!.packing).toBe(3);
  });

  it('counts the live taps on the screen that warns about replacement', () => {
    expect(livePackingCount([tap('a', 2), tap('b', 1, { isDeleted: true }), { kind: 'plus', playerId: 'a' }])).toBe(1);
  });
});

describe('video time', () => {
  it.each([
    ['23:41', 1421], ['0:07', 7], ['75:30', 4530], ['1:02:05', 3725], ['  9:00 ', 540]
  ])('reads %s as %i seconds', (text, seconds) => {
    expect(parseVideoTime(text)).toEqual({ ok: true, seconds });
  });

  it('takes a blank box as no time at all', () => {
    expect(parseVideoTime('')).toEqual({ ok: true, seconds: null });
    expect(parseVideoTime(null)).toEqual({ ok: true, seconds: null });
  });

  it.each(['23:5', '23:60', '1:60:00', '1:02:5', 'abc', '-1:00', '23.41', '12'])('refuses %s', (text) => {
    const r = parseVideoTime(text);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toMatch(/m:ss/);
  });

  it('writes a time back the way it is typed', () => {
    expect(formatVideoTime(1421)).toBe('23:41');
    expect(formatVideoTime(3725)).toBe('1:02:05');
    expect(formatVideoTime(null)).toBe('');
  });
});

describe('the tag list order', () => {
  it('puts timed tags in video order and untimed ones last, as entered', () => {
    const tags = [
      dribble('u1', 1),
      dribble('t2', 1, { videoSeconds: 600 }),
      dribble('u2', 1),
      dribble('t1', 1, { videoSeconds: 30 })
    ];
    expect(orderTags(tags).map(t => t.playerId)).toEqual(['t1', 't2', 'u1', 'u2']);
  });
});

describe('finding a player by shirt number', () => {
  const squad = [
    { id: 'a', name: 'A', number: 9, recordingNumber: 4 },
    { id: 'b', name: 'B', number: 4, recordingNumber: 9 },
    { id: 'c', name: 'C', number: 7 },
    { id: 'd', name: 'D', number: 7 }
  ];

  it('reads the shirt number, not the recording number', () => {
    expect(resolveShirtNumber(squad, '9').player.id).toBe('a');
  });

  it('names nobody when two players share the number, and offers both', () => {
    const r = resolveShirtNumber(squad, '7');
    expect(r.player).toBeNull();
    expect(r.candidates.map(p => p.id)).toEqual(['c', 'd']);
  });

  it('names nobody for a number nobody wears, or for text', () => {
    expect(resolveShirtNumber(squad, '23')).toEqual({ player: null, candidates: [] });
    expect(resolveShirtNumber(squad, 'x')).toEqual({ player: null, candidates: [] });
  });
});
