import { NextResponse } from "next/server";
import { getOrCreateFingerprint } from "@/lib/auth/fingerprint";

export async function GET() {
  const fp = await getOrCreateFingerprint();
  return NextResponse.json({ fingerprint: fp });
}

export const runtime = "nodejs";
