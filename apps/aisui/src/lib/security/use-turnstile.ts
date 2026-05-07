"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TurnstileRenderOptions {
  sitekey: string;
  size?: "invisible" | "compact" | "normal";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __aisuiTurnstileOnload?: () => void;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__aisuiTurnstileOnload";

interface UseTurnstileResult {
  ready: boolean;
  getToken: () => Promise<string | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Cloudflare Turnstile invisible-challenge hook. Renders an invisible widget
 * when `sitekey` is configured; `getToken()` triggers a fresh challenge per
 * call (tokens are single-use, ~5min TTL).
 *
 * No-op when `sitekey` is undefined — local/dev without a configured key
 * skips bot challenges entirely, matching the server's `turnstileEnabled()`.
 */
export function useTurnstile(sitekey: string | undefined): UseTurnstileResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingRef = useRef<((value: string | null) => void) | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!sitekey || typeof window === "undefined") return;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || widgetIdRef.current) return;
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey,
          size: "invisible",
          callback: (token) => {
            pendingRef.current?.(token);
            pendingRef.current = null;
          },
          "error-callback": () => {
            pendingRef.current?.(null);
            pendingRef.current = null;
          },
          "timeout-callback": () => {
            pendingRef.current?.(null);
            pendingRef.current = null;
          },
        });
        setReady(true);
      } catch {
        setReady(false);
      }
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    window.__aisuiTurnstileOnload = renderWidget;

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
      }
      widgetIdRef.current = null;
      pendingRef.current = null;
      setReady(false);
    };
  }, [sitekey]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!sitekey) return null;
    if (typeof window === "undefined") return null;
    const ts = window.turnstile;
    const widgetId = widgetIdRef.current;
    if (!ts || !widgetId) return null;

    if (pendingRef.current) {
      pendingRef.current(null);
      pendingRef.current = null;
    }

    return new Promise<string | null>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const settle = (value: string | null) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (pendingRef.current === settle) pendingRef.current = null;
        resolve(value);
      };
      pendingRef.current = settle;
      timeoutId = setTimeout(() => settle(null), 30_000);

      try {
        ts.reset(widgetId);
        ts.execute(widgetId);
      } catch {
        settle(null);
      }
    });
  }, [sitekey]);

  return { ready, getToken, containerRef };
}
