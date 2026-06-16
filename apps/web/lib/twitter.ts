export interface XUserInfo {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
}

export class TwitterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TwitterApiError';
  }
}

export const X_USERNAME_RE = /^[a-zA-Z0-9_]{1,15}$/;
export const X_USERNAME_INPUT_RE = /^@?[a-zA-Z0-9_]{1,15}$/;
const X_USER_ID_RE = /^[1-9]\d*$/;
const FXTWITTER_USER_API_BASE = 'https://api.fxtwitter.com';
const TWITTERAPI_USER_INFO_URL = 'https://api.twitterapi.io/twitter/user/info';
const X_LOOKUP_TIMEOUT_MS = 5000;

export function normalizeXUsername(raw: string): string {
  const cleaned = raw.startsWith('@') ? raw.slice(1) : raw;
  if (!X_USERNAME_RE.test(cleaned)) {
    throw new Error('Invalid username');
  }
  return cleaned;
}

export function parseXUserId(raw: unknown): string | null {
  if (
    typeof raw !== 'string' &&
    typeof raw !== 'number' &&
    typeof raw !== 'bigint'
  ) {
    return null;
  }

  const xUserId = String(raw);
  return X_USER_ID_RE.test(xUserId) ? xUserId : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function responseCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

function temporaryUnavailableError(): TwitterApiError {
  return new TwitterApiError('X lookup is temporarily unavailable', 503);
}

function isFxTwitterNotFound(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  const code = responseCode(payload.code);
  if (code === 404) {
    return true;
  }

  if (typeof payload.message !== 'string') {
    return false;
  }

  const message = payload.message.toLowerCase();
  return message.includes('not_found') || message.includes('not found') || message.includes('user not found');
}

function parseFxTwitterUser(payload: unknown): XUserInfo | null {
  if (!isRecord(payload) || !isRecord(payload.user)) {
    return null;
  }

  const user = payload.user;
  const xUserId = parseXUserId(user.id);
  if (!xUserId || typeof user.screen_name !== 'string' || !X_USERNAME_RE.test(user.screen_name)) {
    return null;
  }

  const verification = isRecord(user.verification) ? user.verification : null;
  return {
    xUserId,
    username: user.screen_name,
    profilePicture: typeof user.avatar_url === 'string' ? user.avatar_url : null,
    isBlueVerified: Boolean(verification?.verified),
  };
}

function parseTwitterApiUser(payload: unknown, username: string): XUserInfo | null {
  if (!isRecord(payload)) {
    return null;
  }

  const data = isRecord(payload.data) ? payload.data : payload;
  if (data.unavailable) return null;
  const xUserId = parseXUserId(data.id);
  if (!xUserId) return null;

  return {
    xUserId,
    username: typeof data.userName === 'string' ? data.userName : username,
    profilePicture: typeof data.profilePicture === 'string' ? data.profilePicture : null,
    isBlueVerified: Boolean(data.isBlueVerified),
  };
}

type FxTwitterLookupResult =
  | { kind: 'found'; user: XUserInfo }
  | { kind: 'not-found' }
  | { kind: 'transient' }
  | { kind: 'error'; error: TwitterApiError };

async function resolveFxTwitterUser(username: string): Promise<FxTwitterLookupResult> {
  let res: Response;
  try {
    res = await fetch(
      `${FXTWITTER_USER_API_BASE}/${encodeURIComponent(username)}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(X_LOOKUP_TIMEOUT_MS),
      },
    );
  } catch {
    return { kind: 'transient' };
  }

  if (res.status === 404) {
    return { kind: 'not-found' };
  }

  if (res.status === 429 || res.status >= 500) {
    return { kind: 'transient' };
  }

  if (!res.ok) {
    return {
      kind: 'error',
      error: new TwitterApiError(`FxTwitter API returned ${res.status}`, res.status),
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { kind: 'transient' };
  }

  if (isFxTwitterNotFound(payload)) {
    return { kind: 'not-found' };
  }

  if (isRecord(payload)) {
    const code = responseCode(payload.code);
    if (code !== null && code >= 500) {
      return { kind: 'transient' };
    }
  }

  const user = parseFxTwitterUser(payload);
  if (!user) {
    return { kind: 'transient' };
  }

  return { kind: 'found', user };
}

async function resolveTwitterApiUser(
  username: string,
  apiKey: string,
): Promise<XUserInfo | null> {
  let res: Response;
  try {
    res = await fetch(
      `${TWITTERAPI_USER_INFO_URL}?userName=${encodeURIComponent(username)}`,
      {
        method: 'GET',
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(X_LOOKUP_TIMEOUT_MS),
      },
    );
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new TwitterApiError('Twitter API request timed out', 504);
    }
    throw new TwitterApiError('Twitter API request failed', 502);
  }

  if (!res.ok) {
    if (res.status === 404) {
      return null;
    }
    throw new TwitterApiError(`Twitter API returned ${res.status}`, res.status);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new TwitterApiError('Twitter API response was invalid', 503);
  }

  return parseTwitterApiUser(payload, username);
}

/**
 * Resolve an X username to user info via free FxTwitter first.
 * twitterapi.io is used only as an optional fallback for transient FxTwitter failures.
 * Returns null if user is not found or unavailable.
 */
export async function resolveXUser(
  rawUsername: string,
  twitterApiFallbackKey?: string,
): Promise<XUserInfo | null> {
  const username = normalizeXUsername(rawUsername);

  const fxTwitterResult = await resolveFxTwitterUser(username);
  if (fxTwitterResult.kind === 'found') {
    return fxTwitterResult.user;
  }
  if (fxTwitterResult.kind === 'not-found') {
    return null;
  }
  if (fxTwitterResult.kind === 'error') {
    throw fxTwitterResult.error;
  }

  const fallbackKey = twitterApiFallbackKey?.trim();
  if (!fallbackKey) {
    throw temporaryUnavailableError();
  }

  return resolveTwitterApiUser(username, fallbackKey);
}
