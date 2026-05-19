'use client';

import { describeActions, type MandateSummary } from '@/lib/agent/client';

interface Payload {
  mandates: unknown[];
}

export function MandateListCard({ payload }: { payload: Payload }) {
  const mandates = (payload.mandates ?? []) as MandateSummary[];

  if (mandates.length === 0) {
    return (
      <div className="rounded-[12px] bg-[color:var(--surface)] p-3 text-[12px] ring-1 ring-[color:var(--border)]">
        You have no mandates yet.
      </div>
    );
  }

  return (
    <div className="rounded-[12px] bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--border)]">
      <p className="text-[13px] font-medium">Your mandates ({mandates.length})</p>
      <ul className="mt-2 space-y-1.5">
        {mandates.slice(0, 5).map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 text-[12px]">
            <div className="min-w-0">
              <p className="truncate">{m.name}</p>
              <p style={{ color: 'var(--text-soft)' }}>{describeActions(m.actions)}</p>
            </div>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] uppercase ring-1 ring-[color:var(--border)]"
              style={{ color: m.status === 'ACTIVE' ? 'var(--up)' : 'var(--text-soft)' }}
            >
              {m.status.toLowerCase()}
            </span>
          </li>
        ))}
        {mandates.length > 5 && (
          <li className="text-[11px]" style={{ color: 'var(--text-soft)' }}>
            +{mandates.length - 5} more
          </li>
        )}
      </ul>
    </div>
  );
}
