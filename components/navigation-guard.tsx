'use client';

import NextLink from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import type { ComponentProps, MutableRefObject, ReactNode } from 'react';

interface NavigationGuardConfig {
  hasUnsavedChanges: boolean;
  busy: boolean;
  confirmMessage: string;
  beforeNavigate?: () => void;
  onBusyBlocked?: () => void;
  onConfirmedNavigate?: () => void;
}

type NavigationGuardRef = MutableRefObject<NavigationGuardConfig>;
type PreventableNavigation = { preventDefault: () => void };

interface NavigationGuardContextValue {
  register: (guard: NavigationGuardRef) => () => void;
  attemptNavigation: (event: PreventableNavigation) => boolean;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const activeGuardRef = useRef<NavigationGuardRef | null>(null);

  const register = useCallback((guard: NavigationGuardRef) => {
    activeGuardRef.current = guard;
    return () => {
      if (activeGuardRef.current === guard) activeGuardRef.current = null;
    };
  }, []);

  const attemptNavigation = useCallback((event: PreventableNavigation) => {
    const config = activeGuardRef.current?.current;
    if (!config || (!config.hasUnsavedChanges && !config.busy)) return true;

    config.beforeNavigate?.();
    if (config.busy) {
      event.preventDefault();
      config.onBusyBlocked?.();
      return false;
    }
    if (config.hasUnsavedChanges && !window.confirm(config.confirmMessage)) {
      event.preventDefault();
      return false;
    }
    config.onConfirmedNavigate?.();
    return true;
  }, []);

  const value = useMemo(
    () => ({ register, attemptNavigation }),
    [attemptNavigation, register],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function GuardedLink({ onNavigate, ...props }: ComponentProps<typeof NextLink>) {
  const guard = useContext(NavigationGuardContext);
  return (
    <NextLink
      {...props}
      onNavigate={(event) => {
        if (guard && !guard.attemptNavigation(event)) return;
        onNavigate?.(event);
      }}
    />
  );
}

export function usePageNavigationGuard(config: NavigationGuardConfig): void {
  const guard = useContext(NavigationGuardContext);
  if (!guard) {
    throw new Error('usePageNavigationGuard는 NavigationGuardProvider 안에서 사용해야 합니다.');
  }

  const configRef = useRef(config);
  useLayoutEffect(() => {
    configRef.current = config;
  }, [config]);
  const active = config.hasUnsavedChanges || config.busy;

  useLayoutEffect(() => guard.register(configRef), [guard]);

  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      configRef.current.beforeNavigate?.();
      event.preventDefault();
      event.returnValue = '';
    };
    type NavigateEventLike = Event & {
      canIntercept?: boolean;
      navigationType?: string;
    };
    type WindowWithNavigation = Window & { navigation?: EventTarget };
    const navigation = (window as WindowWithNavigation).navigation;
    const handleHistoryNavigation = (event: Event) => {
      const navigateEvent = event as NavigateEventLike;
      if (navigateEvent.navigationType !== 'traverse') return;
      if (!event.cancelable || navigateEvent.canIntercept === false) {
        configRef.current.beforeNavigate?.();
        return;
      }
      guard.attemptNavigation(event);
    };

    const historyGuardKey = '__quedotNavigationGuard';
    const historyGuardId =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `guard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let restoringHistoryGuard = false;
    let historyGuardActive = false;
    const handleGuardedPopState = () => {
      if (restoringHistoryGuard) {
        restoringHistoryGuard = false;
        return;
      }
      const allowed = guard.attemptNavigation({
        preventDefault: () => {
          restoringHistoryGuard = true;
          window.history.forward();
        },
      });
      if (!allowed) return;

      historyGuardActive = false;
      window.removeEventListener('popstate', handleGuardedPopState, true);
      window.history.back();
    };

    if (navigation) {
      navigation.addEventListener('navigate', handleHistoryNavigation);
    } else {
      window.history.pushState(
        { ...window.history.state, [historyGuardKey]: historyGuardId },
        '',
        window.location.href,
      );
      historyGuardActive = true;
      window.addEventListener('popstate', handleGuardedPopState, true);
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      navigation?.removeEventListener('navigate', handleHistoryNavigation);
      window.removeEventListener('popstate', handleGuardedPopState, true);
      if (
        historyGuardActive &&
        window.history.state?.[historyGuardKey] === historyGuardId
      ) {
        window.history.back();
      }
    };
  }, [active, guard]);
}
