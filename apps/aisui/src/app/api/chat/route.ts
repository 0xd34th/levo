import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { tools as localTools } from "@/lib/tools";
import { loadMcpTools } from "@/lib/mcp";
import { SYSTEM_PROMPT } from "@/lib/llm/system-prompt";
import { isModelMode, pickModel, type ModelMode } from "@/lib/llm/model-router";
import { getOrCreateFingerprint } from "@/lib/auth/fingerprint";
import { consumeCredits } from "@/lib/credits/tracker";
import { verifyTurnstile, turnstileEnabled } from "@/lib/security/turnstile";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatBody {
  messages: UIMessage[];
  mode?: ModelMode;
  turnstileToken?: string;
  /** Connected wallet address (Sui). Forwarded by the client; used to resolve
   *  "my X" prompts without round-tripping through the user. */
  sender?: string | null;
}

export async function POST(req: Request) {
  if (!env.deepseekKey()) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  const body = (await req.json()) as ChatBody;
  const mode: ModelMode = isModelMode(body.mode) ? body.mode : "fast";

  const sender = typeof body.sender === "string" ? body.sender : null;
  if (!sender || !/^0x[0-9a-fA-F]+$/.test(sender)) {
    return NextResponse.json(
      { error: "Wallet not connected. Connect a Sui wallet to chat." },
      { status: 401 },
    );
  }

  if (turnstileEnabled()) {
    const ok = await verifyTurnstile(body.turnstileToken);
    if (!ok) {
      return NextResponse.json({ error: "Turnstile verification failed." }, { status: 403 });
    }
  }

  const fp = await getOrCreateFingerprint();
  const credits = await consumeCredits(fp, mode);
  if (!credits.ok) {
    return NextResponse.json(
      {
        error:
          credits.reason === "free_exhausted"
            ? "Free quota exhausted for today. Switch to a paid pack or come back tomorrow."
            : "Insufficient credits for the selected mode.",
        usage: credits,
      },
      { status: 402 },
    );
  }

  const picked = pickModel(mode);

  // Pull MCP tools (cached). Failures are isolated; we always get an object.
  const mcpRegistry = await loadMcpTools().catch(() => null);
  const mergedTools = mcpRegistry
    ? { ...localTools, ...mcpRegistry.tools }
    : localTools;

  // Pin the connected wallet into the system prompt so "my portfolio" /
  // "my assets" / "my recent activity" can be resolved without asking the
  // user to retype their 0x… address.
  const senderHint = `\n\nUser context:\n- Connected wallet address: ${sender}\n- When the user says "me", "my", or refers to their wallet without an explicit address, use this address as the addressOrName argument to portfolio / activity / object tools. Never ask for the address if the user is already connected.`;

  const result = streamText({
    model: picked.model,
    system: SYSTEM_PROMPT + senderHint,
    messages: convertToModelMessages(body.messages),
    tools: mergedTools,
    stopWhen: stepCountIs(8),
    temperature: mode === "fast" ? 0.2 : 0.4,
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: picked.reasoning,
    headers: {
      "x-aisui-mode": mode,
      "x-aisui-credits-free": String(credits.freeRemaining),
      "x-aisui-credits-paid": String(credits.paidRemaining),
      "x-aisui-mcp-tools": String(mcpRegistry?.entries.length ?? 0),
    },
  });
}
