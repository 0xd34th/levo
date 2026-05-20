import { NextResponse } from "next/server";
import { z } from "zod";
import { summarizeJwtForLogs } from "@/lib/privy/jwt";
import {
  getPrivyAuthorizationPrivateKey,
  requirePrivySession,
} from "@/lib/privy/server";

export const runtime = "nodejs";

const signRequestSchema = z.object({
  digest: z.string().min(1),
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Failed to sign Sui transaction";
}

function describeErrorForLogs(error: unknown): {
  name?: string;
  message?: string;
  cause?: unknown;
  stack?: string;
  stringified: string;
} {
  const base: {
    name?: string;
    message?: string;
    cause?: unknown;
    stack?: string;
    stringified: string;
  } = {
    stringified:
      typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(
                error,
                Object.getOwnPropertyNames(error as object),
              );
            } catch {
              return String(error);
            }
          })(),
  };

  if (error instanceof Error) {
    base.name = error.name;
    base.message = error.message;
    base.stack = error.stack;
    if ("cause" in error) {
      base.cause = (error as Error & { cause?: unknown }).cause;
    }
  }

  return base;
}

export async function POST(req: Request) {
  const session = await requirePrivySession(req);
  if ("response" in session) {
    return session.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = signRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Sui signing payload" },
      { status: 400 },
    );
  }

  const wallet = session.walletFleet.wallets.sui;
  if (!wallet?.walletId) {
    return NextResponse.json(
      { error: "Missing Privy Sui wallet" },
      { status: 409 },
    );
  }

  try {
    const signature = await session.privy.wallets().rawSign(wallet.walletId, {
      authorization_context: {
        authorization_private_keys: [getPrivyAuthorizationPrivateKey()],
      },
      params: {
        hash: `0x${parsed.data.digest}`,
      },
    });

    return NextResponse.json(
      { signature: signature.signature },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const sessionJwtSummary = summarizeJwtForLogs(session.sessionJwt);

    console.error("[privy/sui/sign] rawSign failed", {
      digestPrefix: parsed.data.digest.slice(0, 16),
      error: describeErrorForLogs(error),
      sessionJwtSummary,
      sessionJwtType: session.sessionJwtType,
      sessionUserId: session.user.id,
      subMatchesSessionUser: sessionJwtSummary.claims?.sub === session.user.id,
      walletId: wallet.walletId,
    });

    return NextResponse.json(
      { error: getErrorMessage(error) },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
