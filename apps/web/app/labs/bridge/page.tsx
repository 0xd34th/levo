import type { Metadata } from 'next';

import { BridgeWidget } from './_components/bridge-widget';

export const metadata: Metadata = {
  title: 'Bridge (Lab) · Levo',
  description:
    'Experimental bridge UI powered by LI.FI. Routes into your Levo Sui wallet on mainnet.',
};

export default function BridgeLabPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center gap-6 px-4 py-10">
      <header className="w-full">
        <p className="eyebrow">Lab</p>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">
          Bridge to Sui
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-mute)' }}>
          Experimental: LI.FI widget (integrator <code>levo</code>) wired to
          your real Levo Sui wallet on mainnet. Quotes and bridge transactions
          executed here are real and irreversible.
        </p>
      </header>
      <BridgeWidget />
    </main>
  );
}
