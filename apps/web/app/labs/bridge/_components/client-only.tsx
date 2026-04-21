'use client';

import { useSyncExternalStore, type PropsWithChildren, type ReactNode } from 'react';

function subscribe() {
  return () => {};
}

function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function ClientOnly({
  children,
  fallback = null,
}: PropsWithChildren<{ fallback?: ReactNode }>) {
  return useHydrated() ? children : fallback;
}
