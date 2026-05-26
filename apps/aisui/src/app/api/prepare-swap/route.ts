import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prepareSwapParams, runPrepareSwap } from "@/lib/tools/prepare-swap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: "invalid json" }, 400);
  }

  let input;
  try {
    input = prepareSwapParams.parse(body);
  } catch (e) {
    return noStoreJson(
      { error: "invalid input", issues: e instanceof ZodError ? e.issues : undefined },
      400,
    );
  }

  try {
    return noStoreJson(await runPrepareSwap(input), 200);
  } catch (e) {
    return noStoreJson(
      { error: "prepare swap failed", message: (e as Error).message },
      503,
    );
  }
}

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}
