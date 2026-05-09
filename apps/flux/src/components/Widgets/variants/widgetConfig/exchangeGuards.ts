import { ChainId, type WidgetConfig } from '@lifi/widget';
import type { FormData } from './types';

const AFTERMATH_EXCHANGE_KEY = 'aftermath';

const normalizeChainId = (
  chainId?: string | number,
): number | undefined => {
  if (chainId === undefined || chainId === null || chainId === '') {
    return undefined;
  }

  const normalized = Number(chainId);
  return Number.isFinite(normalized) ? normalized : undefined;
};

export const isSuiRoute = (formData?: FormData): boolean => {
  return isSuiRouteForChainIds(
    formData?.sourceChain?.chainId,
    formData?.destinationChain?.chainId,
  );
};

export const isSuiRouteForChainIds = (
  sourceChainId?: string | number,
  destinationChainId?: string | number,
): boolean => {
  const normalizedSourceChainId = normalizeChainId(sourceChainId);
  const normalizedDestinationChainId = normalizeChainId(destinationChainId);
  return (
    normalizedSourceChainId === ChainId.SUI ||
    normalizedDestinationChainId === ChainId.SUI
  );
};

export const applySuiExchangeGuardsForChainIds = (
  exchanges: WidgetConfig['exchanges'],
  sourceChainId?: string | number,
  destinationChainId?: string | number,
): WidgetConfig['exchanges'] => {
  if (!isSuiRouteForChainIds(sourceChainId, destinationChainId)) {
    return exchanges;
  }

  const allow = exchanges?.allow?.filter(
    (exchange) => exchange !== AFTERMATH_EXCHANGE_KEY,
  );
  const deny = Array.from(
    new Set([...(exchanges?.deny ?? []), AFTERMATH_EXCHANGE_KEY]),
  );

  return {
    ...(allow?.length ? { allow } : {}),
    ...(deny.length ? { deny } : {}),
  };
};

export const applySuiExchangeGuards = (
  exchanges: WidgetConfig['exchanges'],
  formData?: FormData,
): WidgetConfig['exchanges'] =>
  applySuiExchangeGuardsForChainIds(
    exchanges,
    formData?.sourceChain?.chainId,
    formData?.destinationChain?.chainId,
  );
