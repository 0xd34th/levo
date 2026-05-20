import { NextRequest } from 'next/server';
import { z } from 'zod';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { buildAgentTools } from '@/lib/agent/tools';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  messages: z.array(z.any()).min(1),
});

const SYSTEM_PROMPT = `You are the levo agent assistant. levo is a stablecoin wallet on Sui; users authorize on-chain "mandates" so a platform-controlled agent can perform yield-management actions (deposit / withdraw / harvest) within strict policy limits.

V1 MVP scope: only yield-related actions (EARN_DEPOSIT / EARN_WITHDRAW / EARN_HARVEST). Reject other requests politely.

When a user asks to create a mandate, do not ask for raw vault/cap/cron details and do not generate a proposal from chat. Tell them to use the guided "New mandate" form, which handles action, cadence, caps, expiry, configured target, and wallet approval.

When a user wants to inspect or run an existing mandate:
- Use \`list_my_mandates\` to fetch current state.
- Use \`execute_mandate_now\` only for explicit user requests like "run", "execute", "harvest now". This tool only returns a confirmation card. Do not claim execution happened until the user presses the frontend confirmation button and the execute API returns a result.

Be concise. Default to bullets or short paragraphs. In chat prose use human-readable values.`;

// POST /api/v1/agent/chat — DeepSeek-powered chat with existing-mandate tools:
// list_my_mandates / execute_mandate_now.
// Returns the AI-SDK v5 UI message stream which @ai-sdk/react useChat consumes.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-chat:${ip}`, 60, 20);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
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
    const tools = buildAgentTools({ xUserId: auth.identity.xUserId });
    const result = streamText({
      model: deepseek('deepseek-chat'),
      system: SYSTEM_PROMPT,
      messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
      tools,
      // Allow up to ~3 tool round-trips per turn (e.g. list → propose).
      stopWhen: ({ steps }) => steps.length >= 4,
    });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    return noStoreJson(
      {
        error: error instanceof Error ? error.message : 'Chat failed',
      },
      { status: 500 },
    );
  }
}
