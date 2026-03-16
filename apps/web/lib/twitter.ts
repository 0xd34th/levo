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

/**
 * Resolve an X username to user info via twitterapi.io.
 * Returns null if user is not found or unavailable.
 */
export async function resolveXUser(
  rawUsername: string,
  apiKey: string,
): Promise<XUserInfo | null> {
  const username = normalizeXUsername(rawUsername);

  let res: Response;
  try {
    res = await fetch(
      `https://api.twitterapi.io/twitter/user/info?userName=${encodeURIComponent(username)}`,
      {
        method: 'GET',
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
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

  const json = await res.json();
  const data = json.data ?? json;

  if (data.unavailable) return null;
  const xUserId = parseXUserId(data.id);
  if (!xUserId) return null;

  return {
    xUserId,
    username: data.userName ?? username,
    profilePicture: data.profilePicture ?? null,
    isBlueVerified: Boolean(data.isBlueVerified),
  };
}
