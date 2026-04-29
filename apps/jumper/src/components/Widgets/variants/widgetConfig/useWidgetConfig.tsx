import { useAccount } from '@lifi/wallet-management';
import { HiddenUI, type WidgetConfig } from '@lifi/widget';
import merge from 'lodash/merge';
import { useMemo } from 'react';
import { AB_TEST_NAME } from '@/const/abtests';
import { useABTest } from '@/hooks/useABTest';
import type { MainWidgetContext } from './types';
import { useMainWidgetConfig } from './useMainWidgetConfig';
import {
  useLanguageConfig,
  useSharedBaseConfig,
  useSharedFormConfig,
  useSharedRPCConfig,
} from './useSharedConfigs';
import { useWidgetDependencies } from './useWidgetDependencies';
import { applySuiExchangeGuards } from './exchangeGuards';
import FeeContribution from '../../FeeContribution/FeeContribution';

/**
 * Main widget configuration hook that orchestrates all configuration logic
 */
export function useWidgetConfig(
  context: MainWidgetContext,
): { config: WidgetConfig; isReady: boolean } {
  const deps = useWidgetDependencies();
  const sharedBase = useSharedBaseConfig(context, deps);
  const sharedRPC = useSharedRPCConfig();
  const sharedForm = useSharedFormConfig(context.formData);
  const { account } = useAccount();
  const priceImpactABTest = useABTest({
    feature: AB_TEST_NAME.A_B_TEST_PRICE_IMPACT_DISPLAY,
    address: account?.address ?? '',
  });

  const tradeABTest = useABTest({
    feature: AB_TEST_NAME.A_B_TEST_TRADE_DISPLAY,
    address: account?.address ?? '',
  });

  const feeContributionABTest = useABTest({
    feature: AB_TEST_NAME.A_B_TEST_FEE_CONTRIBUTION_DISPLAY,
    address: account?.address ?? '',
  });

  const language = useLanguageConfig(
    {
      useMainWidget: true,
      useSwapBridgeTitle: tradeABTest.isEnabled && tradeABTest.value === 'test',
      ...context,
    },
    deps,
  );

  const mainWidgetConfig = useMainWidgetConfig(context, deps);

  const config = useMemo(() => {
    const baseConfig = merge(
      {},
      sharedBase,
      sharedRPC,
      sharedForm,
      language,
      mainWidgetConfig,
    ) as WidgetConfig;

    if (context.theme) {
      merge(baseConfig, {
        theme: context.theme,
      });
    }

    if (context.disabledUI) {
      baseConfig.disabledUI = [
        ...(baseConfig.disabledUI ?? []),
        ...context.disabledUI,
      ];
    }

    if (context.hiddenUI) {
      baseConfig.hiddenUI = [
        ...(baseConfig.hiddenUI ?? []),
        ...context.hiddenUI,
      ];
    }

    baseConfig.exchanges = applySuiExchangeGuards(
      baseConfig.exchanges,
      context.formData,
    );

    if (priceImpactABTest.isEnabled && priceImpactABTest.value === 'test') {
      baseConfig.hiddenUI = [
        ...(baseConfig.hiddenUI ?? []),
        HiddenUI.RouteCardPriceImpact,
      ];
    }

    if (
      feeContributionABTest.isEnabled &&
      feeContributionABTest.value
    ) {
      baseConfig.feeConfig = {
        _vcComponent: () => (
          <FeeContribution translationFn={deps.translation.t} />
        ),
      };
    }

    return baseConfig;
  }, [
    sharedBase,
    sharedRPC,
    sharedForm,
    language,
    mainWidgetConfig,
    context.theme,
    context.disabledUI,
    context.hiddenUI,
    context.formData,
    deps.translation.t,
    priceImpactABTest.isEnabled,
    priceImpactABTest.value,
    feeContributionABTest.isEnabled,
    feeContributionABTest.value,
  ]);

  return {
    config,
    isReady:
      !tradeABTest.isLoading &&
      !priceImpactABTest.isLoading &&
      !feeContributionABTest.isLoading,
  };
}
