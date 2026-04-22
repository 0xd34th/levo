import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './copyTextToClipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the provided text to the clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });

    await expect(copyTextToClipboard('0xwallet')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('0xwallet');
  });

  it('fails closed when clipboard support is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyTextToClipboard('0xwallet')).resolves.toBe(false);
  });

  it('fails closed when clipboard write throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });

    await expect(copyTextToClipboard('0xwallet')).resolves.toBe(false);
  });
});
