'use client';

import { usePathname } from 'next/navigation';

import { GuardedLink as Link } from './navigation-guard';

const NAV_ITEMS = [
  { href: '/videos', label: '영상 라이브러리', shortLabel: '라이브러리', icon: '▦' },
  { href: '/create', label: '새 영상 만들기', shortLabel: '새 영상', icon: '+' },
  { href: '/products', label: '광고 상품 관리', shortLabel: '상품', icon: 'P' },
  { href: '/settings/prompts', label: '프롬프트 설정', shortLabel: '프롬프트', icon: '⌘' },
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
