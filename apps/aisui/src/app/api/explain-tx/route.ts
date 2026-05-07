/**
 * On-demand tx receipt endpoint.
 * Used by SwapCard / TransferCard after the wallet returns a digest, to render
 * a chat-side receipt without consuming an LLM credit.
 *
 * Retries briefly because the fullnode may lag a beat behind the wallet.
 */
import { NextResponse } from "next/server";
import { runExplainTx } from "@/lib/tools/explain-tx";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { digest?: string };
  try {
    body = (await req.json()) as { digest?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const digest = body.digest?.trim();
  if (!digest || digest.length < 40) {
    return NextResponse.json({ error: "digest required" }, { status: 400 });
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await runExplainTx({ digest });
      return NextResponse.json(result);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return NextResponse.json(
    { error: (lastErr as Error)?.message ?? "tx not yet indexed" },
    { status: 504 },
  );
}
