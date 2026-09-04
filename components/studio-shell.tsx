import Link from 'next/link';
import type { ReactNode } from 'react';

import { StudioNav } from './studio-nav';

export function StudioShell({ children }: { children: ReactNode }) {
  return (
    <div className="studio-shell">
      <a className="skip-link" href="#studio-content">본문으로 바로가기</a>
      <aside className="studio-sidebar">
        <Link href="/videos" className="studio-brand" aria-label="QUEDOT Shorts Studio 홈">
          <span className="brand-mark" aria-hidden="true">Q</span>
          <span>
            <strong>QUEDOT</strong>
            <small>SHORTS STUDIO</small>
          </span>
        </Link>
        <StudioNav />
        <div className="sidebar-note">
          <span className="status-dot" aria-hidden="true" />
          Production workflow
        </div>
      </aside>

      <div className="studio-main">
        <header className="mobile-header">
          <Link href="/videos" className="studio-brand" aria-label="QUEDOT Shorts Studio 홈">
            <span className="brand-mark" aria-hidden="true">Q</span>
            <span><strong>QUEDOT</strong><small>SHORTS STUDIO</small></span>
          </Link>
        </header>
        <main id="studio-content" className="studio-content" tabIndex={-1}>
          {children}
        </main>
        <div className="mobile-nav-wrap"><StudioNav /></div>
      </div>
    </div>
  );
}
