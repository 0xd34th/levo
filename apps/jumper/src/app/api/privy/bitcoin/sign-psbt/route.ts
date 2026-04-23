import { NextResponse } from "next/server";
import { z } from "zod";
import { signPrivyBitcoinPsbt } from "@/lib/privy/bitcoin";
import { requirePrivySession } from "@/lib/privy/server";

export const runtime = "nodejs";

const signPsbtRequestSchema = z.object({
  psbt: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await requirePrivySession(req);
  if ("response" in session) {
    return session.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = signPsbtRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bitcoin signing payload" },
      { status: 400 },
    );
  }

  const wallet = session.walletFleet.wallets.bitcoin;
  if (!wallet?.walletId || !wallet.publicKey) {
    return NextResponse.json(
      { error: "Missing Privy bitcoin wallet" },
      { status: 409 },
    );
  }

  const signedPsbt = await signPrivyBitcoinPsbt({
    privy: session.privy,
    psbt: parsed.data.psbt,
    publicKey: wallet.publicKey,
    sessionJwt: session.sessionJwt,
    walletId: wallet.walletId,
  });

  return NextResponse.json(
    { psbt: signedPsbt },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
