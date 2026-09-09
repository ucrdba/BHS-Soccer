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
});
