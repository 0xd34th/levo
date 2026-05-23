'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  useIdentityToken,
  usePrivy,
} from '@privy-io/react-auth';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExecuteResultCard } from './ExecuteResultCard';
import { MandateListCard } from './MandateListCard';
import { ExecuteConfirmationCard } from './ExecuteConfirmationCard';
import { SuiToolCard } from './SuiExplorerCards';

interface Props {
  onMandateCreated: () => void | Promise<void>;
}

const COMMAND_GROUPS = [
  {
    label: 'Markets',
    commands: [
      { label: 'SUI price', prompt: 'How is SUI performing today?' },
      { label: 'Trending coins', prompt: 'What coins are trending on Sui in the last 24 hours?' },
      { label: 'Top DEX pools', prompt: 'Show me the top DEX pools on Sui by volume.' },
      { label: 'New listings', prompt: 'What new tokens were listed on Sui this week?' },
    ],
  },
  {
    label: 'Wallet',
    commands: [
      { label: 'My portfolio', prompt: 'Show me my portfolio' },
      { label: 'Recent activity', prompt: 'Show my recent activity' },
      { label: 'DeFi positions', prompt: 'Show my DeFi positions' },
    ],
  },
  {
    label: 'On-chain',
    commands: [
      { label: 'Object 0x6', prompt: 'What is the Sui object 0x6 (clock)?' },
      { label: 'Explain a digest', prompt: 'Explain this Sui transaction digest' },
      { label: 'NFT collection', prompt: 'Show me the Suipanda NFT collection' },
    ],
  },
  {
    label: 'Trade',
    commands: [
      { label: 'Swap 1 SUI to USDC', prompt: 'Quote me a swap of 1 SUI to USDC' },
      { label: 'Send to .sui', prompt: 'Prepare a transfer of 1 SUI to alice.sui' },
      { label: 'Bridge to Sui', prompt: 'Prepare a bridge of 0.1 ETH from Ethereum to Sui' },
    ],
  },
  {
    label: 'Mandates',
    commands: [
      { label: 'Auto-harvest yield', prompt: 'Create a mandate to auto-harvest claimable Earn yield daily with conservative caps' },
      { label: 'Deposit into Earn', prompt: 'Create a mandate to deposit into Earn manually with conservative caps' },
      { label: 'Withdraw from Earn', prompt: 'Create a mandate to withdraw from Earn manually with conservative caps' },
      { label: 'Show mandates', prompt: 'Show my mandates' },
    ],
  },
];

// Chat panel powered by DeepSeek + AI SDK v5 useChat. It combines Sui explorer
// tools with mandate inspection/handoff while keeping signing outside chat.
export function AgentChatPanel({ onMandateCreated }: Props) {
  const { getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();

  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/v1/agent/chat',
      fetch: async (url, init) => {
        const token = await getAccessToken();
        const headers = new Headers(init?.headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        if (identityToken) headers.set('X-Privy-Identity-Token', identityToken);
        const response = await fetch(url, { ...init, headers });
        if (!response.ok) {
          const payload = await response.clone().json().catch(() => null);
          throw new Error(formatAgentChatHttpError(response.status, payload));
        }
        return response;
      },
    }),
  });

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, status]);

  const busy = status === 'streaming' || status === 'submitted' || submitting;

  const submitPrompt = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setSubmitting(true);
    setInput('');
    try {
      await sendMessage({ text: trimmed });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto pb-3"
      >
        {messages.length === 0 && <EmptyState onPick={submitPrompt} disabled={busy} />}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onMandateCreated={onMandateCreated}
          />
        ))}
        {status === 'submitted' && messages[messages.length - 1]?.role !== 'assistant' && (
          <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>Thinking…</p>
        )}
        {error && (
          <p
            className="rounded-[8px] bg-background px-2 py-1 text-[12px] ring-1 ring-[color:var(--border)]"
            style={{ color: 'var(--down)' }}
          >
            {error.message}
          </p>
        )}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await submitPrompt(input);
        }}
          className="mt-2 flex items-center gap-2 border-t border-[color:var(--border)] pt-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Sui tokens, wallets, txs, swaps, or Earn mandates"
          disabled={busy}
          className="flex-1"
        />
        <Button type="submit" size="icon-lg" disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

export function formatAgentChatHttpError(status: number, payload: unknown): string {
  if (status === 401) return 'Sign in to use agent chat.';
  if (status === 403) return 'Refresh the page and try again; the chat request was blocked.';
  if (status === 429) return 'Agent chat is rate limited. Try again shortly.';
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error?: unknown }).error === 'string'
  ) {
    return (payload as { error: string }).error;
  }
  return `Agent chat failed with HTTP ${status}.`;
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void | Promise<void>;
  disabled: boolean;
}) {
  return (
    <div className="rounded-[12px] bg-[color:var(--surface)] p-4">
      <p className="text-[13px] font-medium">Explore Sui or manage mandates.</p>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
        Start with a Sui query, a prepared transfer/swap, or an Earn mandate handoff.
      </p>
      <div className="mt-4 space-y-3">
        {COMMAND_GROUPS.map((group) => (
          <div key={group.label} className="grid gap-2 sm:grid-cols-[76px_1fr] sm:items-start">
            <p className="pt-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-mute)' }}>
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.commands.map((command) => (
                <button
                  key={command.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(command.prompt)}
                  className="rounded-full border border-[color:var(--border)] bg-background px-3 py-1.5 text-[12px] font-medium transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--raise)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {command.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// AI SDK v5 message shape: `parts: Array<TextUIPart | ToolUIPart<TOOLS> | …>`.
// We render text parts as bubbles and tool-result parts as inline cards.
interface MessagePartsBase {
  role: 'user' | 'assistant' | 'system';
  parts: Array<{ type: string; [k: string]: unknown }>;
}

function MessageBubble({
  message,
  onMandateCreated,
}: {
  message: { id: string } & MessagePartsBase;
  onMandateCreated: () => void | Promise<void>;
}) {
  const isUser = message.role === 'user';
  const text = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text?: string }).text ?? '')
    .join('');

  const toolParts = message.parts.filter((p) => p.type.startsWith('tool-'));

  return (
    <div className={isUser ? 'flex justify-end' : 'flex flex-col gap-2'}>
      {text && (
        <div
          className={
            isUser
              ? 'max-w-[85%] rounded-[12px] bg-foreground px-3 py-2 text-[13px] text-background'
              : 'max-w-[85%] rounded-[12px] bg-[color:var(--surface)] px-3 py-2 text-[13px] leading-5'
          }
        >
          {isUser ? text : <AgentResponseText text={text} />}
        </div>
      )}
      {toolParts.map((part, i) => (
        <ToolPartView
          key={`${message.id}-tool-${i}`}
          part={part}
          onMandateCreated={onMandateCreated}
        />
      ))}
    </div>
  );
}

function ToolPartView({
  part,
  onMandateCreated,
}: {
  part: { type: string; [k: string]: unknown };
  onMandateCreated: () => void | Promise<void>;
}) {
  // AI SDK v5 names tool parts `tool-<name>` with a `state` lifecycle (input-streaming,
  // input-available, output-available, output-error). We render `output-available`.
  const state = (part as { state?: string }).state;
  if (state !== 'output-available') {
    return (
      <p className="text-[11px]" style={{ color: 'var(--text-soft)' }}>
        Running {part.type}...
      </p>
    );
  }
  const output = (part as { output?: unknown }).output;
  if (!output || typeof output !== 'object') return null;
  const kind = (output as { kind?: string }).kind;

  if (kind === 'execute-result') {
    return <ExecuteResultCard result={output as Parameters<typeof ExecuteResultCard>[0]['result']} />;
  }
  if (kind === 'execute-confirmation') {
    return (
      <ExecuteConfirmationCard
        result={output as Parameters<typeof ExecuteConfirmationCard>[0]['result']}
        onExecuted={onMandateCreated}
      />
    );
  }
  if (typeof kind === 'string') {
    return <SuiToolCard output={output as Record<string, unknown>} />;
  }
  // Default: try to render mandate list (the only other tool today).
  if ((output as { mandates?: unknown }).mandates) {
    return <MandateListCard payload={output as { mandates: unknown[] }} />;
  }

  return null;
}

export function AgentResponseText({ text }: { text: string }) {
  const blocks = parseAgentResponseBlocks(text);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === 'list') {
          return (
            <ul key={`${block.items.join('|')}-${index}`} className="ml-4 list-disc space-y-1">
              {block.items.map((line, lineIndex) => (
                <li key={`${line}-${lineIndex}`}>{renderInlineMarkdown(line)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`${block.text}-${index}`} className="whitespace-pre-wrap">
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type AgentResponseBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

function parseAgentResponseBlocks(text: string): AgentResponseBlock[] {
  const blocks: AgentResponseBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*]\s+/, ''));
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
