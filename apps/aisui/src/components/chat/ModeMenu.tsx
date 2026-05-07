"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Zap, Brain, Sparkles, Check } from "lucide-react";
import type { ModelMode } from "@/lib/llm/model-router";
import { cn } from "@/lib/utils";

const ITEMS: Array<{
  mode: ModelMode;
  title: string;
  desc: string;
  cost: string;
  shortCost: string;
  icon: React.ElementType;
}> = [
  { mode: "fast", title: "Fast", desc: "DeepSeek default — instant answers", cost: "Free", shortCost: "Free", icon: Zap },
  { mode: "thinking", title: "Thinking", desc: "DeepSeek reasoner — extended chain of thought", cost: "2 credits", shortCost: "2 cr", icon: Brain },
  { mode: "pro", title: "PRO", desc: "DeepSeek reasoner — deepest analysis", cost: "5 credits", shortCost: "5 cr", icon: Sparkles },
];

export function ModeMenu({
  mode,
  onChange,
}: {
  mode: ModelMode;
  onChange: (m: ModelMode) => void;
}) {
  const current = ITEMS.find((i) => i.mode === mode) ?? ITEMS[0];
  const Icon = current.icon;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="mode-pill">
          <span className="mp-icon">
            <Icon className="size-3" />
          </span>
          {current.title}
          <span className="mp-cost mono">{current.shortCost}</span>
          <ChevronDown className="size-3 opacity-60" />
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
              cursor: pointer;
              line-height: 1;
            }
            .mode-pill:hover {
              background: var(--bg-elev);
              border-color: var(--border-hi);
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
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[260px] rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-1 shadow-xl"
        >
          {ITEMS.map((item) => {
            const ItemIcon = item.icon;
            const selected = item.mode === mode;
            return (
              <DropdownMenu.Item
                key={item.mode}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 outline-none",
                  "data-[highlighted]:bg-[var(--color-bg-soft)]",
                )}
                onSelect={() => onChange(item.mode)}
              >
                <ItemIcon className="mt-0.5 size-4 text-[var(--color-accent)]" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-xs text-[var(--color-fg-muted)]">{item.cost}</span>
                  </div>
                  <div className="text-xs text-[var(--color-fg-muted)]">{item.desc}</div>
                </div>
                {selected ? <Check className="mt-1 size-3.5 text-[var(--color-accent)]" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
