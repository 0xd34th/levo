import { probeBackpackCompanions } from './probeBackpack';
import { probeOkxCompanions } from './probeOkx';
import { probePhantomCompanions } from './probePhantom';
import type { CompanionAddresses, CompanionProviderName } from './types';

export const probeCompanions = (
  providerName: CompanionProviderName,
): Promise<CompanionAddresses> => {
  switch (providerName) {
    case 'phantom':
      return probePhantomCompanions();
    case 'okx':
      return probeOkxCompanions();
    case 'backpack':
      return probeBackpackCompanions();
    default: {
      const _exhaustive: never = providerName;
      return Promise.resolve({});
    }
  }
};
