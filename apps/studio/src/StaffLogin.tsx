import type { AuthView } from '@web/pilot/api';
import { LoginScreen } from '@web/learner/Login';

/** The Studio sign-in: account and password only (no invite code, no trial). */
export function StaffLogin(props: { onLogin: (a: AuthView) => void }) {
  return (
    <LoginScreen
      {...props}
      mode="account"
      userLabel="Tài khoản"
      title="Đăng nhập quản trị"
      intro="Đăng nhập bằng tài khoản được cấp."
      submit="Đăng nhập"
    />
  );
}
