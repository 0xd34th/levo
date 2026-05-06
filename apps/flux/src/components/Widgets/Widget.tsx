'use client';
import envConfig from '@/config/env-config';
import { useThemeStore } from '@/stores/theme';
import { useAccount } from '@lifi/wallet-management';
import type { FormState } from '@lifi/widget';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWelcomeScreen } from 'src/hooks/useWelcomeScreen';
import { useBridgeConditions } from 'src/hooks/useBridgeConditions';
import { useContributionStore } from 'src/stores/contribution/ContributionStore';
import { WidgetWrapper } from './Widget.style';
import type { WidgetProps } from './Widget.types';
import type { MainWidgetContext } from './variants/widgetConfig/types';
import { useFormParameters } from './hooks';
import { Widget as BaseWidget } from './variants/base/Widget';
import dynamic from 'next/dynamic';

const PrivateSwapModal = dynamic(() =>
  import('./PrivateSwapModal/PrivateSwapModal').then(
    (mod) => mod.PrivateSwapModal,
  ),
);
export function Widget({
  starterVariant,
  fromChain,
  fromToken,
  toChain,
  toToken,
  fromAmount,
  allowChains: allowFromChains,
  allowToChains,
  widgetIntegrator,
  autoHeight,
}: WidgetProps) {
  const [configTheme] = useThemeStore((state) => [state.configTheme]);
  const formRef = useRef<FormState>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const bridgeConditions = useBridgeConditions({
    formRef,
    allowToChains,
    configThemeChains: configTheme?.chains,
  });
  const [isPrivateSwapModalOpen, setIsPrivateSwapModalOpen] = useState(false);

  useEffect(() => {
    setIsPrivateSwapModalOpen(bridgeConditions.isPrivateSwapSelected);
  }, [bridgeConditions.isPrivateSwapSelected]);

  const { account } = useAccount();
  const isConnectedAGW = account?.connector?.name === 'Abstract';

  const partnerName = configTheme?.uid ?? 'default';
  const contributionDisplayed = useContributionStore(
    (state) => state.contributionDisplayed,
  );

  const { welcomeScreenClosed, enabled } = useWelcomeScreen();

  const integratorStringByType = useMemo(() => {
    if (configTheme?.integrator) {
      return configTheme.integrator;
    }
    if (widgetIntegrator) {
      return widgetIntegrator;
    }
    return envConfig.NEXT_PUBLIC_WIDGET_INTEGRATOR;
  }, [configTheme.integrator, widgetIntegrator]) as string;

  const formParametersCtx = useFormParameters({
    fromChain,
    fromToken,
    toChain,
    toToken,
    fromAmount,
  });

  const context: MainWidgetContext = useMemo(
    () => ({
      integrator: integratorStringByType,
      starterVariant,
      partnerName,
      formData: formParametersCtx,
      allowFromChains: allowFromChains,
      allowToChains,
      bridgeConditions,
      isConnectedAGW,
    }),
    [
      starterVariant,
      partnerName,
      formParametersCtx,
      allowFromChains,
      allowToChains,
      bridgeConditions,
      isConnectedAGW,
      integratorStringByType,
    ],
  );

  return (
    <WidgetWrapper
      ref={wrapperRef}
      className="widget-wrapper"
      welcomeScreenClosed={welcomeScreenClosed || !enabled}
      autoHeight={autoHeight}
      contributionDisplayed={contributionDisplayed}
    >
      <BaseWidget ctx={context} formRef={formRef} />
      {isPrivateSwapModalOpen && (
        <PrivateSwapModal
          open={isPrivateSwapModalOpen}
          initialAddress={bridgeConditions.toAddress}
          onClose={() => setIsPrivateSwapModalOpen(false)}
          onConfirm={(addr) => {
            formRef.current?.setFieldValue('toAddress', addr, {
              setUrlSearchParam: true,
            });
            setIsPrivateSwapModalOpen(false);
          }}
        />
      )}
    </WidgetWrapper>
  );
}
