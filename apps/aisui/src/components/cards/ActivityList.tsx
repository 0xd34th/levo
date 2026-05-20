"use client";

import type { RecentActivityResult } from "@/lib/tools/get-recent-activity";
import { Card } from "./Card";
import { shortAddr } from "@/lib/utils";

export function ActivityList({
  data,
  onExplain,
}: {
  data: RecentActivityResult;
  onExplain?: (digest: string) => void;
}) {
  return (
    <Card title="Recent activity" subtitle={shortAddr(data.address)}>
      <div className="space-y-1">
        {data.activities.map((a) => (
          <button
            key={a.digest}
            type="button"
            onClick={() => onExplain?.(a.digest)}
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-bg-soft)]"
          >
            <div
              className={
                a.status === "failure"
                  ? "size-1.5 rounded-full bg-[var(--color-down)]"
                  : "size-1.5 rounded-full bg-[var(--color-up)]"
              }
            />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm">{a.summary ?? a.type ?? "Transaction"}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">
                {shortAddr(a.digest, 8, 6)} · {a.timestamp ? new Date(a.timestamp).toLocaleString() : ""}
              </div>
            </div>
          </button>
        ))}
        {data.activities.length === 0 ? (
          <div className="p-3 text-center text-sm text-[var(--color-fg-muted)]">No activity.</div>
        ) : null}
      </div>
    </Card>
  );
}
