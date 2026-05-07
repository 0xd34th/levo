import { NextResponse } from "next/server";
import { buildSwapTxBySource, type SwapQuote } from "@/lib/sui/aggregators";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { quote: SwapQuote; sender: string };
    if (!body?.quote || !body?.sender) {
      return NextResponse.json({ error: "quote and sender required" }, { status: 400 });
    }
    if (!body.quote.source) {
      return NextResponse.json({ error: "quote.source missing" }, { status: 400 });
    }
    const built = await buildSwapTxBySource({ quote: body.quote, sender: body.sender });
    return NextResponse.json({
      sender: built.sender,
      txBytes: built.txBytes,
      source: built.source,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
