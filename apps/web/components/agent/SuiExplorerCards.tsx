'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  ArrowRightLeft,
  BadgeCheck,
  Boxes,
  ExternalLink,
  Landmark,
  ListTree,
  Repeat2,
  Send,
  ShieldAlert,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { SendButton } from '@/components/send-button';
import { TransactionResult, type TransactionResultData } from '@/components/transaction-result';
import { buttonVariants } from '@/components/ui/button';
import { SUI_COIN_TYPE } from '@/lib/coins';
import { cn } from '@/lib/utils';
import { shortId } from '@/lib/agent/display';
import { detectRecipientType } from '@/lib/recipient';
import { useCoinBalance } from '@/lib/use-coin-balance';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

type AnyRecord = Record<string, unknown>;
const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

export function SuiToolCard({ output }: { output: AnyRecord }) {
  const kind = output.kind;
  if (kind === 'token-card') return <TokenCard data={output} />;
  if (kind === 'portfolio-card') return <PortfolioCard data={output} />;
  if (kind === 'activity-card') return <ActivityCard data={output} />;
  if (kind === 'object-card') return <ObjectCard data={output} />;
  if (kind === 'tx-card') return <TxCard data={output} />;
  if (kind === 'defi-card') return <DeFiCard data={output} />;
  if (kind === 'trending-card') return <TrendingCard data={output} />;
  if (kind === 'nft-card') return <NftCollectionCard data={output} />;
  if (kind === 'write-card') return <WriteCard data={output} />;
  if (kind === 'mandate-intent') return <MandateIntentCard data={output} />;
  if (kind === 'followups') return <Followups data={output} />;
  return <GenericCard icon={<ListTree className="size-4" />} title="Tool result" data={output} />;
}

function Shell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[12px] bg-background p-4 text-[13px] ring-1 ring-[color:var(--border)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[color:var(--surface)]">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{title}</p>
            {subtitle ? (
              <p className="truncate text-[12px]" style={{ color: 'var(--text-soft)' }}>
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function TokenCard({ data }: { data: AnyRecord }) {
  const price = numberValue(data.price);
  return (
    <Shell
      icon={data.verified ? <BadgeCheck className="size-4" /> : <Sparkles className="size-4" />}
      title={`${stringValue(data.symbol, 'Token')} market`}
      subtitle={stringValue(data.name, stringValue(data.coinType))}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Price" value={price ? `$${formatNumber(price)}` : 'Unavailable'} />
        <Stat label="24h" value={percentValue(data.priceChange24H)} />
        <Stat label="Market cap" value={usdValue(data.marketCap)} />
        <Stat label="Liquidity" value={usdValue(data.liquidity)} />
      </div>
      <Warnings warnings={arrayOfStrings(data.warnings)} />
    </Shell>
  );
}

function PortfolioCard({ data }: { data: AnyRecord }) {
  const coins = Array.isArray(data.topCoins) ? (data.topCoins as AnyRecord[]) : [];
  return (
    <Shell
      icon={<WalletCards className="size-4" />}
      title="Portfolio"
      subtitle={`${shortId(stringValue(data.address), 8, 6)} · ${stringValue(data.source)}`}
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Verified value" value={usdValue(data.totalUsd)} />
        <Stat label="Coins" value={String(data.coinCount ?? coins.length)} />
        <Stat label="NFTs" value={String(data.nftCount ?? 0)} />
      </div>
      <div className="mt-3 divide-y divide-[color:var(--border)]">
        {coins.slice(0, 6).map((coin, index) => (
          <div key={`${coin.coinType}-${index}`} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{stringValue(coin.symbol, '?')}</p>
              <p className="truncate text-[11px]" style={{ color: 'var(--text-soft)' }}>
                {shortId(stringValue(coin.coinType), 8, 6)}
              </p>
            </div>
            <p className="shrink-0 tabular-nums">{usdValue(coin.usdValue)}</p>
          </div>
        ))}
      </div>
      {typeof data.fallbackReason === 'string' ? <Warnings warnings={[data.fallbackReason]} /> : null}
    </Shell>
  );
}

function ActivityCard({ data }: { data: AnyRecord }) {
  const items = Array.isArray(data.items) ? (data.items as AnyRecord[]) : [];
  return (
    <Shell
      icon={<ListTree className="size-4" />}
      title="Recent activity"
      subtitle={`${shortId(stringValue(data.address), 8, 6)} · ${stringValue(data.source)}`}
    >
      {items.length ? (
        <div className="divide-y divide-[color:var(--border)]">
          {items.slice(0, 8).map((item, index) => (
            <div key={index} className="py-2">
              <p className="truncate font-medium">
                {stringValue(item.summary, stringValue(item.type, stringValue(item.symbol, 'Transaction')))}
              </p>
              <p className="truncate text-[11px]" style={{ color: 'var(--text-soft)' }}>
                {stringValue(item.digest, stringValue(item.txHash, 'No digest'))}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-soft)' }}>No recent activity returned.</p>
      )}
    </Shell>
  );
}

function ObjectCard({ data }: { data: AnyRecord }) {
  const object = (data.object ?? {}) as AnyRecord;
  const objData = (object.data ?? {}) as AnyRecord;
  return (
    <Shell icon={<Boxes className="size-4" />} title="Sui object" subtitle={shortId(stringValue(data.objectId), 8, 8)}>
      <div className="grid gap-2">
        <Stat label="Type" value={shortMiddle(stringValue(objData.type, 'Unknown'), 46)} />
        <Stat label="Version" value={stringValue(objData.version, 'Unknown')} />
        <Stat label="Digest" value={shortId(stringValue(objData.digest), 8, 8)} />
      </div>
    </Shell>
  );
}

function TxCard({ data }: { data: AnyRecord }) {
  const steps = Array.isArray(data.steps) ? (data.steps as AnyRecord[]) : [];
  return (
    <Shell icon={<ArrowRightLeft className="size-4" />} title="Transaction explanation" subtitle={shortId(stringValue(data.digest), 10, 8)}>
      <p className="font-medium">{stringValue(data.summary, 'Transaction decoded')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Status" value={stringValue(data.status, 'unknown')} />
        <Stat label="Sender" value={shortId(stringValue(data.sender), 8, 6)} />
      </div>
      {steps.length ? (
        <ol className="mt-3 space-y-2">
          {steps.slice(0, 6).map((step, index) => (
            <li key={index} className="rounded-[8px] bg-[color:var(--surface)] px-3 py-2">
              {index + 1}. {stringValue(step.description, stringValue(step.kind, 'Step'))}
            </li>
          ))}
        </ol>
      ) : null}
    </Shell>
  );
}

function DeFiCard({ data }: { data: AnyRecord }) {
  const positions = extractRecordList(data.positions);
  const warning = typeof data.warning === 'string' ? data.warning : undefined;
  return (
    <Shell
      icon={<Landmark className="size-4" />}
      title="DeFi positions"
      subtitle={`${shortId(stringValue(data.address), 8, 6)} · ${stringValue(data.source, 'unknown')}`}
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Positions" value={String(positions.length)} />
        <Stat label="Source" value={stringValue(data.source, 'Unknown')} />
      </div>
      {positions.length ? (
        <ResultList
          items={positions.slice(0, 6).map((position) => ({
            title: firstString(position, ['protocol', 'platform', 'name', 'poolName', 'type'], 'Position'),
            subtitle: firstString(position, ['asset', 'symbol', 'coinType', 'pool'], 'Sui DeFi'),
            value: usdValue(firstDefined(position, ['usdValue', 'valueUsd', 'value', 'totalValue'])),
          }))}
        />
      ) : (
        <EmptyResult text="No DeFi positions returned." />
      )}
      {warning ? <Warnings warnings={[formatProviderWarning(warning)]} /> : null}
    </Shell>
  );
}

function TrendingCard({ data }: { data: AnyRecord }) {
  const items = extractRecordList(data.items);
  return (
    <Shell icon={<Sparkles className="size-4" />} title="Trending on Sui" subtitle={stringValue(data.source, 'unknown')}>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Results" value={String(items.length)} />
        <Stat label="Source" value={stringValue(data.source, 'Unknown')} />
      </div>
      {items.length ? (
        <ResultList
          items={items.slice(0, 8).map((item) => ({
            title: firstString(item, ['symbol', 'name', 'poolName', 'pair', 'coinSymbol'], 'Sui market'),
            subtitle: firstString(item, ['coinType', 'poolId', 'objectId', 'address'], 'Trending pool'),
            value: metricValue(firstDefined(item, ['volume24H', 'volume24h', 'volume', 'liquidity', 'tvl'])),
          }))}
        />
      ) : (
        <EmptyResult text="No trending markets returned." />
      )}
      {typeof data.warning === 'string' ? <Warnings warnings={[data.warning]} /> : null}
    </Shell>
  );
}

function NftCollectionCard({ data }: { data: AnyRecord }) {
  const detail = recordValue(data.data);
  const name = firstString(detail, ['name', 'collectionName', 'title'], stringValue(data.collection, 'NFT collection'));
  return (
    <Shell icon={<Boxes className="size-4" />} title={name} subtitle={stringValue(data.source, 'unknown')}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Items" value={metricValue(firstDefined(detail, ['items', 'supply', 'totalItems', 'nftCount']))} />
        <Stat label="Owners" value={metricValue(firstDefined(detail, ['owners', 'holderCount', 'ownerCount']))} />
        <Stat label="Floor" value={metricValue(firstDefined(detail, ['floorPrice', 'floor', 'floorPriceMist']))} />
        <Stat label="24h volume" value={metricValue(firstDefined(detail, ['volume24H', 'volume24h', 'volume']))} />
      </div>
      <SummaryRows
        rows={[
          ['Collection', stringValue(data.collection, name)],
          ['Description', firstString(detail, ['description'], '')],
          ['Verified', booleanLabel(firstDefined(detail, ['verified', 'isVerified']))],
        ]}
      />
      {typeof data.warning === 'string' ? <Warnings warnings={[data.warning]} /> : null}
    </Shell>
  );
}

function WriteCard({ data }: { data: AnyRecord }) {
  const action = stringValue(data.action, 'action');
  if (action === 'transfer') return <TransferWriteCard data={data} />;

  const icon = action === 'transfer' ? <Send className="size-4" /> : action === 'swap' ? <Repeat2 className="size-4" /> : <ExternalLink className="size-4" />;
  const href = typeof data.href === 'string' ? data.href : null;
  return (
    <Shell icon={icon} title={`${capitalize(action)} prepared`} subtitle={stringValue(data.status)}>
      <div className="grid gap-2">
        {action === 'swap' ? (
          <>
            <Stat label="Input" value={`${stringValue(data.amountInHuman)} ${coinSymbol(data.tokenIn)}`} />
            <Stat label="Est. output" value={`${stringValue(data.amountOutHuman, 'Unavailable')} ${coinSymbol(data.tokenOut)}`} />
          </>
        ) : (
          <>
            <Stat label="Route" value={`${stringValue(data.fromChain)} to ${stringValue(data.toChain)}`} />
            <Stat label="Amount" value={`${stringValue(data.amount)} ${stringValue(data.token)}`} />
          </>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-[8px] bg-[color:var(--surface)] px-3 py-2">
        <ShieldAlert className="size-4 shrink-0" />
        <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>
          {stringValue(data.message, 'Wallet approval is required outside chat.')}
        </p>
      </div>
      {typeof data.deeplink === 'string' ? (
        <a
          href={data.deeplink}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ size: 'sm' }), 'mt-3')}
        >
          Open route <ExternalLink className="ml-1 size-3" />
        </a>
      ) : null}
      {href ? (
        <Link
          href={href}
          className={cn(buttonVariants({ size: 'sm' }), 'mt-3')}
        >
          {action === 'swap' ? 'Open swap panel' : 'Open local panel'}
        </Link>
      ) : null}
    </Shell>
  );
}

function TransferWriteCard({ data }: { data: AnyRecord }) {
  const recipient = stringValue(data.recipient);
  const recipientInput = stringValue(data.recipientResolvedFrom, recipient);
  const amount = stringValue(data.amount);
  const coinType = stringValue(data.coinType, SUI_COIN_TYPE);
  const symbol = stringValue(data.symbol, coinType.split('::').pop() || 'Token');
  const { suiAddress: embeddedWalletAddress, loading: walletLoading, error: walletError } = useEmbeddedWallet();
  const { balance: availableBalance, loading: balanceLoading } = useCoinBalance(embeddedWalletAddress, coinType);
  const [sendError, setSendError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TransactionResultData | null>(null);

  return (
    <Shell icon={<Send className="size-4" />} title="Transfer prepared" subtitle={stringValue(data.status)}>
      <div className="grid gap-2">
        <Stat label="Recipient" value={shortId(recipientInput || recipient, 8, 6)} />
        {recipientInput && recipient && recipientInput !== recipient ? (
          <Stat label="Resolved" value={shortId(recipient, 8, 6)} />
        ) : null}
        <Stat label="Amount" value={`${amount} ${symbol}`} />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-[8px] bg-[color:var(--surface)] px-3 py-2">
        <ShieldAlert className="size-4 shrink-0" />
        <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>
          {stringValue(data.message, 'Wallet approval is required before signing.')}
        </p>
      </div>
      <div className="mt-3 space-y-2">
        <p className="text-[13px] font-semibold">Review transfer</p>
        {walletLoading ? (
          <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Preparing your embedded wallet...
          </p>
        ) : null}
        {balanceLoading ? (
          <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Checking balance...
          </p>
        ) : null}
        {!walletLoading && !walletError && !embeddedWalletAddress ? (
          <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Embedded wallet is not ready.
          </p>
        ) : null}
        {walletError ? (
          <p className="text-[12px]" style={{ color: 'var(--down)' }}>
            {walletError}
          </p>
        ) : null}
        {sendError ? (
          <p className="text-[12px]" style={{ color: 'var(--down)' }}>
            {sendError}
          </p>
        ) : null}
        <SendButton
          amount={amount}
          coinType={coinType}
          recipientType={detectRecipientType(recipientInput)}
          embeddedWalletAddress={embeddedWalletAddress}
          availableBalance={availableBalance}
          onConfirm={(result) => {
            setSendError(null);
            setTxResult(result);
          }}
          onError={setSendError}
          username={recipientInput}
        />
      </div>
      <div className="mt-3">
        <TransactionResult
          data={txResult}
          network={NETWORK}
          onReset={() => {
            setTxResult(null);
            setSendError(null);
          }}
        />
      </div>
    </Shell>
  );
}

function MandateIntentCard({ data }: { data: AnyRecord }) {
  return (
    <Shell icon={<Landmark className="size-4" />} title="Earn mandate handoff" subtitle="Guided approval required">
      <p className="text-[13px]">{stringValue(data.intent)}</p>
      <Link
        href={stringValue(data.href, '/agent/new')}
        className={cn(buttonVariants({ size: 'sm' }), 'mt-3')}
      >
        Open guided form
      </Link>
    </Shell>
  );
}

function Followups({ data }: { data: AnyRecord }) {
  const questions = arrayOfStrings(data.questions);
  if (!questions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((q) => (
        <span key={q} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[12px]">
          {q}
        </span>
      ))}
    </div>
  );
}

function GenericCard({ icon, title, data }: { icon: ReactNode; title: string; data: AnyRecord }) {
  return (
    <Shell icon={icon} title={title}>
      <SummaryRows rows={Object.entries(data).map(([key, value]) => [labelize(key), displayValue(value)])} />
    </Shell>
  );
}

function ResultList({
  items,
}: {
  items: Array<{ title: string; subtitle: string; value?: string }>;
}) {
  return (
    <div className="mt-3 divide-y divide-[color:var(--border)]">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{item.title}</p>
            <p className="truncate text-[11px]" style={{ color: 'var(--text-soft)' }}>
              {shortMiddle(item.subtitle, 48)}
            </p>
          </div>
          {item.value ? <p className="shrink-0 tabular-nums">{item.value}</p> : null}
        </div>
      ))}
    </div>
  );
}

function SummaryRows({ rows }: { rows: Array<[string, string]> }) {
  const visibleRows = rows.filter(([, value]) => value);
  if (!visibleRows.length) return null;
  return (
    <div className="mt-3 grid gap-2">
      {visibleRows.slice(0, 8).map(([label, value]) => (
        <div key={label} className="rounded-[8px] bg-[color:var(--surface)] px-3 py-2">
          <p className="text-[10px] uppercase" style={{ color: 'var(--text-mute)' }}>
            {label}
          </p>
          <p className="mt-0.5 break-words text-[12px]">{shortMiddle(value, 160)}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyResult({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-[8px] bg-[color:var(--surface)] px-3 py-2" style={{ color: 'var(--text-soft)' }}>
      {text}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[8px] bg-[color:var(--surface)] px-3 py-2">
      <p className="text-[10px] uppercase" style={{ color: 'var(--text-mute)' }}>
        {label}
      </p>
      <p className="mt-0.5 truncate font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="mt-3 rounded-[8px] bg-[color:var(--down-soft)] px-3 py-2 text-[12px]">
      {warnings.slice(0, 3).map(formatProviderWarning).join(' ')}
    </div>
  );
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value ? value : fallback;
}

function coinSymbol(value: unknown): string {
  const record = recordValue(value);
  const symbol = stringValue(record.symbol);
  if (symbol && symbol !== '?') return symbol;
  const coinType = stringValue(record.coinType);
  return coinType.split('::').pop() || 'Token';
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 });
}

function usdValue(value: unknown): string {
  const number = numberValue(value);
  return number === null ? '$0' : `$${formatNumber(number)}`;
}

function percentValue(value: unknown): string {
  const number = numberValue(value);
  if (number === null) return 'Unavailable';
  return `${number >= 0 ? '+' : ''}${formatNumber(number)}%`;
}

function metricValue(value: unknown): string {
  const number = numberValue(value);
  if (number !== null) return formatNumber(number);
  return stringValue(value, 'Unavailable');
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function formatProviderWarning(warning: string): string {
  if (/\bBlockVision \d{3}\b/.test(warning)) return 'Provider data is unavailable right now.';
  return warning;
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function shortMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.floor(max / 2))}...${value.slice(-Math.floor(max / 2))}`;
}

function extractRecordList(value: unknown): AnyRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ['data', 'items', 'list', 'pools', 'positions', 'collections']) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
  }
  return [];
}

function recordValue(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstDefined(record: AnyRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function firstString(record: AnyRecord, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return formatNumber(value);
  if (typeof value === 'boolean') return booleanLabel(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (isRecord(value)) return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}`;
  return '';
}

function booleanLabel(value: unknown): string {
  if (typeof value !== 'boolean') return '';
  return value ? 'Yes' : 'No';
}

function labelize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
