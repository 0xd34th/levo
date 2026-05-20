"use client";

import { Zap } from "lucide-react";
import type { ModelMode } from "@/lib/llm/model-router";

export function ModeMenu({
  mode: _mode,
  onChange: _onChange,
}: {
  mode: ModelMode;
  onChange: (m: ModelMode) => void;
}) {
  return (
    <span className="mode-pill">
      <span className="mp-icon">
        <Zap className="size-3" />
      </span>
      Fast
      <span className="mp-cost mono">Free</span>
      <style>{`
        .mode-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 9px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 7px;
          color: var(--fg);
          font-size: 12px;
          font-weight: 500;
          line-height: 1;
        }
        .mode-pill .mp-icon {
          color: var(--accent);
          display: inline-flex;
          align-items: center;
        }
        .mode-pill .mp-cost {
          color: var(--fg-muted);
          font-size: 10.5px;
          border-left: 1px solid var(--border);
          margin-left: 2px;
          padding-left: 6px;
        }
      `}</style>
    </span>
  );
}
