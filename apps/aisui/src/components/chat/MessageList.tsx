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
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <div className={"ai-text" + (streaming ? " caret" : "")}>
      <AisuiResponseText text={text} />
      <style>{`
        .ai-text {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--fg);
        }
        .md-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .md-paragraph {
          margin: 0;
          color: var(--fg-mid);
          white-space: pre-wrap;
          max-width: 78ch;
        }
        .md-heading {
          margin: 4px 0 0;
          color: var(--fg);
          font-weight: 650;
          line-height: 1.35;
          max-width: 78ch;
        }
        .md-heading.h2 { font-size: 15.5px; }
        .md-heading.h3 { font-size: 14.5px; }
        .md-list {
          margin: 0;
          padding-left: 20px;
          color: var(--fg-mid);
          max-width: 78ch;
        }
        .md-list li + li { margin-top: 4px; }
        .md-separator {
          width: min(100%, 78ch);
          border: 0;
          border-top: 1px solid var(--border);
          margin: 2px 0;
        }
        .md-blockquote {
          margin: 0;
          max-width: 78ch;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-soft);
          padding: 8px 10px;
          color: var(--fg-muted);
        }
        .md-table-wrap {
          max-width: 100%;
          overflow-x: auto;
        }
        .md-table {
          width: 100%;
          min-width: 460px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 12px;
          line-height: 1.45;
        }
        .md-table th,
        .md-table td {
          padding: 6px 8px;
          border-bottom: 1px solid var(--border);
          text-align: left;
          vertical-align: top;
        }
        .md-table th:first-child,
        .md-table td:first-child { padding-left: 0; }
        .md-table th:last-child,
        .md-table td:last-child { padding-right: 0; }
        .md-table th {
          color: var(--fg-muted);
          font-weight: 600;
        }
        .md-table tr:last-child td { border-bottom: 0; }
        .md-table td { color: var(--fg-mid); }
        .ai-text strong { color: var(--fg); font-weight: 650; }
        .ai-text em { color: var(--fg); font-style: italic; }
        .ai-text code {
          font-family: var(--font-mono);
          font-size: 0.92em;
          background: var(--bg-soft);
          padding: 1px 4px;
          border-radius: 4px;
          color: var(--accent);
          overflow-wrap: anywhere;
        }
        .ai-text a {
          color: var(--accent);
          font-weight: 600;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      `}</style>
    </div>
  );
}

export function AisuiResponseText({ text }: { text: string }) {
  const blocks = parseAisuiResponseBlocks(text);

  return (
    <div className="md-stack">
      {blocks.map((block, index) => renderAisuiResponseBlock(block, index))}
    </div>
  );
}

function renderAisuiResponseBlock(block: AisuiResponseBlock, index: number) {
  if (block.type === "table") {
    return (
      <div key={`${block.headers.join("|")}-${index}`} className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              {block.headers.map((cell, cellIndex) => (
                <th key={`${cell}-${cellIndex}`}>{renderInlineMarkdown(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${row.join("|")}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{renderInlineMarkdown(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag key={`${block.items.join("|")}-${index}`} className="md-list">
        {block.items.map((line, lineIndex) => (
          <li key={`${line}-${lineIndex}`}>{renderInlineMarkdown(line)}</li>
        ))}
      </ListTag>
    );
  }
  if (block.type === "heading") {
    const HeadingTag = block.level === 3 ? "h3" : "h2";
    return (
      <HeadingTag key={`${block.text}-${index}`} className={`md-heading h${block.level}`}>
        {renderInlineMarkdown(block.text)}
      </HeadingTag>
    );
  }
  if (block.type === "separator") {
    return <hr key={`separator-${index}`} className="md-separator" />;
  }
  if (block.type === "blockquote") {
    return (
      <div key={`${block.text}-${index}`} className="md-blockquote">
        {renderInlineMarkdown(block.text)}
      </div>
    );
  }
  return (
    <p key={`${block.text}-${index}`} className="md-paragraph">
      {renderInlineMarkdown(block.text)}
    </p>
  );
}

type AisuiResponseBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "separator" }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

function parseAisuiResponseBlocks(text: string): AisuiResponseBlock[] {
  const blocks: AisuiResponseBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: "list", ordered: listOrdered, items: list });
    list = [];
  };
  const pushListItem = (ordered: boolean, item: string) => {
    flushParagraph();
    if (list.length && listOrdered !== ordered) flushList();
    listOrdered = ordered;
    list.push(item);
  };

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^[-*_]{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "separator" });
      continue;
    }
    if (/^>\s+/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "blockquote", text: line.replace(/^>\s+/, "") });
      continue;
    }
    const nextLine = lines[i + 1]?.trim() ?? "";
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
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
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      pushListItem(false, line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      pushListItem(true, line.replace(/^\d+[.)]\s+/, ""));
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
  return line.startsWith("|") && line.endsWith("|") && line.includes("|", 1);
}

function isMarkdownTableSeparator(line: string): boolean {
  if (!isMarkdownTableLine(line)) return false;
  return parseMarkdownTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTableRow(line: string): string[] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function normalizeTableRow(row: string[], size: number): string[] {
  if (row.length === size) return row;
  if (row.length > size) return row.slice(0, size);
  return [...row, ...Array.from({ length: size - row.length }, () => "")];
}

function renderInlineMarkdown(text: string): ReactNode {
  const parts = splitInlineMarkdownLinks(text);
  if (parts.some((part) => typeof part !== "string")) {
    return parts.map((part, index) => {
      if (typeof part === "string") {
        return <span key={`${part}-${index}`}>{renderInlineMarkdown(part)}</span>;
      }
      return (
        <a
          key={`${part.href}-${index}`}
          href={normalizeMarkdownHref(part.href)}
          target="_blank"
          rel="noreferrer"
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
      const codeText = part.replace(/^\\?`+/, "").replace(/\\?`+$/, "");
      return <code key={`${part}-${index}`}>{codeText}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }
    return part.replace(/\\?`/g, "");
  });
}

function splitInlineMarkdownLinks(text: string): Array<string | { label: string; href: string }> {
  const parts: Array<string | { label: string; href: string }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const labelStart = text.indexOf("[", cursor);
    if (labelStart === -1) break;
    const labelEnd = text.indexOf("](", labelStart + 1);
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
  return parts.filter((part) =>
    typeof part === "string" ? part.length > 0 : part.label.length > 0 && part.href.length > 0,
  );
}

function findMarkdownHrefEnd(text: string, start: number): number {
  let nestedParens = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "(") {
      nestedParens += 1;
      continue;
    }
    if (text[i] !== ")") continue;
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
      <AssistantText key={key} text={text} />
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
        <SwapCard
          key={key}
          data={part.output as PrepareSwapResult}
          onReceipt={onReceipt}
        />
      );
    case "prepare_transfer":
      return (
        <TransferCard
          key={key}
          data={part.output as PrepareTransferResult}
          onReceipt={onReceipt}
        />
      );
    case "suggest_followups":
      // Rendered above the composer — see FollowupBar in page.tsx so the
      // chips stay reachable as the conversation scrolls.
      return null;
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
