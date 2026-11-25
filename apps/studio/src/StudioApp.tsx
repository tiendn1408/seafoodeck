import { useEffect, useRef, useState } from 'react';
import {
  api,
  setAuthRequiredHandler,
  setCsrf,
  setUnauthorizedHandler,
  type AuthView,
} from '@web/pilot/api';
import { confirmLeave, leaveGuarded, setLeaveGuard } from '@web/pilot/leaveGuard';
import { stopAudio } from '@web/pilot/Media';
import { ErrorNote } from '@web/learner/ErrorNote';
import { ChangePassword } from '@web/learner/ChangePassword';
import { Account } from '@web/learner/Account';
import { clearMe } from '@web/learner/meStore';
import { LIBRARY_START, type LibraryView } from '@web/learner/libraryView';
import { Library } from '@web/learner/Library';
import { Profile } from '@web/learner/Profile';
import { ignoreVersion } from '@web/learner/useOverview';
import { StudioShell } from './StudioShell';
import { StaffLogin } from './StaffLogin';
import { homeOf, kindOf, routeAllowed } from './role';
import { Admin } from './screens/Admin';
import { UsersAdmin } from './screens/UsersAdmin';
import { ManagerLearners } from './screens/ManagerLearners';
import { ManagerLearnerDetail } from './screens/ManagerLearnerDetail';

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
/** Viewers here only browse the deck: no study actions on species profiles. */
const noStudy = async () => {};

/**
 * The Studio shell: staff sign-in, forced password change, 401 → sign-in, CSRF adoption after a
 * password change, the one-time-password leave guard, and the screens each kind may open.
 */
export default function StudioApp() {
  const [auth, setAuth] = useState<AuthView | null>(null),
    [error, setError] = useState(''),
    [route, setRoute] = useState(currentRoute),
    [mustChange, setMustChange] = useState(false),
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
  // The session is gone (expired, revoked, account locked): back to the sign-in, quietly.
  const sessionLost = useRef<() => void>(() => {});
  useEffect(() => setUnauthorizedHandler(() => sessionLost.current()), []);

  const kind = kindOf(auth);
  const signedIn = kind !== 'guest';
  // Only an authenticated session can be forced; a flag raised while a guest never sticks.
  const forced = !!auth && signedIn && (mustChange || auth.mustChangePassword === true);
  const permitted = !signedIn || forced || routeAllowed(kind, route);
  const staged = signedIn && permitted && !forced;
  useEffect(() => {
    // A route this kind may not open goes to its home (replace, so Back does not bounce).
    if (signedIn && !permitted) location.replace('#' + homeOf(kind));
  }, [signedIn, permitted, kind]);

  const leaving = useRef(false);
  function reset(a: AuthView) {
    clearMe();
    setMustChange(false);
    setAuth(a);
    setCsrf(a.csrf);
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
          // A stray 401 while the same user is still signed in: adopt the fresh view only.
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
          // Whatever the failed request reports is moot now: the sign-in replaces it.
          setLeaveGuard(null);
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

  const loginShown = !!auth && !signedIn;
  return (
    <StudioShell
      route={route}
      tone={
        forced || loginShown || route === 'account' || route.startsWith('profile/') ? 'deep' : 'ice'
      }
      kind={kind}
      signedIn={signedIn && !forced}
      onLogout={() => void logout()}
    >
      <div
        className={
          staged && route.startsWith('profile/')
            ? 'profile-stage'
            : staged && route === 'account'
              ? 'account-stage'
              : staged && (route === 'library' || route.startsWith('manager/learner/'))
                ? 'ice-stage'
                : 'content home-content'
        }
      >
        {error && <ErrorNote message={error} retry={() => location.reload()} />}
        {!auth ? (
          !error && <p role="status">Đang kết nối…</p>
        ) : forced ? (
          <ChangePassword
            forced
            role={auth.role}
            onLogout={() => void logout()}
            onDone={(session) => {
              clearMe();
              adoptSession(session);
              setMustChange(false);
            }}
          />
        ) : !signedIn ? (
          <StaffLogin
            onLogin={(a) => {
              setCsrf(a.csrf);
              setMustChange(false);
              setAuth(a);
            }}
          />
        ) : !permitted ? null : (
          <>
            {route === 'admin' && <Admin usersTab={kind === 'admin'} />}
            {route === 'admin/users' && <UsersAdmin selfId={auth.userId} />}
            {route === 'manager' && <ManagerLearners admin={kind === 'admin'} />}
            {route.startsWith('manager/learner/') && auth.userId !== undefined && (
              <ManagerLearnerDetail key={route} id={routeId(route)} userId={auth.userId} />
            )}
            {route === 'library' && (
              <Library
                view={libraryView}
                onView={setLibraryView}
                onVersion={ignoreVersion}
                mastery={null}
              />
            )}
            {route.startsWith('profile/') && (
              <Profile
                key={route}
                id={route.split('/')[1]}
                internal={auth.internal}
                canStudy={false}
                onStart={noStudy}
              />
            )}
            {route === 'account' && (
              <Account
                role={auth.role}
                userId={auth.userId}
                onLogout={() => void logout()}
                onSaved={(displayName) => setAuth((a) => a && { ...a, displayName })}
                onPasswordChanged={adoptSession}
              />
            )}
          </>
        )}
      </div>
    </StudioShell>
  );
}
