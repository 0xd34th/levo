import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emitAccountDataRefresh,
  subscribeAccountDataRefresh,
} from './account-refresh';

describe('account refresh events', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('notifies listeners when account data changes', () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal('window', fakeWindow);
    const listener = vi.fn();

    const unsubscribe = subscribeAccountDataRefresh(listener);
    emitAccountDataRefresh();

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('stops notifying listeners after unsubscribe', () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal('window', fakeWindow);
    const listener = vi.fn();

    const unsubscribe = subscribeAccountDataRefresh(listener);
    unsubscribe();
    emitAccountDataRefresh();

    expect(listener).not.toHaveBeenCalled();
  });

  it('is a no-op when window is unavailable', () => {
    const listener = vi.fn();

    expect(() => {
      const unsubscribe = subscribeAccountDataRefresh(listener);
      emitAccountDataRefresh();
      unsubscribe();
    }).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
