"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface Chip {
  label: string;
  prompt: string;
  emoji?: string;
}

interface ChipBarProps {
  chips: Chip[];
  onPick: (prompt: string) => void;
  className?: string;
}

export function ChipBar({ chips, onPick, className }: ChipBarProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          className="cr-chip"
          onClick={() => onPick(c.prompt)}
        >
          {c.emoji ? <span className="cr-chip-emoji">{c.emoji}</span> : null}
          {c.label}
          <style>{`
            .cr-chip {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 6px 11px;
              background: var(--bg-soft);
              border: 1px solid var(--border);
              border-radius: 999px;
              color: var(--fg-mid);
              font-size: 12.5px;
              cursor: pointer;
              transition: background 120ms, color 120ms, border-color 120ms;
            }
            .cr-chip:hover {
              background: var(--bg-elev);
              color: var(--fg);
              border-color: var(--accent-soft);
            }
            .cr-chip-emoji { font-size: 12px; }
          `}</style>
        </button>
      ))}
    </div>
  );
}

interface ChipRowProps {
  label: string;
  chips: Chip[];
  onPick: (prompt: string) => void;
}

export function ChipRow({ label, chips, onPick }: ChipRowProps) {
  return (
    <div className="chip-row">
      <div className="cr-label">{label}</div>
      <ChipBar chips={chips} onPick={onPick} />
      <style>{`
        .chip-row {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 14px;
          align-items: center;
        }
        .cr-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--fg-faint);
          font-weight: 500;
        }
        @media (max-width: 520px) {
          .chip-row { grid-template-columns: 1fr; gap: 6px; }
        }
      `}</style>
    </div>
  );
}

export function FootStat({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="foot-stat">
      <span style={{ color: "var(--accent)", display: "inline-flex" }}>{icon}</span>
      <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{label}</span>
      <style>{`
        .foot-stat { display: inline-flex; align-items: center; gap: 6px; }
      `}</style>
    </span>
  );
}
