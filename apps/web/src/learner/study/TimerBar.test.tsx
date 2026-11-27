import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmountAll } from '../testDom';
import { TimerBar } from './TimerBar';

afterEach(() => unmountAll());

const bar = (host: HTMLElement) => host.querySelector<HTMLElement>('.study-timer')!;

describe('TimerBar', () => {
  it('shows mm:ss for 45 s, without the warm state', () => {
    const host = mount(<TimerBar remainingMs={45000} totalMs={45000} />);
    expect(bar(host).textContent).toBe('00:45');
    expect(bar(host).classList.contains('is-warm')).toBe(false);
  });

  it('rounds a part second up, so 44.2 s still reads 00:45', () => {
    const host = mount(<TimerBar remainingMs={44200} totalMs={45000} />);
    expect(bar(host).textContent).toBe('00:45');
  });

  it('turns warm at 10 s or less', () => {
    const nine = mount(<TimerBar remainingMs={9000} totalMs={45000} />);
    expect(bar(nine).textContent).toBe('00:09');
    expect(bar(nine).classList.contains('is-warm')).toBe(true);
    unmountAll();
    const ten = mount(<TimerBar remainingMs={10000} totalMs={45000} />);
    expect(bar(ten).classList.contains('is-warm')).toBe(true);
  });

  it('shows 00:00 at the end and minutes past a minute', () => {
    expect(bar(mount(<TimerBar remainingMs={0} totalMs={45000} />)).textContent).toBe('00:00');
    unmountAll();
    expect(bar(mount(<TimerBar remainingMs={75000} totalMs={90000} />)).textContent).toBe('01:15');
  });

  it('is named "Thời gian còn lại" and is not a live region', () => {
    const host = mount(<TimerBar remainingMs={30000} totalMs={45000} />);
    const el = bar(host);
    expect(el.getAttribute('aria-label')).toBe('Thời gian còn lại');
    const live = ['status', 'alert', 'log', 'marquee', 'timer', 'progressbar'];
    for (const node of [el, ...el.querySelectorAll('*')]) {
      expect(node.getAttribute('aria-live')).toBeNull();
      expect(live).not.toContain(node.getAttribute('role'));
    }
  });

  it('draws the track as the share of the budget left', () => {
    const host = mount(<TimerBar remainingMs={15000} totalMs={60000} />);
    const fill = host.querySelector<HTMLElement>('.study-timer-fill')!;
    expect(fill.style.transform).toBe('scaleX(0.25)');
    expect(fill.parentElement?.getAttribute('aria-hidden')).toBe('true');
  });
});
