import './users.css';

/** "Nội dung | Người dùng" switch at the top of the admin area (admins only). */
export function AdminTabs({ current }: { current: 'content' | 'users' }) {
  const tabs = [
    { id: 'content', href: '#admin', label: 'Nội dung' },
    { id: 'users', href: '#admin/users', label: 'Người dùng' },
  ] as const;
  return (
    <nav className="admin-tabs" aria-label="Khu quản trị">
      {tabs.map((t) => (
        <a key={t.id} href={t.href} aria-current={current === t.id ? 'page' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
