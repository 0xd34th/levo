/**
 * Tiny PostHog client. Loads the JS SDK lazily only if NEXT_PUBLIC_POSTHOG_KEY is set.
 * No bundle cost when unconfigured.
 */
"use client";

interface PostHogLite {
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify?: (id: string, props?: Record<string, unknown>) => void;
}

let cached: PostHogLite | null | undefined;

async function load(): Promise<PostHogLite | null> {
  if (cached !== undefined) return cached ?? null;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  if (typeof window === "undefined") {
    cached = null;
    return null;
  }
  try {
    // PostHog snippet - inline so we don't add a dependency.
    const w = window as unknown as { posthog?: PostHogLite };
    if (w.posthog) {
      cached = w.posthog;
      return cached;
    }
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${host}/static/array.js`;
      s.async = true;
      s.onload = () => {
        const ph = (window as unknown as { posthog?: PostHogLite & { init?: (k: string, o: { api_host: string }) => void } }).posthog;
        if (ph?.init) {
          ph.init(key, { api_host: host });
        }
        resolve();
      };
      s.onerror = () => reject(new Error("posthog load failed"));
      document.head.appendChild(s);
    });
    cached = (window as unknown as { posthog?: PostHogLite }).posthog ?? null;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export async function capture(event: string, props?: Record<string, unknown>): Promise<void> {
  const ph = await load();
  ph?.capture(event, props);
}
