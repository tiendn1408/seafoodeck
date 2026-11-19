import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Home } from './Home';
import { empty } from './ledger';

describe('Home loading state', () => {
  it('names the hero region with a (visually hidden) heading', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(
      <Home
        ledger={empty}
        now={0}
        pending={false}
        onStart={async () => {}}
        onVersion={() => {}}
        onOpenLibrary={() => {}}
      />,
    );
    const hero = host.querySelector('[aria-labelledby="home-title"]')!;
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Đang tải');
    const title = host.querySelector('#home-title');
    expect(title?.tagName).toBe('H1');
    expect(hero.contains(title)).toBe(true);
  });
});
