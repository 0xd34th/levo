// Direct DeepSeek + tool-call smoke test. Bypasses the HTTP + Privy layers and
// invokes the same tool registry / system prompt as the `/api/v1/agent/chat`
// route so we can confirm the streaming + tool path works end-to-end against
// the real DeepSeek API.
//
// Run: pnpm tsx scripts/chat-smoke.ts

import 'dotenv/config';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { buildAgentTools } from '../lib/agent/tools';
import { prisma } from '../lib/prisma';

const SYSTEM_PROMPT = `You are the levo agent assistant. Be concise.

V1 only supports yield actions (EARN_DEPOSIT / EARN_WITHDRAW / EARN_HARVEST).

New mandate creation is handled by the guided form, not chat.

For the smoke test: when the user asks to show mandates, you MUST immediately call list_my_mandates.

After the tool call, briefly summarize the result in one sentence.`;

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey || apiKey === 'replace-me') {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  console.log('== Chat smoke test ==');
  console.log('Model: deepseek-chat\n');

  const deepseek = createDeepSeek({ apiKey });
  const tools = buildAgentTools({ xUserId: 'smoke-test-user' });

  const userMessages: UIMessage[] = [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Show my mandates.' }],
    },
  ];

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(userMessages),
    tools,
    stopWhen: ({ steps }) => steps.length >= 3,
  });

  let textChunks = 0;
  let toolCalls = 0;
  let toolResults = 0;
  const mandateLists: unknown[] = [];

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        textChunks += 1;
        process.stdout.write(chunk.text ?? '');
        break;
      case 'tool-call':
        toolCalls += 1;
        console.log(`\n→ tool-call: ${chunk.toolName}`);
        console.log('  input:', JSON.stringify(chunk.input, null, 2));
        break;
      case 'tool-result':
        toolResults += 1;
        console.log(`← tool-result (${chunk.toolName})`);
        if (
          chunk.output &&
          typeof chunk.output === 'object' &&
          'mandates' in chunk.output
        ) {
          mandateLists.push(chunk.output);
        }
        break;
      case 'error':
        console.error('Stream error:', chunk.error);
        break;
      case 'finish':
      case 'finish-step':
      case 'start':
      case 'start-step':
        break;
      default:
        // Other chunk types are noisy; skip.
        break;
    }
  }
  console.log('\n');

  console.log('== Summary ==');
  console.log(`  text chunks   : ${textChunks}`);
  console.log(`  tool calls    : ${toolCalls}`);
  console.log(`  tool results  : ${toolResults}`);
  console.log(`  mandate lists : ${mandateLists.length}`);

  if (mandateLists.length === 0) {
    throw new Error('No mandate list returned — tool calling did not engage');
  }
  const list = mandateLists[0] as { mandates?: unknown[] };
  console.log('\n== List validation ==');
  console.log('  mandates:', list.mandates?.length ?? 0);
  console.log('\nOK — DeepSeek + tool calling works end-to-end.');
}

main()
  .catch((err) => {
    console.error('\nSmoke test FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
