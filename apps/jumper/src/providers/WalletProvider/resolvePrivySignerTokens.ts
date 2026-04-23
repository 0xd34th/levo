import { getIdentityToken } from '@privy-io/react-auth';

export async function resolvePrivySignerTokens(params: {
  cachedIdentityToken: string | null;
  getAccessToken: () => Promise<string | null>;
}): Promise<{
  identityToken: string;
  sessionJwt: string;
}> {
  const sessionJwt = await params.getAccessToken();
  if (!sessionJwt) {
    throw new Error('Missing Privy session token');
  }

  const identityToken =
    params.cachedIdentityToken ?? (await getIdentityToken());

  if (!identityToken) {
    throw new Error('Missing Privy identity token');
  }

  return {
    identityToken,
    sessionJwt,
  };
}
