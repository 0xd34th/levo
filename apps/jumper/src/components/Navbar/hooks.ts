'use client';

import { useMemo } from 'react';
import { useActiveAccountByChainType } from 'src/hooks/useActiveAccountByChainType';
import { useChains } from '@/hooks/useChains';
import { useEnsName } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { getAddressLabel } from 'src/utils/getAddressLabel';
import { getConnectorIcon } from '@lifi/wallet-management';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import type { Chain } from '@lifi/sdk';
import type { Address } from 'viem';
import { walletDigest } from 'src/utils/walletDigest';
import { AppPaths } from 'src/const/urls';
import { useTranslation } from 'react-i18next';
import { usePathnameWithoutLocale } from 'src/hooks/routing/usePathnameWithoutLocale';
import { useWalletFleet } from '@/hooks/useWalletFleet';

export const useWalletDisplayData = () => {
  const activeAccount = useActiveAccountByChainType();
  const walletFleet = useWalletFleet();
  const { chains, isSuccess } = useChains();
  const { data: ensName, isSuccess: isSuccessEnsName } = useEnsName({
    address: activeAccount?.address as Address | undefined,
    chainId: mainnet.id,
  });

  const addressLabel = getAddressLabel({
    isSuccess: isSuccessEnsName,
    ensName,
    address: activeAccount?.address,
  });

  const activeChain = useMemo(
    () =>
      chains?.find((chainEl: Chain) => chainEl.id === activeAccount?.chainId),
    [chains, activeAccount?.chainId],
  );

  const walletConnectorIcon = useMemo(
    () => getConnectorIcon(activeAccount?.connector),
    [activeAccount?.connector],
  );

  const accountLabel = useMemo(() => {
    const email = walletFleet.data?.user.email?.trim();
    if (!email) {
      return addressLabel ?? walletDigest(activeAccount?.address);
    }

    const [localPart] = email.split('@');
    return localPart.length > 18 ? `${localPart.slice(0, 15)}...` : localPart;
  }, [activeAccount?.address, addressLabel, walletFleet.data?.user.email]);

  return {
    badgeSrc: isSuccess ? activeChain?.logoURI : undefined,
    avatarSrc: walletConnectorIcon,
    label: accountLabel,
    isDisconnected: !activeAccount?.address,
  };
};

export const useIsDisconnected = () => {
  const activeAccount = useActiveAccountByChainType();
  const externalSuiAccount = useCurrentAccount();
  return !activeAccount?.address && !externalSuiAccount?.address;
};

interface MainLink {
  value: AppPaths;
  label: string;
  subLinks?: AppPaths[];
  testId?: string;
}

export const useMainLinks = () => {
  const { t } = useTranslation();
  const pathname = usePathnameWithoutLocale();

  const links = useMemo<MainLink[]>(
    () => [
      {
        value: AppPaths.Main,
        label: t('navbar.links.exchange'),
        testId: 'navbar-exchange-button',
      },
    ],
    [t],
  );

  const activeLink = useMemo(
    () =>
      links.find(
        ({ value, subLinks }) =>
          pathname === value ||
          subLinks?.some((subLink) => pathname.startsWith(subLink)),
      ),
    [pathname, links],
  );

  return {
    links,
    activeLink,
  };
};
