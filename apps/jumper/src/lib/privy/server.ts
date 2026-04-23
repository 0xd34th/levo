import type { User } from "@privy-io/node";
import { InvalidAuthTokenError, PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import {
  buildWalletFleetResponse,
  getMissingPrivyWalletChains,
  type WalletFleetResponse,
} from "./wallet-fleet";
import { PRIVY_IDENTITY_TOKEN_HEADER } from "./constants";

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
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
    const appSecret = process.env.PRIVY_APP_SECRET?.trim();

    if (!appId || !appSecret) {
      throw new Error("Missing Privy configuration");
    }

    privyClientSingleton = new PrivyClient({ appId, appSecret });
  }

  return privyClientSingleton;
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

  const refreshedUser = await privy.users().pregenerateWallets(user.id, {
    wallets: missingWallets.map((chain_type) => ({ chain_type })),
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

export async function requirePrivyIdentityToken(
  req: Request,
  session: {
    privy: PrivyClient;
    sessionJwt: string;
    sessionJwtType: "access" | "identity";
    user: User;
  },
): Promise<
  | {
      identityToken: string;
    }
  | { response: NextResponse }
> {
  const identityToken =
    getTokenFromHeader(req, PRIVY_IDENTITY_TOKEN_HEADER) ??
    (session.sessionJwtType === "identity" ? session.sessionJwt : null);

  if (!identityToken) {
    return {
      response: jsonError("Missing Privy identity token", 401),
    };
  }

  try {
    const identityUser = await session.privy
      .utils()
      .auth()
      .verifyIdentityToken(identityToken);

    if (identityUser.id !== session.user.id) {
      return {
        response: jsonError("Mismatched Privy identity token", 401),
      };
    }

    return {
      identityToken,
    };
  } catch (error) {
    if (error instanceof InvalidAuthTokenError) {
      return {
        response: jsonError("Invalid or expired Privy identity token", 401),
      };
    }

    console.error("Failed to verify Privy identity token", error);
    return {
      response: jsonError("Privy authentication unavailable", 503),
    };
  }
}
