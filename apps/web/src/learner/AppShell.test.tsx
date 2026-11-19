import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AppShell } from './AppShell';

function shell(tone: 'deep' | 'ice') {
  const host = document.createElement('div');
  host.innerHTML = renderToString(
    <AppShell route="home" tone={tone} staff={false} internal={false} signedIn onLogout={() => {}}>
      <p>nội dung</p>
    </AppShell>,
  );
  return host;
}
const toggle = (host: HTMLElement) => host.querySelector('[aria-label^="Chuyển sang giao diện"]');

describe('AppShell theme toggle', () => {
  it('shows on ice screens, where the theme applies', () => {
    expect(toggle(shell('ice'))).not.toBeNull();
  });
  it('is hidden on deep screens, which never change with the theme', () => {
    const host = shell('deep');
    expect(toggle(host)).toBeNull();
    expect(host.querySelector('[aria-label="Đăng xuất"]')).not.toBeNull();
  });
});
