"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectModal, useCurrentAccount } from "@mysten/dapp-kit";
import { Header } from "@/components/Header";
import { Composer } from "@/components/chat/Composer";
import { Landing } from "@/components/chat/Landing";
import { MessageList } from "@/components/chat/MessageList";
import { PresetPanel, type OnchainPreset, type TradeSurface } from "@/components/chat/PresetPanels";
import type { PresetCommand } from "@/components/chat/ChipBar";
import type { ModelMode } from "@/lib/llm/model-router";
import type { ExplainedTx } from "@/lib/sui/ptb-explainer";
import { useTurnstile } from "@/lib/security/use-turnstile";

const TURNSTILE_SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;

export default function Home() {
  const account = useCurrentAccount();
  const [mode, setMode] = useState<ModelMode>("fast");
  const [composerSeed, setComposerSeed] = useState<string | undefined>(undefined);
  const [activePreset, setActivePreset] = useState<OnchainPreset | null>(null);
  const [activeSurface, setActiveSurface] = useState<TradeSurface | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [walletPromptOpen, setWalletPromptOpen] = useState(false);
  const { getToken: getTurnstileToken, containerRef: turnstileRef } = useTurnstile(TURNSTILE_SITEKEY);

  // Mirror the latest mode + connected wallet into refs so the transport,
  // which AI SDK 5's useChat binds once, can read fresh values on every send.
  // Without this the closure captures whatever account was at first render
  // (typically null, before dapp-kit's autoConnect resolves) and never
  // refreshes — the LLM keeps asking for an address even when connected.
  const modeRef = useRef<ModelMode>(mode);
  const senderRef = useRef<string | null>(account?.address ?? null);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    senderRef.current = account?.address ?? null;
  }, [account?.address]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            mode: modeRef.current,
            sender: senderRef.current,
            turnstileToken: (body as { turnstileToken?: string } | undefined)?.turnstileToken,
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, setMessages, status, stop, error } = useChat({ transport });

  useEffect(() => {
    void fetch("/api/auth/fingerprint").catch(() => undefined);
  }, []);

  const submit = useCallback(
    async (text: string) => {
      if (!account?.address) {
        setWalletPromptOpen(true);
        return;
      }
      setChallengeError(null);
      let turnstileToken: string | undefined;
      if (TURNSTILE_SITEKEY) {
        const tok = await getTurnstileToken();
        if (tok === null) {
          setChallengeError("Bot challenge failed. Please try again.");
          return;
        }
        turnstileToken = tok;
      }
      await sendMessage({ text }, { body: { turnstileToken } });
    },
    [account?.address, sendMessage, getTurnstileToken],
  );

  const onChipFromCard = useCallback(
    (text: string) => {
      setActivePreset(null);
      setActiveSurface(null);
      setComposerSeed(text);
    },
    [],
  );

  const onPresetCommand = useCallback((command: PresetCommand) => {
    if (command.kind === "prompt") {
      setActivePreset(null);
      setActiveSurface(null);
      setComposerSeed(command.prompt);
      return;
    }
    if (command.kind === "onchain") {
      setActivePreset(command.preset);
      setActiveSurface(null);
      return;
    }
    setActiveSurface(command.surface);
    setActivePreset(null);
  }, []);

  const onPresetPrompt = useCallback((prompt: string) => {
    setActivePreset(null);
    setActiveSurface(null);
    setComposerSeed(prompt);
  }, []);

  const onReceipt = useCallback(
    async (digest: string) => {
      const placeholderId = `receipt-${digest}`;
      // Optimistic placeholder so the user sees something immediately.
      setMessages((prev: UIMessage[]) => [
        ...prev,
        {
          id: placeholderId,
          role: "assistant",
          parts: [
            {
              type: "tool-explain_tx",
              toolCallId: `manual-${digest}`,
              state: "input-available",
              input: { digest },
            },
          ],
        } as UIMessage,
      ]);
      try {
        const res = await fetch("/api/explain-tx", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ digest }),
        });
        if (!res.ok) throw new Error(`explain-tx ${res.status}`);
        const explained = (await res.json()) as ExplainedTx;
        setMessages((prev: UIMessage[]) =>
          prev.map((m) =>
            m.id === placeholderId
              ? ({
                  ...m,
                  parts: [
                    {
                      type: "tool-explain_tx",
                      toolCallId: `manual-${digest}`,
                      state: "output-available",
                      input: { digest },
                      output: explained,
                    },
                  ],
                } as UIMessage)
              : m,
          ),
        );
      } catch (e) {
        setMessages((prev: UIMessage[]) =>
          prev.map((m) =>
            m.id === placeholderId
              ? ({
                  ...m,
                  parts: [
                    {
                      type: "tool-explain_tx",
                      toolCallId: `manual-${digest}`,
                      state: "output-error",
                      input: { digest },
                      errorText: (e as Error).message,
                    },
                  ],
                } as UIMessage)
              : m,
          ),
        );
      }
    },
    [setMessages],
  );

  const empty = messages.length === 0;

  const followups = useMemo<string[]>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const parts = (m as { parts?: Array<Record<string, unknown>> }).parts ?? [];
      for (let j = parts.length - 1; j >= 0; j--) {
        const p = parts[j] as { type?: string; state?: string; output?: { questions?: string[] } };
        if (p.type === "tool-suggest_followups" && p.state === "output-available") {
          const qs = p.output?.questions ?? [];
          if (qs.length) return qs;
        }
      }
    }
    return [];
  }, [messages]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <ConnectModal
        open={walletPromptOpen}
        onOpenChange={setWalletPromptOpen}
        trigger={<span style={{ display: "none" }} aria-hidden />}
      />
      {TURNSTILE_SITEKEY ? (
        <div
          ref={turnstileRef}
          aria-hidden="true"
          style={{
            position: "fixed",
            bottom: 0,
            right: 0,
            visibility: "hidden",
            pointerEvents: "none",
          }}
        />
      ) : null}
      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-32 pt-2">
        {empty ? (
          <>
            <Landing onPick={onPresetCommand} />
            <div className="mx-auto mt-2 w-full max-w-[600px]">
              <div className={activePreset || activeSurface ? "mb-3" : ""}>
                <PresetPanel
                  onchainPreset={activePreset}
                  tradeSurface={activeSurface}
                  onPrompt={onPresetPrompt}
                  onReceipt={onReceipt}
                />
              </div>
              <Composer
                onSubmit={submit}
                status={status}
                onStop={() => stop()}
                mode={mode}
                onModeChange={setMode}
                initialValue={composerSeed}
              />
              {challengeError ? (
                <div className="mt-2 rounded-md bg-[var(--color-down)]/10 p-3 text-sm text-[var(--color-down)]">
                  {challengeError}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 space-y-2 pt-4 pb-40">
              <MessageList
                messages={messages}
                isStreaming={status === "streaming" || status === "submitted"}
                onChip={onChipFromCard}
                onReceipt={onReceipt}
              />
              {error || challengeError ? (
                <div className="rounded-md bg-[var(--color-down)]/10 p-3 text-sm text-[var(--color-down)]">
                  {challengeError ?? error?.message}
                </div>
              ) : null}
            </div>
            <div
              className="sticky bottom-0 mt-auto pt-4 pb-6"
              style={{
                background:
                  "linear-gradient(to top, var(--bg) 60%, color-mix(in oklch, var(--bg) 0%, transparent))",
              }}
            >
              <FollowupBar questions={followups} onPick={onChipFromCard} />
              <Composer
                onSubmit={submit}
                status={status}
                onStop={() => stop()}
                mode={mode}
                onModeChange={setMode}
                initialValue={composerSeed}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FollowupBar({
  questions,
  onPick,
}: {
  questions: string[];
  onPick: (q: string) => void;
}) {
  if (!questions.length) return null;
  return (
    <div className="fu-bar">
      <span className="fu-label">Try next</span>
      <div className="fu-row">
        {questions.map((q) => (
          <button key={q} type="button" onClick={() => onPick(q)} className="fu-chip">
            {q}
          </button>
        ))}
      </div>
      <style>{`
        .fu-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-bottom: 8px;
          flex-wrap: wrap;
        }
        .fu-label {
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-muted);
        }
        .fu-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          flex: 1;
        }
        .fu-chip {
          padding: 5px 10px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 999px;
          color: var(--fg-mid);
          font-size: 12px;
          line-height: 1.2;
          cursor: pointer;
          transition: background 120ms, color 120ms, border-color 120ms;
        }
        .fu-chip:hover {
          background: var(--bg-elev);
          color: var(--fg);
          border-color: var(--accent-soft);
        }
      `}</style>
    </div>
  );
}
