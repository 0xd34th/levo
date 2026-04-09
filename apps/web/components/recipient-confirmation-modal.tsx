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
import { Card, CardContent } from '@/components/ui/card';
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
  if (!data) {
    return null;
  }

  const isAddressSend = data.recipientType === 'SUI_ADDRESS';

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Confirm Recipient</DialogTitle>
          <DialogDescription>
            {isAddressSend
              ? 'Review the Sui address before opening your wallet.'
              : 'Review the resolved X account before opening your wallet.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">
              {data.amount} {getCoinLabel(data.coinType)}
            </span>
          </div>

          {isAddressSend ? (
            <Card>
              <CardContent>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Sui Address
                  </p>
                  <p className="break-all font-mono text-sm text-foreground">
                    {data.recipientAddress}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ResolvedUserCard user={data.recipient} />
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            {isAddressSend
              ? 'Funds will be sent directly to this address. This cannot be reversed.'
              : 'Funds will be sent directly to the resolved canonical wallet for this X account. Confirm it matches before approving the transaction.'}
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
