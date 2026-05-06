'use client';
import { ChainAlert } from '@/components/Alerts';
import { PartnerThemeFooterImage } from '../PartnerThemeFooterImage';
import { WidgetEvents } from './WidgetEvents';
import {
  TrackingAction,
  TrackingEventDataAction,
} from 'src/const/trackingKeys';
import { WidgetTrackingProvider } from 'src/providers/WidgetTrackingProvider';
import { AB_TEST_NAME, AbTests } from '@/const/abtests';
import { useABTest } from '@/hooks/useABTest';
import { useAccount } from '@lifi/wallet-management';

export function Widgets() {
  const { account } = useAccount();
  const tradeABTest = useABTest({
    feature: AB_TEST_NAME.A_B_TEST_TRADE_DISPLAY,
    address: account?.address ?? '',
  });

  return (
    <>
      <ChainAlert />
      <PartnerThemeFooterImage />
      <WidgetTrackingProvider
        trackingActionKeys={{
          destinationChainAndTokenSelection:
            TrackingAction.OnDestinationChainAndTokenSelection,
          sourceChainAndTokenSelection:
            TrackingAction.OnSourceChainAndTokenSelection,
          availableRoutes: TrackingAction.OnAvailableRoutes,
          routeExecutionStarted: TrackingAction.OnRouteExecutionStarted,
          routeExecutionUpdated: TrackingAction.OnRouteExecutionUpdated,
          routeExecutionCompleted: TrackingAction.OnRouteExecutionCompleted,
          routeExecutionFailed: TrackingAction.OnRouteExecutionFailed,
          changeSettings: TrackingAction.OnChangeSettings,
          routeHighValueLoss: TrackingAction.OnRouteHighValueLoss,
          lowAddressActivityConfirmed:
            TrackingAction.OnLowAddressActivityConfirmed,
          sendToWalletToggled: TrackingAction.OnSendToWalletToggled,
          formFieldChanged: TrackingAction.OnFormFieldChanged,
        }}
        trackingDataActionKeys={{
          routeExecutionStarted: TrackingEventDataAction.ExecutionStart,
          routeExecutionUpdated: TrackingEventDataAction.ExecutionUpdated,
          routeExecutionCompleted: TrackingEventDataAction.ExecutionCompleted,
          routeExecutionFailed: TrackingEventDataAction.ExecutionFailed,
        }}
        trackingDataProperties={{
          routeExecutionCompleted: {
            abTestVariants: {
              [AbTests[AB_TEST_NAME.A_B_TEST_TRADE_DISPLAY].name]:
                tradeABTest.value,
            },
          },
          routeExecutionStarted: {
            abTestVariants: {
              [AbTests[AB_TEST_NAME.A_B_TEST_TRADE_DISPLAY].name]:
                tradeABTest.value,
            },
          },
        }}
      >
        <WidgetEvents />
      </WidgetTrackingProvider>
    </>
  );
}
