'use client';

import { useMemo, useState } from 'react';
import {
  useAuthorizationSignature,
  useIdentityToken,
  usePrivy,
} from '@privy-io/react-auth';
import { ArrowUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MAINNET_USDC_TYPE,
  SUI_COIN_TYPE,
  formatAmount,
  getCoinDecimals,
  getCoinLabel,
  getSelectableCoinOptions,
  isValidAmountInput,
} from '@/lib/coins';
import { parsePrivyAuthorizationRequiredResponse } from '@/lib/privy-authorization';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

type SwapStage = 'idle' | 'quoting' | 'authorizing' | 'executing' | 'confirmed';

interface SwapQuoteReview {
  swapQuoteToken: string;
  provider: string;
  coinTypeIn: string;
  coinTypeOut: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  slippageBps: number;
  expiresAt: string;
}

interface SwapExecuteResponse {
  status: 'confirmed';
  txDigest: string;
}

function isMainnet() {
  return (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') === 'mainnet';
}

function toBaseUnits(amount: string, decimals: number): bigint {
  const [wholeRaw = '0', frac = ''] = amount.split('.');
  if (frac.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places`);
  }
  const whole = wholeRaw === '' ? '0' : wholeRaw;
  const paddedFrac = frac.padEnd(decimals, '0');
  return BigInt(`${whole}${paddedFrac}`);
}

function parseQuoteReview(payload: unknown): SwapQuoteReview | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = payload as Partial<SwapQuoteReview>;
  if (
    typeof candidate.swapQuoteToken !== 'string' ||
    typeof candidate.provider !== 'string' ||
    typeof candidate.coinTypeIn !== 'string' ||
    typeof candidate.coinTypeOut !== 'string' ||
    typeof candidate.amountIn !== 'string' ||
    typeof candidate.amountOut !== 'string' ||
    typeof candidate.minAmountOut !== 'string' ||
    typeof candidate.slippageBps !== 'number' ||
    typeof candidate.expiresAt !== 'string'
  ) {
    return null;
  }
  return candidate as SwapQuoteReview;
}

function parseExecuteResponse(payload: unknown): SwapExecuteResponse | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = payload as Partial<SwapExecuteResponse>;
  if (candidate.status !== 'confirmed' || typeof candidate.txDigest !== 'string') {
    return null;
  }
  return candidate as SwapExecuteResponse;
}

async function getResponseError(response: Response, fallback: string) {
  try {
    const payload = await response.clone().json();
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string' &&
      payload.error
    ) {
      return payload.error;
    }
  } catch {
    // Ignore malformed error payloads.
  }
  return fallback;
}

export function SevenKSwapPanel() {
  const { getAccessToken } = usePrivy();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const { identityToken } = useIdentityToken();
  const { suiAddress: embeddedWalletAddress, loading: walletLoading, error: walletError } = useEmbeddedWallet();
  const coinOptions = useMemo(() => getSelectableCoinOptions(), []);
  const defaultOutputCoin = coinOptions.find((option) => option.coinType !== SUI_COIN_TYPE)?.coinType ?? MAINNET_USDC_TYPE;
  const [coinTypeIn, setCoinTypeIn] = useState(SUI_COIN_TYPE);
  const [coinTypeOut, setCoinTypeOut] = useState(defaultOutputCoin);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuoteReview | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<SwapStage>('idle');

  const amountNum = amount === '' ? Number.NaN : Number(amount);
  const validAmount =
    amount !== '' &&
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    isValidAmountInput(amount, coinTypeIn);
  const mainnet = isMainnet();
  const sameCoin = coinTypeIn === coinTypeOut;
  const busy = stage === 'quoting' || stage === 'authorizing' || stage === 'executing';
  const quoteDisabled =
    !mainnet ||
    !embeddedWalletAddress ||
    walletLoading ||
    sameCoin ||
    !validAmount ||
    busy;

  const clearReview = () => {
    setQuote(null);
    setTxDigest(null);
    setError(null);
    if (stage === 'confirmed') setStage('idle');
  };

  const requestQuote = async () => {
    if (quoteDisabled || !embeddedWalletAddress) return;
    setStage('quoting');
    setError(null);
    setTxDigest(null);

    try {
      const baseAmount = toBaseUnits(amount, getCoinDecimals(coinTypeIn));
      const response = await privyAuthenticatedFetch(
        getAccessToken,
        '/api/v1/swap/quote',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coinTypeIn,
            coinTypeOut,
            amount: baseAmount.toString(),
            senderAddress: embeddedWalletAddress,
          }),
        },
        { identityToken },
      );

      if (!response.ok) {
        setError(await getResponseError(response, 'Swap quote failed'));
        return;
      }

      const payload = await response.json().catch(() => null);
      const review = parseQuoteReview(payload);
      if (!review) {
        setError('Invalid swap quote response');
        return;
      }
      setQuote(review);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Swap quote failed');
    } finally {
      setStage('idle');
    }
  };

  const executeSwap = async () => {
    if (!quote || busy) return;
    setError(null);
    setTxDigest(null);
    setStage('executing');

    const requestExecute = (authorizationSignature?: string) => (
      privyAuthenticatedFetch(
        getAccessToken,
        '/api/v1/swap/execute',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            swapQuoteToken: quote.swapQuoteToken,
            ...(authorizationSignature ? { authorizationSignature } : {}),
          }),
        },
        { identityToken },
      )
    );

    try {
      let response = await requestExecute();
      if (!response.ok) {
        setError(await getResponseError(response, 'Swap execution failed'));
        return;
      }

      let payload = await response.json().catch(() => null);
      const authorizationRequired = parsePrivyAuthorizationRequiredResponse(payload);
      if (authorizationRequired) {
        setStage('authorizing');
        const authorization = await generateAuthorizationSignature(
          authorizationRequired.authorizationRequest,
        );
        setStage('executing');
        response = await requestExecute(authorization.signature);
        if (!response.ok) {
          setError(await getResponseError(response, 'Swap execution failed'));
          return;
        }
        payload = await response.json().catch(() => null);
      }

      if (parsePrivyAuthorizationRequiredResponse(payload)) {
        setError('Swap authorization did not complete. Please try again.');
        return;
      }

      const result = parseExecuteResponse(payload);
      if (!result) {
        setError('Invalid swap execution response');
        return;
      }

      setTxDigest(result.txDigest);
      setStage('confirmed');
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'Swap execution failed');
    } finally {
      setStage((currentStage) => currentStage === 'confirmed' ? currentStage : 'idle');
    }
  };

  const slippageText = quote ? `${(quote.slippageBps / 100).toFixed(2)}%` : '1.00%';

  return (
    <div className="rounded-[12px] border border-[color:var(--border)] bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold">Swap on Sui</p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Powered by 7K Aggregator
          </p>
        </div>
        <ArrowUpDown className="h-4 w-4" style={{ color: 'var(--text-mute)' }} />
      </div>

      {!mainnet ? (
        <p className="mt-3 rounded-[10px] bg-surface px-3 py-2 text-[12px]" style={{ color: 'var(--text-soft)' }}>
          Swap is available on Sui mainnet only.
        </p>
      ) : null}
      {walletError ? (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--down)' }}>
          {walletError}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2">
        <label className="grid gap-1 text-[12px] font-medium">
          From
          <select
            aria-label="From coin"
            className="h-10 rounded-[10px] border border-[color:var(--border)] bg-background px-3 text-[13px]"
            value={coinTypeIn}
            onChange={(event) => {
              setCoinTypeIn(event.target.value);
              clearReview();
            }}
          >
            {coinOptions.map((option) => (
              <option key={option.coinType} value={option.coinType}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Input
          aria-label="Swap amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            const value = event.target.value;
            if (value === '' || isValidAmountInput(value, coinTypeIn)) {
              setAmount(value);
              clearReview();
            }
          }}
          placeholder={`0.0 ${getCoinLabel(coinTypeIn)}`}
        />
        <label className="grid gap-1 text-[12px] font-medium">
          To
          <select
            aria-label="To coin"
            className="h-10 rounded-[10px] border border-[color:var(--border)] bg-background px-3 text-[13px]"
            value={coinTypeOut}
            onChange={(event) => {
              setCoinTypeOut(event.target.value);
              clearReview();
            }}
          >
            {coinOptions.map((option) => (
              <option key={option.coinType} value={option.coinType}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sameCoin ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--down)' }}>
          Choose two different coins.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--down)' }}>
          {error}
        </p>
      ) : null}

      {quote ? (
        <div className="mt-3 rounded-[10px] bg-surface p-3 text-[12px]">
          <div className="flex items-center justify-between gap-3">
            <span style={{ color: 'var(--text-soft)' }}>Provider</span>
            <span className="font-medium">{quote.provider}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span style={{ color: 'var(--text-soft)' }}>Estimated out</span>
            <span className="font-medium">
              {formatAmount(quote.amountOut, quote.coinTypeOut)} {getCoinLabel(quote.coinTypeOut)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span style={{ color: 'var(--text-soft)' }}>Minimum out</span>
            <span className="font-medium">
              {formatAmount(quote.minAmountOut, quote.coinTypeOut)} {getCoinLabel(quote.coinTypeOut)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span style={{ color: 'var(--text-soft)' }}>Slippage</span>
            <span className="font-medium">{slippageText}</span>
          </div>
        </div>
      ) : null}

      {txDigest ? (
        <p className="mt-3 break-all rounded-[10px] bg-surface px-3 py-2 text-[12px]">
          Swap submitted: {txDigest}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          className="h-10 rounded-[10px] text-[13px]"
          variant="outline"
          disabled={quoteDisabled}
          onClick={requestQuote}
        >
          {stage === 'quoting' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Get quote
        </Button>
        <Button
          type="button"
          className="h-10 rounded-[10px] text-[13px]"
          disabled={!quote || busy}
          onClick={executeSwap}
        >
          {stage === 'authorizing' || stage === 'executing' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Execute swap
        </Button>
      </div>

      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-mute)' }}>
        Slippage is fixed at {slippageText} for this version.
      </p>
    </div>
  );
}
