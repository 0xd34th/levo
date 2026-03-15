import { prisma } from '@/lib/prisma';
import {
  normalizeXUsername,
  parseXUserId,
  resolveXUser,
  TwitterApiError,
  type XUserInfo,
} from '@/lib/twitter';

export const FRESH_X_USER_TTL_MS = 60_000;

interface XLookupErrorDetails {
  error: string;
  headers?: Record<string, string>;
  status: number;
}

function toXUserInfo(user: {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
}): XUserInfo | null {
  const xUserId = parseXUserId(user.xUserId);
  if (!xUserId) {
    return null;
  }

  return {
    xUserId,
    username: user.username,
    profilePicture: user.profilePicture,
    isBlueVerified: user.isBlueVerified,
  };
}

/**
 * Reuse a very recent resolution to avoid burning external quota on back-to-back lookups
 * from the same client flow (for example, resolve followed immediately by quote creation).
 */
export async function resolveFreshXUser(
  rawUsername: string,
  apiKey: string,
): Promise<XUserInfo | null> {
  const username = normalizeXUsername(rawUsername);
  const cachedUser = await prisma.xUser.findFirst({
    where: {
      accountStatus: 'ACTIVE',
      updatedAt: { gte: new Date(Date.now() - FRESH_X_USER_TTL_MS) },
      username: {
        equals: username,
        mode: 'insensitive',
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const cachedUserInfo = cachedUser ? toXUserInfo(cachedUser) : null;
  if (cachedUserInfo) {
    return cachedUserInfo;
  }

  return resolveXUser(username, apiKey);
}

export function getXLookupErrorDetails(error: unknown): XLookupErrorDetails {
  if (error instanceof TwitterApiError) {
    if (error.status === 429) {
      return {
        status: 429,
        error: 'X lookup is temporarily rate limited. Please try again in a minute.',
        headers: { 'Retry-After': '60' },
      };
    }

    if (error.status === 504) {
      return {
        status: 504,
        error: 'X lookup timed out. Please try again.',
      };
    }
  }

  return {
    status: 503,
    error: 'X lookup is temporarily unavailable',
  };
}
