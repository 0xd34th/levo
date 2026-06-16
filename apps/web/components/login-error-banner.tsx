'use client';

import { useEffect, useState } from 'react';
import { subscribeLoginError } from '@/lib/login-error';

/**
 * Single global surface for sign-in failures. Mounted once near the app root so
 * every "Sign in with X" entry point reports through it.
 */
export function LoginErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => subscribeLoginError(setMessage), []);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-start justify-between gap-3 rounded-[12px] bg-background px-4 py-3 text-[13px] shadow-lg ring-1 ring-[color:var(--border)]"
    >
      <span style={{ color: 'var(--down)' }}>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setMessage(null)}
        className="shrink-0 text-foreground/60 transition hover:text-foreground"
      >
        ×
      </button>
    </div>
  );
}
