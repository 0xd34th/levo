import {
  Transaction,
  type TransactionObjectArgument,
  coinWithBalance,
} from '@mysten/sui/transactions';
import { getSuiClient } from '@/lib/sui';

const DEFAULT_SLIPPAGE_BPS = 100;
const QUOTE_TIMEOUT_MS = 7_000;
const BPS_DENOMINATOR = 10_000n;

export interface SevenKQuoteReview {
  quote: unknown;
  provider: string;
  coinTypeIn: string;
  coinTypeOut: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  slippageBps: number;
}

export interface SevenKQuoteRequest {
  coinTypeIn: string;
  coinTypeOut: string;
  amount: string;
  senderAddress: string;
}

interface MetaAgConstructor {
  new(options?: Record<string, unknown>): {
    quote: (
      options: Record<string, unknown>,
      simulation?: Record<string, unknown>,
    ) => Promise<Array<Record<string, unknown>>>;
    swap: (
      options: Record<string, unknown>,
      slippageBps?: number,
    ) => Promise<unknown>;
  };
}

async function createMetaAg(slippageBps = DEFAULT_SLIPPAGE_BPS) {
  const sdk = await import('@7kprotocol/sdk-ts') as unknown as { MetaAg: MetaAgConstructor };
  return new sdk.MetaAg({
    fullnodeUrl: process.env.SUI_RPC_URL,
    providers: {
      bluefin7k: { disabled: true },
      flowx: {},
      cetus: {},
    },
    slippageBps,
  });
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function quoteOutputAmount(quote: Record<string, unknown>): bigint {
  const amountOut = readString(quote.simulatedAmountOut) ?? readString(quote.amountOut);
  return amountOut ? BigInt(amountOut) : 0n;
}

function calculateMinAmountOut(amountOut: string, slippageBps: number): string {
  const output = BigInt(amountOut);
  return ((output * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR).toString();
}

export async function getBestSevenKQuote({
  coinTypeIn,
  coinTypeOut,
  amount,
  senderAddress,
}: SevenKQuoteRequest): Promise<SevenKQuoteReview> {
  const metaAg = await createMetaAg(DEFAULT_SLIPPAGE_BPS);
  const quoteOptions = {
    amountIn: amount,
    coinTypeIn,
    coinTypeOut,
    signer: senderAddress,
    timeout: QUOTE_TIMEOUT_MS,
  };
  const quotes = await metaAg.quote(quoteOptions);
  const bestQuote = quotes
    .filter((quote) => quoteOutputAmount(quote) > 0n)
    .sort((a, b) => {
      const diff = quoteOutputAmount(b) - quoteOutputAmount(a);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    })[0];

  if (!bestQuote) {
    throw new Error('No 7K swap quote available');
  }

  const amountOut = (readString(bestQuote.simulatedAmountOut) ?? readString(bestQuote.amountOut))!;

  return {
    quote: bestQuote,
    provider: readString(bestQuote.provider) ?? '7k',
    coinTypeIn,
    coinTypeOut,
    amountIn: amount,
    amountOut,
    minAmountOut: calculateMinAmountOut(amountOut, DEFAULT_SLIPPAGE_BPS),
    slippageBps: DEFAULT_SLIPPAGE_BPS,
  };
}

export async function buildSevenKSwapTransaction({
  quote,
  senderAddress,
  coinTypeIn,
  amountIn,
  slippageBps,
  gasOwner,
}: {
  quote: unknown;
  senderAddress: string;
  coinTypeIn: string;
  amountIn: string;
  slippageBps: number;
  gasOwner: string;
}): Promise<Uint8Array> {
  const metaAg = await createMetaAg(slippageBps);
  const tx = new Transaction();
  tx.setSender(senderAddress);
  tx.setGasOwner(gasOwner);

  const coinIn = tx.add(
    coinWithBalance({
      balance: BigInt(amountIn),
      type: coinTypeIn,
      useGasCoin: false,
    }),
  );

  const coinOut = await metaAg.swap(
    {
      quote,
      signer: senderAddress,
      tx,
      coinIn,
    },
    slippageBps,
  );

  tx.transferObjects([coinOut as TransactionObjectArgument], senderAddress);

  return tx.build({ client: getSuiClient() });
}
