import type { ChainTokenSelected, FormFieldChanged } from '@lifi/widget';

interface OptionalChainTokenSelected {
  chainId?: number;
  tokenAddress?: string;
}

export interface ChainTokenFormDraft {
  source: OptionalChainTokenSelected;
  destination: OptionalChainTokenSelected;
}

export interface ChainTokenFormSyncSeed {
  source?: OptionalChainTokenSelected;
  destination?: OptionalChainTokenSelected;
}

export interface ChainTokenFormSyncResult {
  source?: ChainTokenSelected;
  destination?: ChainTokenSelected;
}

const normalizeChainId = (value: unknown): number | undefined => {
  const chainId = Number(value);
  return Number.isFinite(chainId) ? chainId : undefined;
};

const normalizeTokenAddress = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const completeSelection = (
  draft: OptionalChainTokenSelected,
): ChainTokenSelected | undefined =>
  draft.chainId && draft.tokenAddress
    ? {
        chainId: draft.chainId,
        tokenAddress: draft.tokenAddress,
      }
    : undefined;

export const createChainTokenFormDraft = (
  seed: ChainTokenFormSyncSeed = {},
): ChainTokenFormDraft => ({
  source: { ...seed.source },
  destination: { ...seed.destination },
});

export const applyChainTokenFormFieldChange = (
  draft: ChainTokenFormDraft,
  formFieldData: FormFieldChanged,
): ChainTokenFormSyncResult => {
  if (!formFieldData) {
    return {};
  }

  const emitSource = (): ChainTokenFormSyncResult => {
    const source = completeSelection(draft.source);
    return source ? { source } : {};
  };
  const emitDestination = (): ChainTokenFormSyncResult => {
    const destination = completeSelection(draft.destination);
    return destination ? { destination } : {};
  };

  switch (formFieldData.fieldName) {
    case 'fromChain':
      draft.source.chainId = normalizeChainId(formFieldData.newValue);
      draft.source.tokenAddress = undefined;
      return {};
    case 'fromToken':
      draft.source.tokenAddress = normalizeTokenAddress(formFieldData.newValue);
      return emitSource();
    case 'toChain':
      draft.destination.chainId = normalizeChainId(formFieldData.newValue);
      draft.destination.tokenAddress = undefined;
      return {};
    case 'toToken':
      draft.destination.tokenAddress = normalizeTokenAddress(
        formFieldData.newValue,
      );
      return emitDestination();
    default:
      return {};
  }
};
