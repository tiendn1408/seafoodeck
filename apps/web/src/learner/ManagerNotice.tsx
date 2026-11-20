import { Library } from 'lucide-react';
import './account.css';

/** Managers' home: the management page ships later; the library is open meanwhile. */
export function ManagerNotice() {
  return (
    <section className="account">
      <div className="role-card" role="note">
        <h1>Chào bạn</h1>
        <p>Trang quản lý sẽ có ở bản sau. Bạn có thể xem Thư viện.</p>
        <a className="role-card-action" href="#library">
          <Library size={18} aria-hidden="true" /> Mở Thư viện
        </a>
      </div>
    </section>
  );
}
