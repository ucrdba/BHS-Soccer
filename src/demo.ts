/**
 * Demo mode: the one visible difference between the demo deployment and the
 * real site.
 *
 * Everything else that makes the demo a demo lives in its own Supabase project
 * — self-serve coach accounts, the visitor cap, the expiry sweep — so the
 * application code has no branch for it beyond this file. That is deliberate:
 * a conditional in a view is a conditional that can be wrong on production,
 * and the one thing that must never happen is the real site telling a parent
 * their child's record is made up.
 *
 * The flag is a build-time variable, so it cannot be switched on at runtime
 * and cannot follow a user from one deployment to another.
 */

export interface DemoConfig {
  enabled: boolean;
  /**
   * Hours before a visitor's organization is swept. Shown in the warning, so
   * it has to match `demo_settings.expire_after` in the demo database — a
   * banner promising 48 hours over a database that clears in 12 is worse than
   * no banner, because the visitor plans their evening around it.
   */
  expiryHours: number;
}

const DEFAULT_EXPIRY_HOURS = 48;

/**
 * Reads the flag out of a Vite env object.
 *
 * Only the exact string 'true' enables it. Anything else — unset, '', 'false',
 * '0', 'yes' — leaves it off, because every accidental value should fail
 * closed onto the production behaviour.
 */
export function readDemoConfig(env: Record<string, string | undefined>): DemoConfig {
  const enabled = env.VITE_DEMO_MODE === 'true';

  const parsed = Number.parseInt(env.VITE_DEMO_EXPIRY_HOURS ?? '', 10);
  const expiryHours = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRY_HOURS;

  return { enabled, expiryHours };
}

/**
 * What the warning says, and why each sentence is in it.
 *
 * It stops a visitor mistaking the site for their real program. It says the
 * players and results are fictional. It states the expiry in hours, before
 * they invest an evening in it. And it invites them to break things, which is
 * the point of a playground and is not obvious unless said.
 */
export function demoNoticeText(expiryHours: number): string {
  return `DEMO SITE — everything here is made up. Your data is deleted `
    + `${expiryHours} hours after you create your account. `
    + `Change anything you like.`;
}

export const DEMO_NOTICE_ID = 'demoNotice';

/**
 * Puts the warning at the very top of the page, above the banner strip.
 *
 * Not dismissible, and given no close control: a visitor who hides it can
 * spend the next hour believing the roster is real. It is inserted as the
 * first child of <body> rather than written into the existing banner, because
 * renderTopBanner() rewrites that strip from the schedule on every view change
 * and would erase it.
 *
 * Safe to call more than once; it will not stack.
 */
export function installDemoNotice(config: DemoConfig, doc: Document = document): HTMLElement | null {
  if (!config.enabled) return null;

  const existing = doc.getElementById(DEMO_NOTICE_ID);
  if (existing) return existing as HTMLElement;

  const notice = doc.createElement('div');
  notice.id = DEMO_NOTICE_ID;
  notice.setAttribute('role', 'note');
  notice.textContent = demoNoticeText(config.expiryHours);
  notice.style.cssText = [
    'background: #b45309',
    'color: #fff',
    'padding: 8px 16px',
    'text-align: center',
    'font-size: 0.85rem',
    'font-weight: 700',
    'letter-spacing: 0.02em',
    'line-height: 1.4'
  ].join(';');

  doc.body.insertBefore(notice, doc.body.firstChild);
  return notice;
}
