'use client';

import { GitBranch, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { CreateMandatePayload } from '@/lib/agent/client';
import {
  proposalSummary,
  shortId,
} from '@/lib/agent/display';

interface ProposalPayload {
  spec?: CreateMandatePayload['spec'];
  plan?: CreateMandatePayload['plan'];
  metadataName?: string;
  error?: string;
}

export function MandateDraftPreview({ proposal }: { proposal: ProposalPayload | null }) {
  if (!proposal?.spec || !proposal.plan || proposal.error) {
    return (
      <aside className="flex h-full min-h-[420px] flex-col rounded-[16px] bg-[color:var(--surface)] p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5" />
          <h2 className="text-[18px] font-semibold">Mandate preview</h2>
        </div>
        <div className="mt-8 flex flex-1 flex-col justify-center rounded-[12px] bg-background p-5 text-center ring-1 ring-[color:var(--border)]">
          <p className="text-[14px] font-medium">No draft yet</p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
            Fill the guided controls. The draft updates here before approval.
          </p>
        </div>
      </aside>
    );
  }

  const summary = proposalSummary({
    spec: proposal.spec,
    plan: proposal.plan,
    metadataName: proposal.metadataName,
  });
  const target = proposal.spec.allowedTargets[0] ?? '';

  return (
    <aside className="h-full rounded-[16px] bg-[color:var(--surface)] p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5" />
        <h2 className="text-[18px] font-semibold">Mandate preview</h2>
      </div>
      <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
        {proposal.metadataName ?? 'Untitled mandate'}
      </p>

      <section className="mt-5 rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
        <p className="eyebrow">Plain English</p>
        <p className="mt-2 text-[15px] font-medium">
          The agent may {summary.action} for {summary.amount}, capped at {summary.perTxCap} per run and {summary.periodCap} per period.
        </p>
      </section>

      <section className="mt-3 rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          <p className="text-[14px] font-semibold">Controls</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
          <KV label="Schedule" value={summary.schedule} />
          <KV label="Target" value={summary.target} />
          <KV label="Expiry" value={summary.expiry} />
          <KV label="Coin" value={summary.coinLabel} />
        </dl>
      </section>

      <section className="mt-3 rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4" />
          <p className="text-[14px] font-semibold">Flow</p>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center text-[12px]">
          <Step label="Owner signs" />
          <span style={{ color: 'var(--text-mute)' }}>to</span>
          <Step label="Mandate active" />
          <span style={{ color: 'var(--text-mute)' }}>to</span>
          <Step label="Agent runs" />
        </div>
        {target ? (
          <p className="mt-3 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Target object: {shortId(target, 8, 6)}
          </p>
        ) : null}
      </section>

      <section className="mt-3 rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
        <p className="text-[14px] font-semibold">Before approval</p>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--text-soft)' }}>
          Adjust the caps, schedule, expiry, or Earn action before signing the create and initialize transactions.
        </p>
      </section>
    </aside>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase" style={{ color: 'var(--text-mute)' }}>
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function Step({ label }: { label: string }) {
  return (
    <span className="rounded-[8px] bg-[color:var(--surface)] px-2 py-2 font-medium">
      {label}
    </span>
  );
}
