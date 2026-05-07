/**
 * OKX Wallet API client used as a redundant data source for portfolio and
 * activity tools. Adapters convert OKX shapes into BlockVision shapes so the
 * consuming tool / card layer stays source-agnostic.
 *
 * chainIndex 784 = Sui. Wallet endpoints remain on V5 (verified live —
 * web3.okx.com only deprecated V5 *DEX* endpoints, not Wallet).
 */
import { okxGet } from "./client";
import { OKX_CHAIN } from "./chain";
import type { OkxTokenBalance, OkxTransactionRow } from "./types";
import type {
  BVAccountActivity,
  BVAccountCoin,
  BVAccountNftItem,
} from "@/lib/blockvision/types";

const BALANCES_PATH = "/api/v5/wallet/asset/all-token-balances-by-address";
const TX_HISTORY_PATH = "/api/v5/wallet/post-transaction/transactions";

interface OkxBalanceResponse {
  tokenAssets?: OkxTokenBalance[];
}

interface OkxTransactionResponse {
  transactionList?: OkxTransactionRow[];
  transactions?: OkxTransactionRow[];
  cursor?: string;
}

function pickArray<T>(raw: unknown, keys: string[]): T[] {
  // Shape A: { tokenAssets: [...] }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const k of keys) {
      const v = (raw as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  // Shape B: [{ tokenAssets: [...] }] — common after OKX envelope unwraps `data`.
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      for (const k of keys) {
        const v = (first as Record<string, unknown>)[k];
        if (Array.isArray(v)) return v as T[];
      }
    }
    // Shape C: array of plain items already.
    const looksLikeRow = (raw[0] as Record<string, unknown>) ?? {};
    if ("symbol" in looksLikeRow || "tokenAddress" in looksLikeRow || "txHash" in looksLikeRow) {
      return raw as T[];
    }
  }
  return [];
}

function safeFloat(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.length > 0) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function safeInt(value: unknown, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.floor(value) : fallback;
  if (typeof value === "string" && value.length > 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/**
 * Fetch all token balances for a Sui address via OKX, mapped into the
 * BVAccountCoin shape used by `get-portfolio`.
 */
export async function getOkxSuiCoins(address: string): Promise<BVAccountCoin[]> {
  const raw = await okxGet<unknown>(
    BALANCES_PATH,
    { address, chains: OKX_CHAIN.SUI },
    { ttl: 30, swr: 60 },
  );
  const rows = pickArray<OkxTokenBalance>(raw, ["tokenAssets", "balances"]);
  return rows.map((row) => {
    const decimals = safeInt(row.decimals, 9);
    const balance = row.rawBalance ?? row.balance ?? "0";
    const price = safeFloat(row.tokenPrice);
    const balanceHuman = safeFloat(row.balance);
    const usdValue =
      price !== undefined && balanceHuman !== undefined ? price * balanceHuman : undefined;
    return {
      coinType: row.tokenAddress ?? row.symbol ?? "",
      symbol: row.symbol ?? "?",
      name: row.symbol,
      decimals,
      balance: typeof balance === "string" ? balance : String(balance),
      usdValue,
      price,
      verified: row.isRiskToken === undefined ? undefined : !row.isRiskToken,
    };
  });
}

/** OKX wallet API has no first-class Sui NFT listing endpoint we rely on yet. */
export async function getOkxSuiNfts(_address: string): Promise<BVAccountNftItem[]> {
  return [];
}

/**
 * Fetch recent transactions for an address, mapped to BVAccountActivity.
 */
export async function getOkxSuiActivities(
  address: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<BVAccountActivity[]> {
  const params: Record<string, string | number | undefined> = {
    // OKX V5 Wallet API uses `accountId` (not `address`) on tx history.
    accountId: address,
    chains: OKX_CHAIN.SUI,
    limit: opts.limit ?? 20,
  };
  if (opts.cursor) params.cursor = opts.cursor;
  const raw = await okxGet<unknown>(TX_HISTORY_PATH, params, { ttl: 30, swr: 60 });
  const rows = pickArray<OkxTransactionRow>(raw, ["transactionList", "transactions"]);
  return rows.map((row) => mapTxRow(row));
}

function mapTxRow(row: OkxTransactionRow): BVAccountActivity {
  const tsRaw = row.txTime;
  const ts = typeof tsRaw === "string" ? Number.parseInt(tsRaw, 10) : Number(tsRaw ?? 0);
  const sender = row.fromAddress ?? "";
  const summary = composeSummary(row);
  return {
    digest: row.txHash ?? "",
    timestamp: Number.isFinite(ts) ? ts : 0,
    sender,
    type: row.txType,
    status: row.txStatus,
    summary,
    coinChanges:
      row.amount && row.symbol
        ? [
            {
              coinType: row.symbol,
              symbol: row.symbol,
              amount: String(row.amount),
            },
          ]
        : undefined,
  };
}

function composeSummary(row: OkxTransactionRow): string | undefined {
  const parts: string[] = [];
  if (row.txType) parts.push(row.txType);
  if (row.amount && row.symbol) parts.push(`${row.amount} ${row.symbol}`);
  if (row.toAddress) parts.push(`→ ${row.toAddress}`);
  return parts.length ? parts.join(" · ") : undefined;
}
