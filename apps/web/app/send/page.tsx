'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { HandleInput, type ResolvedUser } from '@/components/handle-input';
import { ResolvedUserCard } from '@/components/resolved-user-card';
import { AmountInput } from '@/components/amount-input';
import { SendButton } from '@/components/send-button';
import { ConfirmationModal, type ConfirmationData } from '@/components/confirmation-modal';
import { MintButton } from '@/components/mint-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ConnectButton is a Lit web component that accesses `window` at import time,
// so it must be loaded client-side only to avoid SSR errors.
const ConnectButton = dynamic(
  () => import('@mysten/dapp-kit-react/ui').then((m) => m.ConnectButton),
  { ssr: false },
);

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? '';
const COIN_TYPE = `${PACKAGE_ID}::test_usdc::TEST_USDC`;
const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const TREASURY_CAP_ID = process.env.NEXT_PUBLIC_TREASURY_CAP_ID ?? '';

export default function SendPage() {
  const [resolvedUser, setResolvedUser] = useState<ResolvedUser | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);

  const handleDone = () => {
    setConfirmation(null);
    setAmount('');
    setResolvedUser(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Levo</h1>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/send" className="text-foreground font-medium">Send</Link>
            <Link href="/history" className="text-muted-foreground hover:text-foreground">History</Link>
          </nav>
          {PACKAGE_ID && TREASURY_CAP_ID && NETWORK !== 'mainnet' && (
            <MintButton packageId={PACKAGE_ID} treasuryCapId={TREASURY_CAP_ID} />
          )}
        </div>
        <div className="self-end sm:self-auto">
          <ConnectButton />
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 items-start justify-center px-4 pt-12 sm:pt-20">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Send Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <HandleInput
              onResolved={setResolvedUser}
              onLoading={setResolveLoading}
              onError={setResolveError}
            />

            <ResolvedUserCard
              user={resolvedUser}
              loading={resolveLoading}
              error={resolveError}
            />

            <AmountInput
              amount={amount}
              onAmountChange={setAmount}
              coinType={COIN_TYPE}
            />

            {sendError && (
              <p className="text-sm text-destructive">{sendError}</p>
            )}

            <SendButton
              user={resolvedUser}
              amount={amount}
              coinType={COIN_TYPE}
              onError={setSendError}
              onConfirm={setConfirmation}
            />
          </CardContent>
        </Card>
      </main>

      <ConfirmationModal
        data={confirmation}
        network={NETWORK}
        onClose={handleDone}
      />
    </div>
  );
}
