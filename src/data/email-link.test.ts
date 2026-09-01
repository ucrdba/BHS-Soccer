/**
 * Finishing an emailed confirmation link.
 *
 * The reported bug: a player registers, gets the email, clicks the link, and
 * lands on the guest home page as though nothing happened. The account IS
 * confirmed at Supabase — the app simply never read the callback and never
 * said anything, so confirming your account looked identical to doing nothing.
 *
 * The email template sends a link rather than a 6-digit code and cannot be
 * changed on this project's plan, so the app has to handle the link. These
 * cover both halves: reading the callback, and saying what it did.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { supabaseService } from './supabase';
import utilsSrc from '../../public/js/utils.js?raw';

const svc = supabaseService as any;
const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let session: any;

/** jsdom will not let location be reassigned, so stub what the code reads. */
const at = (hash: string, search = '') => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hash, search, pathname: '/', origin: 'https://bhssoccer.org' }
  });
};

beforeEach(() => {
  session = null;
  svc.isConfigured = () => true;
  svc.client = { auth: { getSession: async () => ({ data: { session } }) } };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  at('', '');
});

afterEach(() => { vi.restoreAllMocks(); });

describe('completeEmailLink', () => {
  it('does nothing on an ordinary page load', async () => {
    const res = await supabaseService.completeEmailLink();
    expect(res.outcome).toBe('none');
  });

  it('reports a confirmed session when the link created one', async () => {
    at('#access_token=abc&refresh_token=def&type=signup');
    session = { user: { id: 'u1' } };
    const res = await supabaseService.completeEmailLink();
    expect(res.outcome).toBe('confirmed');
  });

  it('reports verified when the link was valid but no session could be made', async () => {
    // The cross-device case: registered on a laptop, opened the mail on a
    // phone. The account is confirmed; a session here is impossible. Calling
    // this a failure would tell the player to do something already done.
    at('#access_token=abc&type=signup');
    session = null;
    const res = await supabaseService.completeEmailLink();
    expect(res.outcome).toBe('verified');
  });

  it('reports an expired or reused link as an error, with the reason', async () => {
    at('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired');
    const res = await supabaseService.completeEmailLink();
    expect(res.outcome).toBe('error');
    expect(res.message).toContain('expired');
    // The + separators are decoded, or the message reads like a URL.
    expect(res.message).not.toContain('+');
  });

  it('strips the tokens from the address bar', async () => {
    // Leaving them there means they survive a copied link, a screenshot, or
    // the browser history.
    const replaceState = vi.fn();
    (window.history as any).replaceState = replaceState;
    at('#access_token=abc&type=signup');
    session = { user: { id: 'u1' } };
    await supabaseService.completeEmailLink();
    expect(replaceState).toHaveBeenCalled();
  });

  it('strips them on the error path too', async () => {
    const replaceState = vi.fn();
    (window.history as any).replaceState = replaceState;
    at('#error=access_denied&error_description=expired');
    await supabaseService.completeEmailLink();
    expect(replaceState).toHaveBeenCalled();
  });

  it('reports none rather than throwing when the client is unconfigured', async () => {
    svc.isConfigured = () => false;
    at('#access_token=abc');
    const res = await supabaseService.completeEmailLink();
    expect(res.outcome).toBe('none');
  });
});

describe('authRedirectUrl', () => {
  it('returns the current origin, so the link comes back where signup began', () => {
    // Without this the link falls back to Supabase's Site URL, which is
    // invisible from the app and easy to leave pointing at localhost.
    expect(supabaseService.authRedirectUrl()).toBe('https://bhssoccer.org/');
  });
});

describe('telling the player what happened', () => {
  const boot = (result: any) => {
    document.body.innerHTML = '';
    (globalThis as any).emailLinkResult = result;
    (globalThis as any).BHSSoccerApp = function () {};
    (globalThis as any).SoccerTacticalBoard = class {};
    (globalThis as any).auth = {
      isCoach: () => false, isAdmin: () => false, isLoggedIn: () => false,
      canAccessRatings: () => false, subscribe: () => {},
      getCurrentUser: () => null, getRole: () => 'guest'
    };
    const fn = new Function(strip(utilsSrc) + '\nreturn showEmailLinkOutcome;')();
    fn();
    return document.body.textContent || '';
  };

  it('says nothing on an ordinary load', () => {
    expect(boot({ outcome: 'none' })).toBe('');
    expect(boot(undefined)).toBe('');
  });

  it('tells a confirmed player they are waiting on approval', () => {
    // Confirming is not the last step, and a player who thinks it is will sit
    // wondering why they still cannot see their team.
    const text = boot({ outcome: 'confirmed' });
    expect(text).toContain('Email confirmed');
    expect(text).toContain('approve');
  });

  it('tells a cross-device player to sign in', () => {
    const text = boot({ outcome: 'verified' });
    expect(text).toContain('Email confirmed');
    expect(text).toContain('Sign in');
  });

  it('explains a dead link rather than staying silent', () => {
    const text = boot({ outcome: 'error', message: 'Email link is invalid or has expired' });
    expect(text).toContain('did not work');
    expect(text).toContain('expired');
  });
});
