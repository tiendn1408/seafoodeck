import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setAuthRequiredHandler, setCsrf, type AuthView, type Game, type MeHome } from './api';
import { stopAudio } from './Media';
import { Admin } from './Admin';
import { AppShell } from '../learner/AppShell';
import { ErrorNote } from '../learner/ErrorNote';
import { ChangePassword } from '../learner/ChangePassword';
import { Login, StaffLogin } from '../learner/Login';
import { clearMe, refreshMe } from '../learner/meStore';
import { Home } from '../learner/Home';
import { Account } from '../learner/Account';
import { ManagerNotice } from '../learner/ManagerNotice';
import { kindOf, routeAllowed } from '../learner/role';
import { loginKind } from '../learner/loginKind';
import { LIBRARY_START, openGroup, type LibraryView } from '../learner/libraryView';
import { Profile } from '../learner/Profile';
import { Library } from '../learner/Library';
import { Review } from '../learner/Review';
import { useMe } from '../learner/meStore';
import type { MeMastery } from './api';
import { Progress } from '../learner/Progress';
import { ignoreVersion } from '../learner/useOverview';
import { Study, type GameUpdate } from '../learner/study/Study';
/**
 * The session a trial (or staff) tab is studying, so a reload on #study reopens it. Tab-scoped
 * and ephemeral; a student's active session always comes from `GET /me/home` instead.
 */
export const TRIAL_SESSION_KEY = 'seafood-deck:study-session';
function rememberSession(id: string | null) {
  try {
    if (id) sessionStorage.setItem(TRIAL_SESSION_KEY, JSON.stringify(id));
    else sessionStorage.removeItem(TRIAL_SESSION_KEY);
  } catch {
    // Storage blocked: a reload simply asks to start a new session.
  }
}
function rememberedSession(): string | null {
  try {
    const id = JSON.parse(sessionStorage.getItem(TRIAL_SESSION_KEY) ?? 'null');
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}
/** After a session starts or finishes, refetch the learner's /me views that are mounted. */
function refreshProgress() {
  for (const path of ['/me/home', '/me/review', '/me/progress', '/me/mastery']) refreshMe(path);
}
/** Library with server mastery for students; other kinds pass an idle id, so no /me request is made. */
function LibraryRoute({
  userId,
  ...props
}: { userId: string | undefined } & Omit<Parameters<typeof Library>[0], 'mastery'>) {
  const mastery = useMe<MeMastery>('/me/mastery', userId).data;
  return <Library {...props} mastery={userId === undefined ? null : mastery} />;
}
function currentRoute() {
  return window.location.hash.slice(1) || 'home';
}
export default function PilotApp() {
  const [auth, setAuth] = useState<AuthView | null>(null),
    [error, setError] = useState(''),
    [route, setRoute] = useState(currentRoute),
    [mustChange, setMustChange] = useState(false);
  const [game, setGame] = useState<Game | null>(null),
    [pending, setPending] = useState(false),
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
  // Stage wrappers follow the route only once it is signed in and permitted for this kind.
  const staged = signedIn && permitted;
  const canStudy = routeAllowed(kind, 'study');
  useEffect(() => {
    if (!permitted) location.replace('#home');
  }, [permitted]);
  // Only students have server-side progress; trial and staff keep the tab's session id.
  const student = kind === 'student';
  function opened(g: Game) {
    setGame(g);
    if (!student) rememberSession(g.id);
    location.hash = 'study';
  }
  async function start(
    mode: string,
    revisionId?: string,
    kind = 'en',
    reviewOf?: string,
    reviewTargets?: { targetId: string; skill: string }[],
    limit?: number,
  ) {
    // Kinds without the study route (managers) never open a learning session.
    if (!canStudy) return;
    setPending(true);
    setError('');
    try {
      const next = await api<Game>('/learning/sessions', {
        mode,
        kind,
        ...(revisionId ? { revisionId } : {}),
        ...(reviewOf ? { reviewOf } : {}),
        ...(reviewTargets ? { reviewTargets } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
      opened(next);
      refreshProgress();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function resume(sessionId: string) {
    setPending(true);
    setError('');
    try {
      opened(await api<Game>(`/learning/sessions/${sessionId}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  // A reload on #study reopens the session being studied: a student's from /me/home
  // (activeSessionId), a trial or staff tab's from sessionStorage. Tried once per sign-in.
  const restoreTried = useRef<string | null>(null);
  // Bumped on logout so a restore still in flight never reopens the previous user's session.
  const signIns = useRef(0);
  const [restoreSettled, setRestoreSettled] = useState<string | null>(null);
  const restoreFor = auth && auth.role !== 'guest' ? `${auth.role}:${auth.userId ?? ''}` : null;
  const restoring =
    restoreFor !== null &&
    restoreSettled !== restoreFor &&
    canStudy &&
    (student || rememberedSession() !== null);
  useEffect(() => {
    if (
      !restoreFor ||
      forced ||
      !permitted ||
      !canStudy ||
      route !== 'study' ||
      game ||
      restoreTried.current === restoreFor
    )
      return;
    restoreTried.current = restoreFor;
    const signIn = signIns.current;
    let alive = true;
    const remembered = student ? null : rememberedSession();
    if (!student && !remembered) return;
    (student ? api<MeHome>('/me/home').then((h) => h.activeSessionId) : Promise.resolve(remembered))
      .then((id) => (id ? api<Game>(`/learning/sessions/${id}`) : null))
      // Applied even if this effect was cleaned up meanwhile (it runs once per sign-in), but
      // never over a session the learner opened in the meantime.
      .then((g) => {
        if (g && signIn === signIns.current) setGame((current) => current ?? g);
      })
      .catch((e) => {
        if (!student) rememberSession(null);
        if (alive) setError(e.message);
      })
      .finally(() => setRestoreSettled(restoreFor));
    return () => {
      alive = false;
    };
  }, [restoreFor, student, forced, permitted, canStudy, route, game]);
  // Stable: Study's background saves apply it even after the study screen has unmounted.
  const changeGame = useCallback<GameUpdate>((update) => setGame((g) => g && update(g)), []);
  // A finished session (every answer confirmed by the server) refreshes the /me views once.
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (
      !game ||
      refreshed.current === game.id ||
      !game.questions.length ||
      !game.questions.every((q) => q.result && !q.result.provisional)
    )
      return;
    refreshed.current = game.id;
    refreshProgress();
  }, [game]);
  const staff = kind === 'staff';
  function logout() {
    void api<AuthView>('/auth/logout', {})
      .then((a) => {
        clearMe();
        setMustChange(false);
        setAuth(a);
        setCsrf(a.csrf);
        signIns.current++;
        restoreTried.current = null;
        setGame(null);
        rememberSession(null);
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
          staged && route === 'home'
            ? 'home-stage'
            : staged && route.startsWith('profile/')
              ? 'profile-stage'
              : staged && route === 'study'
                ? 'study-stage'
                : staged && route === 'account'
                  ? 'account-stage'
                  : staged && ['library', 'review', 'progress'].includes(route)
                    ? 'ice-stage'
                    : 'content home-content'
        }
      >
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
                kind={kind === 'student' || kind === 'trial' ? kind : 'staff'}
                userId={auth.userId}
                pending={pending}
                onStart={start}
                onResume={resume}
                onSignIn={logout}
                onOpenLibrary={(taxon) => {
                  setLibraryView(openGroup(taxon));
                  location.hash = 'library';
                }}
              />
            )}
            {route === 'library' && (
              <LibraryRoute
                userId={kind === 'student' ? auth.userId : undefined}
                view={libraryView}
                onView={setLibraryView}
                onVersion={ignoreVersion}
              />
            )}
            {route.startsWith('profile/') && (
              <Profile
                key={route}
                id={route.split('/')[1]}
                internal={auth.internal}
                canStudy={canStudy}
                onStart={start}
              />
            )}
            {route === 'study' &&
              (game ? (
                <Study
                  key={game.id}
                  game={game}
                  userKind={student ? 'student' : kind === 'trial' ? 'trial' : 'staff'}
                  onChange={changeGame}
                  onRetry={() => start('review', undefined, 'en', game.id)}
                  pending={pending}
                />
              ) : (
                <p className="study-status" role="status">
                  {pending || restoring ? 'Đang khôi phục phiên…' : 'Mở lượt mới từ trang Học.'}
                </p>
              ))}
            {route === 'review' && auth.userId !== undefined && (
              <Review userId={auth.userId} pending={pending} onStart={start} />
            )}
            {route === 'progress' && auth.userId !== undefined && <Progress userId={auth.userId} />}
            {route === 'account' && (
              <Account
                userId={auth.userId}
                onLogout={logout}
                onSaved={(displayName) => setAuth((a) => a && { ...a, displayName })}
              />
            )}
            {route === 'admin' && staff && <Admin />}
          </>
        )}
      </div>
    </AppShell>
  );
}
