'use client';

import { useState } from 'react';
import { useIdentityToken, usePrivy } from '@privy-io/react-auth';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  describeMandateIntent,
  expiryLabel,
  primaryCoinLimit,
  shortId,
} from '@/lib/agent/display';
import {
  executeMandate,
  type ExecuteResponse,
  type MandateSummary,
} from '@/lib/agent/client';

interface ExecuteConfirmationOutput {
  kind: 'execute-confirmation';
  status?: 'confirmation_required' | 'not_found';
  error?: string;
  message?: string;
  executeUrl?: string;
  mandate?: MandateSummary;
}

export function ExecuteConfirmationCard({
  result,
  onExecuted,
}: {
  result: ExecuteConfirmationOutput;
  onExecuted: () => void | Promise<void>;
}) {
  const { getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(result.error ?? null);

  const mandate = result.mandate;
  const limit = mandate ? primaryCoinLimit(mandate) : null;

  const run = async () => {
    if (!mandate) return;
    setBusy(true);
    setError(null);
    try {
      const next = await executeMandate({ getAccessToken, identityToken }, mandate.id);
      setOutcome(next);
      await onExecuted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[12px] bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--border)]">
      <p className="text-[13px] font-medium">Confirm agent execution</p>
      {mandate ? (
        <>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            The agent can run one pending witness step for {mandate.name}.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            <KV label="Action" value={describeMandateIntent(mandate.actions)} />
            <KV label="Object" value={shortId(mandate.mandateObjectId)} />
            <KV label="Per run cap" value={limit?.perTxCapLabel ?? 'Not set'} />
            <KV label="Expires" value={expiryLabel(mandate.expiryMs)} />
          </dl>
          <div className="mt-3 rounded-[10px] bg-background px-3 py-2 text-[12px]">
            <p className="font-medium">This will</p>
            <p className="mt-1" style={{ color: 'var(--text-soft)' }}>
              submit one agent-signed transaction through the mandate policy and
              record it in the audit timeline.
            </p>
            <p className="mt-2 font-medium">This will not</p>
            <p className="mt-1" style={{ color: 'var(--text-soft)' }}>
              change the mandate caps, revoke permission, or create a new mandate.
            </p>
          </div>
        </>
      ) : null}

      {outcome ? (
        <p className="mt-3 text-[12px]" style={{ color: outcome.status === 'confirmed' ? 'var(--up)' : 'var(--text-soft)' }}>
          {executionLabel(outcome)}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--down)' }}>
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={run} disabled={!mandate || busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
          Execute one step
        </Button>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: 'var(--text-soft)' }}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function executionLabel(outcome: ExecuteResponse): string {
  if (outcome.status === 'confirmed') return `Confirmed: ${shortId(outcome.txDigest)}`;
  if (outcome.status === 'no_steps_pending') return 'No pending witness steps remain.';
  if (outcome.status === 'blocked_by_seal') return `Blocked by policy: ${outcome.reason}`;
  return `Failed: ${outcome.reason}`;
}
