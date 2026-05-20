import { NextResponse } from "next/server";
import { getOrCreateFingerprint } from "@/lib/auth/fingerprint";
import { getUsage, grantCredits } from "@/lib/credits/tracker";

export async function GET() {
  const fp = await getOrCreateFingerprint();
  return NextResponse.json(await getUsage(fp));
}

/** Dev-only top-up. Wire to Stripe webhook in production. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "use webhook" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { amount?: number };
  const fp = await getOrCreateFingerprint();
  const balance = await grantCredits(fp, body.amount ?? 50);
  return NextResponse.json({ fingerprint: fp, balance });
}

export const runtime = "nodejs";
