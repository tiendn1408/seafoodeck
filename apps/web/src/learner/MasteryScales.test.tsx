import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MasteryScales } from './MasteryScales';

function render(node: React.ReactElement) {
  const host = document.createElement('div');
  host.innerHTML = renderToString(node);
  return host;
}

describe('MasteryScales', () => {
  it('fills one scale per review milestone reached', () => {
    const host = render(<MasteryScales level={2} />);
    const img = host.querySelector('[role="img"]')!;
    expect(img.getAttribute('aria-label')).toBe('Mức nhớ 2/4');
    expect(host.querySelectorAll('.mastery-scale')).toHaveLength(4);
    expect(host.querySelectorAll('.mastery-scale.on')).toHaveLength(2);
  });

  it('reads "Chưa học" with no filled scale at level 0', () => {
    const host = render(<MasteryScales level={0} />);
    expect(host.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Chưa học');
    expect(host.querySelectorAll('.mastery-scale.on')).toHaveLength(0);
  });

  it('fills all four at level 4 and draws shapes, never an image', () => {
    const host = render(<MasteryScales level={4} />);
    expect(host.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Mức nhớ 4/4');
    expect(host.querySelectorAll('.mastery-scale.on')).toHaveLength(4);
    expect(host.querySelector('img')).toBeNull();
  });
});
