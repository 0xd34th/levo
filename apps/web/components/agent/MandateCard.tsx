'use client';

import { useState } from 'react';
import { usePrivy, useIdentityToken, useAuthorizationSignature } from '@privy-io/react-auth';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  describeActions,
  destroyMandate,
  executeMandate,
  pauseMandate,
  resumeMandate,
  revokeMandate,
  statusLabel,
  type MandateSummary,
} from '@/lib/agent/client';

interface Props {
  mandate: MandateSummary;
  onChanged: () => void | Promise<void>;
}

type Action = 'execute' | 'pause' | 'resume' | 'revoke' | 'destroy' | null;

export function MandateCard({ mandate, onChanged }: Props) {
  const { getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const [busy, setBusy] = useState<Action>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmingExecute, setConfirmingExecute] = useState(false);

  const expiry = new Date(Number(mandate.expiryMs));
  const expired = expiry.getTime() <= Date.now();

  const handleExecute = async () => {
    setBusy('execute');
    setError(null);
    setInfo(null);
    try {
      const outcome = await executeMandate(
        { getAccessToken, identityToken },
        mandate.id,
      );
      if (outcome.status === 'confirmed') {
        setInfo(`Confirmed (tx ${shortDigest(outcome.txDigest)})`);
        await onChanged();
      } else if (outcome.status === 'queued') {
        setInfo(`Queued for external runner (${shortDigest(outcome.job.id)})`);
      } else if (outcome.status === 'no_steps_pending') {
        setInfo('All planned runs consumed.');
      } else if (outcome.status === 'blocked_by_seal') {
        setError(`Seal denied: ${outcome.reason}`);
      } else {
        setError(`Failed: ${outcome.reason}`);
      }
      setConfirmingExecute(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this mandate? Future agent actions will be blocked.')) return;
    setBusy('revoke');
    setError(null);
    setInfo(null);
    try {
      const result = await revokeMandate(
        { getAccessToken, identityToken, generateAuthorizationSignature },
        mandate.id,
      );
      setInfo(`Revoked (tx ${shortDigest(result.txDigest)})`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setBusy(null);
    }
  };

  const handlePause = async () => {
    setBusy('pause');
    setError(null);
    setInfo(null);
    try {
      await pauseMandate({ getAccessToken, identityToken }, mandate.id);
      setInfo('Paused');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pause failed');
    } finally {
      setBusy(null);
    }
  };

  const handleResume = async () => {
    setBusy('resume');
    setError(null);
    setInfo(null);
    try {
      await resumeMandate({ getAccessToken, identityToken }, mandate.id);
      setInfo('Resumed');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume failed');
    } finally {
      setBusy(null);
    }
  };

  const handleDestroy = async () => {
    if (!confirm('Permanently delete this mandate? You will reclaim storage rebate.')) return;
    setBusy('destroy');
    setError(null);
    setInfo(null);
    try {
      const result = await destroyMandate(
        { getAccessToken, identityToken, generateAuthorizationSignature },
        mandate.id,
      );
      setInfo(`Destroyed (tx ${shortDigest(result.txDigest)})`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Destroy failed');
    } finally {
      setBusy(null);
    }
  };

  const isActive = mandate.status === 'ACTIVE' && !expired;
  const isTerminated =
    mandate.status === 'REVOKED' ||
    mandate.status === 'EXPIRED' ||
    mandate.status === 'LEGACY_PAUSED' ||
    expired;
  const isDestroyed = mandate.status === 'DESTROYED';

  return (
    <div className="rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{mandate.name}</p>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            {describeActions(mandate.actions)}
          </p>
        </div>
        <StatusPill status={mandate.status} expired={expired} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Object</dt>
          <dd className="font-mono">{shortAddress(mandate.mandateObjectId)}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Nonce</dt>
          <dd className="font-mono">{mandate.nonce}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Agent</dt>
          <dd className="font-mono">{shortAddress(mandate.agentAddress || 'Not bound')}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Initialized</dt>
          <dd>{mandate.witnessCommit ? 'Yes' : 'Pending'}</dd>
        </div>
        <div>
          <dt style={{ color: 'var(--text-soft)' }}>Expiry</dt>
          <dd>{formatDate(expiry)}</dd>
        </div>
      </dl>

      {(error || info) && (
        <p
          className="mt-3 rounded-[8px] bg-background px-2 py-1 text-[12px] ring-1 ring-[color:var(--border)]"
          style={{ color: error ? 'var(--down)' : 'var(--text-soft)' }}
        >
          {error ?? info}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {isActive && mandate.witnessCommit && (
          <Button
            size="sm"
            variant="default"
            onClick={() => setConfirmingExecute(true)}
            disabled={busy !== null}
          >
            {busy === 'execute' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Review execution
          </Button>
        )}
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={handlePause}
            disabled={busy !== null}
          >
            {busy === 'pause' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Pause
          </Button>
        )}
        {mandate.status === 'PAUSED_BY_USER' && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleResume}
            disabled={busy !== null}
          >
            {busy === 'resume' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Resume
          </Button>
        )}
        {!isDestroyed && !isTerminated && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRevoke}
            disabled={busy !== null}
          >
            {busy === 'revoke' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Revoke
          </Button>
        )}
        {!isDestroyed && isTerminated && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDestroy}
            disabled={busy !== null}
          >
            {busy === 'destroy' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Destroy
          </Button>
        )}
      </div>
      {confirmingExecute && isActive && mandate.witnessCommit && (
        <div className="mt-3 rounded-[10px] bg-background p-3 text-[12px] ring-1 ring-[color:var(--border)]">
          <p className="font-medium">Confirm one agent execution</p>
          <p className="mt-1" style={{ color: 'var(--text-soft)' }}>
            This queues the next witness step. Your external runner will decrypt with its agent key and submit the bounded action.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleExecute}
              disabled={busy !== null}
            >
              {busy === 'execute' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Confirm execution
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmingExecute(false)}
              disabled={busy !== null}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({
  status,
  expired,
}: {
  status: MandateSummary['status'];
  expired: boolean;
}) {
  let color: string;
  if (status === 'ACTIVE' && !expired) color = 'var(--up)';
  else if (status === 'REVOKED' || expired) color = 'var(--down)';
  else color = 'var(--text-soft)';

  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-[color:var(--border)]"
      style={{ color }}
    >
      {expired && status === 'ACTIVE' ? 'Expired' : statusLabel(status)}
    </span>
  );
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortDigest(d: string): string {
  return `${d.slice(0, 6)}…${d.slice(-4)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
