import { describe, expect, it, vi } from 'vitest';
import { subscribeCompanionChanges } from './listeners';

const fakeEmitter = () => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)!.add(handler);
    }),
    removeListener: vi.fn(
      (event: string, handler: (...args: unknown[]) => void) => {
        handlers.get(event)?.delete(handler);
      },
    ),
    emit: (event: string) => {
      handlers.get(event)?.forEach((h) => h());
    },
    countFor: (event: string) => handlers.get(event)?.size ?? 0,
  };
};

describe('subscribeCompanionChanges', () => {
  it('attaches listeners on Phantom solana + ethereum and detaches on unsubscribe', () => {
    const sol = fakeEmitter();
    const eth = fakeEmitter();
    const onChange = vi.fn();

    const unsub = subscribeCompanionChanges('phantom', onChange, {
      phantom: { solana: sol, ethereum: eth },
    });

    expect(sol.on).toHaveBeenCalledWith('accountChanged', expect.any(Function));
    expect(eth.on).toHaveBeenCalledWith(
      'accountsChanged',
      expect.any(Function),
    );

    sol.emit('accountChanged');
    eth.emit('accountsChanged');
    expect(onChange).toHaveBeenCalledTimes(2);

    unsub();
    expect(sol.countFor('accountChanged')).toBe(0);
    expect(eth.countFor('accountsChanged')).toBe(0);
  });

  it('handles missing namespaces silently', () => {
    const onChange = vi.fn();
    const unsub = subscribeCompanionChanges('phantom', onChange, {});
    expect(onChange).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
  });

  it('subscribes the OKX top-level emitter for EVM accountsChanged', () => {
    const okx = Object.assign(fakeEmitter(), {
      solana: fakeEmitter(),
      bitcoin: fakeEmitter(),
    });
    const onChange = vi.fn();

    subscribeCompanionChanges('okx', onChange, { okxwallet: okx });

    expect(okx.on).toHaveBeenCalledWith(
      'accountsChanged',
      expect.any(Function),
    );
    expect(okx.solana.on).toHaveBeenCalledWith(
      'accountChanged',
      expect.any(Function),
    );
    expect(okx.bitcoin.on).toHaveBeenCalledWith(
      'accountsChanged',
      expect.any(Function),
    );
  });

  it('falls back to window.ethereum for backpack only when isBackpack', () => {
    const onChange = vi.fn();
    const eth = Object.assign(fakeEmitter(), { isBackpack: true });
    subscribeCompanionChanges('backpack', onChange, {
      backpack: {},
      ethereum: eth,
    });
    expect(eth.on).toHaveBeenCalledWith(
      'accountsChanged',
      expect.any(Function),
    );
  });
});
