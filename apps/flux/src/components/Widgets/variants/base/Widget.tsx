import type { FC } from 'react';
import { LiFiWidget, WidgetSkeleton as LifiWidgetSkeleton } from '@lifi/widget';
import type { WidgetProps } from './Widget.types';
import { useWidgetConfig } from '../widgetConfig/useWidgetConfig';
import { ClientOnly } from '@/components/ClientOnly';
import { ChainAbstractionController } from '@/components/Widgets/ChainAbstractionController/ChainAbstractionController';

export const Widget: FC<WidgetProps> = ({ ctx, formRef }) => {
  const { config, isReady } = useWidgetConfig(ctx);

  return (
    <ClientOnly fallback={<LifiWidgetSkeleton config={config} />}>
      {isReady ? (
        <>
          <ChainAbstractionController
            formRef={formRef!}
            bridges={config.bridges}
            chains={config.chains}
            exchanges={config.exchanges}
            routeOptions={config.sdkConfig?.routeOptions}
            fee={config.feeConfig?.fee ?? config.fee}
            initialFromChain={config.fromChain}
            initialFromToken={config.fromToken}
            initialToChain={config.toChain}
            initialToToken={config.toToken}
            slippage={config.slippage}
            tokens={config.tokens}
            routePriority={config.routePriority}
            useRelayerRoutes={config.useRelayerRoutes}
          />
          <LiFiWidget
            config={config}
            integrator={config.integrator}
            formRef={formRef}
          />
        </>
      ) : (
        <LifiWidgetSkeleton config={config} />
      )}
    </ClientOnly>
  );
};
