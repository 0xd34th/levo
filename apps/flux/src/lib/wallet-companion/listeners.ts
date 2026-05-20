import type { CompanionProviderName } from './types';

type Unsubscribe = () => void;

interface EventEmitterShape {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
}

const subscribe = (
  target: EventEmitterShape | undefined,
  event: string,
  handler: () => void,
): Unsubscribe | undefined => {
  if (!target?.on) {
    return undefined;
  }
  target.on(event, handler);
  return () => {
    if (target.removeListener) {
      target.removeListener(event, handler);
    } else if (target.off) {
      target.off(event, handler);
    }
  };
};

interface SubscribeHosts {
  phantom?: {
    solana?: EventEmitterShape;
    ethereum?: EventEmitterShape;
  };
  okxwallet?: EventEmitterShape & {
    solana?: EventEmitterShape;
    bitcoin?: EventEmitterShape;
  };
  backpack?: {
    solana?: EventEmitterShape;
    ethereum?: EventEmitterShape;
  };
  ethereum?: EventEmitterShape & { isBackpack?: boolean };
}

const resolveHost = (host?: SubscribeHosts): SubscribeHosts => {
  if (host) {
    return host;
  }
  if (typeof window === 'undefined') {
    return {};
  }
  return window as unknown as SubscribeHosts;
};

/**
 * Attach `accountsChanged` / `accountChanged` listeners on the companion
 * sub-providers belonging to the given multi-chain wallet. The returned
 * unsubscribe function detaches all of them. Missing providers are silently
 * skipped.
 */
export const subscribeCompanionChanges = (
  providerName: CompanionProviderName,
  onChange: () => void,
  host?: SubscribeHosts,
): Unsubscribe => {
  const resolved = resolveHost(host);
  const unsubs: Unsubscribe[] = [];
  const add = (target: EventEmitterShape | undefined, event: string) => {
    const fn = subscribe(target, event, onChange);
    if (fn) {
      unsubs.push(fn);
    }
  };

  if (providerName === 'phantom') {
    add(resolved.phantom?.solana, 'accountChanged');
    add(resolved.phantom?.ethereum, 'accountsChanged');
  } else if (providerName === 'okx') {
    add(resolved.okxwallet?.solana, 'accountChanged');
    add(resolved.okxwallet, 'accountsChanged');
    add(resolved.okxwallet?.bitcoin, 'accountsChanged');
  } else if (providerName === 'backpack') {
    add(resolved.backpack?.solana, 'accountChanged');
    const evm = resolved.backpack?.ethereum
      ? resolved.backpack.ethereum
      : resolved.ethereum?.isBackpack
        ? resolved.ethereum
        : undefined;
    add(evm, 'accountsChanged');
  }

  return () => {
    for (const fn of unsubs) {
      fn();
    }
  };
};
