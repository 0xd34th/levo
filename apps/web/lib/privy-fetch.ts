export type GetPrivyAccessToken = () => Promise<string | null>;

export interface PrivyAuthenticatedFetchOptions {
  identityToken?: string | null;
}

export async function privyAuthenticatedFetch(
  getAccessToken: GetPrivyAccessToken,
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: PrivyAuthenticatedFetchOptions,
): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (options?.identityToken) {
    headers.set('X-Privy-Identity-Token', options.identityToken);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
