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

  useEffect(() => {
    setToAddress(toAddressUrlParams);
  }, [toAddressUrlParams]);

  const sourceChainType = useMemo(() => {
    if (!sourceChainTokenParam?.chainId) {
      return undefined;
    }
    return getChainById(sourceChainTokenParam.chainId)?.chainType;
  }, [sourceChainTokenParam?.chainId, getChainById]);

  const destinationChainType = useMemo(() => {
    if (!destinationChainTokenParam?.chainId) {
      return undefined;
    }

    return getChainById(destinationChainTokenParam.chainId)?.chainType;
  }, [destinationChainTokenParam?.chainId, getChainById]);

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
    const handleToAddressChange = (params: FormFieldChanged) => {
      if (params?.fieldName === 'toAddress' && params.newValue !== undefined) {
        setToAddress(params.newValue);
      }
    };
    const widgetEventsConfig = {
      routeSelected: handleSelectedRoute,
      routeExecutionStarted: handleResetPrivateSwapSelected,
      pageEntered: handleResetPrivateSwapSelectedForPageEntered,
      formFieldChanged: handleToAddressChange,
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
      sourceChainTokenParam?.chainId === ExtendedChainId.HYPE &&
      destinationChainTokenParam?.chainId === ChainId.ARB &&
      destinationChainTokenParam?.token?.toLowerCase() ===
        ARB_NATIVE_USDC.toLowerCase();

    const isBridgeFromEvmToHype =
      sourceChainType === ChainType.EVM &&
      destinationChainTokenParam?.chainId === ExtendedChainId.HYPE;

    const isAGWToNonABSChain =
      isConnectedAGW && destinationChainTokenParam?.chainId !== ChainId.ABS;

    return {
      isBridgeFromHypeToArbNativeUSDC,
      isBridgeFromEvmToHype,
      isAGWToNonABSChain,
      isPrivateSwapSelected,
      toAddress,
    };
  }, [
    sourceChainTokenParam.chainId,
    sourceChainType,
    destinationChainTokenParam.chainId,
    destinationChainTokenParam.token,
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
