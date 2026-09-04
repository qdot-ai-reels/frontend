import type { ReactNode } from 'react';

import { NavigationGuardProvider } from '@/components/navigation-guard';
import { StudioShell } from '@/components/studio-shell';

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <NavigationGuardProvider>
      <StudioShell>{children}</StudioShell>
    </NavigationGuardProvider>
  );
}
