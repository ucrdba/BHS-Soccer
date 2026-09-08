/**
 * Whether a tool route can render yet.
 *
 * A touchline screen is a real URL, so it is reached from bookmarks and
 * reloads as well as from a link. Three answers, and the difference between
 * the first two is what stops the screen announcing that a fixture is gone
 * while its own schedule is still loading.
 */
import { describe, it, expect } from 'vitest';
import { subjectState } from './tool-subject';

describe('subjectState', () => {
  it('is loading until the source has settled, whatever the id says', () => {
    expect(subjectState({ settled: false, id: 'm1', found: null })).toBe('loading');
    expect(subjectState({ settled: false, id: 'gone', found: null })).toBe('loading');
    expect(subjectState({ settled: false, id: null, found: null })).toBe('loading');
  });

  it('is ready once the subject is found', () => {
    expect(subjectState({ settled: true, id: 'm1', found: { id: 'm1' } })).toBe('ready');
  });

  it('is missing when a named subject is not there', () => {
    expect(subjectState({ settled: true, id: 'gone', found: null })).toBe('missing');
  });

  it('is missing when no id was given and the screen needs one', () => {
    // The live board and the session grid both need a subject; without one
    // there is nothing to write to.
    expect(subjectState({ settled: true, id: null, found: null })).toBe('missing');
    expect(subjectState({ settled: true, id: '', found: null })).toBe('missing');
  });

  it('is ready with no id when the screen does not need one', () => {
    // A lineup not tied to a fixture is a legitimate sheet.
    expect(subjectState({ settled: true, id: null, found: null, idOptional: true })).toBe('ready');
    expect(subjectState({ settled: true, id: '', found: null, idOptional: true })).toBe('ready');
  });

  it('still reports a named subject missing even when the id is optional', () => {
    expect(subjectState({ settled: true, id: 'gone', found: null, idOptional: true })).toBe('missing');
  });
});
