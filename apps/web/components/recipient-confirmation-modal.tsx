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

export interface RecipientConfirmationData {
  amount: string;
  coinType: string;
  recipient: ResolvedUserPreview;
}

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
  if (!data) {
    return null;
  }

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Confirm Recipient</DialogTitle>
          <DialogDescription>
            Review the resolved X account before opening your wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">
              {data.amount} {getCoinLabel(data.coinType)}
            </span>
          </div>

          <ResolvedUserCard user={data.recipient} />

          <p className="text-xs leading-5 text-muted-foreground">
            Your wallet will still show the vault address. Confirm it matches the
            resolved recipient above before approving the transaction.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Continue to Wallet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
