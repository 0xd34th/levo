'use client';
import { sdk } from '@farcaster/miniapp-sdk';
import type React from 'react';
import { useEffect } from 'react';
import { HeaderHeight } from 'src/const/headerHeight';
import { WelcomeOverlayLayout } from '@/components/WelcomeOverlayLayout/WelcomeOverlayLayout';
import { WelcomeScreen } from '@/components/WelcomeScreen/WelcomeScreen';
import { TrackingAction, TrackingCategory } from '@/const/trackingKeys';
import { useWelcomeScreen } from '@/hooks/useWelcomeScreen';

export interface AppProps {
  children: React.ReactNode;
}

const App = ({ children }: { children: React.ReactNode }) => {
  const { welcomeScreenClosed, setWelcomeScreenClosed, enabled } =
    useWelcomeScreen();

  useEffect(() => {
    sdk.actions.ready();
  }, []);

  return (
    <WelcomeOverlayLayout
      overlayContent={<WelcomeScreen />}
      isOverlayOpen={!welcomeScreenClosed}
      onOverlayClose={() => setWelcomeScreenClosed(true)}
      enabled={enabled}
      trackingConfig={{
        category: TrackingCategory.WelcomeScreen,
        action: TrackingAction.CloseWelcomeScreen,
        label: 'enter_welcome_screen_on_widget-click',
        enableAddressable: true,
      }}
      overlayClassName="welcome-screen-container"
      containerSx={{
        height: {
          xs: `calc(100dvh - ${HeaderHeight.XS}px)`,
          sm: `calc(100dvh - ${HeaderHeight.SM}px)`,
          md: `calc(100dvh - ${HeaderHeight.MD}px)`,
        },
      }}
    >
      {children}
    </WelcomeOverlayLayout>
  );
};

export default App;
