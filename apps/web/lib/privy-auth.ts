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

export async function verifyPrivyXAuth(): Promise<
  { ok: true; identity: PrivyXIdentity } | { ok: false; response: NextResponse }
> {
  const cookieStore = await cookies();
  const idToken = cookieStore.get('privy-id-token')?.value;

  if (!idToken) {
    return {
      ok: false,
      response: noStoreJson({ error: 'Not authenticated' }, { status: 401 }),
    };
  }

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

  let user;
  try {
    user = await privy.users().get({ id_token: idToken });
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

  const twitterAccount = user.linked_accounts.find(
    (account): account is Extract<typeof account, { type: 'twitter_oauth' }> =>
      account.type === 'twitter_oauth',
  );

  if (!twitterAccount) {
    return {
      ok: false,
      response: noStoreJson({ error: 'No X account linked' }, { status: 401 }),
    };
  }

  return {
    ok: true,
    identity: {
      privyUserId: user.id,
      xUserId: twitterAccount.subject,
      username: twitterAccount.username,
      profilePictureUrl: twitterAccount.profile_picture_url,
    },
  };
}
