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
import { useCoinBalance } from '@/lib/use-coin-balance';
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
  const [coinType, setCoinType] = useState(defaultCoinType);
  const { balance: availableBalance } = useCoinBalance(embeddedWalletAddress, coinType);
  const [amount, setAmount] = useState('');
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
    <div className="min-h-screen bg-background">
      <MobileTopBar title="Send" backHref="/" />

      <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-3">
        <div className="flex flex-col gap-5">
          {embeddedWalletAddress ? (
            <div className="flex items-center gap-3 rounded-[16px] bg-surface px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-raise">
                <Wallet className="size-[18px]" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">From your wallet</p>
                <p
                  className="mt-0.5 text-[12px]"
                  style={{ color: 'var(--text-mute)' }}
                >
                  Deposit funds here first to send.
                </p>
              </div>
              <button
                type="button"
                onClick={copyAddress}
                title={embeddedWalletAddress}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-raise px-3 py-1.5 text-[12px] font-medium font-mono"
              >
                {truncateAddress(embeddedWalletAddress)}
                {copied ? (
                  <Check className="size-3" style={{ color: 'var(--up)' }} />
                ) : (
                  <Copy className="size-3" style={{ color: 'var(--text-mute)' }} />
                )}
              </button>
            </div>
          ) : walletLoading ? (
            <div className="rounded-[16px] bg-surface px-4 py-3 text-[13px]" style={{ color: 'var(--text-soft)' }}>
              Setting up your embedded wallet…
            </div>
          ) : embeddedWalletError ? (
            <div
              className="rounded-[16px] px-4 py-3"
              style={{ background: 'var(--down-soft)' }}
            >
              <p className="text-[13px]" style={{ color: 'var(--down)' }}>
                {embeddedWalletError}
              </p>
              <Button
                className="mt-3 h-9 rounded-full text-[13px]"
                variant="outline"
                type="button"
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
            availableBalance={availableBalance}
          />

          <CoinSelector
            disabled={isSending}
            value={coinType}
            onValueChange={handleCoinTypeChange}
          />

          {sendError ? (
            <div
              className="rounded-[16px] px-4 py-3 text-[13px]"
              style={{ background: 'var(--down-soft)', color: 'var(--down)' }}
            >
              {sendError}
            </div>
          ) : null}

          <SendButton
            amount={amount}
            coinType={coinType}
            recipientType={detectRecipientType(username)}
            embeddedWalletAddress={embeddedWalletAddress}
            availableBalance={availableBalance}
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
