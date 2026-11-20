import { LogIn } from 'lucide-react';
import './account.css';

/** Trial (invite-code) learners only: a calm card inviting them to sign in with an account. */
export function TrialNudge({ onSignIn }: { onSignIn: () => void }) {
  return (
    <aside className="role-card trial-nudge" aria-labelledby="trial-nudge-title">
      <h2 id="trial-nudge-title">Đăng nhập để lưu tiến độ</h2>
      <p>Bạn đang học thử bằng mã mời. Có tài khoản học viên thì tiến độ được giữ lại.</p>
      <button type="button" className="role-card-action" onClick={onSignIn}>
        <LogIn size={18} aria-hidden="true" /> Đăng nhập
      </button>
    </aside>
  );
}
