import { ChainId, ChainType, type Route } from '@lifi/sdk';
import { useAccount } from '@lifi/wallet-management';
import type { FormFieldChanged, FormState } from '@lifi/widget';
import { useWidgetEvents } from '@lifi/widget';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { ExtendedChainId } from 'src/components/Widgets/Widget.types';
import { ARB_NATIVE_USDC } from 'src/config/tokens';
import { useUrlParams } from './useUrlParams';
import { useChains } from './useChains';
import { useWalletFleetAddress } from './useWalletFleet';
import {
  setupWidgetEvents,
  teardownWidgetEvents,
} from '@/components/Widgets/WidgetEventsManager';

const PRIVATE_SWAP_TOOL_KEYS = ['houdini'];

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  return undefined;
};

interface UseWidgetSelectionProps {
  formRef?: RefObject<FormState | null>;
  allowToChains?: number[];
  configThemeChains?: {
    to?: {
      allow?: number[];
    };
  };
}

export const useBridgeConditions = ({
  formRef,
  allowToChains,
  configThemeChains,
}: UseWidgetSelectionProps) => {
  const { account } = useAccount();
  const isConnectedAGW = account?.connector?.name === 'Abstract';
  const { getChainById } = useChains();
  const widgetEvents = useWidgetEvents();
  const [isPrivateSwapSelected, setIsPrivateSwapSelected] = useState(false);
  const [toAddress, setToAddress] = useState<string | undefined>(undefined);
  const lastAutoToAddressRef = useRef<string | undefined>(undefined);

  const {
    sourceChainToken: sourceChainTokenParam,
    destinationChainToken: destinationChainTokenParam,
    toAddress: toAddressUrlParams,
  } = useUrlParams();

  // Live form state mirrored from widget formFieldChanged events. URL alone
  // is unreliable: LiFi widget updates the URL via history.replaceState,
  // which doesn't fire popstate, so useUrlParams stays stale relative to the
  // widget's actual selection. We bootstrap from the URL once it stabilizes
  // and then track widget events as the source of truth.
  const [currentFromChainId, setCurrentFromChainId] = useState<
    number | undefined
  >();
  const [currentToChainId, setCurrentToChainId] = useState<number | undefined>();
  const [currentFromToken, setCurrentFromToken] = useState<string | undefined>();
  const [currentToToken, setCurrentToToken] = useState<string | undefined>();

  useEffect(() => {
    setCurrentFromChainId(
      (prev) => prev ?? sourceChainTokenParam.chainId,
    );
    setCurrentToChainId(
      (prev) => prev ?? destinationChainTokenParam.chainId,
    );
    setCurrentFromToken((prev) => prev ?? sourceChainTokenParam.token);
    setCurrentToToken((prev) => prev ?? destinationChainTokenParam.token);
  }, [
    sourceChainTokenParam.chainId,
    sourceChainTokenParam.token,
    destinationChainTokenParam.chainId,
    destinationChainTokenParam.token,
  ]);

  useEffect(() => {
    setToAddress(toAddressUrlParams);
  }, [toAddressUrlParams]);

  const sourceChainType = useMemo(() => {
    if (!currentFromChainId) {
      return undefined;
    }
    return getChainById(currentFromChainId)?.chainType;
  }, [currentFromChainId, getChainById]);

  const destinationChainType = useMemo(() => {
    if (!currentToChainId) {
      return undefined;
    }
    return getChainById(currentToChainId)?.chainType;
  }, [currentToChainId, getChainById]);

  const destinationWalletAddress = useWalletFleetAddress(destinationChainType);

  useEffect(() => {
    const handleSelectedRoute = ({ route }: { route: Route }) => {
      setIsPrivateSwapSelected(
        route.steps.some((step) => PRIVATE_SWAP_TOOL_KEYS.includes(step.tool)),
      );
    };

    const handleResetPrivateSwapSelected = () => {
      setIsPrivateSwapSelected(false);
    };
    const handleResetPrivateSwapSelectedForPageEntered = (path: string) => {
      if (path === '/routes' || path === '/') {
        setIsPrivateSwapSelected(false);
      }
    };
    const handleFormFieldChange = (params: FormFieldChanged) => {
      if (!params) {
        return;
      }
      switch (params.fieldName) {
        case 'toAddress':
          if (params.newValue !== undefined) {
            setToAddress(params.newValue);
          }
          break;
        case 'fromChain':
          setCurrentFromChainId(toNumberOrUndefined(params.newValue));
          break;
        case 'toChain':
          setCurrentToChainId(toNumberOrUndefined(params.newValue));
          break;
        case 'fromToken':
          setCurrentFromToken(toStringOrUndefined(params.newValue));
          break;
        case 'toToken':
          setCurrentToToken(toStringOrUndefined(params.newValue));
          break;
        default:
          break;
      }
    };
    const widgetEventsConfig = {
      routeSelected: handleSelectedRoute,
      routeExecutionStarted: handleResetPrivateSwapSelected,
      pageEntered: handleResetPrivateSwapSelectedForPageEntered,
      formFieldChanged: handleFormFieldChange,
    };

    setupWidgetEvents(widgetEventsConfig, widgetEvents);

    return () => {
      teardownWidgetEvents(widgetEventsConfig, widgetEvents);
    };
  }, [widgetEvents]);

  // // Handle initial URL parameter clearing
  useEffect(() => {
    if (
      configThemeChains?.to?.allow?.includes(ChainId.ABS) ||
      allowToChains?.includes(ChainId.ABS) ||
      !formRef?.current ||
      !isConnectedAGW
    ) {
      return;
    }

    formRef.current.setFieldValue('toAddress', undefined, {
      setUrlSearchParam: true,
    });
  }, [
    allowToChains,
    configThemeChains?.to?.allow,
    formRef,
    isConnectedAGW,
  ]);

  // Bridge condition checks
  const bridgeConditions = useMemo(() => {
    const isBridgeFromHypeToArbNativeUSDC =
      currentFromChainId === ExtendedChainId.HYPE &&
      currentToChainId === ChainId.ARB &&
      currentToToken?.toLowerCase() === ARB_NATIVE_USDC.toLowerCase();

    const isBridgeFromEvmToHype =
      sourceChainType === ChainType.EVM &&
      currentToChainId === ExtendedChainId.HYPE;

    const isAGWToNonABSChain =
      isConnectedAGW && currentToChainId !== ChainId.ABS;

    return {
      isBridgeFromHypeToArbNativeUSDC,
      isBridgeFromEvmToHype,
      isAGWToNonABSChain,
      isPrivateSwapSelected,
      toAddress,
    };
  }, [
    currentFromChainId,
    sourceChainType,
    currentToChainId,
    currentToToken,
    isConnectedAGW,
    isPrivateSwapSelected,
    toAddress,
  ]);

  useEffect(() => {
    if (!formRef?.current) {
      return;
    }

    if (
      bridgeConditions.isAGWToNonABSChain ||
      bridgeConditions.isBridgeFromEvmToHype ||
      bridgeConditions.isBridgeFromHypeToArbNativeUSDC
    ) {
      formRef.current.setFieldValue('toAddress', undefined, {
        setUrlSearchParam: true,
      });
      lastAutoToAddressRef.current = undefined;
      setToAddress(undefined);
      return;
    }

    if (!destinationWalletAddress) {
      return;
    }

    const canReplaceToAddress =
      !toAddress ||
      toAddress === toAddressUrlParams ||
      toAddress === lastAutoToAddressRef.current;

    if (!canReplaceToAddress || toAddress === destinationWalletAddress) {
      if (toAddress === destinationWalletAddress) {
        lastAutoToAddressRef.current = destinationWalletAddress;
      }
      return;
    }

    formRef.current.setFieldValue('toAddress', destinationWalletAddress, {
      setUrlSearchParam: true,
    });
    lastAutoToAddressRef.current = destinationWalletAddress;
    setToAddress(destinationWalletAddress);
  }, [
    bridgeConditions.isAGWToNonABSChain,
    bridgeConditions.isBridgeFromEvmToHype,
    bridgeConditions.isBridgeFromHypeToArbNativeUSDC,
    destinationWalletAddress,
    formRef,
    toAddress,
    toAddressUrlParams,
  ]);

  return bridgeConditions;
};
