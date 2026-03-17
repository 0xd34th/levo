'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ShieldCheck, TimerReset, Twitter, Wallet } from 'lucide-react';
import { AmountInput } from '@/components/amount-input';
import { CoinSelector } from '@/components/coin-selector';
import { Navbar } from '@/components/navbar';
import { SendButton } from '@/components/send-button';
import { TransactionResult, type TransactionResultData } from '@/components/transaction-result';
import { UsernameInput } from '@/components/username-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SUI_COIN_TYPE, getTestUsdcCoinType } from '@/lib/coins';
import { truncateAddress } from '@/lib/received-dashboard-client';
import { sanitizeAmountForCoinType } from '@/lib/send-form';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

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
  const {
    suiAddress: embeddedWalletAddress,
    loading: walletLoading,
    error: embeddedWalletError,
    refetch: refetchEmbeddedWallet,
  } = useEmbeddedWallet();
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [coinType, setCoinType] = useState(defaultCoinType);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TransactionResultData | null>(null);
  const [copied, setCopied] = useState(false);
  const copyResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => (
    () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    }
  ), []);

  const copyAddress = useCallback(() => {
    if (!embeddedWalletAddress) return;
    navigator.clipboard.writeText(embeddedWalletAddress).then(() => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      setCopied(true);
      copyResetTimeoutRef.current = window.setTimeout(() => {
        copyResetTimeoutRef.current = null;
        setCopied(false);
      }, 2000);
    }).catch(() => {});
  }, [embeddedWalletAddress]);

  const resetFlow = () => {
    setUsername('');
    setAmount('');
    setIsSending(false);
    setSendError(null);
    setTxResult(null);
    setCoinType(defaultCoinType);
  };

  const handleUsernameChange = (nextUsername: string) => {
    setUsername(nextUsername);
    setSendError(null);
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

              {embeddedWalletAddress ? (
                <div className="rounded-[22px] border border-primary/15 bg-primary/5 px-4 py-3 dark:border-primary/20 dark:bg-primary/8">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15">
                      <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">Embedded wallet</p>
                      <p className="text-xs text-muted-foreground">
                        Deposit funds to send. No browser extension needed.
                      </p>
                    </div>
                    <button
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
                      onClick={copyAddress}
                      title={embeddedWalletAddress}
                      type="button"
                    >
                      {truncateAddress(embeddedWalletAddress)}
                      {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              ) : walletLoading ? (
                <div className="rounded-[22px] border border-border/70 bg-secondary/60 px-4 py-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/4">
                  Setting up your embedded wallet…
                </div>
              ) : embeddedWalletError ? (
                <div className="rounded-[22px] border border-destructive/20 bg-destructive/8 px-4 py-3">
                  <p className="text-sm text-destructive">{embeddedWalletError}</p>
                  <Button
                    className="mt-3 rounded-full"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      refetchEmbeddedWallet();
                    }}
                  >
                    Retry wallet setup
                  </Button>
                </div>
              ) : null}

              <UsernameInput
                disabled={isSending}
                value={username}
                onValueChange={handleUsernameChange}
              />

              <AmountInput
                amount={amount}
                coinType={coinType}
                disabled={isSending}
                onAmountChange={setAmount}
              />

              <CoinSelector
                disabled={isSending}
                value={coinType}
                onValueChange={handleCoinTypeChange}
              />

              {sendError ? (
                <div className="rounded-[22px] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {sendError}
                </div>
              ) : null}

              <SendButton
                amount={amount}
                coinType={coinType}
                embeddedWalletAddress={embeddedWalletAddress}
                onConfirm={(data) => {
                  setSendError(null);
                  setTxResult(data);
                }}
                onError={setSendError}
                onSendingChange={setIsSending}
                username={username}
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
