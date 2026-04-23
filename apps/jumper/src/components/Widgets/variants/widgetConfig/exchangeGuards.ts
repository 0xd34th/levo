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
  const sourceChainId = normalizeChainId(formData?.sourceChain?.chainId);
  const destinationChainId = normalizeChainId(
    formData?.destinationChain?.chainId,
  );

  return (
    sourceChainId === ChainId.SUI || destinationChainId === ChainId.SUI
  );
};

export const applySuiExchangeGuards = (
  exchanges: WidgetConfig['exchanges'],
  formData?: FormData,
): WidgetConfig['exchanges'] => {
  if (!isSuiRoute(formData)) {
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
