'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getCoinLabel, getExplorerTransactionUrl } from '@/lib/coins';

export interface ConfirmationData {
  amount: string;
  coinType: string;
  username: string;
  txDigest: string;
}

interface ConfirmationModalProps {
  data: ConfirmationData | null;
  network: string;
  onClose: () => void;
}

export function ConfirmationModal({ data, network, onClose }: ConfirmationModalProps) {
  if (!data) return null;

  const explorerUrl = getExplorerTransactionUrl(network, data.txDigest);
  const coinLabel = getCoinLabel(data.coinType);

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Payment Sent</DialogTitle>
          <DialogDescription>
            Your transaction has been confirmed on-chain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">{data.amount} {coinLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Recipient</span>
            <span className="font-medium">@{data.username}</span>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">Transaction Digest</span>
            <p className="break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
              {data.txDigest}
            </p>
          </div>
        </div>

        <DialogFooter>
          {explorerUrl ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              View on Explorer
            </a>
          ) : null}
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
