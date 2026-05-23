'use client';

const CETUS_TERMINAL_URL = 'https://terminal.cetus.zone/';

export function CetusTerminalPanel() {
  return (
    <div className="rounded-[12px] border border-[color:var(--border)] bg-background p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold">Swap on Cetus</p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Enter the amount and confirm with a connected wallet in the Cetus terminal.
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-[color:var(--border)]">
        <iframe
          title="Cetus Terminal"
          src={CETUS_TERMINAL_URL}
          className="h-[640px] w-full bg-white"
          sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        />
      </div>
    </div>
  );
}
