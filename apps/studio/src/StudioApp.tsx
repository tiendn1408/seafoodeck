import { useEffect, useState } from 'react';
import { api, setCsrf, type AuthView } from '@web/pilot/api';
import { StaffLogin } from '@web/learner/Login';
import { ErrorNote } from '@web/learner/ErrorNote';
import { Admin } from './screens/Admin';
import { UsersAdmin } from './screens/UsersAdmin';
import { ManagerLearners } from './screens/ManagerLearners';

const currentRoute = () => window.location.hash.slice(1) || 'home';

/** Minimal Studio shell (replaced by the full shell in the next step). */
export default function StudioApp() {
  const [auth, setAuth] = useState<AuthView | null>(null),
    [error, setError] = useState(''),
    [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const f = () => setRoute(currentRoute());
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
  if (error) return <ErrorNote message={error} />;
  if (!auth) return <p role="status">Đang kết nối…</p>;
  if (auth.role === 'guest')
    return (
      <StaffLogin
        onLogin={(a) => {
          setCsrf(a.csrf);
          setAuth(a);
        }}
      />
    );
  if (route === 'admin/users') return <UsersAdmin selfId={auth.userId} />;
  if (route === 'manager') return <ManagerLearners admin={auth.role === 'admin'} />;
  return <Admin usersTab={auth.role === 'admin'} />;
}
