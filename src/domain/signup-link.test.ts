import { describe, it, expect } from 'vitest';
import { signupLink, readSignupEmail } from './signup-link';

describe('signupLink', () => {
  it('fills the address in, lowercased and encoded', () => {
    expect(signupLink('https://club.example/', ' Kid+U14@Example.com '))
      .toBe('https://club.example/?signup=kid%2Bu14%40example.com');
  });
});

describe('readSignupEmail', () => {
  it('reads the address back', () => {
    expect(readSignupEmail('?signup=kid%2Bu14%40example.com')).toBe('kid+u14@example.com');
  });

  it('is null for an ordinary page load, so nothing opens', () => {
    expect(readSignupEmail('')).toBeNull();
    expect(readSignupEmail('?team=1')).toBeNull();
  });

  it('opens registration even when the address is empty', () => {
    expect(readSignupEmail('?signup=')).toBe('');
  });
});
