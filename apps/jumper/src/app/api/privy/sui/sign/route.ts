import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePrivyIdentityToken,
  requirePrivySession,
} from "@/lib/privy/server";

export const runtime = "nodejs";

const signRequestSchema = z.object({
  digest: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await requirePrivySession(req);
  if ("response" in session) {
    return session.response;
  }

  const identity = await requirePrivyIdentityToken(req, session);
  if ("response" in identity) {
    return identity.response;
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

  const signature = await session.privy.wallets().rawSign(wallet.walletId, {
    authorization_context: {
      user_jwts: [identity.identityToken],
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
}
