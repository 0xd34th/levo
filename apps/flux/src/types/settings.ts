import type { StoreApi } from 'zustand';
import type { UseBoundStoreWithEqualityFn } from 'zustand/traditional';

export type WalletConnected = string;

export interface SettingsProps {
  clientWallets: string[];
  disabledFeatureCards: string[];
  welcomeScreenClosed: boolean;
}

export interface SettingsActions {
  setClientWallets: (wallet: string) => void;
  setDisabledFeatureCard: (id: string) => void;
  setDefaultSettings: VoidFunction;
  setWelcomeScreenClosed: (shown: boolean) => void;
}

export type SettingsState = SettingsActions & SettingsProps;

export type SettingsStore = UseBoundStoreWithEqualityFn<
  StoreApi<SettingsState>
>;
