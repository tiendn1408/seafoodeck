import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, Component, type ReactNode } from 'react';
import { lazyScreen, pageReload } from './lazyScreen';
import { button, click, mount, unmountAll } from '../learner/testDom';

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const offline = () => new TypeError('Failed to fetch dynamically imported module');
function Hello({ name }: { name: string }) {
  return <h1>Xin chào {name}</h1>;
}

describe('lazyScreen', () => {
  it('loads nothing until rendered, shows a status while loading, then the screen', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const load = vi.fn(() => gate.then(() => Hello));
    const Screen = lazyScreen(load);
    expect(load).not.toHaveBeenCalled();
    const host = mount(<Screen name="Lan" />);
    expect(load).toHaveBeenCalledOnce();
    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toBe('Đang tải…');
    release();
    await tick();
    expect(host.querySelector('h1')?.textContent).toBe('Xin chào Lan');
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it('a loaded screen opens again without loading or a status flash', async () => {
    const load = vi.fn(() => Promise.resolve(Hello));
    const Screen = lazyScreen(load);
    mount(<Screen name="Lan" />);
    await tick();
    unmountAll();
    const host = mount(<Screen name="Bình" />);
    expect(host.querySelector('h1')?.textContent).toBe('Xin chào Bình');
    expect(load).toHaveBeenCalledOnce();
  });

  it('a failed load shows the error note; Thử lại loads it again', async () => {
    const load = vi
      .fn<() => Promise<typeof Hello>>()
      .mockRejectedValueOnce(offline())
      .mockResolvedValue(Hello);
    const Screen = lazyScreen(load);
    const host = mount(<Screen name="Lan" />);
    await tick();
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Không tải được trang này.');
    expect(host.querySelector('h1')).toBeNull();
    await click(button(host, 'Thử lại'));
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('h1')?.textContent).toBe('Xin chào Lan');
  });

  it('a screen that failed earlier is tried again when opened again', async () => {
    const load = vi
      .fn<() => Promise<typeof Hello>>()
      .mockRejectedValueOnce(offline())
      .mockResolvedValue(Hello);
    const Screen = lazyScreen(load);
    mount(<Screen name="Lan" />);
    await tick();
    unmountAll();
    const host = mount(<Screen name="Lan" />);
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.querySelector('h1')?.textContent).toBe('Xin chào Lan');
  });

  it('failing again while online (a new deploy replaced the files) offers a page reload', async () => {
    const reload = vi.spyOn(pageReload, 'run').mockImplementation(() => {});
    const load = vi.fn<() => Promise<typeof Hello>>().mockRejectedValue(offline());
    const Screen = lazyScreen(load);
    const host = mount(<Screen name="Lan" />);
    await tick();
    await click(button(host, 'Thử lại'));
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Ứng dụng vừa được cập nhật.',
    );
    await click(button(host, 'Tải lại trang'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('while offline it keeps offering Thử lại, never a reload', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const reload = vi.spyOn(pageReload, 'run').mockImplementation(() => {});
    const load = vi.fn<() => Promise<typeof Hello>>().mockRejectedValue(offline());
    const Screen = lazyScreen(load);
    const host = mount(<Screen name="Lan" />);
    await tick();
    await click(button(host, 'Thử lại'));
    await tick();
    await click(button(host, 'Thử lại'));
    await tick();
    expect(load).toHaveBeenCalledTimes(3);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Kiểm tra kết nối');
    expect(reload).not.toHaveBeenCalled();
  });

  it('an error thrown by the loaded screen itself is not mistaken for a failed load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    class Outer extends Component<{ children: ReactNode }, { caught: boolean }> {
      state = { caught: false };
      static getDerivedStateFromError() {
        return { caught: true };
      }
      render() {
        return this.state.caught ? <p>outer caught</p> : this.props.children;
      }
    }
    function Broken(): ReactNode {
      throw new Error('bug');
    }
    const Screen = lazyScreen(() => Promise.resolve(Broken));
    const host = mount(
      <Outer>
        <Screen />
      </Outer>,
    );
    await tick();
    expect(host.textContent).toBe('outer caught');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
