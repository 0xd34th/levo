import { useMemo } from 'react';
import type {
  BaseToken as LifiBaseToken,
  Token as LifiToken,
  TokensResponse,
} from '@lifi/sdk';
import type { WidgetConfig } from '@lifi/widget';
import { isWidgetAllowedChainId } from '@/config/chains';
import type { AssetGroup } from '@/types/assets';
import type { BaseToken } from '@/types/tokens';
import { useTokens } from './useTokens';

const symbolFallbackKey = (symbol: string) => `symbol:${symbol.toUpperCase()}`;

export const groupKeyFor = (token: Pick<LifiToken, 'coinKey' | 'symbol'>) =>
  token.coinKey ? `coin:${token.coinKey}` : symbolFallbackKey(token.symbol);

type AssetGroupFormType = 'from' | 'to';
type AssetTokenInput = LifiToken;
type TokenConstraint = Pick<LifiBaseToken, 'address' | 'chainId'>;
type TokenAllowDeny = {
  allow?: TokenConstraint[];
  deny?: TokenConstraint[];
};

const toBaseToken = (token: AssetTokenInput): BaseToken => ({
  type: 'base',
  address: token.address,
  symbol: token.symbol,
  name: token.name,
  decimals: token.decimals,
  logoURI: token.logoURI,
  chainId: token.chainId,
  coinKey: token.coinKey,
  tags: token.tags,
});

const isNumberAllowed = (
  value: number,
  items?: { allow?: number[]; deny?: number[] },
) => {
  if (items?.allow?.length) {
    return items.allow.includes(value);
  }
  return !(items?.deny ?? []).includes(value);
};

const isChainAllowed = (
  chainId: number,
  chains: WidgetConfig['chains'] | undefined,
  formType: AssetGroupFormType | undefined,
) =>
  isNumberAllowed(chainId, chains) &&
  (formType ? isNumberAllowed(chainId, chains?.[formType]) : true);

const sameToken = (token: BaseToken, allowedToken: TokenConstraint) =>
  Number(allowedToken.chainId) === token.chainId &&
  allowedToken.address.toLowerCase() === token.address.toLowerCase();

const isTokenAllowed = (
  token: BaseToken,
  items: TokenAllowDeny | undefined,
) => {
  const allow = (items?.allow ?? []).filter(
    (allowedToken) => Number(allowedToken.chainId) === token.chainId,
  );
  if (allow.length) {
    return allow.some((allowedToken) => sameToken(token, allowedToken));
  }
  return !(items?.deny ?? []).some((deniedToken) =>
    sameToken(token, deniedToken),
  );
};

const isTokenAllowedForForm = (
  token: BaseToken,
  tokens: WidgetConfig['tokens'] | undefined,
  formType: AssetGroupFormType | undefined,
) =>
  isTokenAllowed(token, tokens) &&
  (formType ? isTokenAllowed(token, tokens?.[formType]) : true);

export interface UseAssetGroupsOptions {
  filterAllowedChains?: boolean;
  chains?: WidgetConfig['chains'];
  formType?: AssetGroupFormType;
  tokens?: WidgetConfig['tokens'];
}

export interface UseAssetGroupsResult {
  groups: AssetGroup[];
  isLoading: boolean;
  isError: boolean;
  byId: Map<string, AssetGroup>;
}

export const buildAssetGroups = (
  dataTokens: TokensResponse['tokens'] | undefined,
  options: UseAssetGroupsOptions = {},
): AssetGroup[] => {
  if (!dataTokens) {
    return [];
  }
  const {
    chains,
    filterAllowedChains = true,
    formType,
    tokens: widgetTokens,
  } = options;
  const map = new Map<string, AssetGroup>();

  const addToken = (token: AssetTokenInput) => {
    const instance = toBaseToken(token);
    if (filterAllowedChains && !isWidgetAllowedChainId(instance.chainId)) {
      return;
    }
    if (!isChainAllowed(instance.chainId, chains, formType)) {
      return;
    }
    if (!isTokenAllowedForForm(instance, widgetTokens, formType)) {
      return;
    }

    const key = groupKeyFor(instance);
    const existing = map.get(key);
    if (existing) {
      if (!existing.instances.some((t) => t.chainId === instance.chainId)) {
        existing.instances.push(instance);
      }
    } else {
      map.set(key, {
        id: key,
        symbol: instance.symbol,
        name: instance.name,
        logoURI: instance.logoURI,
        instances: [instance],
      });
    }
  };

  for (const chainTokens of Object.values(dataTokens)) {
    for (const token of chainTokens as LifiToken[]) {
      addToken(token);
    }
  }
  for (const token of widgetTokens?.include ?? []) {
    addToken(token);
  }

  // Post-pass: when a coinKey-less group (`symbol:X`) shares its symbol with
  // exactly one coinKey-anchored group (`coin:Y` whose `.symbol === X`),
  // merge the symbol-group's instances into that coin-group. This collapses
  // the SUI / SOL / HYPE-style split where LiFi only assigns a coinKey to
  // the canonical chain's variant and leaves bridged variants without one.
  // Conservative: skip when zero or multiple coin candidates match, so
  // symbol-collisions like USDT vs USDT.e never get force-merged.
  const coinGroupsBySymbol = new Map<string, AssetGroup[]>();
  for (const group of map.values()) {
    if (!group.id.startsWith('coin:')) {
      continue;
    }
    const sym = group.symbol.toUpperCase();
    const list = coinGroupsBySymbol.get(sym) ?? [];
    list.push(group);
    coinGroupsBySymbol.set(sym, list);
  }
  for (const [id, group] of Array.from(map.entries())) {
    if (!id.startsWith('symbol:')) {
      continue;
    }
    const candidates = coinGroupsBySymbol.get(group.symbol.toUpperCase());
    if (!candidates || candidates.length !== 1) {
      continue;
    }
    const target = candidates[0];
    for (const inst of group.instances) {
      if (!target.instances.some((t) => t.chainId === inst.chainId)) {
        target.instances.push(inst);
      }
    }
    map.delete(id);
  }

  return Array.from(map.values()).sort(
    (a, b) => b.instances.length - a.instances.length,
  );
};

export const useAssetGroups = (
  options: UseAssetGroupsOptions = {},
): UseAssetGroupsResult => {
  const { tokens: dataTokens, isLoading, isError } = useTokens();
  const {
    chains,
    filterAllowedChains = true,
    formType,
    tokens: widgetTokens,
  } = options;

  const groups = useMemo<AssetGroup[]>(() => {
    return buildAssetGroups(dataTokens, {
      chains,
      filterAllowedChains,
      formType,
      tokens: widgetTokens,
    });
  }, [chains, dataTokens, filterAllowedChains, formType, widgetTokens]);

  const byId = useMemo(() => {
    const m = new Map<string, AssetGroup>();
    for (const g of groups) {m.set(g.id, g);}
    return m;
  }, [groups]);

  return { groups, isLoading, isError, byId };
};

export const useAssetGroup = (id?: string): AssetGroup | undefined => {
  const { byId } = useAssetGroups();
  return id ? byId.get(id) : undefined;
};
