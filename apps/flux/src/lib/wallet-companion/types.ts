export type CompanionProviderName = 'phantom' | 'okx' | 'backpack';

export interface CompanionAddresses {
  evm?: string;
  solana?: string;
  bitcoin?: string;
}
