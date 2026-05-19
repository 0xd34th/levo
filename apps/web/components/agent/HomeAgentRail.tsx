'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useIdentityToken, usePrivy } from '@privy-io/react-auth';
import { ArrowRight, Bot, Clock3, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchMandate,
  fetchMandates,
  type AgentActionRow,
  type MandateSummary,
} from '@/lib/agent/client';
import {
  actionTimelineLabel,
  nextRunLabel,
  primaryCoinLimit,
} from '@/lib/agent/display';

export function HomeAgentRail() {
  const { getAccessToken, ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [mandates, setMandates] = useState<MandateSummary[]>([]);
  const [actions, setActions] = useState<AgentActionRow[]>([]);

  const reload = useCallback(async () => {
    if (!ready || !authenticated) return;
    const rows = await fetchMandates(getAccessToken, identityToken).catch(() => []);
    setMandates(rows);
    const active = rows.slice(0, 3);
    const details = await Promise.all(
      active.map((row) =>
        fetchMandate(getAccessToken, identityToken ?? null, row.id).catch(() => null),
      ),
    );
    setActions(
      details
        .flatMap((detail) => detail?.actions ?? [])
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 4),
    );
  }, [authenticated, getAccessToken, identityToken, ready]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [reload]);

  if (!ready || !authenticated) return null;

  const activeMandates = mandates.filter((mandate) => mandate.status === 'ACTIVE').slice(0, 3);

  return (
    <aside className="rounded-[16px] bg-[color:var(--surface)] p-4 lg:sticky lg:top-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="size-5" />
          <h2 className="text-[16px] font-semibold">Agent</h2>
        </div>
        <Link href="/agent" className="text-[12px] font-medium">
          Open
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {activeMandates.length === 0 ? (
          <div className="rounded-[12px] bg-background p-3 ring-1 ring-[color:var(--border)]">
            <p className="text-[13px] font-medium">No active mandates</p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
              Draft an auto-harvest policy with caps and expiry.
            </p>
          </div>
        ) : (
          activeMandates.map((mandate) => {
            const limit = primaryCoinLimit(mandate);
            return (
              <Link
                href="/agent"
                key={mandate.id}
                className="block rounded-[12px] bg-background p-3 ring-1 ring-[color:var(--border)]"
              >
                <p className="truncate text-[13px] font-medium">{mandate.name}</p>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
                  {nextRunLabel(mandate)}
                </p>
                {limit ? (
                  <p className="mt-2 text-[12px]">
                    {limit.periodSpentLabel ?? '0'} / {limit.periodCapLabel}
                  </p>
                ) : null}
              </Link>
            );
          })
        )}
      </div>

      <div className="mt-4 rounded-[12px] bg-background p-3 ring-1 ring-[color:var(--border)]">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Sparkles className="size-4" />
          Recommendation
        </div>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
          Create a daily auto-harvest mandate with a short expiry and conservative cap.
        </p>
        <Button
          size="sm"
          className="mt-3 w-full"
          render={<Link href="/agent/new?intent=auto-harvest" />}
        >
          Draft mandate
          <ArrowRight className="ml-1.5 size-3.5" />
        </Button>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Clock3 className="size-4" />
          Recent actions
        </div>
        <div className="mt-2 space-y-2">
          {actions.length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>
              No agent actions yet.
            </p>
          ) : (
            actions.map((action) => (
              <p key={action.id} className="rounded-[10px] bg-background px-3 py-2 text-[12px] ring-1 ring-[color:var(--border)]">
                {actionTimelineLabel(action)}
              </p>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
