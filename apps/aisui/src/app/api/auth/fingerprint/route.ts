import { NextResponse } from "next/server";
import { getOrCreateFingerprint } from "@/lib/auth/fingerprint";
import { getUsage } from "@/lib/credits/tracker";

export async function GET() {
  const fp = await getOrCreateFingerprint();
  const usage = await getUsage(fp);
  return NextResponse.json({ fingerprint: fp, usage });
}

export const runtime = "nodejs";
