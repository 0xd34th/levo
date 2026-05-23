import { NextRequest } from 'next/server';
import { z } from 'zod';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { buildAgentTools } from '@/lib/agent/tools';
import {
  loadMcpTools,
} from '@/lib/agent/explorer';
import { loadOwnerWallet } from '@/lib/agent/mandate-flow';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

const TextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(20_000),
}).passthrough();

const AnyPartSchema = z.object({
  type: z.string().max(120),
}).passthrough();

const MessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(AnyPartSchema).max(64),
}).passthrough();

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(64),
});

const SYSTEM_PROMPT = `You are the levo Agent+Explorer assistant. levo is a stablecoin wallet on Sui; users authorize on-chain "mandates" so a platform-controlled agent can perform yield-management actions (deposit / withdraw / harvest) within strict policy limits.

You have two modes in one workbench:
- Explorer: read Sui chain data, explain transactions, render token / portfolio / activity / object / DeFi / NFT cards, and prepare transfer/swap/bridge confirmation cards.
- Agent: inspect existing levo mandates and hand Earn mandate intent to the guided form.

Never create a mandate directly from chat. When a user asks to create or change a yield mandate, use prepare_earn_mandate_intent with a concise intent. The guided form handles action, cadence, caps, expiry, configured target, and wallet approval.

When a user wants to inspect or run an existing mandate:
- Use \`list_my_mandates\` to fetch current state.
- Use \`execute_mandate_now\` only for explicit user requests like "run", "execute", "harvest now". This tool only returns a confirmation card. Do not claim execution happened until the user presses the frontend confirmation button and the execute API returns a result.

For transfers, swaps, and bridges, tools only prepare cards, quotes, confirmations, or deeplinks. Never claim a transfer, swap, bridge, or mandate was signed or broadcast from chat.

When the user says "my wallet", "my portfolio", or "my activity", use the server-provided wallet context if present. Do not ask the browser to send a wallet address and do not trust a client-provided sender for write tools.

Be concise. Default to bullets or short paragraphs. In chat prose use human-readable values.`;

// POST /api/v1/agent/chat — DeepSeek-powered chat with existing-mandate tools:
// list_my_mandates / execute_mandate_now.
// Returns the AI-SDK v5 UI message stream which @ai-sdk/react useChat consumes.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!agentChatRateLimitDisabled()) {
    const rl = await rateLimit(`agent-chat:${ip}`, 60, 20);
    if (!rl.allowed) {
      return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
    }
  }

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) {
    return sameOrigin.response;
  }

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey || apiKey === 'replace-me') {
    return noStoreJson(
      { error: 'DEEPSEEK_API_KEY is not configured on this server' },
      { status: 503 },
    );
  }

  try {
    const deepseek = createDeepSeek({ apiKey });
    const owner = await loadOwnerWallet(auth.identity.xUserId).catch(() => null);
    const senderHint = owner?.suiAddress
      ? `\n\nServer-resolved user wallet: ${owner.suiAddress}. Use this for "my" read tools and for prepare_swap sender context.`
      : '\n\nNo server-resolved wallet is available. For "my wallet" reads, explain that wallet setup is required.';
    const mcp = await loadMcpTools();
    const tools = {
      ...buildAgentTools({
        xUserId: auth.identity.xUserId,
        senderAddress: owner?.suiAddress,
      }),
      ...mcp.tools,
    };
    const result = streamText({
      model: deepseek('deepseek-chat'),
      system: SYSTEM_PROMPT + senderHint,
      messages: convertToModelMessages(sanitizeMessages(parsed.data.messages)),
      tools,
      // Allow up to ~3 tool round-trips per turn (e.g. list → propose).
      stopWhen: ({ steps }) => steps.length >= 4,
    });
    return result.toUIMessageStreamResponse({
      headers: {
        'x-levo-mcp-tools': String(mcp.entries.filter((entry) => entry.ok).length),
      },
    });
  } catch (error) {
    return noStoreJson(
      {
        error: error instanceof Error ? error.message : 'Chat failed',
      },
      { status: 500 },
    );
  }
}

function agentChatRateLimitDisabled(): boolean {
  const value = process.env.AGENT_CHAT_RATE_LIMIT_DISABLED?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function sanitizeMessages(messages: z.infer<typeof MessageSchema>[]): UIMessage[] {
  return messages
    .map((message, index) => ({
      id: message.id ?? `m-${index}`,
      role: message.role,
      parts: message.parts.filter((part) => TextPartSchema.safeParse(part).success),
    }))
    .filter((message) => message.parts.length > 0) as UIMessage[];
}
