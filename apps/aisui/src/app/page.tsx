"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Header } from "@/components/Header";
import { Composer } from "@/components/chat/Composer";
import { Landing } from "@/components/chat/Landing";
import { MessageList } from "@/components/chat/MessageList";
import type { ModelMode } from "@/lib/llm/model-router";
import type { ExplainedTx } from "@/lib/sui/ptb-explainer";
import { useTurnstile } from "@/lib/security/use-turnstile";

const TURNSTILE_SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;

export default function Home() {
  const account = useCurrentAccount();
  const [mode, setMode] = useState<ModelMode>("fast");
  const [composerSeed, setComposerSeed] = useState<string | undefined>(undefined);
  const [challengeError, setChallengeError] = useState<string | null>(null);
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
    [sendMessage, getTurnstileToken],
  );

  const onChipFromCard = useCallback(
    (text: string) => {
      setComposerSeed(text);
    },
    [],
  );

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

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
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
            <Landing onPick={submit} />
            <div className="mx-auto mt-2 w-full max-w-[600px]">
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
            <div className="flex-1 space-y-2 pt-4">
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
