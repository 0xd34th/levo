import { LiFiErrorCode, ProviderError } from "@lifi/sdk";

type SigningErrorPayload = {
  error?: string;
} | null;

type ExecuteSigningRequestResult<TSuccess> =
  | {
      ok: true;
      payload: TSuccess;
    }
  | {
      errorMessage: string;
      ok: false;
    };

export function shouldRetryWithFreshPrivySession(errorMessage?: string): boolean {
  if (!errorMessage) {
    return false;
  }

  return (
    errorMessage.includes("Invalid JWT token provided") ||
    errorMessage.includes("Invalid or expired Privy session")
  );
}

async function executeSigningRequest<TSuccess>(params: {
  body: Record<string, unknown>;
  defaultErrorMessage: string;
  sessionJwt: string;
  url: string;
}): Promise<ExecuteSigningRequestResult<TSuccess>> {
  const response = await fetch(params.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.sessionJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as SigningErrorPayload;

    return {
      errorMessage: payload?.error || params.defaultErrorMessage,
      ok: false,
    };
  }

  return {
    ok: true,
    payload: (await response.json()) as TSuccess,
  };
}

export async function postPrivySigningRequest<TSuccess>(params: {
  body: Record<string, unknown>;
  defaultErrorMessage: string;
  refreshSessionJwt?: (() => Promise<string | null>) | undefined;
  sessionJwt: string;
  url: string;
}): Promise<TSuccess> {
  const firstAttempt = await executeSigningRequest<TSuccess>(params);
  if (firstAttempt.ok) {
    return firstAttempt.payload;
  }

  if (
    params.refreshSessionJwt &&
    shouldRetryWithFreshPrivySession(firstAttempt.errorMessage)
  ) {
    const refreshedSessionJwt = await params.refreshSessionJwt();
    if (refreshedSessionJwt && refreshedSessionJwt !== params.sessionJwt) {
      const retryAttempt = await executeSigningRequest<TSuccess>({
        ...params,
        sessionJwt: refreshedSessionJwt,
      });

      if (retryAttempt.ok) {
        return retryAttempt.payload;
      }

      throw new ProviderError(
        LiFiErrorCode.ProviderUnavailable,
        retryAttempt.errorMessage,
      );
    }
  }

  throw new ProviderError(
    LiFiErrorCode.ProviderUnavailable,
    firstAttempt.errorMessage,
  );
}
