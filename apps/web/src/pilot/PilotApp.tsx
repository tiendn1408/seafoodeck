import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  setAuthRequiredHandler,
  setCsrf,
  setUnauthorizedHandler,
  type AuthView,
  type Game,
  type MeHome,
} from './api';
import { confirmLeave, leaveGuarded, setLeaveGuard } from './leaveGuard';
import { stopAudio } from './Media';
import { Admin } from './Admin';
import { UsersAdmin } from './UsersAdmin';
import { AppShell } from '../learner/AppShell';
import { ErrorNote } from '../learner/ErrorNote';
import { ChangePassword } from '../learner/ChangePassword';
import { Login, StaffLogin } from '../learner/Login';
import { clearMe, refreshMe } from '../learner/meStore';
import { Home } from '../learner/Home';
import { Account } from '../learner/Account';
import { ManagerLearners } from '../manager/ManagerLearners';
import { ManagerLearnerDetail } from '../manager/ManagerLearnerDetail';
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
import { adoptingTotal, disposeAll, flushAll, pendingTotal } from '../learner/study/submitQueues';
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
/** The learner id in `manager/learner/<id>`: the hash carries it percent-encoded, decode it once. */
function routeId(route: string) {
  const raw = route.split('/')[2] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
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
  // The route on screen, and a hash change we undo ourselves (it must not count as navigation).
  const shown = useRef(route);
  useEffect(() => {
    shown.current = route;
  }, [route]);
  const undoing = useRef(false);
  useEffect(() => {
    const f = () => {
      const next = currentRoute();
      if (undoing.current) {
        undoing.current = false;
        return;
      }
      // Something that cannot be shown again (an admin's own temporary password) is on screen.
      if (next !== shown.current && leaveGuarded() && !confirmLeave()) {
        undoing.current = true;
        location.replace('#' + shown.current);
        return;
      }
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
  // The session is gone (for example the account was locked and the server deleted it): back to
  // the sign-in as a guest, quietly. Set below, once the helpers it resets exist.
  const sessionLost = useRef<() => void>(() => {});
  useEffect(() => setUnauthorizedHandler(() => sessionLost.current()), []);
  const signedIn = !!auth && auth.role !== 'guest';
  // Only an authenticated session can be forced; a flag raised while a guest never sticks.
  const forced = !!auth && signedIn && (mustChange || auth.mustChangePassword === true);
  const loginShown = !!auth && !forced && !!loginKind(route, auth.role);
  const kind = kindOf(auth);
  // A route this kind may not open goes back to home (replace, so Back does not bounce).
  // A manager's home is the learner table: its own rule, ahead of the general redirect.
  const managerHome = !!auth && !forced && kind === 'manager' && route === 'home';
  const permitted = !auth || forced || managerHome || routeAllowed(kind, route);
  // Stage wrappers follow the route only once it is signed in, permitted for this kind and not
  // forced: the forced password screen uses the plain content wrapper, like the login screens.
  const staged = signedIn && permitted && !forced && !managerHome;
  const canStudy = routeAllowed(kind, 'study');
  useEffect(() => {
    if (managerHome) location.replace('#manager');
    else if (!permitted) location.replace('#home');
  }, [permitted, managerHome]);
  // Only students have server-side progress; trial and staff keep the tab's session id.
  const student = kind === 'student';
  function opened(g: Game) {
    // Reopening the session this tab already holds keeps answers whose save is still queued.
    setGame((current) =>
      current?.id === g.id
        ? {
            ...g,
            questions: g.questions.map((q) => {
              const mine = current.questions.find((x) => x.id === q.id)?.result;
              return !q.result && mine ? { ...q, result: mine } : q;
            }),
          }
        : g,
    );
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
  // Admins are staff-like everywhere (content area, no /me/*) and also manage accounts.
  const staff = kind === 'staff' || kind === 'admin';
  // True while logout waits for self-ratings still being saved in the background.
  const [saving, setSaving] = useState(false);
  const leaving = useRef(false);
  function reset(a: AuthView) {
    clearMe();
    setMustChange(false);
    setAuth(a);
    setCsrf(a.csrf);
    signIns.current++;
    disposeAll();
    restoreTried.current = null;
    setGame(null);
    rememberSession(null);
  }
  const recovering = useRef(false);
  // The signed-in view as of the latest render, read when /auth/me answers after a 401.
  const authNow = useRef(auth);
  useEffect(() => {
    authNow.current = auth;
    sessionLost.current = () => {
      if (recovering.current) return;
      recovering.current = true;
      void api<AuthView>('/auth/me')
        .then((a) => {
          const was = authNow.current;
          // A stray 401 (for example a request sent with a session that has since rotated)
          // while the same user is still signed in: keep their queues and screen, adopt the
          // fresh view only.
          if (
            a.role !== 'guest' &&
            a.userId !== undefined &&
            a.role === was?.role &&
            a.userId === was.userId
          ) {
            setCsrf(a.csrf);
            setAuth(a);
            return;
          }
          // Whatever the failed request reports is moot now: the login screen replaces it.
          reset(a);
          setError('');
        })
        .catch(() => {})
        .finally(() => void (recovering.current = false));
    };
  });
  /** The session view a password change answered with (ChangePassword already holds its csrf). */
  function adoptSession(s: AuthView) {
    setAuth(
      (a) =>
        a && {
          ...a,
          csrf: s.csrf ?? a.csrf,
          expiresAt: s.expiresAt ?? a.expiresAt,
          displayName: s.displayName !== undefined ? s.displayName : a.displayName,
          mustChangePassword: false,
        },
    );
  }
  async function logout() {
    // Held until the logout request is over, so a second click never sends a second one.
    if (leaving.current) return;
    if (!confirmLeave()) return;
    leaving.current = true;
    try {
      if (pendingTotal() > 0 || adoptingTotal() > 0) {
        setSaving(true);
        let saved: boolean;
        try {
          saved = await flushAll(5000);
        } finally {
          setSaving(false);
        }
        if (
          !saved &&
          !window.confirm('Còn câu chưa lưu được. Đăng xuất sẽ mất các câu này. Vẫn đăng xuất?')
        )
          return;
      }
      const a = await api<AuthView>('/auth/logout', {});
      setLeaveGuard(null);
      reset(a);
      location.hash = 'home';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      leaving.current = false;
    }
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
      onLogout={() => void logout()}
      logoutBusy={saving}
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
                  : staged &&
                      (['library', 'review', 'progress'].includes(route) ||
                        route.startsWith('manager/learner/'))
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
            onLogout={() => void logout()}
            saving={saving}
            onDone={(session) => {
              clearMe();
              adoptSession(session);
              setMustChange(false);
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
        ) : !permitted || managerHome ? null : (
          <>
            {route === 'manager' && <ManagerLearners admin={kind === 'admin'} />}
            {route.startsWith('manager/learner/') && auth.userId !== undefined && (
              <ManagerLearnerDetail key={route} id={routeId(route)} userId={auth.userId} />
            )}
            {route === 'home' && kind !== 'manager' && (
              <Home
                kind={kind === 'student' || kind === 'trial' ? kind : 'staff'}
                userId={auth.userId}
                pending={pending}
                onStart={start}
                onResume={resume}
                onSignIn={() => void logout()}
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
                onLogout={() => void logout()}
                onSaved={(displayName) => setAuth((a) => a && { ...a, displayName })}
                onPasswordChanged={adoptSession}
              />
            )}
            {route === 'admin' && staff && <Admin usersTab={kind === 'admin'} />}
            {route === 'admin/users' && kind === 'admin' && <UsersAdmin selfId={auth.userId} />}
          </>
        )}
      </div>
    </AppShell>
  );
}
