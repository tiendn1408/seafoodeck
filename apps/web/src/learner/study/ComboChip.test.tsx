import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { mount, unmountAll } from '../testDom';
import { ComboChip } from './ComboChip';

afterEach(unmountAll);

describe('ComboChip', () => {
  it.each([0, 1])('renders no pill (an empty live region) for %i', (n) => {
    const host = mount(<ComboChip current={n} />);
    expect(host.querySelector('.combo-chip')).toBeNull();
    const slot = host.querySelector('[role="status"]');
    expect(slot).not.toBeNull();
    expect(slot?.innerHTML).toBe('');
  });

  it.each([2, 5])('shows Combo ×%i as a status', (n) => {
    const host = mount(<ComboChip current={n} />);
    const el = host.querySelector('[role="status"]');
    expect(el?.textContent).toBe(`Combo ×${n}`);
  });

  it('disappears without a trace when the streak ends', () => {
    let set: (n: number) => void = () => {};
    function Harness() {
      const [n, setN] = useState(3);
      set = setN;
      return <ComboChip current={n} />;
    }
    const host = mount(<Harness />);
    expect(host.textContent).toBe('Combo ×3');
    act(() => set(0));
    expect(host.textContent).toBe('');
    expect(host.querySelector('.combo-chip')).toBeNull();
  });
});
