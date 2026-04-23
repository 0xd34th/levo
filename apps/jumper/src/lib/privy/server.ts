import type { User } from "@privy-io/node";
import { InvalidAuthTokenError, PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import {
  buildWalletFleetResponse,
  getMissingPrivyWalletChains,
  type WalletFleetResponse,
} from "./wallet-fleet";

let privyClientSingleton: PrivyClient | null = null;

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
  const header = req.headers.get("authorization");
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/.exec(header.trim());
  return match?.[1] ?? null;
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
      userJwt: string;
      user: User;
      walletFleet: WalletFleetResponse;
    }
  | { response: NextResponse }
> {
  const userJwt = getBearerToken(req);
  if (!userJwt) {
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
    const authUtils = privy.utils().auth();

    let userId: string;
    try {
      const auth = await authUtils.verifyAccessToken(userJwt);
      userId = auth.user_id;
    } catch (error) {
      if (!(error instanceof InvalidAuthTokenError)) {
        throw error;
      }

      const identityUser = await authUtils.verifyIdentityToken(userJwt);
      userId = identityUser.id;
    }

    const user = await privy.users()._get(userId);
    const walletFleet = await ensureWalletFleetForUser(privy, user);

    return {
      privy,
      userJwt,
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
