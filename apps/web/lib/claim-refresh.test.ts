import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emitClaimDataRefresh,
  subscribeClaimDataRefresh,
} from './claim-refresh';

describe('claim refresh events', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('notifies listeners when claim data changes', () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal('window', fakeWindow);
    const listener = vi.fn();

    const unsubscribe = subscribeClaimDataRefresh(listener);
    emitClaimDataRefresh();

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('stops notifying listeners after unsubscribe', () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal('window', fakeWindow);
    const listener = vi.fn();

    const unsubscribe = subscribeClaimDataRefresh(listener);
    unsubscribe();
    emitClaimDataRefresh();

    expect(listener).not.toHaveBeenCalled();
  });

  it('is a no-op when window is unavailable', () => {
    const listener = vi.fn();

    expect(() => {
      const unsubscribe = subscribeClaimDataRefresh(listener);
      emitClaimDataRefresh();
      unsubscribe();
    }).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
