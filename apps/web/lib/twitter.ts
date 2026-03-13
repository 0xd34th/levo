export interface XUserInfo {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{1,15}$/;

function sanitizeUsername(raw: string): string {
  const cleaned = raw.startsWith('@') ? raw.slice(1) : raw;
  if (!USERNAME_RE.test(cleaned)) {
    throw new Error('Invalid username');
  }
  return cleaned;
}

/**
 * Resolve an X username to user info via twitterapi.io.
 * Returns null if user is not found or unavailable.
 */
export async function resolveXUser(
  rawUsername: string,
  apiKey: string,
): Promise<XUserInfo | null> {
  const username = sanitizeUsername(rawUsername);

  const res = await fetch(
    `https://api.twitterapi.io/twitter/user/info?userName=${encodeURIComponent(username)}`,
    {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
    },
  );

  if (!res.ok) return null;

  const data = await res.json();

  if (data.unavailable) return null;
  if (!data.id) return null;

  return {
    xUserId: String(data.id),
    username: data.userName ?? username,
    profilePicture: data.profilePicture ?? null,
    isBlueVerified: Boolean(data.isBlueVerified),
  };
}
