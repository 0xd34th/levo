import type { User } from "@privy-io/node";
import { InvalidAuthTokenError, PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import { summarizeJwtForLogs } from "./jwt";
import {
  buildWalletFleetResponse,
  getMissingPrivyWalletChains,
  type WalletFleetResponse,
} from "./wallet-fleet";

let privyClientSingleton: PrivyClient | null = null;

type VerifiedPrivySessionToken = {
  sessionJwt: string;
  sessionJwtType: "access" | "identity";
  userId: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function getBearerToken(req: Request): string | null {
  return getTokenFromHeader(req, "authorization");
}

function getTokenFromHeader(req: Request, headerName: string): string | null {
  const header = req.headers.get(headerName);
  if (!header) {
    return null;
  }

  if (headerName.toLowerCase() === "authorization") {
    const match = /^Bearer\s+(.+)$/.exec(header.trim());
    return match?.[1] ?? null;
  }

  const value = header.trim();
  return value.length > 0 ? value : null;
}

function getPrivyConfig(): { appId: string; appSecret: string } {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    throw new Error("Missing Privy configuration");
  }

  return { appId, appSecret };
}

function audienceIncludesAppId(
  audience: string | string[] | undefined,
  appId: string,
): boolean {
  if (typeof audience === "string") {
    return audience === appId;
  }

  return Array.isArray(audience) && audience.includes(appId);
}

function isJwtAudienceForDifferentPrivyApp(
  sessionJwt: string,
  appId: string,
): boolean {
  const audience = summarizeJwtForLogs(sessionJwt).claims?.aud;
  return audience !== undefined && !audienceIncludesAppId(audience, appId);
}

async function verifyPrivySessionToken(
  privy: PrivyClient,
  sessionJwt: string,
): Promise<VerifiedPrivySessionToken> {
  const authUtils = privy.utils().auth();

  try {
    const auth = await authUtils.verifyAccessToken(sessionJwt);
    return {
      sessionJwt,
      sessionJwtType: "access",
      userId: auth.user_id,
    };
  } catch (error) {
    if (!(error instanceof InvalidAuthTokenError)) {
      throw error;
    }

    const identityUser = await authUtils.verifyIdentityToken(sessionJwt);
    return {
      sessionJwt,
      sessionJwtType: "identity",
      userId: identityUser.id,
    };
  }
}

export function getPrivyClient(): PrivyClient {
  if (!privyClientSingleton) {
    const { appId, appSecret } = getPrivyConfig();
    privyClientSingleton = new PrivyClient({ appId, appSecret });
  }

  return privyClientSingleton;
}

export function getPrivyAuthorizationPrivateKey(): string {
  const key = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error("Missing PRIVY_AUTHORIZATION_PRIVATE_KEY");
  }
  return key;
}

export function getPrivyAuthorizationKeyId(): string {
  const id = process.env.PRIVY_AUTHORIZATION_KEY_ID?.trim();
  if (!id) {
    throw new Error("Missing PRIVY_AUTHORIZATION_KEY_ID");
  }
  return id;
}

export async function ensureWalletFleetForUser(
  privy: PrivyClient,
  user: User,
): Promise<WalletFleetResponse> {
  let walletFleet = buildWalletFleetResponse({
    linkedAccounts: user.linked_accounts,
    userId: user.id,
  });

  const missingWallets = getMissingPrivyWalletChains(walletFleet.wallets);
  if (!missingWallets.length) {
    return walletFleet;
  }

  const signerId = getPrivyAuthorizationKeyId();

  const refreshedUser = await privy.users().pregenerateWallets(user.id, {
    wallets: missingWallets.map((chain_type) => ({
      chain_type,
      additional_signers: [{ signer_id: signerId }],
    })),
  });

  walletFleet = buildWalletFleetResponse({
    linkedAccounts: refreshedUser.linked_accounts,
    userId: refreshedUser.id,
  });

  return walletFleet;
}

export async function requirePrivySession(req: Request): Promise<
  | {
      privy: PrivyClient;
      sessionJwt: string;
      sessionJwtType: "access" | "identity";
      user: User;
      walletFleet: WalletFleetResponse;
    }
  | { response: NextResponse }
> {
  const sessionJwt = getBearerToken(req);
  if (!sessionJwt) {
    return {
      response: jsonError("Missing Privy session token", 401),
    };
  }

  let privy: PrivyClient;
  try {
    const { appId } = getPrivyConfig();
    if (isJwtAudienceForDifferentPrivyApp(sessionJwt, appId)) {
      return {
        response: jsonError("Invalid or expired Privy session", 401),
      };
    }

    privy = getPrivyClient();
  } catch (error) {
    console.error("Failed to initialize Privy client", error);
    return {
      response: jsonError("Missing Privy configuration", 500),
    };
  }

  try {
    const verifiedSession = await verifyPrivySessionToken(privy, sessionJwt);

    const user = await privy.users()._get(verifiedSession.userId);
    const walletFleet = await ensureWalletFleetForUser(privy, user);

    return {
      privy,
      sessionJwt: verifiedSession.sessionJwt,
      sessionJwtType: verifiedSession.sessionJwtType,
      user,
      walletFleet,
    };
  } catch (error) {
    if (error instanceof InvalidAuthTokenError) {
      return {
        response: jsonError("Invalid or expired Privy session", 401),
      };
    }

    console.error("Failed to verify Privy session", error);
    return {
      response: jsonError("Privy authentication unavailable", 503),
    };
  }
}
