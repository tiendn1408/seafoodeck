import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FloatRope, floatX, ropePath } from './FloatRope';

function render(node: React.ReactElement) {
  const host = document.createElement('div');
  host.innerHTML = renderToString(node);
  return host;
}

describe('FloatRope', () => {
  it('labels progress by the number of correct floats', () => {
    const host = render(
      <FloatRope
        total={5}
        done={[
          { index: 0, group: 'fish', correct: true },
          { index: 1, group: 'crustacean', correct: true },
        ]}
      />,
    );
    const rope = host.querySelector('[role="img"]')!;
    expect(rope.getAttribute('aria-label')).toBe('Tiến độ mẻ lưới: 2 / 5');
    expect(host.querySelectorAll('.float')).toHaveLength(5);
    expect(host.querySelectorAll('.float.caught')).toHaveLength(2);
    expect(host.querySelector('.float.caught')!.textContent).toBe('1');
  });

  it('marks a wrong or skipped float as missed and leaves the rest empty', () => {
    const host = render(
      <FloatRope
        total={4}
        done={[
          { index: 0, group: 'mollusc', correct: true },
          { index: 2, group: 'fish', correct: false },
        ]}
      />,
    );
    const floats = host.querySelectorAll('.float');
    expect(floats[2].classList.contains('missed')).toBe(true);
    expect(floats[1].classList.contains('empty')).toBe(true);
    expect(host.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe(
      'Tiến độ mẻ lưới: 1 / 4',
    );
  });

  it('rings only the unanswered float in play', () => {
    const host = render(
      <FloatRope total={3} current={1} done={[{ index: 0, group: 'fish', correct: true }]} />,
    );
    const floats = host.querySelectorAll('.float');
    expect(floats[1].classList.contains('current')).toBe(true);
    expect(host.querySelectorAll('.float.current')).toHaveLength(1);
    const answered = render(
      <FloatRope total={3} current={0} done={[{ index: 0, group: 'fish', correct: true }]} />,
    );
    expect(answered.querySelectorAll('.float.current')).toHaveLength(0);
  });

  it('ties every float to the rope, a single float in the middle', () => {
    expect(floatX(0, 1)).toBe(50);
    expect(floatX(0, 5)).toBe(4);
    expect(floatX(4, 5)).toBe(96);
    expect(ropePath(5).match(/Q/g)).toHaveLength(6);
    const host = render(<FloatRope total={2} done={[]} />);
    const xs = [...host.querySelectorAll<HTMLElement>('.float')].map((f) =>
      f.style.getPropertyValue('--x'),
    );
    expect(xs).toEqual(['4', '96']);
  });
});
