import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_NOTICE_ID,
  demoNoticeText,
  installDemoNotice,
  readDemoConfig
} from './demo';

describe('readDemoConfig', () => {
  it('is off when nothing is set — production sets no VITE variables', () => {
    expect(readDemoConfig({}).enabled).toBe(false);
  });

  // Every accidental value must fail closed onto production behaviour: the one
  // thing that must never happen is the real site calling a real roster fake.
  it.each(['false', '', '0', 'yes', 'TRUE', 'true '])(
    'stays off for %o',
    (value) => {
      expect(readDemoConfig({ VITE_DEMO_MODE: value }).enabled).toBe(false);
    }
  );

  it('is on for exactly "true"', () => {
    expect(readDemoConfig({ VITE_DEMO_MODE: 'true' }).enabled).toBe(true);
  });

  it('defaults the expiry to 48 hours', () => {
    expect(readDemoConfig({}).expiryHours).toBe(48);
    expect(readDemoConfig({ VITE_DEMO_EXPIRY_HOURS: 'soon' }).expiryHours).toBe(48);
    expect(readDemoConfig({ VITE_DEMO_EXPIRY_HOURS: '0' }).expiryHours).toBe(48);
  });

  it('takes the expiry from the environment when it is a real number', () => {
    expect(readDemoConfig({ VITE_DEMO_EXPIRY_HOURS: '12' }).expiryHours).toBe(12);
  });
});

describe('demoNoticeText', () => {
  it('does all four jobs: fake data, the expiry in hours, and permission to break it', () => {
    const text = demoNoticeText(48);

    expect(text).toContain('DEMO SITE');
    expect(text).toContain('made up');
    expect(text).toContain('48 hours');
    expect(text).toContain('Change anything you like');
  });

  it('states the expiry it was given, not a hardcoded 48', () => {
    expect(demoNoticeText(12)).toContain('12 hours');
    expect(demoNoticeText(12)).not.toContain('48');
  });
});

describe('installDemoNotice', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="top-banner">GAME DAY</div>';
  });

  it('renders nothing on production', () => {
    installDemoNotice({ enabled: false, expiryHours: 48 });

    expect(document.getElementById(DEMO_NOTICE_ID)).toBeNull();
  });

  it('renders above the banner strip, which is rewritten on every view change', () => {
    installDemoNotice({ enabled: true, expiryHours: 48 });

    expect(document.body.firstChild).toBe(document.getElementById(DEMO_NOTICE_ID));
  });

  it('offers no way to dismiss it', () => {
    const notice = installDemoNotice({ enabled: true, expiryHours: 48 })!;

    expect(notice.querySelector('button')).toBeNull();
    expect(notice.querySelector('[onclick]')).toBeNull();
  });

  it('does not stack when called twice', () => {
    installDemoNotice({ enabled: true, expiryHours: 48 });
    installDemoNotice({ enabled: true, expiryHours: 48 });

    expect(document.querySelectorAll(`#${DEMO_NOTICE_ID}`)).toHaveLength(1);
  });
});
