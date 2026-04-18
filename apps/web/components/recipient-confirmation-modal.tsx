'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ResolvedUserCard,
  type ResolvedUserPreview,
} from '@/components/resolved-user-card';
import { getCoinLabel } from '@/lib/coins';

export type RecipientConfirmationData =
  | {
      amount: string;
      coinType: string;
      recipientType: 'X_HANDLE';
      recipient: ResolvedUserPreview;
    }
  | {
      amount: string;
      coinType: string;
      recipientType: 'SUI_ADDRESS';
      recipientAddress: string;
    };

interface RecipientConfirmationModalProps {
  data: RecipientConfirmationData | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RecipientConfirmationModal({
  data,
  onCancel,
  onConfirm,
}: RecipientConfirmationModalProps) {
  if (!data) return null;

  const isAddressSend = data.recipientType === 'SUI_ADDRESS';

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Confirm recipient</DialogTitle>
          <DialogDescription>
            {isAddressSend
              ? 'Review the Sui address before opening your wallet.'
              : 'Review the resolved X account before opening your wallet.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between rounded-[12px] bg-raise px-3.5 py-2.5 text-[13px]">
            <span style={{ color: 'var(--text-mute)' }}>Amount</span>
            <span className="mono-nums font-semibold tabular-nums">
              {data.amount} {getCoinLabel(data.coinType)}
            </span>
          </div>

          {isAddressSend ? (
            <div className="rounded-[14px] bg-raise px-3.5 py-3">
              <p className="eyebrow mb-1">Sui address</p>
              <p className="break-all font-mono text-[12px] leading-[1.45]">
                {data.recipientAddress}
              </p>
            </div>
          ) : (
            <ResolvedUserCard user={data.recipient} />
          )}

          <p
            className="px-1 text-[12px] leading-[1.45]"
            style={{ color: 'var(--text-mute)' }}
          >
            {isAddressSend
              ? 'Funds will be sent directly to this address. This cannot be reversed.'
              : 'Funds will be sent directly to the resolved canonical wallet for this X account. Confirm it matches before approving.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Continue to wallet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
