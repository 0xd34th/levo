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
        return fetch(url, { ...init, headers });
      },
    }),
  });

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, status]);

  const busy = status === 'streaming' || status === 'submitted' || submitting;

  return (
    <div className="flex h-full flex-col">
      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto pb-3"
      >
        {messages.length === 0 && <EmptyState />}
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
          const text = input.trim();
          if (!text || busy) return;
          setSubmitting(true);
          setInput('');
          try {
            await sendMessage({ text });
          } finally {
            setSubmitting(false);
          }
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

function EmptyState() {
  return (
    <div className="rounded-[12px] bg-[color:var(--surface)] p-4">
      <p className="text-[13px] font-medium">Explore Sui or manage mandates.</p>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
        Try “Show my Sui portfolio”, “Explain this tx”, or “Create a daily Earn harvest mandate”.
      </p>
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
              : 'max-w-[85%] rounded-[12px] bg-[color:var(--surface)] px-3 py-2 text-[13px]'
          }
        >
          {text}
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
