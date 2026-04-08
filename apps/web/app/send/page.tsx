'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Wallet } from 'lucide-react';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { AmountInput } from '@/components/amount-input';
import { CoinSelector } from '@/components/coin-selector';
import { SendButton } from '@/components/send-button';
import { TransactionResult, type TransactionResultData } from '@/components/transaction-result';
import { UsernameInput } from '@/components/username-input';
import { Button } from '@/components/ui/button';
import { SUI_COIN_TYPE, getUserFacingUsdcCoinType } from '@/lib/coins';
import { truncateAddress } from '@/lib/received-dashboard-client';
import { detectRecipientType } from '@/lib/recipient';
import { sanitizeAmountForCoinType } from '@/lib/send-form';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const defaultCoinType = getUserFacingUsdcCoinType() ?? SUI_COIN_TYPE;

export default function SendPage() {
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

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    },
    [],
  );

  const copyAddress = useCallback(() => {
    if (!embeddedWalletAddress) return;
    navigator.clipboard
      .writeText(embeddedWalletAddress)
      .then(() => {
        if (copyResetTimeoutRef.current !== null) {
          window.clearTimeout(copyResetTimeoutRef.current);
        }
        setCopied(true);
        copyResetTimeoutRef.current = window.setTimeout(() => {
          copyResetTimeoutRef.current = null;
          setCopied(false);
        }, 2000);
      })
      .catch(() => {});
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
    <div className="min-h-screen">
      <MobileTopBar title="Send Money" backHref="/" />

      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
        <div className="flex flex-col gap-5">
          {/* Wallet info */}
          {embeddedWalletAddress ? (
            <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 dark:border-primary/20 dark:bg-primary/8">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15">
                  <Wallet className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">Sending from</p>
                  <p className="text-xs text-muted-foreground">
                    Deposit funds to this wallet first.
                  </p>
                </div>
                <button
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
                  onClick={copyAddress}
                  title={embeddedWalletAddress}
                  type="button"
                >
                  {truncateAddress(embeddedWalletAddress)}
                  {copied ? (
                    <Check className="size-3 text-green-500" />
                  ) : (
                    <Copy className="size-3 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          ) : walletLoading ? (
            <div className="rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/4">
              Setting up your embedded wallet...
            </div>
          ) : embeddedWalletError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3">
              <p className="text-sm text-destructive">{embeddedWalletError}</p>
              <Button
                className="mt-3 rounded-full"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => refetchEmbeddedWallet()}
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
            <div className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {sendError}
            </div>
          ) : null}

          <SendButton
            amount={amount}
            coinType={coinType}
            recipientType={detectRecipientType(username)}
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
        </div>
      </main>
    </div>
  );
}
