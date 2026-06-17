'use client';

import { useState } from 'react';
import {
  useIdentityToken,
  usePrivy,
  useSigners,
} from '@privy-io/react-auth';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  confirmDelegation,
  createMandate,
  fetchDelegationStatus,
  isDelegationRequiredError,
  type CreateMandatePayload,
} from '@/lib/agent/client';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';
import {
  proposalSummary,
} from '@/lib/agent/display';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ProposalPayload {
  spec?: CreateMandatePayload['spec'];
  plan?: CreateMandatePayload['plan'];
  metadataName?: string;
  error?: string;
}

export function MandateProposalCard({
  proposal,
  onCreated,
}: {
  proposal: ProposalPayload;
  onCreated: () => void | Promise<void>;
}) {
  const { getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { addSigners } = useSigners();
  const { suiAddress } = useEmbeddedWallet();
  const [stage, setStage] = useState<'idle' | 'delegating' | 'creating' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  if (proposal.error) {
    return (
      <div
        className="rounded-[12px] bg-[color:var(--surface)] p-3 text-[12px] ring-1 ring-[color:var(--border)]"
        style={{ color: 'var(--down)' }}
      >
        {proposal.error}
      </div>
    );
  }
  if (!proposal.spec || !proposal.plan) return null;
  const summary = proposalSummary({
    spec: proposal.spec,
    plan: proposal.plan,
    metadataName: proposal.metadataName,
  });

  const handleApprove = async () => {
    setError(null);
    const ctx = { getAccessToken, identityToken };
    const payload = {
      spec: proposal.spec!,
      plan: proposal.plan!,
      metadataName: proposal.metadataName,
    };
    try {
      setStage('creating');
      try {
        await createMandate(ctx, payload);
      } catch (err) {
        if (!isDelegationRequiredError(err)) throw err;
        // One-time: delegate the embedded wallet to the platform signer, then retry.
        setStage('delegating');
        if (!suiAddress) throw new Error('Wallet is not ready yet. Try again in a moment.');
        const { signerId } = await fetchDelegationStatus(ctx);
        await addSigners({ address: suiAddress, signers: [{ signerId, policyIds: [] }] });
        await confirmDelegation(ctx);
        setStage('creating');
        await createMandate(ctx, payload);
      }
      setStage('done');
      setReviewOpen(false);
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
      setStage('idle');
    }
  };

  const busy = stage === 'creating' || stage === 'delegating';

  return (
    <div className="rounded-[12px] bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--border)]">
      <p className="text-[13px] font-medium">
        Proposed mandate: <span className="font-mono">{proposal.metadataName ?? 'Untitled'}</span>
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Action</dt>
          <dd>{summary.action}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Target</dt>
          <dd className="font-mono">{summary.target}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Agent</dt>
          <dd className="font-mono">{shortAddress(proposal.spec.agent)}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Runs</dt>
          <dd>{proposal.plan.length}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Per-tx cap</dt>
          <dd>{summary.perTxCap}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Period cap</dt>
          <dd>{summary.periodCap}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Period</dt>
          <dd>{formatMs(BigInt(proposal.spec.periodMs))}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Expires</dt>
          <dd>{summary.expiry}</dd>
        </div>
      </dl>
      {proposal.spec.metadata && 'schedule' in proposal.spec.metadata && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--text-soft)' }}>
          Schedule: <span className="font-mono">{proposal.spec.metadata.schedule}</span>
        </p>
      )}
      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--down)' }}>{error}</p>
      )}
      <div className="mt-3 flex justify-end">
        {stage === 'done' ? (
          <span className="text-[12px]" style={{ color: 'var(--up)' }}>
            Mandate created
          </span>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={() => setReviewOpen(true)}
            disabled={busy}
          >
            Review permission
          </Button>
        )}
      </div>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve agent mandate</DialogTitle>
            <DialogDescription>
              Review what Levo can do on a schedule, then authorize it once. Your funds stay in your wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-[13px]">
            <div className="rounded-[12px] bg-[color:var(--surface)] p-3">
              <p className="font-medium">Can</p>
              <ul className="mt-2 space-y-1" style={{ color: 'var(--text-soft)' }}>
                <li>Run {summary.action} for {summary.amount} per scheduled step.</li>
                <li>Use agent address {shortAddress(proposal.spec.agent)}.</li>
                <li>Spend up to {summary.perTxCap} per transaction.</li>
                <li>Spend up to {summary.periodCap} each period.</li>
              </ul>
            </div>
            <div className="rounded-[12px] bg-[color:var(--surface)] p-3">
              <p className="font-medium">Cannot</p>
              <ul className="mt-2 space-y-1" style={{ color: 'var(--text-soft)' }}>
                <li>Send funds to a target outside {summary.target}.</li>
                <li>Spend more than the caps above.</li>
                <li>Continue after {summary.expiry}.</li>
              </ul>
            </div>
            <div className="rounded-[12px] bg-background p-3 ring-1 ring-[color:var(--border)]">
              <p className="font-medium">How it runs</p>
              <ol className="mt-2 space-y-1" style={{ color: 'var(--text-soft)' }}>
                <li>1. You authorize Levo to act for this wallet — once, revocable in Privy.</li>
                <li>2. The mandate is saved with its schedule and caps.</li>
                <li>3. On schedule, Levo runs the Earn action within the caps and records each run.</li>
              </ol>
              <details className="mt-3">
                <summary className="cursor-pointer text-[12px] font-medium">Developer details</summary>
                <pre className="mt-2 max-h-44 overflow-auto rounded-[8px] bg-[color:var(--surface)] p-2 text-[11px]">
{JSON.stringify(
  {
    actions: proposal.spec.actions,
    periodMs: proposal.spec.periodMs,
    expiryMs: proposal.spec.expiryMs,
    target: proposal.spec.allowedTargets[0],
    coin: proposal.spec.coinLimits[0],
    firstStep: proposal.plan[0],
    plannedRuns: proposal.plan.length,
  },
  null,
  2,
)}
                </pre>
              </details>
            </div>
          </div>
          {error && (
            <p className="text-[12px]" style={{ color: 'var(--down)' }}>{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {stage === 'delegating'
                ? 'Authorizing wallet...'
                : stage === 'creating'
                  ? 'Saving mandate...'
                  : 'Approve mandate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatMs(ms: bigint): string {
  const days = Number(ms / 86_400_000n);
  if (days >= 1) return `${days}d`;
  const hours = Number(ms / 3_600_000n);
  if (hours >= 1) return `${hours}h`;
  return `${ms}ms`;
}
