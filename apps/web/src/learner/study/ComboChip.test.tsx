import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { unmountAll } from '../testDom';
import { ComboChip } from './ComboChip';

afterEach(unmountAll);

describe('ComboChip', () => {
  it.each([0, 1])('renders no pill (an empty live region) for %i', (n) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ComboChip current={n} />));
    expect(host.querySelector('.combo-chip')).toBeNull();
    const slot = host.querySelector('[role="status"]');
    expect(slot).not.toBeNull();
    expect(slot?.innerHTML).toBe('');
    act(() => root.unmount());
    host.remove();
  });

  it.each([2, 5])('shows Combo ×%i as a status', (n) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ComboChip current={n} />));
    const el = host.querySelector('[role="status"]');
    expect(el?.textContent).toBe(`Combo ×${n}`);
    act(() => root.unmount());
    host.remove();
  });

  it('disappears without a trace when the streak ends', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ComboChip current={3} />));
    expect(host.textContent).toBe('Combo ×3');
    act(() => root.render(<ComboChip current={0} />));
    expect(host.textContent).toBe('');
    expect(host.querySelector('.combo-chip')).toBeNull();
    act(() => root.unmount());
    host.remove();
  });
});
