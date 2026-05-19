'use client';

interface ExecuteOutput {
  kind: 'execute-result';
  status?: string;
  txDigest?: string;
  actionId?: string;
  witnessId?: string;
  nonceAfter?: string;
  reason?: string;
  error?: string;
  mandateId?: string;
}

export function ExecuteResultCard({ result }: { result: ExecuteOutput }) {
  const status = result.status ?? 'unknown';
  const ok = status === 'confirmed';
  const blocked = status === 'blocked_by_seal';
  const failed = status === 'failed';

  let color = 'var(--text-soft)';
  if (ok) color = 'var(--up)';
  else if (blocked || failed) color = 'var(--down)';

  return (
    <div className="rounded-[12px] bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--border)]">
      <p className="text-[13px] font-medium">
        Execute: <span style={{ color }}>{status}</span>
      </p>
      <dl className="mt-2 space-y-0.5 text-[12px]">
        {result.txDigest && (
          <KV label="Tx" value={short(result.txDigest)} />
        )}
        {result.nonceAfter && <KV label="Nonce" value={result.nonceAfter} />}
        {result.reason && <KV label="Reason" value={result.reason} />}
        {result.error && <KV label="Error" value={result.error} />}
        {result.mandateId && status === 'no_steps_pending' && (
          <KV label="Note" value="Chain fully consumed" />
        )}
      </dl>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: 'var(--text-soft)' }}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function short(s: string): string {
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}
