/**
 * The organization's own profile.
 *
 * The assertion that carries the file: it edits the ACTIVE organization and
 * never a defaulted one. `upsertSchool` fills a blank name, mascot and city
 * with Beaumont's -- so a club admin who clears the mascot would be handed
 * "Cougars", on every heading in their app. The form refuses to send a blank.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SchoolProfileSection from './SchoolProfileSection.vue';

const upsertSchool = vi.fn();
const fetchSchool = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    upsertSchool: (...a: any[]) => upsertSchool(...a),
    fetchSchool: (...a: any[]) => fetchSchool(...a)
  }
}));

const CLUB = {
  code: 'lfc',
  name: 'Legends FC',
  mascot: 'Lions',
  city: 'Riverside, CA',
  league: 'SoCal Premier',
  colors: { primary: '#123456', secondary: '#abcdef' },
  record: { wins: 4, losses: 1, draws: 2 }
};

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

function mountIt(props: any = {}) {
  return mount(SchoolProfileSection, {
    props: { schoolCode: 'lfc', isAdmin: true, ...props }
  });
}

/**
 * Mounts with the loaded row's `colors` overridden, for the colour-field
 * tests below. Reuses `mountIt` and `CLUB` rather than a fresh mount path --
 * `rowOverrides` replaces top-level keys of CLUB the same way `mountIt`'s
 * `props` replaces top-level keys of the default props.
 */
async function mountSection(rowOverrides: any = {}) {
  fetchSchool.mockResolvedValueOnce({ ...CLUB, ...rowOverrides });
  const w = mountIt();
  await flush();
  return w;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSchool.mockResolvedValue({ ...CLUB });
  upsertSchool.mockResolvedValue({ data: [{ id: 's1' }], error: null });
});

describe('reading the profile', () => {
  it('LOADS THE ACTIVE ORGANIZATION, not a defaulted one', async () => {
    const w = mountIt();
    await flush();

    expect(fetchSchool).toHaveBeenCalledWith('lfc');
  });

  it("shows the club's own name and mascot", async () => {
    const w = mountIt();
    await flush();

    expect((w.find('[data-school-name]').element as HTMLInputElement).value).toBe('Legends FC');
    expect((w.find('[data-school-mascot]').element as HTMLInputElement).value).toBe('Lions');
  });

  it('shows its colours and record', async () => {
    const w = mountIt();
    await flush();

    expect((w.find('[data-school-primary]').element as HTMLInputElement).value).toBe('#123456');
    expect((w.find('[data-school-wins]').element as HTMLInputElement).value).toBe('4');
  });

  it('waits rather than loading nothing when no organization is resolved yet', async () => {
    mountIt({ schoolCode: null });
    await flush();

    expect(fetchSchool).not.toHaveBeenCalled();
  });
});

describe('SAVING NEVER FALLS BACK TO BEAUMONT', () => {
  it('REFUSES a blank mascot rather than letting it default to Cougars', async () => {
    // upsertSchool fills a blank mascot with "Cougars", and every heading
    // renders the mascot -- so a club would silently become the Cougars.
    const w = mountIt();
    await flush();

    await w.find('[data-school-mascot]').setValue('   ');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool).not.toHaveBeenCalled();
    expect(w.find('[data-school-error]').text()).toMatch(/mascot/i);
  });

  it('refuses a blank name for the same reason', async () => {
    const w = mountIt();
    await flush();

    await w.find('[data-school-name]').setValue('');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool).not.toHaveBeenCalled();
  });

  it('writes against the ACTIVE organization code', async () => {
    const w = mountIt();
    await flush();

    await w.find('[data-school-name]').setValue('Legends Football Club');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool).toHaveBeenCalledWith('lfc', expect.objectContaining({
      name: 'Legends Football Club', mascot: 'Lions'
    }));
  });

  it('sends the record as numbers, not the text a field holds', async () => {
    const w = mountIt();
    await flush();

    await w.find('[data-school-wins]').setValue('7');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool.mock.calls[0][1].record).toEqual({ wins: 7, losses: 1, draws: 2 });
  });

  it('refuses a colour the app cannot read', async () => {
    // These are written straight into CSS custom properties. 'red' is a
    // recognised colour name and would be accepted -- this uses a value that
    // matches none of the three accepted forms.
    const w = mountIt();
    await flush();

    await w.find('[data-school-primary]').setValue('mauve');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool).not.toHaveBeenCalled();
    // After Fix 2, the colour error renders in data-school-colour-error, not data-school-error.
    expect(w.find('[data-school-colour-error]').text()).toMatch(/colour|color/i);
  });
});

describe('after a save', () => {
  it('TELLS THE APP THE BRANDING CHANGED, since every heading reads it', async () => {
    const w = mountIt();
    await flush();

    await w.find('[data-school-mascot]').setValue('Legends');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(w.emitted('saved')).toBeTruthy();
    expect((w.emitted('saved') as any[])[0][0].mascot).toBe('Legends');
  });

  it('reports a refusal rather than claiming it saved', async () => {
    upsertSchool.mockResolvedValue({ data: null, error: 'row-level security' });
    const w = mountIt();
    await flush();

    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(w.find('[data-school-error]').exists()).toBe(true);
    expect(w.emitted('saved')).toBeFalsy();
  });
});

describe('who may edit it', () => {
  it('shows the form to an admin', async () => {
    const w = mountIt({ isAdmin: true });
    await flush();
    expect(w.find('[data-school-save]').exists()).toBe(true);
  });

  it('does not offer the form to a coach who is not an admin', async () => {
    const w = mountIt({ isAdmin: false });
    await flush();
    expect(w.find('[data-school-save]').exists()).toBe(false);
  });
});

describe('the colour fields', () => {
  it('refuses to save a colour it cannot parse, and says what it accepts', async () => {
    const wrapper = await mountSection();
    await wrapper.find('[data-school-primary]').setValue('greenish');
    await wrapper.find('[data-school-save]').trigger('click');

    expect(upsertSchool).not.toHaveBeenCalled();
    const msg = wrapper.find('[data-school-colour-error]').text();
    expect(msg).toContain('greenish');
    expect(msg).toMatch(/hex|rgb|name/i);
  });

  it('accepts each of the three forms', async () => {
    for (const value of ['#21196F', 'rgb(33, 25, 111)', 'navy']) {
      upsertSchool.mockClear();
      const wrapper = await mountSection();
      await wrapper.find('[data-school-primary]').setValue(value);
      await wrapper.find('[data-school-save]').trigger('click');
      expect(upsertSchool).toHaveBeenCalledOnce();
      // Assert the payload actually reached upsertSchool: index [1] is the school object.
      const sent = upsertSchool.mock.calls[0][1];
      expect(sent.colors.primary).toBe(value);
    }
  });

  // The row carries keys this form does not edit. Writing a fresh object
  // silently drops them -- Beaumont's row has a "navy" key that disappeared on
  // every save.
  it('preserves a key in colors that it does not edit', async () => {
    const wrapper = await mountSection({
      colors: { primary: '#21196F', secondary: 'white', navy: '#0A1428' }
    });
    await wrapper.find('[data-school-save]').trigger('click');

    // upsertSchool(schoolCode, school) -- index 1 is the school object, per
    // the other calls-index assertions in this file (e.g. the record test
    // above).
    const sent = upsertSchool.mock.calls[0][1];
    expect(sent.colors.navy).toBe('#0A1428');
  });

  it('says which colour the interface had to substitute, and why', async () => {
    const wrapper = await mountSection({
      colors: { primary: '#21196F', secondary: 'white' }
    });
    expect(wrapper.find('[data-school-colour-note]').text()).toMatch(/white/i);
  });

  // Fix 2: guardedColour substitutes for either of two independent reasons,
  // and the message must name whichever one actually fired -- the two
  // wordings are not interchangeable. maroon fails the dark ground's 3:1
  // contrast floor (its contrast against DARK_GROUND is ~1.7); white passes
  // that floor at 17:1 but sits at zero distance from the dark ink, so it
  // fails only the ink-distance floor.
  it('says a colour cannot be SEEN when it fails the contrast floor', async () => {
    const wrapper = await mountSection({
      colors: { primary: '#21196F', secondary: 'maroon' }
    });
    const note = wrapper.find('[data-school-colour-note]').text();
    expect(note).toMatch(/maroon/i);
    expect(note).toMatch(/cannot be seen/i);
    expect(note).not.toMatch(/cannot be told apart/i);
  });

  it('says a colour cannot be TOLD APART when it fails only the ink-distance floor', async () => {
    const wrapper = await mountSection({
      colors: { primary: '#21196F', secondary: 'white' }
    });
    const note = wrapper.find('[data-school-colour-note]').text();
    expect(note).toMatch(/cannot be told apart/i);
    expect(note).not.toMatch(/cannot be seen/i);
  });

  // The primary was previously unchecked entirely, even though it now drives
  // --live on the paper ground. #f5f4f4 clears the ink-distance floor easily
  // (it is nowhere near the dark ink) but fails the paper ground's 4.5:1 text
  // contrast floor -- a pure contrast failure, on the paper side this time.
  it('reports a primary substitution too, since it now drives --live on paper', async () => {
    const wrapper = await mountSection({
      colors: { primary: '#f5f4f4', secondary: '#abcdef' }
    });
    const notes = wrapper.findAll('[data-school-colour-note]').map(n => n.text());
    expect(notes.some(n => /f5f4f4/i.test(n) && /paper/i.test(n) && /cannot be seen/i.test(n))).toBe(true);
  });
});

describe('the logo', () => {
  /*
   * Shown on the public home page in place of the coach's message, and read
   * from the organization's row like everything else on this form.
   */
  it('shows the logo address the row carries, and a preview of it', async () => {
    const w = await mountSection({ logo_url: '/img/legends.png' });

    expect((w.find('[data-school-logo]').element as HTMLInputElement).value).toBe('/img/legends.png');
    expect(w.find('[data-school-logo-preview]').attributes('src')).toBe('/img/legends.png');
  });

  /*
   * Until 0028 is applied the column does not exist: `select *` omits it, and
   * naming it in the save makes PostgREST refuse the WHOLE profile with 42703.
   * So the field is disabled and the save leaves it out, rather than losing an
   * admin's name or colour edit over a field they never touched.
   */
  it('is disabled, and says why, on a database without the column', async () => {
    const w = await mountSection();   // CLUB carries no logo_url key at all

    expect(w.find('[data-school-logo]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-school-logo-unmigrated]').text()).toMatch(/0028/);
  });

  it('leaves the logo out of the save on a database without the column', async () => {
    const w = await mountSection();
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool).toHaveBeenCalled();
    expect(upsertSchool.mock.calls[0][1]).not.toHaveProperty('logoUrl');
  });

  it('saves the logo once the column exists', async () => {
    const w = await mountSection({ logo_url: null });
    await w.find('[data-school-logo]').setValue('/img/legends.png');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool.mock.calls[0][1].logoUrl).toBe('/img/legends.png');
  });

  it('refuses an address the public page would not show, before saving', async () => {
    const w = await mountSection({ logo_url: null });
    await w.find('[data-school-logo]').setValue('javascript:alert(1)');

    expect(w.find('[data-school-logo-error]').exists()).toBe(true);
    await w.find('[data-school-save]').trigger('click');
    await flush();
    expect(upsertSchool).not.toHaveBeenCalled();
  });

  it('clears a logo by saving an empty address', async () => {
    const w = await mountSection({ logo_url: '/img/legends.png' });
    await w.find('[data-school-logo]').setValue('');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool.mock.calls[0][1].logoUrl).toBe('');
  });
});

describe('a logo address that does not load', () => {
  it('says so, and hides the broken preview', async () => {
    const w = await mountSection({ logo_url: '/img/missing.png' });
    await w.find('[data-school-logo-preview]').trigger('error');

    expect(w.find('[data-school-logo-broken]').text()).toMatch(/did not load an image/i);
    expect((w.find('[data-school-logo-preview]').element as HTMLElement).style.display).toBe('none');
  });

  it('warns rather than refusing: the address still saves', async () => {
    // It may be a file not uploaded yet, or a host that is briefly down. The
    // public page withdraws a logo that fails to load, so saving is safe.
    const w = await mountSection({ logo_url: '/img/missing.png' });
    await w.find('[data-school-logo-preview]').trigger('error');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool).toHaveBeenCalled();
    expect(upsertSchool.mock.calls[0][1].logoUrl).toBe('/img/missing.png');
  });

  /*
   * The preview follows the typing after a pause. Fetching on every keystroke
   * would request /i, /im, /img/... -- each failing, each flashing the warning
   * at an admin who has not finished typing.
   */
  it('waits for the typing to pause before fetching the new address', async () => {
    const w = await mountSection({ logo_url: '/img/old.png' });
    vi.useFakeTimers();
    try {
      await w.find('[data-school-logo]').setValue('/img/new.png');
      expect(w.find('[data-school-logo-preview]').attributes('src')).toBe('/img/old.png');

      vi.advanceTimersByTime(500);
      await w.vm.$nextTick();
      expect(w.find('[data-school-logo-preview]').attributes('src')).toBe('/img/new.png');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the warning once a corrected address is shown', async () => {
    const w = await mountSection({ logo_url: '/img/missing.png' });
    await w.find('[data-school-logo-preview]').trigger('error');
    vi.useFakeTimers();
    try {
      await w.find('[data-school-logo]').setValue('/img/legends.png');
      vi.advanceTimersByTime(500);
      await w.vm.$nextTick();

      expect(w.find('[data-school-logo-broken]').exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the photo', () => {
  /*
   * Shown behind the next match on the public home page, and read from the
   * organization's row like the logo. It behaves exactly as the logo field
   * does, because it is the same field.
   */
  it('shows the photo address the row carries, and a preview of it', async () => {
    const w = await mountSection({ hero_url: '/img/legends.jpg' });

    expect((w.find('[data-school-hero]').element as HTMLInputElement).value).toBe('/img/legends.jpg');
    expect(w.find('[data-school-hero-preview]').attributes('src')).toBe('/img/legends.jpg');
  });

  it('is disabled, and says why, on a database without the column', async () => {
    const w = await mountSection();   // CLUB carries no hero_url key at all

    expect(w.find('[data-school-hero]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-school-hero-unmigrated]').text()).toMatch(/0030/);
  });

  it('leaves the photo out of the save on a database without the column', async () => {
    const w = await mountSection({ logo_url: null });
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool.mock.calls[0][1]).not.toHaveProperty('heroUrl');
  });

  it('saves the photo once the column exists', async () => {
    const w = await mountSection({ hero_url: null });
    await w.find('[data-school-hero]').setValue('/img/legends.jpg');
    await w.find('[data-school-save]').trigger('click');
    await flush();

    expect(upsertSchool.mock.calls[0][1].heroUrl).toBe('/img/legends.jpg');
  });

  it('refuses an address the public page would not show, before saving', async () => {
    const w = await mountSection({ hero_url: null });
    await w.find('[data-school-hero]').setValue('//evil.example/x.jpg');

    expect(w.find('[data-school-hero-error]').text()).toMatch(/photo address/i);
    await w.find('[data-school-save]').trigger('click');
    await flush();
    expect(upsertSchool).not.toHaveBeenCalled();
  });

  it('says the colour band shows instead when the photo does not load', async () => {
    const w = await mountSection({ hero_url: '/img/missing.jpg' });
    await w.find('[data-school-hero-preview]').trigger('error');

    expect(w.find('[data-school-hero-broken]').text()).toMatch(/colour band/i);
  });

  it('tells the admin where the subject should sit', async () => {
    const w = await mountSection({ hero_url: null });
    expect(w.find('[data-school-hero-hint]').text()).toMatch(/upper or right/i);
  });
});
