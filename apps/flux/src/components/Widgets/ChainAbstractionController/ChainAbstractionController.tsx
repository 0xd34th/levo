'use client';

import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormState, FormFieldChanged } from '@lifi/widget';
import type { WidgetConfig } from '@lifi/widget';
import { widgetEvents } from '@lifi/widget';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AssetPicker } from '@/components/composite/AssetPicker';
import {
  ChainChip,
  type ChainChipOption,
} from '@/components/composite/ChainChip/ChainChip';
import { useAssetGroups } from '@/hooks/useAssetGroups';
import {
  type BestRouteConstraints,
  useBestRoute,
} from '@/hooks/useBestRoute';
import type { AssetGroup } from '@/types/assets';
import { findInstance } from '@/types/assets';
import { useChainTokenSelectionStore } from '@/stores/chainTokenSelection/ChainTokenSelectionStore';
import { useAccount } from '@lifi/wallet-management';
import { useAvailableToChainTypes } from '@/hooks/useAvailableToChainTypes';
import { useChains } from '@/hooks/useChains';
import { useUrlParams } from '@/hooks/useUrlParams';
import {
  buildDestinationChainOptions,
  buildQuoteAllowedToChainIds,
  resolveEffectiveDestinationChainId,
  resolveInitialAssetSelection,
  resolveSelectionInput,
  sanitizeDestinationChainOverride,
} from './selection';

interface ChainAbstractionControllerProps extends BestRouteConstraints {
  chains?: WidgetConfig['chains'];
  formRef: React.RefObject<FormState | null>;
  initialFromChain?: number;
  initialFromToken?: string;
  initialToChain?: number;
  initialToToken?: string;
  tokens?: WidgetConfig['tokens'];
}

const setField = (
  formRef: React.RefObject<FormState | null>,
  fieldName: 'fromChain' | 'toChain' | 'fromToken' | 'toToken',
  value: number | string,
) => {
  formRef.current?.setFieldValue(fieldName, value as never, {
    setUrlSearchParam: true,
  });
};

export const ChainAbstractionController: FC<ChainAbstractionControllerProps> = ({
  bridges,
  chains,
  exchanges,
  fee,
  formRef,
  initialFromChain,
  initialFromToken,
  initialToChain,
  initialToToken,
  routeOptions,
  routePriority,
  slippage,
  tokens,
  useRelayerRoutes,
}) => {
  const { groups: fromGroups } = useAssetGroups({
    chains,
    formType: 'from',
    tokens,
  });
  const { groups: toGroups } = useAssetGroups({
    chains,
    formType: 'to',
    tokens,
  });
  const { account } = useAccount();
  const { getChainById, isSuccess: chainsLoaded } = useChains();
  const availableToChainTypes = useAvailableToChainTypes();
  const {
    sourceChainToken: sourceChainTokenUrlParam,
    destinationChainToken: destinationChainTokenUrlParam,
  } = useUrlParams();
  const sourceSelection = useChainTokenSelectionStore(
    (s) => s.sourceChainToken,
  );
  const destinationSelection = useChainTokenSelectionStore(
    (s) => s.destinationChainToken,
  );
  const sourceChainId = sourceSelection.chainId;
  const sourceTokenAddress = sourceSelection.tokenAddress;
  const destinationChainId = destinationSelection.chainId;
  const destinationTokenAddress = destinationSelection.tokenAddress;
  const sourceUrlSelection = useMemo(
    () => ({
      chainId: sourceChainTokenUrlParam.chainId,
      tokenAddress: sourceChainTokenUrlParam.token,
    }),
    [sourceChainTokenUrlParam.chainId, sourceChainTokenUrlParam.token],
  );
  const destinationUrlSelection = useMemo(
    () => ({
      chainId: destinationChainTokenUrlParam.chainId,
      tokenAddress: destinationChainTokenUrlParam.token,
    }),
    [
      destinationChainTokenUrlParam.chainId,
      destinationChainTokenUrlParam.token,
    ],
  );

  // Selected asset groups (logical assets)
  const [fromAsset, setFromAsset] = useState<AssetGroup | undefined>();
  const [toAsset, setToAsset] = useState<AssetGroup | undefined>();
  // User-overridden source chain (undefined = auto, follow useBestRoute).
  const [fromChainOverride, setFromChainOverride] = useState<number | undefined>();
  const [toChainOverride, setToChainOverride] = useState<number | undefined>(
    () => destinationUrlSelection.chainId ?? destinationChainId ?? initialToChain,
  );
  // Live fromAmount mirrored from the widget's AmountInput
  const [fromAmount, setFromAmount] = useState<string | undefined>();

  // Hydrate selected assets from URL/store first, then widget config defaults.
  useEffect(() => {
    if (!fromGroups.length && !toGroups.length) {
      return;
    }
    if (!fromAsset) {
      const candidate = resolveInitialAssetSelection(
        fromGroups,
        resolveSelectionInput(sourceUrlSelection, {
          chainId: sourceChainId,
          tokenAddress: sourceTokenAddress,
        }),
        { chainId: initialFromChain, tokenAddress: initialFromToken },
      );
      if (candidate) {
        setFromAsset(candidate.asset);
        setFromChainOverride(candidate.chainId);
      }
    }
    if (!toAsset) {
      const candidate = resolveInitialAssetSelection(
        toGroups,
        resolveSelectionInput(destinationUrlSelection, {
          chainId: destinationChainId,
          tokenAddress: destinationTokenAddress,
        }),
        {
          chainId: initialToChain,
          tokenAddress: initialToToken,
        },
      );
      if (candidate) {
        setToAsset(candidate.asset);
        setToChainOverride(candidate.chainId);
      }
    }
  }, [
    fromGroups,
    toGroups,
    sourceChainId,
    sourceTokenAddress,
    destinationChainId,
    destinationTokenAddress,
    sourceUrlSelection,
    destinationUrlSelection,
    initialFromChain,
    initialFromToken,
    initialToChain,
    initialToToken,
    fromAsset,
    toAsset,
  ]);

  useEffect(() => {
    if (!fromAsset) {return;}
    const constrainedAsset = fromGroups.find((group) => group.id === fromAsset.id);
    if (!constrainedAsset) {
      setFromAsset(undefined);
      setFromChainOverride(undefined);
      return;
    }
    if (
      fromChainOverride &&
      !findInstance(constrainedAsset, fromChainOverride)
    ) {
      setFromChainOverride(undefined);
    }
    if (constrainedAsset !== fromAsset) {
      setFromAsset(constrainedAsset);
    }
  }, [fromAsset, fromChainOverride, fromGroups]);

  useEffect(() => {
    if (!toAsset) {return;}
    const constrainedAsset = toGroups.find((group) => group.id === toAsset.id);
    if (!constrainedAsset) {
      setToAsset(undefined);
      setToChainOverride(undefined);
      return;
    }
    if (constrainedAsset !== toAsset) {
      setToAsset(constrainedAsset);
    }
  }, [toAsset, toGroups]);

  // Listen to widget formFieldChanged events to mirror fromAmount.
  useEffect(() => {
    const handler = (event?: FormFieldChanged) => {
      if (!event || event.fieldName !== 'fromAmount') {return;}
      const next = event.newValue;
      setFromAmount(
        next === undefined || next === null ? undefined : String(next),
      );
    };
    widgetEvents.on('formFieldChanged', handler);
    return () => {
      widgetEvents.off('formFieldChanged', handler);
    };
  }, []);

  const fromAddress = account?.address;

  // Constrain destination auto-pick to chain types the user can actually
  // receive on. Avoids the bug where we auto-pick a chain in an ecosystem
  // the user has no wallet for, then writing a wrong-ecosystem toAddress
  // makes LiFi return zero routes. `undefined` = pre-auth, no constraint.
  const receivableToChainIds = useMemo(() => {
    if (!availableToChainTypes || !toAsset || !chainsLoaded) {
      return undefined;
    }
    const allowed = new Set<number>();
    for (const instance of toAsset.instances) {
      const chainType = getChainById(instance.chainId)?.chainType;
      if (chainType && availableToChainTypes.has(chainType)) {
        allowed.add(instance.chainId);
      }
    }
    return allowed;
  }, [availableToChainTypes, toAsset, getChainById, chainsLoaded]);

  const validToChainOverride = useMemo(
    () =>
      sanitizeDestinationChainOverride({
        asset: toAsset,
        toChainOverride,
      }),
    [toAsset, toChainOverride],
  );

  const quoteAllowedToChainIds = useMemo(
    () =>
      buildQuoteAllowedToChainIds({
        receivableToChainIds,
        toChainOverride: validToChainOverride,
      }),
    [receivableToChainIds, validToChainOverride],
  );

  const bestRoute = useBestRoute({
    fromAsset,
    toAsset,
    fromAmount,
    fromAddress,
    bridges,
    exchanges,
    fee,
    routeOptions,
    routePriority,
    slippage,
    useRelayerRoutes,
    allowedToChainIds: quoteAllowedToChainIds,
  });

  // Auto-selected chains (best-rate). Source can be user-overridden;
  // destination can be user-overridden.
  const autoFromChainId = bestRoute.best?.fromToken.chainId;
  const autoToChainId = bestRoute.best?.toToken.chainId;

  const effectiveFromChainId =
    fromChainOverride ?? autoFromChainId ?? fromAsset?.instances[0]?.chainId;
  const effectiveToChainId = resolveEffectiveDestinationChainId({
    asset: toAsset,
    autoAllowedToChainIds: receivableToChainIds,
    toChainOverride,
    autoToChainId,
  });

  const selectedToChainName = effectiveToChainId
    ? getChainById(effectiveToChainId)?.name
    : undefined;

  useEffect(() => {
    if (!toAsset) {return;}
    if (validToChainOverride !== toChainOverride) {
      setToChainOverride(validToChainOverride);
    }
  }, [toAsset, toChainOverride, validToChainOverride]);

  // Push selection back to the LI.FI widget via formRef.
  useEffect(() => {
    if (!fromAsset || !effectiveFromChainId) {return;}
    const instance = findInstance(fromAsset, effectiveFromChainId);
    if (!instance) {return;}
    setField(formRef, 'fromChain', effectiveFromChainId);
    setField(formRef, 'fromToken', instance.address);
  }, [formRef, fromAsset, effectiveFromChainId]);

  useEffect(() => {
    if (!toAsset || !effectiveToChainId) {return;}
    const instance = findInstance(toAsset, effectiveToChainId);
    if (!instance) {return;}
    setField(formRef, 'toChain', effectiveToChainId);
    setField(formRef, 'toToken', instance.address);
  }, [formRef, toAsset, effectiveToChainId]);

  const fromChainOptions = useMemo<ChainChipOption[]>(() => {
    if (!fromAsset) {return [];}
    const bestChainId = bestRoute.best?.fromToken.chainId;
    return fromAsset.instances.map((t) => {
      const candidate =
        bestRoute.best?.fromToken.chainId === t.chainId
          ? bestRoute.best
          : bestRoute.alternatives.find((c) => c.fromToken.chainId === t.chainId);
      return {
        chainId: t.chainId,
        netUSD: candidate?.netUSD,
        isBest: bestChainId === t.chainId,
      };
    });
  }, [fromAsset, bestRoute.best, bestRoute.alternatives]);

  const routeCandidates = useMemo(
    () => [
      ...(bestRoute.best ? [bestRoute.best] : []),
      ...bestRoute.alternatives,
    ],
    [bestRoute.best, bestRoute.alternatives],
  );

  const toChainOptions = useMemo<ChainChipOption[]>(
    () =>
      buildDestinationChainOptions({
        asset: toAsset,
        candidates: routeCandidates,
      }),
    [routeCandidates, toAsset],
  );

  const selectedToChainOption = toChainOptions.find(
    (option) => option.chainId === effectiveToChainId,
  );
  const bestToChainOption = toChainOptions.find((option) => option.isBest);
  const bestToChainName = bestToChainOption
    ? getChainById(bestToChainOption.chainId)?.name
    : undefined;
  const toChainStatusText = bestRoute.isLoading
    ? 'Finding best chain…'
    : bestRoute.best
      ? selectedToChainOption?.isBest
        ? 'Best rate'
        : bestToChainName
          ? `Best rate: ${bestToChainName}`
          : undefined
      : undefined;

  const handleSelectFromAsset = useCallback((group: AssetGroup) => {
    setFromAsset(group);
    setFromChainOverride(undefined); // reset to auto-pick
  }, []);

  const handleSelectToAsset = useCallback((group: AssetGroup) => {
    setToAsset(group);
    setToChainOverride(undefined); // reset to auto-pick
  }, []);

  const handleReverse = useCallback(() => {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    // Both sides re-evaluate after reverse: source goes back to auto
    // (user can re-pick); destination goes back to auto.
    setFromChainOverride(undefined);
    setToChainOverride(undefined);
  }, [fromAsset, toAsset]);

  const isCrossChain =
    bestRoute.best && bestRoute.best.isBridge ? true : false;

  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'flex-start' }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <AssetPicker
              groups={fromGroups}
              label="From"
              selected={fromAsset}
              selectedChainId={effectiveFromChainId}
              onSelect={handleSelectFromAsset}
              modalTitle="Select asset to swap from"
            />
          </Box>
        </Stack>

        {fromAsset && fromChainOptions.length > 1 ? (
          <Box sx={{ pl: 0.5 }}>
            <ChainChip
              label="Source chain"
              selectedChainId={effectiveFromChainId}
              options={fromChainOptions}
              onChange={setFromChainOverride}
            />
          </Box>
        ) : null}

        <Stack direction="row" sx={{ justifyContent: 'center' }}>
          <IconButton
            size="small"
            onClick={handleReverse}
            aria-label="Reverse assets"
            disabled={!fromAsset && !toAsset}
            sx={(theme) => ({
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.background.paper,
            })}
          >
            <SwapVertIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'flex-start' }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <AssetPicker
              groups={toGroups}
              label="To"
              selected={toAsset}
              selectedChainId={effectiveToChainId}
              onSelect={handleSelectToAsset}
              modalTitle="Select asset to receive"
            />
          </Box>
        </Stack>

        {toAsset && toChainOptions.length > 1 ? (
          <Box sx={{ pl: 0.5 }}>
            <ChainChip
              label="Destination chain"
              selectedChainId={effectiveToChainId}
              options={toChainOptions}
              onChange={setToChainOverride}
            />
          </Box>
        ) : null}

        {toAsset && selectedToChainName && toChainStatusText ? (
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', pl: 0.5 }}
          >
            {toChainStatusText}
          </Typography>
        ) : null}

        {isCrossChain ? (
          <Typography
            variant="caption"
            sx={{ color: 'warning.main', pl: 0.5 }}
          >
            Best rate requires a cross-chain bridge (~1–3 min).
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
};
