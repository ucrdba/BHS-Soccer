import { describe, it, expect } from 'vitest';

describe('test environment', () => {
  it('provides a working localStorage', () => {
    localStorage.setItem('probe', 'value');
    expect(localStorage.getItem('probe')).toBe('value');
  });
});
