'use client';

import { useState } from 'react';
import { ShieldCheck, TimerReset, Twitter } from 'lucide-react';
import { AmountInput } from '@/components/amount-input';
import { CoinSelector } from '@/components/coin-selector';
import { Navbar } from '@/components/navbar';
import { SendButton } from '@/components/send-button';
import { TransactionResult, type TransactionResultData } from '@/components/transaction-result';
import { UsernameInput, type ResolvedUser } from '@/components/username-input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SUI_COIN_TYPE, getTestUsdcCoinType } from '@/lib/coins';
import { sanitizeAmountForCoinType } from '@/lib/send-form';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

const defaultCoinType = getTestUsdcCoinType() ?? SUI_COIN_TYPE;

const highlights = [
  {
    icon: TimerReset,
    title: 'Five-second send flow',
    description: 'Type @username, set amount, and send. No wallet address copy-paste.',
  },
  {
    icon: Twitter,
    title: 'Recipient starts with X',
    description: 'Funds land in a deterministic vault tied to the X identity, not a seed phrase.',
  },
  {
    icon: ShieldCheck,
    title: 'Web3 stays in the background',
    description: 'Sui handles settlement while the UI stays clear, familiar, and fintech-first.',
  },
];

export default function HomePage() {
  const [username, setUsername] = useState('');
  const [resolvedUser, setResolvedUser] = useState<ResolvedUser | null>(null);
  const [amount, setAmount] = useState('');
  const [coinType, setCoinType] = useState(defaultCoinType);
  const [sendError, setSendError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TransactionResultData | null>(null);

  const resetFlow = () => {
    setUsername('');
    setResolvedUser(null);
    setAmount('');
    setSendError(null);
    setTxResult(null);
    setCoinType(defaultCoinType);
  };

  const handleCoinTypeChange = (nextCoinType: string) => {
    setCoinType(nextCoinType);
    setAmount((currentAmount) => sanitizeAmountForCoinType(currentAmount, nextCoinType));
  };

  return (
    <div className="app-shell">
      <Navbar />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <Badge
            variant="outline"
            className="rounded-full border-primary/20 bg-primary/8 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"
          >
            Cash App simplicity. Blazing fast settlement.
          </Badge>
          <h1 className="hero-heading mt-6 max-w-2xl">
            Send money to any X handle.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Enter a handle, enter an amount, and move stablecoins in one clean motion.
          </p>
        </section>

        <section className="mx-auto mt-10 flex w-full max-w-3xl flex-col items-center">
          <Card className="glass-card w-full max-w-xl rounded-[32px] border-border/60 bg-card/95 py-0 dark:border-white/10 dark:bg-[#11151d]/90">
            <CardContent className="space-y-6 px-5 py-5 sm:px-7 sm:py-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-5 dark:border-white/8">
                <div>
                  <p className="section-eyebrow">Send money</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em]">
                    Ready in less than five seconds
                  </h2>
                </div>
              </div>

              <UsernameInput
                value={username}
                onResolvedChange={setResolvedUser}
                onValueChange={setUsername}
              />

              <AmountInput
                amount={amount}
                coinType={coinType}
                onAmountChange={setAmount}
              />

              <CoinSelector value={coinType} onValueChange={handleCoinTypeChange} />

              {sendError ? (
                <div className="rounded-[22px] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {sendError}
                </div>
              ) : null}

              <SendButton
                amount={amount}
                coinType={coinType}
                onConfirm={(data) => {
                  setSendError(null);
                  setTxResult(data);
                }}
                onError={setSendError}
                user={resolvedUser}
              />

              <TransactionResult data={txResult} network={NETWORK} onReset={resetFlow} />
            </CardContent>
          </Card>
        </section>

        <section className="mx-auto mt-10 grid w-full max-w-5xl gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <div key={item.title} className="metric-card rounded-[28px] p-5">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary dark:bg-white/7">
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
