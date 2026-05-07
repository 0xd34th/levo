/**
 * OKX HTTP client — handles signing, headers, retries, SWR caching, and error
 * normalisation. All OKX API calls (DEX swap, cross-chain bridge, wallet
 * balances, tx history, DeFi positions) go through here.
 */
import { env, okxConfigured } from "@/lib/env";
import { getStale, hashKey, withCache } from "@/lib/cache/store";
import { buildQueryString, signOkxRequest } from "./auth";
import { OkxApiError, OkxNotConfiguredError, type OkxEnvelope } from "./types";

export interface OkxFetchOpts {
  /** Cache TTL in seconds. Defaults to 30. */
  ttl?: number;
  /** SWR window in seconds. Defaults to ttl × 2. */
  swr?: number;
  /** HTTP retries on 429 / 5xx. Defaults to 2. */
  retries?: number;
  /** Per-request timeout in milliseconds. Defaults to 8000. */
  timeoutMs?: number;
  /** Skip cache; always fetch fresh. */
  noCache?: boolean;
}

interface OkxRequestOpts<TBody> extends OkxFetchOpts {
  method: "GET" | "POST";
  /** Path component starting with "/". */
  path: string;
  /** Query string params for GET. */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** JSON body for POST. */
  body?: TBody;
}

function ensureConfigured(): void {
  if (!okxConfigured()) throw new OkxNotConfiguredError();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeRequest<T, TBody = unknown>(opts: OkxRequestOpts<TBody>): Promise<T> {
  ensureConfigured();
  const apiKey = env.okxApiKey()!;
  const secret = env.okxSecretKey()!;
  const passphrase = env.okxPassphrase()!;
  const projectId = env.okxProjectId()!;

  const queryStr = opts.method === "GET" ? buildQueryString(opts.params ?? {}) : "";
  const requestPath = opts.path + queryStr;
  const bodyStr = opts.method === "POST" && opts.body !== undefined ? JSON.stringify(opts.body) : "";

  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 8000;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { timestamp, signature } = signOkxRequest({
      method: opts.method,
      requestPath,
      body: bodyStr,
      secretKey: secret,
    });
    const headers: Record<string, string> = {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "OK-ACCESS-PROJECT": projectId,
      accept: "application/json",
    };
    if (opts.method === "POST") headers["content-type"] = "application/json";

    try {
      const res = await fetchWithTimeout(
        env.okxBaseUrl() + requestPath,
        {
          method: opts.method,
          headers,
          body: opts.method === "POST" ? bodyStr : undefined,
          cache: "no-store",
        },
        timeoutMs,
      );

      if (!res.ok) {
        const transient = res.status === 429 || res.status >= 500;
        if (transient && attempt < retries) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        const text = await safeReadText(res);
        throw new OkxApiError(
          `OKX HTTP ${res.status} ${opts.path}: ${text.slice(0, 200)}`,
          String(res.status),
          res.status,
          opts.path,
        );
      }

      const json = (await res.json()) as OkxEnvelope<T>;
      // OKX returns code "0" for success; any other code is a logical error.
      if (json.code && json.code !== "0") {
        throw new OkxApiError(
          json.msg ?? `OKX code ${json.code} ${opts.path}`,
          json.code,
          res.status,
          opts.path,
        );
      }
      // Some endpoints return T directly; most return { data: T }.
      const result = (json.data ?? (json as unknown as T)) as T;
      return result;
    } catch (err) {
      lastErr = err;
      // AbortError or network error → retry if attempts remain.
      const transient = err instanceof OkxApiError ? false : true;
      if (transient && attempt < retries) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error("OKX request failed");
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** GET helper with optional SWR cache. Returns the body of `data`. */
export async function okxGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined | null> = {},
  opts: OkxFetchOpts = {},
): Promise<T> {
  const ttl = opts.ttl ?? 30;
  const swr = opts.swr ?? ttl * 2;

  if (opts.noCache) {
    return executeRequest<T>({ method: "GET", path, params, ...opts });
  }

  const key = hashKey([
    "okx",
    "GET",
    path,
    ...Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .flat(),
  ]);

  return withCache<T>(
    key,
    async () => {
      try {
        return await executeRequest<T>({ method: "GET", path, params, ...opts });
      } catch (err) {
        // Fall back to stale cache on recoverable failures so a transient
        // OKX outage doesn't take down the chat experience.
        const stale = await getStale<T>(key);
        if (stale !== null) return stale;
        throw err;
      }
    },
    { ttl, swr },
  );
}

/** POST helper. Caching disabled by default — most POSTs are tx builders. */
export async function okxPost<T, TBody = unknown>(
  path: string,
  body: TBody,
  opts: OkxFetchOpts = {},
): Promise<T> {
  return executeRequest<T, TBody>({ method: "POST", path, body, ...opts });
}

/** Health probe — used by debug endpoints to check creds. */
export function isOkxConfigured(): boolean {
  return okxConfigured();
}
