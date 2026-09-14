import { describe, it, expect } from 'vitest';
import { signupLink, readSignupEmail } from './signup-link';

describe('signupLink', () => {
  it('fills the address in, lowercased and encoded', () => {
    expect(signupLink('https://club.example/', ' Kid+U14@Example.com '))
      .toBe('https://club.example/#signup=kid%2Bu14%40example.com');
  });

  it('carries the address in the fragment, which is never sent to the server', () => {
    // Many invited addresses belong to minors: a query string would land in
    // the host's request logs.
    expect(signupLink('https://club.example', 'kid@example.com')).not.toContain('?');
  });
});

describe('readSignupEmail', () => {
  it('reads the address back', () => {
    expect(readSignupEmail('#signup=kid%2Bu14%40example.com')).toBe('kid+u14@example.com');
  });

  it('is null for an ordinary page load, so nothing opens', () => {
    expect(readSignupEmail('')).toBeNull();
    expect(readSignupEmail('#team=1')).toBeNull();
    // The old query-string form is not read: the hash is where the link puts it.
    expect(readSignupEmail('?signup=kid%40example.com')).toBeNull();
  });

  it('opens registration even when the address is empty', () => {
    expect(readSignupEmail('#signup=')).toBe('');
  });
});
