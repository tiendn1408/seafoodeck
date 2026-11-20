import { useEffect, useState } from 'react';
import {
  api,
  setAuthRequiredHandler,
  setCsrf,
  writeLocal,
  type AuthView,
  type Game,
  type Score,
} from './api';
import { stopAudio } from './Media';
import { Admin } from './Admin';
import { AppShell } from '../learner/AppShell';
import { ErrorNote } from '../learner/ErrorNote';
import { ChangePassword } from '../learner/ChangePassword';
import { Login, StaffLogin } from '../learner/Login';
import { clearMe } from '../learner/meStore';
import { Home } from '../learner/Home';
import { Account } from '../learner/Account';
import { ManagerNotice } from '../learner/ManagerNotice';
import { kindOf, routeAllowed } from '../learner/role';
import { loginKind } from '../learner/loginKind';
import { LIBRARY_START, openGroup, type LibraryView } from '../learner/libraryView';
import { Profile } from '../learner/Profile';
import { Library } from '../learner/Library';
import { Review } from '../learner/Review';
import { Progress } from '../learner/Progress';
import { Study } from '../learner/study/Study';
import { LEDGER_KEY, loadLedger, mergeScore, mergeGame, type Ledger } from '../learner/ledger';
function currentRoute() {
  return window.location.hash.slice(1) || 'home';
}
export default function PilotApp() {
  const [initial] = useState(loadLedger);
  const [warning, setWarning] = useState(initial.warning);
  const [auth, setAuth] = useState<AuthView | null>(null),
    [error, setError] = useState(''),
    [route, setRoute] = useState(currentRoute),
    [ledger, setLedger] = useState<Ledger>(initial.ledger),
    [saved, setSaved] = useState(true),
    [mustChange, setMustChange] = useState(false);
  const [game, setGame] = useState<Game | null>(null),
    [pending, setPending] = useState(false),
    [version, setVersion] = useState(''),
    [libraryView, setLibraryView] = useState<LibraryView>(LIBRARY_START);
  useEffect(() => {
    const f = () => {
      const next = currentRoute();
      setRoute(next);
      window.scrollTo(0, 0);
      setError('');
      stopAudio();
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => {
    void api<AuthView>('/auth/me')
      .then((a) => {
        setCsrf(a.csrf);
        setAuth(a);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => setAuthRequiredHandler(() => setMustChange(true)), []);
  const signedIn = !!auth && auth.role !== 'guest';
  // Only an authenticated session can be forced; a flag raised while a guest never sticks.
  const forced = !!auth && signedIn && (mustChange || auth.mustChangePassword === true);
  const loginShown = !!auth && !forced && !!loginKind(route, auth.role);
  const kind = kindOf(auth);
  // A route this kind may not open goes back to home (replace, so Back does not bounce).
  const permitted = !auth || forced || routeAllowed(kind, route);
  useEffect(() => {
    if (!permitted) location.replace('#home');
  }, [permitted]);
  function persist(next: Ledger) {
    setLedger(next);
    setWarning('');
    setSaved(writeLocal(LEDGER_KEY, next));
  }
  async function start(
    mode: string,
    revisionId?: string,
    kind = 'en',
    reviewOf?: string,
    reviewTargets?: { targetId: string; skill: string }[],
  ) {
    setPending(true);
    setError('');
    try {
      const next = await api<Game>('/learning/sessions', {
        mode,
        kind,
        ...(revisionId ? { revisionId } : {}),
        ...(reviewOf ? { reviewOf } : {}),
        ...(reviewTargets ? { reviewTargets } : {}),
      });
      setGame(next);
      persist({ ...ledger, sessionId: next.id });
      location.hash = 'study';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function resume() {
    if (!ledger.sessionId) return;
    setPending(true);
    setError('');
    try {
      const restored = await api<Game>(`/learning/sessions/${ledger.sessionId}`);
      setGame(restored);
      persist(mergeGame(ledger, restored));
      location.hash = 'study';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (
      !auth ||
      auth.role === 'guest' ||
      forced ||
      !permitted ||
      route !== 'study' ||
      game ||
      !ledger.sessionId
    )
      return;
    let alive = true;
    api<Game>(`/learning/sessions/${ledger.sessionId}`)
      .then((g) => {
        if (alive) {
          setGame(g);
          const restored = mergeGame(ledger, g);
          setLedger(restored);
          setSaved(writeLocal(LEDGER_KEY, restored));
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [auth, forced, permitted, route, game, ledger]);
  function record(result: Score, g: Game) {
    persist(mergeScore(ledger, result, g));
  }
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const active = ledger.attempts.filter((a) => a.contentVersion === version && !a.skipped),
    reviews = Object.values(ledger.reviews).filter((r) => r.contentVersion === version);
  const staff = kind === 'staff';
  function logout() {
    void api<AuthView>('/auth/logout', {})
      .then((a) => {
        clearMe();
        setMustChange(false);
        setAuth(a);
        setCsrf(a.csrf);
        setGame(null);
        location.hash = 'home';
      })
      .catch((e) => setError(e.message));
  }
  return (
    <AppShell
      route={route}
      tone={
        forced ||
        loginShown ||
        route === 'home' ||
        route === 'study' ||
        route === 'account' ||
        route.startsWith('profile/')
          ? 'deep'
          : 'ice'
      }
      kind={kind}
      userName={auth?.displayName ?? undefined}
      internal={!!auth?.internal}
      signedIn={signedIn && !forced}
      onLogout={logout}
    >
      <div
        className={
          route === 'home' && signedIn
            ? 'home-stage'
            : route.startsWith('profile/') && signedIn
              ? 'profile-stage'
              : route === 'study' && signedIn
                ? 'study-stage'
                : route === 'account' && signedIn
                  ? 'account-stage'
                  : ['library', 'review', 'progress'].includes(route) && signedIn
                    ? 'ice-stage'
                    : 'content home-content'
        }
      >
        {warning && <ErrorNote message={warning} />}
        {!saved && (
          <ErrorNote message="Trình duyệt không lưu được tiến độ. Phiên trên máy chủ vẫn hoạt động, nhưng cần giữ trang này mở." />
        )}
        {error && <ErrorNote message={error} retry={() => location.reload()} />}
        {!auth ? (
          !error && <p role="status">Đang kết nối bộ học…</p>
        ) : forced ? (
          <ChangePassword
            forced
            role={auth.role}
            onLogout={logout}
            onDone={() => {
              clearMe();
              void api<AuthView>('/auth/me')
                .then((a) => {
                  setCsrf(a.csrf);
                  setAuth(a);
                  setMustChange(false);
                })
                .catch((e) => setError(e.message));
            }}
          />
        ) : loginKind(route, auth.role) ? (
          (() => {
            const onLogin = (a: AuthView) => {
              setCsrf(a.csrf);
              setMustChange(false);
              setAuth(a);
            };
            return loginKind(route, auth.role) === 'staff' ? (
              <StaffLogin onLogin={onLogin} />
            ) : (
              <Login onLogin={onLogin} />
            );
          })()
        ) : !permitted ? null : (
          <>
            {route === 'home' && kind === 'manager' && <ManagerNotice />}
            {route === 'home' && kind !== 'manager' && (
              <Home
                ledger={ledger}
                now={now}
                pending={pending}
                onStart={start}
                onResume={ledger.sessionId ? resume : undefined}
                onVersion={setVersion}
                onOpenLibrary={(taxon) => {
                  setLibraryView(openGroup(taxon));
                  location.hash = 'library';
                }}
              />
            )}
            {route === 'library' && (
              <Library
                view={libraryView}
                onView={setLibraryView}
                reviews={reviews}
                onVersion={setVersion}
              />
            )}
            {route.startsWith('profile/') && (
              <Profile
                key={route}
                id={route.split('/')[1]}
                internal={auth.internal}
                onStart={start}
              />
            )}
            {route === 'study' &&
              (game ? (
                <Study
                  key={game.id}
                  game={game}
                  ledger={ledger}
                  onChange={setGame}
                  onRecord={record}
                  onRetry={() => start('review', undefined, 'en', game.id)}
                  pending={pending}
                />
              ) : (
                <p className="study-status" role="status">
                  {pending ? 'Đang khôi phục phiên…' : 'Mở lượt mới từ trang Học.'}
                </p>
              ))}
            {route === 'review' && (
              <Review
                ledger={ledger}
                reviews={reviews}
                now={now}
                pending={pending}
                onStart={start}
                onVersion={setVersion}
              />
            )}
            {route === 'progress' && (
              <Progress attempts={active} reviews={reviews} onVersion={setVersion} />
            )}
            {route === 'account' && (
              <Account
                userId={auth.userId}
                onLogout={logout}
                onSaved={(displayName) => setAuth({ ...auth, displayName })}
              />
            )}
            {route === 'admin' && staff && <Admin />}
          </>
        )}
      </div>
    </AppShell>
  );
}
