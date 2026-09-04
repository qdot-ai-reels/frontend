'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/videos', label: '영상 라이브러리', shortLabel: '라이브러리', icon: '▦' },
  { href: '/create', label: '새 영상 만들기', shortLabel: '새 영상', icon: '+' },
] as const;

export function StudioNav() {
  const pathname = usePathname();

  return (
    <nav className="studio-nav" aria-label="Studio 주요 메뉴">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === '/videos'
            ? pathname === '/videos' || pathname.startsWith('/videos/')
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? 'active' : ''}
            aria-current={active ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            <span className="nav-label-mobile">{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
