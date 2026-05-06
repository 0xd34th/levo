import { ConnectNavbarButtonLabel, ConnectNavbarButton } from './Buttons.style';
import { useWalletMenu } from '@lifi/wallet-management';

function ConnectButton() {
  const { openWalletMenu } = useWalletMenu();

  return (
    <ConnectNavbarButton
      // Used in the widget
      id="connect-wallet-button"
      onClick={(event) => {
        event.stopPropagation();
        openWalletMenu();
      }}
    >
      <ConnectNavbarButtonLabel
        sx={{
          typography: {
            xs: 'bodyXSmallStrong',
            sm: 'bodySmallStrong',
            lg: 'bodyMediumStrong',
          },
        }}
      >
        Sign in
      </ConnectNavbarButtonLabel>
    </ConnectNavbarButton>
  );
}

export default ConnectButton;
