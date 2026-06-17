'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  useIdentityToken,
  usePrivy,
} from '@privy-io/react-auth';
import { ArrowUpRight, Loader2, Send, X } from 'lucide-react';
import { CoinSelector } from '@/components/coin-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SendButton } from '@/components/send-button';
import { TransactionResult, type TransactionResultData } from '@/components/transaction-result';
import { ExecuteResultCard } from './ExecuteResultCard';
import { MandateListCard } from './MandateListCard';
import { ExecuteConfirmationCard } from './ExecuteConfirmationCard';
import { SuiToolCard } from './SuiExplorerCards';
import { SUI_COIN_TYPE, getSelectableCoinOptions } from '@/lib/coins';
import { detectRecipientType } from '@/lib/recipient';
import { useCoinBalance } from '@/lib/use-coin-balance';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';
import { SevenKSwapPanel } from './SevenKSwapPanel';
import { MandateCreateForm } from './MandateCreateForm';
import type { CreateMandatePayload } from '@/lib/agent/client';

type MandateDraftProposal = {
  spec?: CreateMandatePayload['spec'];
  plan?: CreateMandatePayload['plan'];
  metadataName?: string;
  error?: string;
};

interface Props {
  onMandateCreated: () => void | Promise<void>;
  initialSurface?: TradeSurface | null;
  // When provided, the three Mandates commands open the guided create form
  // inline in the chat and report draft changes here (drives the sidebar
  // preview). When absent (e.g. the agent drawer), commands fall back to chat.
  onMandateDraftChange?: (proposal: MandateDraftProposal | null) => void;
  initialMandateIntent?: string | null;
  configReloadSignal?: number;
}

type OnChainPresetKind = 'object' | 'digest' | 'collection';
type TradeSurface = 'swap' | 'send' | 'bridge';

type PromptCommand = {
  label: string;
  prompt: string;
};

type MandateCommand = {
  label: string;
  prompt: string;
  intent: string;
};

type InputCommand = {
  label: string;
  preset: OnChainPresetDescriptor;
};

type SurfaceCommand = {
  label: string;
  surface: TradeSurface;
};

type Command = PromptCommand | MandateCommand | InputCommand | SurfaceCommand;

type OnChainPresetDescriptor = {
  kind: OnChainPresetKind;
  label: string;
  title: string;
  inputLabel: string;
  placeholder: string;
  error: string;
  validate: (value: string) => boolean;
  buildPrompt: (value: string) => string;
};

const SUI_ID_RE = /^0x[a-fA-F0-9]{1,64}$/;
const SUI_DIGEST_RE = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;

const ON_CHAIN_PRESETS: Record<OnChainPresetKind, OnChainPresetDescriptor> = {
  object: {
    kind: 'object',
    label: 'Object',
    title: 'Enter object ID',
    inputLabel: 'Object ID',
    placeholder: '0x6',
    error: 'Enter a Sui object ID such as 0x6.',
    validate: (value) => SUI_ID_RE.test(value.trim()),
    buildPrompt: (value) => `What is the Sui object ${value.trim()}?`,
  },
  digest: {
    kind: 'digest',
    label: 'Transaction digest',
    title: 'Enter transaction digest',
    inputLabel: 'Transaction digest',
    placeholder: 'Digest',
    error: 'Enter a valid Sui transaction digest.',
    validate: (value) => SUI_DIGEST_RE.test(value.trim()),
    buildPrompt: (value) => `Explain this Sui transaction digest: ${value.trim()}`,
  },
  collection: {
    kind: 'collection',
    label: 'NFT collection',
    title: 'Enter NFT collection',
    inputLabel: 'NFT collection',
    placeholder: 'Suipanda',
    error: 'Enter a collection name or collection object ID.',
    validate: (value) => value.trim().length >= 2,
    buildPrompt: (value) => `Show me the ${value.trim()} NFT collection on Sui.`,
  },
};

const COMMAND_GROUPS: Array<{ label: string; commands: Command[] }> = [
  {
    label: 'Markets',
    commands: [
      { label: 'SUI price', prompt: 'How is SUI performing today?' },
      { label: 'Trending coins', prompt: 'What coins are trending on Sui in the last 24 hours?' },
      { label: 'Top DEX pools', prompt: 'Show me the top DEX pools on Sui by volume.' },
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
      { label: ON_CHAIN_PRESETS.object.label, preset: ON_CHAIN_PRESETS.object },
      { label: ON_CHAIN_PRESETS.digest.label, preset: ON_CHAIN_PRESETS.digest },
      { label: ON_CHAIN_PRESETS.collection.label, preset: ON_CHAIN_PRESETS.collection },
    ],
  },
  {
    label: 'Trade',
    commands: [
      { label: 'Swap', surface: 'swap' },
      { label: 'Send', surface: 'send' },
      { label: 'Bridge', surface: 'bridge' },
    ],
  },
  {
    label: 'Mandates',
    commands: [
      {
        label: 'Auto-harvest yield',
        intent: 'Auto-harvest claimable Earn yield daily with conservative caps',
        prompt: 'Create a mandate to auto-harvest claimable Earn yield daily with conservative caps',
      },
      {
        label: 'Deposit into Earn',
        intent: 'Deposit into Earn manually with conservative caps',
        prompt: 'Create a mandate to deposit into Earn manually with conservative caps',
      },
      {
        label: 'Withdraw from Earn',
        intent: 'Withdraw from Earn manually with conservative caps',
        prompt: 'Create a mandate to withdraw from Earn manually with conservative caps',
      },
      { label: 'Show mandates', prompt: 'Show my mandates' },
    ],
  },
];

// Single-tap prompts kept above the composer after a conversation starts (the
// full EmptyState only shows while the thread is empty). Pure prompt commands
// only — input presets, trade surfaces, and mandate handoffs need the surfaces
// that EmptyState renders.
const QUICK_PROMPTS: PromptCommand[] = COMMAND_GROUPS.flatMap((group) =>
  group.commands.filter(
    (command): command is PromptCommand => 'prompt' in command && !('intent' in command),
  ),
);

// Chat panel powered by DeepSeek + AI SDK v5 useChat. It combines Sui explorer
// tools with mandate inspection/handoff while keeping signing outside chat.
export function AgentChatPanel({
  onMandateCreated,
  initialSurface = null,
  onMandateDraftChange,
  initialMandateIntent = null,
  configReloadSignal = 0,
}: Props) {
  const { getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();

  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activePreset, setActivePreset] = useState<OnChainPresetDescriptor | null>(null);
  const [activeSurface, setActiveSurface] = useState<TradeSurface | null>(initialSurface);
  const [mandateIntent, setMandateIntent] = useState<string | null>(initialMandateIntent);
  const inlineMandateEnabled = Boolean(onMandateDraftChange);

  const closeMandate = () => {
    setMandateIntent(null);
    onMandateDraftChange?.(null);
  };

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

  const pickCommand = async (command: Command) => {
    if (busy) return;
    if ('intent' in command) {
      if (inlineMandateEnabled) {
        setActivePreset(null);
        setActiveSurface(null);
        setMandateIntent(command.intent);
        return;
      }
      await submitPrompt(command.prompt);
      return;
    }
    if ('prompt' in command) {
      await submitPrompt(command.prompt);
      return;
    }
    if ('preset' in command) {
      setMandateIntent(null);
      setActiveSurface(null);
      setActivePreset(command.preset);
      return;
    }
    setMandateIntent(null);
    setActivePreset(null);
    setActiveSurface(command.surface);
  };

  return (
    <div className="flex h-full flex-col">
      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto pb-3"
      >
        {messages.length === 0 && (
          <>
            <EmptyState onPick={pickCommand} disabled={busy} />
            {mandateIntent !== null && inlineMandateEnabled ? (
              <SurfaceShell onClose={closeMandate}>
                <MandateCreateForm
                  key={mandateIntent}
                  initialIntent={mandateIntent}
                  onDraftChange={onMandateDraftChange}
                  onCreated={async () => {
                    closeMandate();
                    await onMandateCreated();
                  }}
                  onCancel={closeMandate}
                  configReloadSignal={configReloadSignal}
                />
              </SurfaceShell>
            ) : (
              <PresetSurface
                activePreset={activePreset}
                activeSurface={activeSurface}
                onClose={() => {
                  setActivePreset(null);
                  setActiveSurface(null);
                }}
                onSubmitPreset={async (prompt) => {
                  setActivePreset(null);
                  await submitPrompt(prompt);
                }}
              />
            )}
          </>
        )}
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

      {messages.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {QUICK_PROMPTS.map((command) => (
            <button
              key={command.label}
              type="button"
              disabled={busy}
              onClick={() => pickCommand(command)}
              className="shrink-0 rounded-full border border-[color:var(--border)] bg-background px-3 py-1.5 text-[12px] font-medium transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--raise)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {command.label}
            </button>
          ))}
        </div>
      )}

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
  onPick: (command: Command) => void | Promise<void>;
  disabled: boolean;
}) {
  const exploreGroups = COMMAND_GROUPS.filter((group) => group.label !== 'Mandates');
  const mandatesGroup = COMMAND_GROUPS.find((group) => group.label === 'Mandates');
  return (
    <div data-agent-tour="chat-start" className="rounded-[12px] bg-[color:var(--surface)] p-4">
      <p className="text-[13px] font-medium">Explore Sui or manage mandates.</p>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
        Start with a Sui query, a prepared transfer/swap, or an Earn mandate handoff.
      </p>
      <div className="mt-4 space-y-3">
        <div data-agent-tour="explore-presets" className="space-y-3">
          {exploreGroups.map((group) => (
            <CommandGroupBlock key={group.label} group={group} onPick={onPick} disabled={disabled} />
          ))}
        </div>
        {mandatesGroup ? (
          <CommandGroupBlock
            group={mandatesGroup}
            anchor="mandate-create"
            onPick={onPick}
            disabled={disabled}
          />
        ) : null}
      </div>
    </div>
  );
}

function CommandGroupBlock({
  group,
  anchor,
  onPick,
  disabled,
}: {
  group: { label: string; commands: Command[] };
  anchor?: string;
  onPick: (command: Command) => void | Promise<void>;
  disabled: boolean;
}) {
  return (
    <div
      data-agent-tour={anchor}
      className="grid gap-2 sm:grid-cols-[76px_1fr] sm:items-start"
    >
      <p className="pt-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-mute)' }}>
        {group.label}
      </p>
      <div className="flex flex-wrap gap-2">
        {group.commands.map((command) => (
          <button
            key={command.label}
            type="button"
            disabled={disabled}
            onClick={() => onPick(command)}
            className="rounded-full border border-[color:var(--border)] bg-background px-3 py-1.5 text-[12px] font-medium transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--raise)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {command.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PresetSurface({
  activePreset,
  activeSurface,
  onClose,
  onSubmitPreset,
}: {
  activePreset: OnChainPresetDescriptor | null;
  activeSurface: TradeSurface | null;
  onClose: () => void;
  onSubmitPreset: (prompt: string) => void | Promise<void>;
}) {
  if (activePreset) {
    return (
      <OnChainPresetCard
        preset={activePreset}
        onClose={onClose}
        onSubmit={onSubmitPreset}
      />
    );
  }
  if (activeSurface === 'swap') {
    return (
      <SurfaceShell onClose={onClose}>
        <SevenKSwapPanel />
      </SurfaceShell>
    );
  }
  if (activeSurface === 'send') {
    return (
      <SurfaceShell onClose={onClose}>
        <AgentSendCard />
      </SurfaceShell>
    );
  }
  if (activeSurface === 'bridge') {
    return (
      <SurfaceShell onClose={onClose}>
        <BridgeHandoffCard />
      </SurfaceShell>
    );
  }
  return null;
}

function SurfaceShell({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="mt-3">
      <div className="mb-2 flex justify-end">
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {children}
    </div>
  );
}

function OnChainPresetCard({
  preset,
  onClose,
  onSubmit,
}: {
  preset: OnChainPresetDescriptor;
  onClose: () => void;
  onSubmit: (prompt: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const hasValue = trimmed.length > 0;
  const isValid = preset.validate(trimmed);

  return (
    <div className="mt-3 rounded-[12px] border border-[color:var(--border)] bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold">{preset.title}</p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            The agent will use this value to build the on-chain query.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close preset">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3">
        <Input
          aria-label={preset.inputLabel}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={preset.placeholder}
        />
        {hasValue && !isValid ? (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--down)' }}>
            {preset.error}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        className="mt-3 h-10 w-full rounded-[10px] text-[13px]"
        disabled={!isValid}
        onClick={() => onSubmit(preset.buildPrompt(trimmed))}
      >
        Ask agent
      </Button>
    </div>
  );
}

function AgentSendCard() {
  const { suiAddress: embeddedWalletAddress, loading: walletLoading, error: walletError } = useEmbeddedWallet();
  const defaultCoinType = getSelectableCoinOptions()[0]?.coinType ?? SUI_COIN_TYPE;
  const [coinType, setCoinType] = useState(defaultCoinType);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TransactionResultData | null>(null);
  const { balance: availableBalance } = useCoinBalance(embeddedWalletAddress, coinType);

  return (
    <div className="rounded-[12px] border border-[color:var(--border)] bg-background p-3">
      <p className="text-[13px] font-semibold">Send to Sui</p>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
        Enter an amount and a Sui address or .sui name. Levo will show the normal recipient review before signing.
      </p>
      <div className="mt-3 grid gap-2">
        <CoinSelector
          value={coinType}
          onValueChange={(value) => {
            setCoinType(value);
            setSendError(null);
          }}
        />
        <Input
          aria-label="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setSendError(null);
          }}
          placeholder="1"
        />
        <Input
          aria-label="Recipient address or .sui"
          value={recipient}
          onChange={(event) => {
            setRecipient(event.target.value);
            setSendError(null);
          }}
          placeholder="alice.sui or 0x..."
        />
      </div>
      {walletLoading ? (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--text-soft)' }}>
          Preparing your embedded wallet…
        </p>
      ) : null}
      {walletError ? (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--down)' }}>
          {walletError}
        </p>
      ) : null}
      {sendError ? (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--down)' }}>
          {sendError}
        </p>
      ) : null}
      <div className="mt-3">
        <SendButton
          amount={amount}
          coinType={coinType}
          recipientType={detectRecipientType(recipient)}
          embeddedWalletAddress={embeddedWalletAddress}
          availableBalance={availableBalance}
          onConfirm={(data) => {
            setSendError(null);
            setTxResult(data);
          }}
          onError={setSendError}
          username={recipient}
        />
      </div>
      <TransactionResult
        data={txResult}
        network={process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet'}
        onReset={() => {
          setTxResult(null);
          setAmount('');
          setRecipient('');
          setSendError(null);
        }}
      />
    </div>
  );
}

function BridgeHandoffCard() {
  const [amount, setAmount] = useState('');
  const [sourceToken, setSourceToken] = useState('ETH');
  const [reviewing, setReviewing] = useState(false);

  const openBridge = () => {
    window.open('https://bridge.sui.io/', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-[12px] border border-[color:var(--border)] bg-background p-3">
      <p className="text-[13px] font-semibold">Review bridge handoff</p>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
        Official Sui Bridge opens in a new tab. Route selection and wallet confirmation happen there.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Bridge amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setReviewing(false);
          }}
          placeholder="Amount optional"
        />
        <Input
          aria-label="Source token"
          value={sourceToken}
          onChange={(event) => {
            setSourceToken(event.target.value);
            setReviewing(false);
          }}
          placeholder="ETH"
        />
      </div>
      {reviewing ? (
        <div className="mt-3 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--raise)] p-3">
          <p className="text-[12px] font-semibold">Handoff review</p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            {amount.trim() ? `${amount.trim()} ` : 'Amount not set '}
            {sourceToken.trim() || 'source token'} to Sui. Confirm the final route, fees, destination, and wallet
            signature on the official bridge.
          </p>
          <Button
            type="button"
            className="mt-3 h-10 w-full rounded-[10px] text-[13px]"
            onClick={openBridge}
          >
            <span className="inline-flex items-center gap-2">
              Open Sui Bridge
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className="mt-3 h-10 w-full rounded-[10px] text-[13px]"
          onClick={() => setReviewing(true)}
        >
          Review handoff
        </Button>
      )}
    </div>
  );
}

// AI SDK v5 message shape: `parts: Array<TextUIPart | ToolUIPart<TOOLS> | …>`.
// We render text parts as bubbles and tool-result parts as inline cards.
interface MessagePartsBase {
  role: 'user' | 'assistant' | 'system';
  parts: Array<{ type: string; [k: string]: unknown }>;
}

export function MessageBubble({
  message,
  onMandateCreated,
}: {
  message: { id: string } & MessagePartsBase;
  onMandateCreated: () => void | Promise<void>;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={isUser ? 'flex flex-col items-end gap-2' : 'flex flex-col gap-2'}>
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          const text = (part as { text?: string }).text ?? '';
          if (!text) return null;
          return <MessageTextBubble key={`${message.id}-text-${i}`} text={text} isUser={isUser} />;
        }
        if (part.type.startsWith('tool-')) {
          return (
            <ToolPartView
              key={`${message.id}-tool-${i}`}
              part={part}
              onMandateCreated={onMandateCreated}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function MessageTextBubble({
  text,
  isUser,
}: {
  text: string;
  isUser: boolean;
}) {
  return (
    <div
      className={
        isUser
          ? 'max-w-[85%] rounded-[12px] bg-foreground px-3 py-2 text-[13px] text-background'
          : 'max-w-[85%] rounded-[12px] bg-[color:var(--surface)] px-3 py-2 text-[13px] leading-5'
      }
    >
      {isUser ? text : <AgentResponseText text={text} />}
    </div>
  );
}

export function ToolPartView({
  part,
  onMandateCreated,
}: {
  part: { type: string; [k: string]: unknown };
  onMandateCreated: () => void | Promise<void>;
}) {
  // AI SDK v5 names tool parts `tool-<name>` with a `state` lifecycle (input-streaming,
  // input-available, output-available, output-error). We render `output-available`.
  const state = (part as { state?: string }).state;
  if (state === 'output-error') {
    const errorText = toolErrorText(part);
    return (
      <div
        className="max-w-[85%] rounded-[10px] bg-background px-3 py-2 text-[12px] ring-1 ring-[color:var(--border)]"
        style={{ color: 'var(--down)' }}
      >
        <p className="font-medium">Tool unavailable</p>
        <p className="mt-1">{errorText}</p>
      </div>
    );
  }
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

function toolErrorText(part: { [k: string]: unknown }): string {
  for (const key of ['errorText', 'errorMessage', 'message']) {
    const value = part[key];
    if (typeof value === 'string' && value.trim()) return sanitizeProviderDiagnostics(value);
  }
  const error = part.error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return sanitizeProviderDiagnostics(message);
  }
  return 'The data provider did not return a usable result. Try again shortly.';
}

export function AgentResponseText({ text }: { text: string }) {
  const blocks = parseAgentResponseBlocks(sanitizeProviderDiagnostics(text));

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === 'table') {
          return (
            <div key={`${block.headers.join('|')}-${index}`} className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-left text-[12px]">
                <thead>
                  <tr>
                    {block.headers.map((cell, cellIndex) => (
                      <th
                        key={`${cell}-${cellIndex}`}
                        className="border-b border-[color:var(--border)] px-2 py-1 font-medium first:pl-0 last:pr-0"
                        style={{ color: 'var(--text-soft)' }}
                      >
                        {renderInlineMarkdown(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${row.join('|')}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${cell}-${cellIndex}`}
                          className="border-b border-[color:var(--border)] px-2 py-1 align-top first:pl-0 last:pr-0"
                        >
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={`${block.items.join('|')}-${index}`}
              className={`ml-4 space-y-1 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
            >
              {block.items.map((line, lineIndex) => (
                <li key={`${line}-${lineIndex}`}>{renderInlineMarkdown(line)}</li>
              ))}
            </ListTag>
          );
        }
        if (block.type === 'heading') {
          const HeadingTag = block.level === 3 ? 'h3' : 'h2';
          return (
            <HeadingTag
              key={`${block.text}-${index}`}
              className="pt-1 text-[13px] font-semibold"
            >
              {renderInlineMarkdown(block.text)}
            </HeadingTag>
          );
        }
        if (block.type === 'separator') {
          return (
            <hr
              key={`separator-${index}`}
              className="border-[color:var(--border)]"
            />
          );
        }
        if (block.type === 'blockquote') {
          return (
            <div
              key={`${block.text}-${index}`}
              className="rounded-[8px] border border-[color:var(--border)] bg-background px-3 py-2 text-[12px]"
              style={{ color: 'var(--text-soft)' }}
            >
              {renderInlineMarkdown(block.text)}
            </div>
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

function sanitizeProviderDiagnostics(text: string): string {
  return text
    .replace(/\bboth the OKX and 7K quote adapters are not running\b/gi, 'live quote routes are unavailable')
    .replace(/\bboth the OKX and 7K quote adapters are down or not configured\b/gi, 'live quote routes are unavailable')
    .replace(/\bOKX and 7K quote adapters are not running\b/gi, 'live quote routes are unavailable')
    .replace(/\bOKX and 7K quote adapters are down or not configured\b/gi, 'live quote routes are unavailable')
    .replace(/\bboth the OKX and 7K quote providers are not returning quotes\b/gi, 'live quote routes are unavailable')
    .replace(/\bOKX and 7K quote providers are not returning quotes\b/gi, 'live quote routes are unavailable')
    .replace(/\bboth OKX and 7K routes are disabled\/not configured\b/gi, 'live quote routes are unavailable')
    .replace(/\bconfigured quote providers \(OKX and 7K\) aren't active\b/gi, 'live quote routes are unavailable')
    .replace(/\bquote sources offline\b/gi, 'live quote unavailable')
    .replace(/\bcurrent server flags? or providers\b/gi, 'live quote routes')
    .replace(/\bon this server\b/gi, 'right now')
    .replace(/\bBlockVision\s+\d{3}\s+\/[^\s).,;]+/gi, 'the data provider returned an unavailable response')
    .replace(/\bBlockVision\s+\d{3}\b/gi, 'the data provider returned an unavailable response')
    .replace(/\bBlockVision returned an error\b/gi, 'the data provider returned an error')
    .replace(/\bBlockVision timed out\b/gi, 'the data provider timed out')
    .replace(/\bBlockVision\b/gi, 'the data provider');
}

type AgentResponseBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'separator' }
  | { type: 'blockquote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

function parseAgentResponseBlocks(text: string): AgentResponseBlock[] {
  const blocks: AgentResponseBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: 'list', ordered: listOrdered, items: list });
    list = [];
  };
  const pushListItem = (ordered: boolean, item: string) => {
    flushParagraph();
    if (list.length && listOrdered !== ordered) flushList();
    listOrdered = ordered;
    list.push(item);
  };

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^[-*_]{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'separator' });
      continue;
    }
    if (/^>\s+/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'blockquote', text: line.replace(/^>\s+/, '') });
      continue;
    }
    const nextLine = lines[i + 1]?.trim() ?? '';
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length === 3 ? 3 : 2,
        text: headingMatch[2],
      });
      continue;
    }
    if (isMarkdownTableLine(line) && isMarkdownTableSeparator(nextLine)) {
      flushParagraph();
      flushList();
      const headers = parseMarkdownTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!isMarkdownTableLine(rowLine)) {
          i -= 1;
          break;
        }
        rows.push(normalizeTableRow(parseMarkdownTableRow(rowLine), headers.length));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      pushListItem(false, line.replace(/^[-*]\s+/, ''));
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      pushListItem(true, line.replace(/^\d+[.)]\s+/, ''));
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function isMarkdownTableLine(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.includes('|', 1);
}

function isMarkdownTableSeparator(line: string): boolean {
  if (!isMarkdownTableLine(line)) return false;
  return parseMarkdownTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTableRow(line: string): string[] {
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function normalizeTableRow(row: string[], size: number): string[] {
  if (row.length === size) return row;
  if (row.length > size) return row.slice(0, size);
  return [...row, ...Array.from({ length: size - row.length }, () => '')];
}

function renderInlineMarkdown(text: string) {
  const parts = splitInlineMarkdownLinks(text);
  if (parts.some((part) => typeof part !== 'string')) {
    return parts.map((part, index) => {
      if (typeof part === 'string') {
        return <span key={`${part}-${index}`}>{renderInlineMarkdown(part)}</span>;
      }
      return (
        <a
          key={`${part.href}-${index}`}
          href={normalizeMarkdownHref(part.href)}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-2"
        >
          {part.label}
        </a>
      );
    });
  }
  return renderInlineMarkdownWithoutLinks(text);
}

function renderInlineMarkdownWithoutLinks(text: string) {
  const parts = text.split(/(\\?`+[^`\n]+\\?`+|\*\*[^*]+\*\*|\*[^*\n]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (/^\\?`+[^`\n]+\\?`+$/.test(part)) {
      const codeText = part.replace(/^\\?`+/, '').replace(/\\?`+$/, '');
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-[color:var(--raise)] px-1 py-0.5 font-mono text-[0.92em] break-all text-[color:var(--foreground)]"
        >
          {codeText}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }
    return part.replace(/\\?`/g, '');
  });
}

function splitInlineMarkdownLinks(text: string): Array<string | { label: string; href: string }> {
  const parts: Array<string | { label: string; href: string }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const labelStart = text.indexOf('[', cursor);
    if (labelStart === -1) break;
    const labelEnd = text.indexOf('](', labelStart + 1);
    if (labelEnd === -1) break;

    const hrefStart = labelEnd + 2;
    const hrefEnd = findMarkdownHrefEnd(text, hrefStart);
    if (hrefEnd === -1) {
      cursor = labelEnd + 2;
      continue;
    }

    if (labelStart > cursor) parts.push(text.slice(cursor, labelStart));
    parts.push({
      label: text.slice(labelStart + 1, labelEnd),
      href: text.slice(hrefStart, hrefEnd),
    });
    cursor = hrefEnd + 1;
  }

  if (!parts.length) return [text];
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.filter((part) => (typeof part === 'string' ? part.length > 0 : part.label.length > 0 && part.href.length > 0));
}

function findMarkdownHrefEnd(text: string, start: number): number {
  let nestedParens = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '(') {
      nestedParens += 1;
      continue;
    }
    if (text[i] !== ')') continue;
    if (nestedParens > 0) {
      nestedParens -= 1;
      continue;
    }
    return i;
  }
  return -1;
}

function normalizeMarkdownHref(href: string): string {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/(?!\/)/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
