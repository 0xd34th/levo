import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { InvalidAuthTokenError, PrivyClient } from '@privy-io/node';
import { noStoreJson } from '@/lib/api';

export interface PrivyXIdentity {
  privyUserId: string;
  xUserId: string;
  username: string | null;
  profilePictureUrl: string | null;
}

let _privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!_privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('Missing Privy configuration');
    }
    _privyClient = new PrivyClient({ appId, appSecret });
  }
  return _privyClient;
}

function getBearerToken(req?: Request): string | null {
  const header = req?.headers.get('authorization');
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/.exec(header.trim());
  return match?.[1] ?? null;
}

export function getPrivyAccessToken(req?: Request): string | null {
  return getBearerToken(req);
}

export async function getPrivyUserJwt(req?: Request): Promise<string | null> {
  const identityHeader = req?.headers.get('x-privy-identity-token');
  if (identityHeader) {
    return identityHeader;
  }

  const cookieStore = await cookies();
  return cookieStore.get('privy-id-token')?.value ?? null;
}

function getTwitterIdentity(user: {
  id: string;
  linked_accounts: Array<{
    type: string;
    subject?: string;
    username?: string | null;
    profile_picture_url?: string | null;
  }>;
}): PrivyXIdentity | null {
  const twitterAccount = user.linked_accounts.find((account) => account.type === 'twitter_oauth');

  if (!twitterAccount) {
    return null;
  }

  return {
    privyUserId: user.id,
    xUserId: twitterAccount.subject ?? '',
    username: twitterAccount.username ?? null,
    profilePictureUrl: twitterAccount.profile_picture_url ?? null,
  };
}

export async function verifyPrivyXAuth(req?: Request): Promise<
  { ok: true; identity: PrivyXIdentity } | { ok: false; response: NextResponse }
> {
  let privy: PrivyClient;
  try {
    privy = getPrivyClient();
  } catch (error) {
    console.error('Missing Privy configuration', error);
    return {
      ok: false,
      response: noStoreJson({ error: 'Server configuration error' }, { status: 500 }),
    };
  }

  const verifyWithAccessToken = async (accessToken: string) => {
    const auth = await privy.utils().auth().verifyAccessToken(accessToken);
    const user = await privy.users()._get(auth.user_id);
    const identity = getTwitterIdentity(user);

    if (!identity) {
      return {
        ok: false as const,
        response: noStoreJson({ error: 'No X account linked' }, { status: 401 }),
      };
    }

    return { ok: true as const, identity };
  };

  const bearerToken = getBearerToken(req);
  if (bearerToken) {
    try {
      return await verifyWithAccessToken(bearerToken);
    } catch (error) {
      if (error instanceof InvalidAuthTokenError) {
        return {
          ok: false,
          response: noStoreJson({ error: 'Invalid or expired session' }, { status: 401 }),
        };
      }

      console.error('Failed to verify Privy access token', error);
      return {
        ok: false,
        response: noStoreJson({ error: 'Authentication temporarily unavailable' }, { status: 503 }),
      };
    }
  }

  const cookieStore = await cookies();
  const idToken = cookieStore.get('privy-id-token')?.value;

  if (!idToken) {
    return {
      ok: false,
      response: noStoreJson({ error: 'Not authenticated' }, { status: 401 }),
    };
  }

  try {
    const user = await privy.users().get({ id_token: idToken });
    const identity = getTwitterIdentity(user);

    if (!identity) {
      return {
        ok: false,
        response: noStoreJson({ error: 'No X account linked' }, { status: 401 }),
      };
    }

    return { ok: true, identity };
  } catch (error) {
    if (error instanceof InvalidAuthTokenError) {
      return {
        ok: false,
        response: noStoreJson({ error: 'Invalid or expired session' }, { status: 401 }),
      };
    }

    console.error('Failed to verify Privy session', error);
    return {
      ok: false,
      response: noStoreJson({ error: 'Authentication temporarily unavailable' }, { status: 503 }),
    };
  }
}
