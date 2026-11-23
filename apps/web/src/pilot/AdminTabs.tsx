import './users.css';

/**
 * "Nội dung | Người dùng" switch at the top of the admin area (admins only). `disabled` while an
 * admin's own temporary password is on screen: leaving would lose it.
 */
export function AdminTabs({
  current,
  disabled = false,
}: {
  current: 'content' | 'users';
  disabled?: boolean;
}) {
  const tabs = [
    { id: 'content', href: '#admin', label: 'Nội dung' },
    { id: 'users', href: '#admin/users', label: 'Người dùng' },
  ] as const;
  return (
    <nav className="admin-tabs" aria-label="Khu quản trị">
      {tabs.map((t) =>
        disabled ? (
          <span
            key={t.id}
            aria-disabled="true"
            title="Đóng khung mật khẩu tạm trước."
            aria-current={current === t.id ? 'page' : undefined}
          >
            {t.label}
          </span>
        ) : (
          <a key={t.id} href={t.href} aria-current={current === t.id ? 'page' : undefined}>
            {t.label}
          </a>
        ),
      )}
    </nav>
  );
}
