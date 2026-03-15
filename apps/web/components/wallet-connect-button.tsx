'use client';

import dynamic from 'next/dynamic';
import { Wallet } from 'lucide-react';

const ConnectButton = dynamic(
  () => import('@mysten/dapp-kit-react/ui').then((mod) => mod.ConnectButton),
  { ssr: false },
);

export function WalletConnectButton() {
  return (
    <ConnectButton className="wallet-connect-button">
      <span className="inline-flex items-center gap-2">
        <Wallet className="size-4" />
        Connect wallet
      </span>
    </ConnectButton>
  );
}
