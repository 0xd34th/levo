"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Send, Square, Wrench } from "lucide-react";
import type { ModelMode } from "@/lib/llm/model-router";
import { ModeMenu } from "./ModeMenu";

interface ComposerProps {
  onSubmit: (text: string) => void;
  status: "ready" | "submitted" | "streaming" | "error";
  onStop: () => void;
  mode: ModelMode;
  onModeChange: (m: ModelMode) => void;
  initialValue?: string;
  hint?: ReactNode;
}

export function Composer({
  onSubmit,
  status,
  onStop,
  mode,
  onModeChange,
  initialValue,
  hint,
}: ComposerProps) {
  const [text, setText] = useState(initialValue ?? "");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (initialValue !== undefined) setText(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(160, ta.scrollHeight) + "px";
  }, [text]);

  const isBusy = status === "submitted" || status === "streaming";

  function send() {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    onSubmit(trimmed);
    setText("");
  }

  return (
    <div className="composer">
      {hint ? <div className="composer-hint">{hint}</div> : null}
      <div className="composer-box">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask anything about Sui — coins, wallets, objects, txs, swaps…"
          className="composer-text"
        />
        <div className="composer-bar">
          <div className="composer-tools">
            <ModeMenu mode={mode} onChange={onModeChange} />
            <span className="tool-pill">
              <Wrench className="size-3" />
              Auto-tools
            </span>
          </div>
          <div className="composer-actions">
            {isBusy ? (
              <button type="button" onClick={onStop} className="send-btn stop">
                <Square className="size-3.5" /> Stop
              </button>
            ) : (
              <button type="button" onClick={send} disabled={!text.trim()} className="send-btn">
                <Send className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .composer { width: 100%; }
        .composer-hint {
          font-size: 11px;
          color: var(--fg-muted);
          padding: 0 6px 6px;
        }
        .composer-box {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          padding: 14px 14px 10px;
          box-shadow: var(--shadow-card);
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .composer-box:focus-within {
          border-color: var(--accent-soft);
          box-shadow: 0 0 0 4px var(--accent-glow);
        }
        .composer-text {
          width: 100%;
          resize: none;
          background: transparent;
          border: 0;
          outline: none;
          font-size: 14.5px;
          line-height: 1.5;
          min-height: 24px;
          color: var(--fg);
          font-family: inherit;
        }
        .composer-text::placeholder { color: var(--fg-faint); }

        .composer-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
        }
        .composer-tools {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
        }
        .composer-actions { display: flex; gap: 6px; }

        .tool-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 9px;
          color: var(--fg-muted);
          font-size: 11.5px;
          border-radius: 7px;
        }

        .send-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--accent);
          color: var(--on-accent);
          border: 0;
          border-radius: 8px;
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .send-btn:hover:not(:disabled) { background: var(--accent-2); }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .send-btn.stop {
          background: color-mix(in oklch, var(--down) 18%, transparent);
          color: var(--down);
        }
      `}</style>
    </div>
  );
}
