import { useEffect, useState } from 'react';

interface ChainToken {
  chainId: number | undefined;
  token: string | undefined;
}

export interface ChainTokenSelection {
  sourceChainToken: ChainToken;
  destinationChainToken: ChainToken;
  toAddress?: string;
  fromAmount?: string;
}

const emptySelection: ChainTokenSelection = {
  sourceChainToken: {
    chainId: undefined,
    token: undefined,
  },
  destinationChainToken: {
    chainId: undefined,
    token: undefined,
  },
  toAddress: undefined,
  fromAmount: undefined,
};

const parseChainId = (value: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }
  const chainId = Number(value);
  return Number.isFinite(chainId) ? chainId : undefined;
};

export const parseChainTokenUrlParams = (
  search: string | undefined,
): ChainTokenSelection => {
  if (!search) {
    return emptySelection;
  }

  const queryParameters = new URLSearchParams(search);
  const fromChain = queryParameters.get('fromChain');
  const toChain = queryParameters.get('toChain');
  const fromToken = queryParameters.get('fromToken');
  const toToken = queryParameters.get('toToken');
  const toAddress = queryParameters.get('toAddress');
  const fromAmount = queryParameters.get('fromAmount');

  return {
    sourceChainToken: {
      chainId: parseChainId(fromChain),
      token: fromToken ?? undefined,
    },
    destinationChainToken: {
      chainId: parseChainId(toChain),
      token: toToken ?? undefined,
    },
    toAddress: toAddress ?? undefined,
    fromAmount: fromAmount ?? undefined,
  };
};

const getCurrentUrlParams = (): ChainTokenSelection => {
  if (typeof window === 'undefined') {
    return emptySelection;
  }
  return parseChainTokenUrlParams(window.location.search);
};

export const useUrlParams = (): ChainTokenSelection => {
  const [urlParams, setUrlParams] =
    useState<ChainTokenSelection>(getCurrentUrlParams);

  useEffect(() => {
    const updateSelection = () => {
      setUrlParams(getCurrentUrlParams());
    };

    // Initial update
    updateSelection();

    // Listen for changes in the URL
    window.addEventListener('popstate', updateSelection);

    // Clean up the event listener
    return () => {
      window.removeEventListener('popstate', updateSelection);
    };
  }, []);

  return urlParams;
};
