import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FloatRope } from './FloatRope';

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
});
