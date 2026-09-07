/**
 * The frame every touchline screen sits in.
 *
 * A tool route renders without the app's header and nav, so the screen has
 * to carry its own way back — a coach who cannot leave the live board is
 * stuck. The body scrolls between two fixed bars, which is what keeps the
 * clock and the event buttons on screen while the squad list moves.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolScreen from './ToolScreen.vue';

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : to.name"><slot /></a>'
};

function mountTool(props: Record<string, any> = {}, slots: Record<string, string> = {}) {
  return mount(ToolScreen, {
    props: { title: 'Lineup', backTo: { name: 'schedule' }, ...props },
    slots,
    global: { stubs: { RouterLink: RouterLinkStub } }
  });
}

describe('ToolScreen', () => {
  it('names the screen and offers a way back', () => {
    const w = mountTool();
    expect(w.find('[data-tool-title]').text()).toBe('Lineup');
    const back = w.find('[data-tool-back]');
    expect(back.exists()).toBe(true);
    expect(back.text()).toBe('Back');
  });

  it('takes a kicker above the title, and renders none when there is none', () => {
    expect(mountTool({ kicker: '2nd half · vs Cedar Ridge' }).find('[data-tool-kicker]').text())
      .toBe('2nd half · vs Cedar Ridge');
    expect(mountTool().find('[data-tool-kicker]').exists()).toBe(false);
  });

  it('lets the back link be named for where it goes', () => {
    expect(mountTool({ backLabel: 'Schedule' }).find('[data-tool-back]').text()).toBe('Schedule');
  });

  it('renders the body, the top-right control and the footer', () => {
    const w = mountTool({}, {
      default: '<p data-body>the squad</p>',
      'top-right': '<button data-control>4-3-3</button>',
      foot: '<button data-save>Save lineup</button>'
    });
    expect(w.find('[data-body]').text()).toBe('the squad');
    expect(w.find('[data-control]').exists()).toBe(true);
    expect(w.find('[data-tool-foot] [data-save]').exists()).toBe(true);
  });

  it('draws no footer bar at all when nothing is in it', () => {
    // An empty bar is a strip of surface taking room the squad list needs.
    expect(mountTool().find('[data-tool-foot]').exists()).toBe(false);
  });
});
