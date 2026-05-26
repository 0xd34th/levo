/**
 * BlockVision Sui Indexing API client.
 * Free trial = 30 calls/day —— always wrap with cache + quota.
 */
import { env } from "@/lib/env";
import { getStale, hashKey, withCache } from "@/lib/cache/store";

interface BvResponseEnvelope<T> {
  code?: number;
  message?: string;
  result?: T;
  data?: T;
}

export class BlockVisionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "BlockVisionError";
  }
}

export interface BvFetchOpts {
  ttl: number; // seconds
  swr?: number; // stale-while-revalidate window
  retries?: number;
}

/** Issue a GET against BlockVision indexing API with cache + retry. */
export async function bvGet<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined>,
  opts: BvFetchOpts,
): Promise<T> {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") cleaned[k] = String(v);
  }
  const key = hashKey(["bv", endpoint, ...Object.entries(cleaned).flat()]);

  return withCache<T>(
    key,
    async () => {
      const url = new URL(env.blockvisionApiUrl() + endpoint);
      for (const [k, v] of Object.entries(cleaned)) url.searchParams.set(k, v);

      const retries = opts.retries ?? 2;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
              accept: "application/json",
              "x-api-key": env.blockvisionKey(),
            },
            // Next.js will cache server fetches automatically, we manage it ourselves
            cache: "no-store",
          });
          if (!res.ok) {
            // 429 / 5xx → retry with backoff
            if ((res.status === 429 || res.status >= 500) && attempt < retries) {
              await sleep(250 * (attempt + 1));
              continue;
            }
            const stale = await getStale<T>(key);
            if (stale !== null) return stale;
            throw new BlockVisionError(`BV ${res.status} ${endpoint}`, res.status, endpoint);
          }
          const json = (await res.json()) as BvResponseEnvelope<T>;
          if (json.code !== undefined && json.code !== 0 && json.code !== 200) {
            throw new BlockVisionError(
              json.message ?? `BV code ${json.code} ${endpoint}`,
              json.code,
              endpoint,
            );
          }
          const result = (json.result ?? json.data ?? (json as unknown as T)) as T;
          return result;
        } catch (e) {
          lastErr = e;
          if (attempt >= retries) break;
          await sleep(250 * (attempt + 1));
        }
      }
      const stale = await getStale<T>(key);
      if (stale !== null) return stale;
      throw lastErr instanceof Error ? lastErr : new Error("BlockVision request failed");
    },
    { ttl: opts.ttl, swr: opts.swr },
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
