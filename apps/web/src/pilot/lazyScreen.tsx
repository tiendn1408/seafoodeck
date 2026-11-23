import {
  Component,
  lazy,
  Suspense,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import { ErrorNote } from '../learner/ErrorNote';

/** A screen's code could not be downloaded: offline, or a new deploy replaced the chunk files. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'ChunkLoadError';
  }
}

/** Indirection so tests can observe the reload without leaving the page. */
export const pageReload = { run: () => window.location.reload() };

const OFFLINE = 'Không tải được trang này. Kiểm tra kết nối rồi thử lại.';
const STALE = 'Ứng dụng vừa được cập nhật. Tải lại trang để mở trang này.';

class ChunkBoundary extends Component<
  { onRetry: () => void; children: ReactNode },
  { error: unknown; failures: number }
> {
  state = { error: null as unknown, failures: 0 };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown) {
    if (error instanceof ChunkLoadError) this.setState((s) => ({ failures: s.failures + 1 }));
  }
  retry = () => {
    this.props.onRetry();
    this.setState({ error: null });
  };
  render() {
    const { error, failures } = this.state;
    if (error === null) return this.props.children;
    // Only a failed download is handled here; a bug in the screen goes up as before.
    if (!(error instanceof ChunkLoadError)) throw error;
    // The same files failing again while the browser is online: most likely a new deploy whose
    // chunk names differ from this page's, so only a reload of the page can help.
    const stale = failures > 1 && navigator.onLine !== false;
    return stale ? (
      <ErrorNote message={STALE} retry={() => pageReload.run()} retryLabel="Tải lại trang" />
    ) : (
      <ErrorNote message={OFFLINE} retry={this.retry} />
    );
  }
}

/**
 * A screen whose code is a separate chunk, downloaded the first time it renders (never before:
 * the caller decides whether it renders at all). While it downloads a status line shows; a failed
 * download shows an error note with a retry, and the next render tries the download again.
 */
export function lazyScreen<P extends object>(load: () => Promise<ComponentType<P>>) {
  const slot: { current: LazyExoticComponent<ComponentType<P>> } = { current: fresh() };
  function fresh(): LazyExoticComponent<ComponentType<P>> {
    return lazy(() =>
      load().then(
        (screen) => ({ default: screen }),
        (e: unknown) => {
          // React keeps a rejected lazy rejected: the next render gets a new one.
          slot.current = fresh();
          throw new ChunkLoadError(e);
        },
      ),
    );
  }
  function Screen(props: P) {
    const [, retried] = useState(0);
    const Loaded = slot.current;
    return (
      <ChunkBoundary onRetry={() => retried((n) => n + 1)}>
        <Suspense fallback={<p role="status">Đang tải…</p>}>
          <Loaded {...props} />
        </Suspense>
      </ChunkBoundary>
    );
  }
  return Screen;
}
