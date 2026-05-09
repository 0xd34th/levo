'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '@lifi/sdk';
import { getRoutes } from '@lifi/sdk';
import type { WidgetConfig } from '@lifi/widget';
import { parseUnits } from 'viem';
import { sdkClient } from '@/utils/instrumentation/lifiSdkConfig';
import { isWidgetAllowedChainId } from '@/config/chains';
import type { AssetGroup } from '@/types/assets';
import type { BaseToken } from '@/types/tokens';
import { calcPriceImpact } from '@/utils/routes/routeAmounts';
import { applySuiExchangeGuardsForChainIds } from '@/components/Widgets/variants/widgetConfig/exchangeGuards';

type RoutesRequest = Parameters<typeof getRoutes>[1];
type RoutesRequestOptions = NonNullable<RoutesRequest['options']>;
type WidgetRouteOptions = NonNullable<
  NonNullable<WidgetConfig['sdkConfig']>['routeOptions']
>;

export interface BestRouteConstraints {
  bridges?: WidgetConfig['bridges'];
  exchanges?: WidgetConfig['exchanges'];
  routeOptions?: WidgetRouteOptions;
  fee?: WidgetConfig['fee'];
  slippage?: WidgetConfig['slippage'];
  routePriority?: WidgetConfig['routePriority'];
  useRelayerRoutes?: WidgetConfig['useRelayerRoutes'];
}

export interface BestRouteCandidate {
  fromToken: BaseToken;
  toToken: BaseToken;
  route: Route;
  toAmountUSD: number;
  netUSD: number;
  priceImpact: number;
  isBridge: boolean;
}

export interface UseBestRouteResult {
  best: BestRouteCandidate | undefined;
  alternatives: BestRouteCandidate[];
  isLoading: boolean;
  isError: boolean;
  /** Total candidate pairs we attempted to quote in the latest run */
  attempted: number;
}

export interface UseBestRouteParams extends BestRouteConstraints {
  fromAsset?: AssetGroup;
  toAsset?: AssetGroup;
  /**
   * Human-readable display amount (e.g. "1.5"), as the widget's AmountInput
   * stores it. Converted to per-pair raw units via parseUnits(amount,
   * fromToken.decimals) before each getRoutes call.
   */
  fromAmount?: string;
  /** Address that pays — passed as fromAddress on quote requests. Optional. */
  fromAddress?: string;
  /** Cap on number of (fromChain, toChain) pairs to fan out per request. */
  maxPairsToFanout?: number;
  /** Debounce window for amount/asset changes (ms). */
  debounceMs?: number;
  enabled?: boolean;
}

export const shouldEnableBestRouteFanout = ({
  enabled,
  useRelayerRoutes,
}: Pick<UseBestRouteParams, 'enabled' | 'useRelayerRoutes'>) =>
  enabled !== false && !useRelayerRoutes;

const DEFAULT_MAX_PAIRS = 6;
const DEFAULT_DEBOUNCE_MS = 400;

const PRICE_IMPACT_PENALTY_THRESHOLD = 0.005; // 0.5%
const PRICE_IMPACT_PENALTY_WEIGHT = 0.5; // each 1% over threshold => 0.5% net penalty

interface CandidatePair {
  fromToken: BaseToken;
  toToken: BaseToken;
  /** Lower = preferred (same-chain, more-liquid chain) */
  priority: number;
}

const sameChainBonus = -1000;
const popularityWeight = -1; // less negative => lower priority

/**
 * Build candidate (fromChain, toChain) pairs intersecting both assets'
 * available chains, filtered to widget-allowed chains.
 */
export const buildCandidatePairs = (
  fromAsset: AssetGroup,
  toAsset: AssetGroup,
): CandidatePair[] => {
  const fromInstances = fromAsset.instances.filter((t) =>
    isWidgetAllowedChainId(t.chainId),
  );
  const toInstances = toAsset.instances.filter((t) =>
    isWidgetAllowedChainId(t.chainId),
  );
  const totalChains = new Set<number>([
    ...fromInstances.map((t) => t.chainId),
    ...toInstances.map((t) => t.chainId),
  ]).size;

  const pairs: CandidatePair[] = [];
  for (const fromToken of fromInstances) {
    for (const toToken of toInstances) {
      const isSameChain = fromToken.chainId === toToken.chainId;
      const popularity =
        fromInstances.length + toInstances.length + totalChains;
      const priority =
        (isSameChain ? sameChainBonus : 0) + popularity * popularityWeight;
      pairs.push({ fromToken, toToken, priority });
    }
  }
  pairs.sort((a, b) => a.priority - b.priority);
  return pairs;
};

/**
 * Score a route by net USD value (output - gas - fees) with a penalty for
 * high price impact (computed from fromAmountUSD vs toAmountUSD per
 * calcPriceImpact in utils/routes/routeAmounts).
 */
export const scoreRoute = (route: Route): { netUSD: number; priceImpact: number } => {
  const toAmountUSD = Number.parseFloat(route.toAmountUSD ?? '0');
  const gasCostUSD = (route.gasCostUSD ? Number.parseFloat(route.gasCostUSD) : 0) || 0;
  const feeCostUSD =
    route.steps?.reduce((sum, step) => {
      const fees = step.estimate?.feeCosts ?? [];
      return (
        sum +
        fees.reduce(
          (s, f) => s + (f.amountUSD ? Number.parseFloat(f.amountUSD) : 0),
          0,
        )
      );
    }, 0) ?? 0;
  const priceImpact = Math.abs(calcPriceImpact(route));
  const overImpact = Math.max(0, priceImpact - PRICE_IMPACT_PENALTY_THRESHOLD);
  const penaltyUSD = toAmountUSD * overImpact * PRICE_IMPACT_PENALTY_WEIGHT;
  const netUSD = toAmountUSD - gasCostUSD - feeCostUSD - penaltyUSD;
  return { netUSD, priceImpact };
};

const isBridgeRoute = (route: Route): boolean =>
  Boolean(route.fromChainId && route.toChainId && route.fromChainId !== route.toChainId);

/**
 * Convert a widget display amount (e.g. "1.5") to LI.FI's raw `fromAmount`
 * string using the source token's decimals. Exported so the fanout and its
 * regression tests share the exact same conversion contract.
 */
export const toRawFromAmount = (
  displayAmount: string,
  decimals: number,
): string => parseUnits(displayAmount, decimals).toString();

export const buildBestRouteRequestOptions = (
  constraints: BestRouteConstraints,
  fromToken: BaseToken,
  toToken: BaseToken,
): RoutesRequestOptions | undefined => {
  const exchanges = applySuiExchangeGuardsForChainIds(
    constraints.exchanges,
    fromToken.chainId,
    toToken.chainId,
  );
  const options: RoutesRequestOptions = {
    ...constraints.routeOptions,
    ...(constraints.bridges ? { bridges: constraints.bridges } : {}),
    ...(exchanges ? { exchanges } : {}),
    ...(constraints.fee !== undefined ? { fee: constraints.fee } : {}),
    ...(constraints.slippage !== undefined
      ? { slippage: constraints.slippage }
      : {}),
    ...(constraints.routePriority
      ? { order: constraints.routePriority }
      : {}),
  };

  return Object.keys(options).length > 0 ? options : undefined;
};

const canQuote = (params: UseBestRouteParams): params is Required<
  Pick<UseBestRouteParams, 'fromAsset' | 'toAsset' | 'fromAmount'>
> &
  UseBestRouteParams => {
  if (!shouldEnableBestRouteFanout(params)) {
    return false;
  }
  if (!params.fromAsset || !params.toAsset) {
    return false;
  }
  if (!params.fromAmount) {
    return false;
  }
  // fromAmount is a display value (e.g. "1.5"), not raw token units. Validate
  // it parses as a positive finite number; per-pair raw conversion happens at
  // quote time using each fromToken's decimals.
  const parsed = Number.parseFloat(params.fromAmount);
  return Number.isFinite(parsed) && parsed > 0;
};

export const useBestRoute = (
  params: UseBestRouteParams,
): UseBestRouteResult => {
  const {
    maxPairsToFanout = DEFAULT_MAX_PAIRS,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = params;

  const [results, setResults] = useState<BestRouteCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [attempted, setAttempted] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestKey = useMemo(() => {
    if (!canQuote(params)) {
      return null;
    }
    return JSON.stringify({
      from: params.fromAsset!.id,
      to: params.toAsset!.id,
      amount: params.fromAmount,
      addr: params.fromAddress ?? '',
      bridges: params.bridges,
      exchanges: params.exchanges,
      routeOptions: params.routeOptions,
      fee: params.fee,
      slippage: params.slippage,
      routePriority: params.routePriority,
      useRelayerRoutes: params.useRelayerRoutes,
    });
    // Tracking individual fields keeps the key stable when params object identity
    // changes but its values don't (avoids re-firing the fanout on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.fromAsset?.id,
    params.toAsset?.id,
    params.fromAmount,
    params.fromAddress,
    params.enabled,
    params.bridges,
    params.exchanges,
    params.routeOptions,
    params.fee,
    params.slippage,
    params.routePriority,
    params.useRelayerRoutes,
  ]);

  useEffect(() => {
    if (debounceRef.current) {clearTimeout(debounceRef.current);}
    if (abortRef.current) {abortRef.current.abort();}

    if (!requestKey || !canQuote(params)) {
      setResults([]);
      setIsLoading(false);
      setIsError(false);
      setAttempted(0);
      return;
    }

    setIsLoading(true);
    setIsError(false);

    const fromAsset = params.fromAsset!;
    const toAsset = params.toAsset!;
    const fromAmount = params.fromAmount!;
    const fromAddress = params.fromAddress;

    const pairs = buildCandidatePairs(fromAsset, toAsset).slice(
      0,
      maxPairsToFanout,
    );
    setAttempted(pairs.length);

    if (pairs.length === 0) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      const accumulated: BestRouteCandidate[] = [];

      Promise.allSettled(
        pairs.map(async ({ fromToken, toToken }) => {
          // Convert the display amount to raw units using this pair's source
          // token decimals. Decimals can vary across chains (e.g. USDT is 6 on
          // ETH and 18 on BSC), so we cannot share a single raw amount across
          // pairs.
          const rawFromAmount = toRawFromAmount(fromAmount, fromToken.decimals);
          const options = buildBestRouteRequestOptions(
            params,
            fromToken,
            toToken,
          );
          const response = await getRoutes(
            sdkClient,
            {
              fromChainId: fromToken.chainId,
              fromTokenAddress: fromToken.address,
              toChainId: toToken.chainId,
              toTokenAddress: toToken.address,
              fromAmount: rawFromAmount,
              fromAddress,
              ...(options ? { options } : {}),
            },
            { signal: controller.signal },
          );
          const route = response.routes?.[0];
          if (!route) {return null;}
          const { netUSD, priceImpact } = scoreRoute(route);
          const candidate: BestRouteCandidate = {
            fromToken,
            toToken,
            route,
            toAmountUSD: Number.parseFloat(route.toAmountUSD ?? '0'),
            netUSD,
            priceImpact,
            isBridge: isBridgeRoute(route),
          };
          accumulated.push(candidate);
          accumulated.sort((a, b) => b.netUSD - a.netUSD);
          if (!controller.signal.aborted) {
            setResults([...accumulated]);
          }
          return candidate;
        }),
      )
        .then((settled) => {
          if (controller.signal.aborted) {return;}
          const anySuccess = settled.some(
            (s) => s.status === 'fulfilled' && s.value !== null,
          );
          if (!anySuccess) {setIsError(true);}
        })
        .finally(() => {
          if (!controller.signal.aborted) {setIsLoading(false);}
        });
    }, debounceMs);

    return () => {
      if (debounceRef.current) {clearTimeout(debounceRef.current);}
      if (abortRef.current) {abortRef.current.abort();}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, maxPairsToFanout, debounceMs]);

  return useMemo(() => {
    const sorted = [...results].sort((a, b) => b.netUSD - a.netUSD);
    return {
      best: sorted[0],
      alternatives: sorted.slice(1),
      isLoading,
      isError,
      attempted,
    };
  }, [results, isLoading, isError, attempted]);
};
