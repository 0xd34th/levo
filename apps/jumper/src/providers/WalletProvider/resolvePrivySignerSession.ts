import { LiFiErrorCode, ProviderError } from "@lifi/sdk";

export const PRIVY_SIGNER_SESSION_ERROR_MESSAGE =
  "Privy session unavailable. Please reconnect your wallet and try again.";

export async function resolvePrivySignerSession(params: {
  getAccessToken: () => Promise<string | null>;
}): Promise<{
  sessionJwt: string;
}> {
  const sessionJwt = await params.getAccessToken();
  if (!sessionJwt) {
    throw new Error("Missing Privy session token");
  }

  return {
    sessionJwt,
  };
}

export function toPrivySignerSessionError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  return new ProviderError(
    LiFiErrorCode.ProviderUnavailable,
    PRIVY_SIGNER_SESSION_ERROR_MESSAGE,
    error instanceof Error ? error : undefined,
  );
}

export async function resolvePrivyExecutionSignerSession(params: {
  getAccessToken: () => Promise<string | null>;
}): Promise<{
  sessionJwt: string;
}> {
  try {
    return await resolvePrivySignerSession(params);
  } catch (error) {
    throw toPrivySignerSessionError(error);
  }
}
