"use client";

import type { ReactNode } from "react";
import type { UIMessage } from "ai";
import { Wrench, Check } from "lucide-react";
import { TokenCard } from "@/components/cards/TokenCard";
import { PortfolioCard } from "@/components/cards/PortfolioCard";
import { DefiCard } from "@/components/cards/DefiCard";
import { ActivityList } from "@/components/cards/ActivityList";
import { TrendingCard } from "@/components/cards/TrendingCard";
import { NFTCollectionCard } from "@/components/cards/NFTCollectionCard";
import { ObjectCard } from "@/components/cards/ObjectCard";
import { TxExplainCard } from "@/components/cards/TxExplainCard";
import { SwapCard } from "@/components/cards/SwapCard";
import { TransferCard } from "@/components/cards/TransferCard";
import type { TokenMetricsResult } from "@/lib/tools/get-token-metrics";
import type { PortfolioResult } from "@/lib/tools/get-portfolio";
import type { DefiPositionsResult } from "@/lib/tools/get-defi-positions";
import type { RecentActivityResult } from "@/lib/tools/get-recent-activity";
import type { TrendingResult } from "@/lib/tools/get-trending";
import type { NftCollectionResult } from "@/lib/tools/get-nft-collection";
import type { ObjectResult } from "@/lib/tools/get-object";
import type { ExplainedTx } from "@/lib/sui/ptb-explainer";
import type { PrepareSwapResult } from "@/lib/tools/prepare-swap";
import type { PrepareTransferResult } from "@/lib/tools/prepare-transfer";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  onChip: (text: string) => void;
  onReceipt: (digest: string) => void;
}

interface ToolPart {
  type: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export function MessageList({ messages, isStreaming, onChip, onReceipt }: MessageListProps) {
  return (
    <div className="msg-list">
      {messages.map((m) => {
        const isUser = m.role === "user";
        if (isUser) {
          return (
            <div key={m.id} className="user-msg">
              <div className="user-msg-bubble">
                {m.parts.map((part, idx) => {
                  if (part.type === "text") {
                    return (
                      <span key={idx}>
                        {(part as ToolPart & { text?: string }).text ?? ""}
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        }

        return (
          <div key={m.id} className="ai-msg">
            <div className="ai-msg-row">
              <AssistantAvatar />
              <div className="ai-msg-body">
                {m.parts.map((part, idx) =>
                  renderPart(part as ToolPart, `${m.id}:${idx}`, onChip, onReceipt),
                )}
              </div>
            </div>
          </div>
        );
      })}
      {isStreaming ? (
        <div className="ai-msg">
          <div className="ai-msg-row">
            <AssistantAvatar />
            <div className="ai-msg-body">
              <div className="streaming-dot">
                <span className="pulse" /> thinking…
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        .msg-list { display: flex; flex-direction: column; gap: 4px; }

        .user-msg {
          display: flex;
          justify-content: flex-end;
          padding: 6px 0;
        }
        .user-msg-bubble {
          max-width: 75%;
          background: var(--bg-soft);
          color: var(--fg);
          padding: 10px 14px;
          border-radius: 14px 14px 3px 14px;
          font-size: 14px;
          line-height: 1.5;
          border: 1px solid var(--border);
          white-space: pre-wrap;
        }

        .ai-msg { padding: 12px 0; }
        .ai-msg-row { display: flex; gap: 12px; }
        .ai-msg-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .streaming-dot {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--fg-muted);
          font-family: var(--font-mono);
        }
        .streaming-dot .pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
        }
      `}</style>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="ai-av">
      <svg width="14" height="14" viewBox="0 0 28 28" fill="none" aria-hidden>
        <path
          d="M14 3.5c2.5 4.5 7 6 7 11.5a7 7 0 1 1-14 0c0-5.5 4.5-7 7-11.5z"
          fill="var(--accent)"
        />
        <circle cx="14" cy="15.5" r="2" fill="var(--bg)" />
      </svg>
      <style>{`
        .ai-av {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: color-mix(in oklch, var(--accent) 10%, transparent);
          border: 1px solid var(--accent-soft);
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

function AssistantText({
  children,
  streaming,
}: {
  children: ReactNode;
  streaming?: boolean;
}) {
  return (
    <div className={"ai-text" + (streaming ? " caret" : "")}>
      {children}
      <style>{`
        .ai-text {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--fg);
          white-space: pre-wrap;
        }
        .ai-text :global(strong) { color: var(--fg); font-weight: 600; }
        .ai-text :global(code) {
          font-family: var(--font-mono);
          font-size: 0.9em;
          background: var(--bg-soft);
          padding: 1px 5px;
          border-radius: 4px;
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}

function ToolStatusRow({
  name,
  detail,
  done,
}: {
  name: string;
  detail?: string;
  done: boolean;
}) {
  return (
    <div className={"tsg-row " + (done ? "done" : "running")}>
      <span className={"tsg-marker " + (done ? "done" : "running")}>
        {done ? (
          <Check className="size-2.5" strokeWidth={3} />
        ) : (
          <span
            className="pulse"
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "currentColor",
              display: "block",
            }}
          />
        )}
      </span>
      <Wrench className="size-3" />
      <span className="mono" style={{ fontSize: 12 }}>{name}</span>
      {detail ? (
        <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>· {detail}</span>
      ) : null}
      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-faint)" }}>
        {done ? "completed" : "running"}
      </span>
      <style>{`
        .tsg-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          color: var(--fg-mid);
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-family: var(--font-mono);
        }
        .tsg-marker {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          display: grid;
          place-items: center;
        }
        .tsg-marker.done {
          background: color-mix(in oklch, var(--up) 22%, transparent);
          color: var(--up);
        }
        .tsg-marker.running {
          background: color-mix(in oklch, var(--accent) 22%, transparent);
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}

function renderPart(
  part: ToolPart,
  key: string,
  onChip: (s: string) => void,
  onReceipt: (digest: string) => void,
) {
  if (part.type === "text") {
    const text = (part as ToolPart & { text?: string }).text ?? "";
    if (!text.trim()) return null;
    return (
      <AssistantText key={key}>
        {text}
      </AssistantText>
    );
  }

  if (part.type === "reasoning") {
    const text = (part as ToolPart & { text?: string }).text ?? "";
    if (!text.trim()) return null;
    return (
      <details
        key={key}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-soft)] px-3 py-2 text-xs text-[var(--color-fg-muted)]"
      >
        <summary className="cursor-pointer">Thinking</summary>
        <pre className="mt-2 whitespace-pre-wrap">{text}</pre>
      </details>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return renderToolPart(part, key, onChip, onReceipt);
  }
  return null;
}

function renderToolPart(
  part: ToolPart,
  key: string,
  onChip: (s: string) => void,
  onReceipt: (digest: string) => void,
) {
  const toolName = part.type.replace(/^tool-/, "");
  const state = part.state;

  if (state === "output-error") {
    return (
      <div
        key={key}
        className="rounded-md bg-[var(--color-down)]/10 p-2 text-xs text-[var(--color-down)]"
      >
        {toolName} error: {part.errorText ?? "unknown"}
      </div>
    );
  }

  if (state !== "output-available") {
    return <ToolStatusRow key={key} name={toolName} done={false} />;
  }

  // Output is available — render the actual card. Tool name is shown as a
  // subtle status pill above so users see what produced this card.
  switch (toolName) {
    case "get_token_metrics":
      return <TokenCard key={key} data={part.output as TokenMetricsResult} />;
    case "get_portfolio":
      return <PortfolioCard key={key} data={part.output as PortfolioResult} />;
    case "get_defi_positions":
      return <DefiCard key={key} data={part.output as DefiPositionsResult} />;
    case "get_recent_activity":
      return (
        <ActivityList
          key={key}
          data={part.output as RecentActivityResult}
          onExplain={(d) => onChip(`Explain tx ${d}`)}
        />
      );
    case "get_trending":
      return <TrendingCard key={key} data={part.output as TrendingResult} />;
    case "get_nft_collection":
      return <NFTCollectionCard key={key} data={part.output as NftCollectionResult} />;
    case "get_object":
      return <ObjectCard key={key} data={part.output as ObjectResult} />;
    case "explain_tx":
      return <TxExplainCard key={key} data={part.output as ExplainedTx} />;
    case "prepare_swap":
      return (
        <SwapCard key={key} data={part.output as PrepareSwapResult} onReceipt={onReceipt} />
      );
    case "prepare_transfer":
      return (
        <TransferCard
          key={key}
          data={part.output as PrepareTransferResult}
          onReceipt={onReceipt}
        />
      );
    case "suggest_followups": {
      const out = part.output as { questions?: string[] } | undefined;
      const questions = out?.questions ?? [];
      if (!questions.length) return null;
      return (
        <div key={key} className="fu-chips">
          {questions.map((q) => (
            <button key={q} type="button" onClick={() => onChip(q)} className="fu-chip">
              {q}
            </button>
          ))}
          <style>{`
            .fu-chips { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 4px; }
            .fu-chip {
              padding: 6px 11px;
              background: transparent;
              border: 1px dashed var(--border-hi);
              border-radius: 999px;
              color: var(--fg-mid);
              font-size: 12px;
              cursor: pointer;
            }
            .fu-chip:hover {
              background: var(--bg-soft);
              color: var(--fg);
              border-style: solid;
              border-color: var(--accent-soft);
            }
          `}</style>
        </div>
      );
    }
    default:
      return (
        <details
          key={key}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-2 text-xs"
        >
          <summary>{toolName}</summary>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        </details>
      );
  }
}
