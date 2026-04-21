import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('src/Layout', () => ({
  Layout: ({ children }: { children: unknown }) => children,
}));

const getPartnerThemesMock = vi.fn();
const notFoundMock = vi.fn(() => ({ __notFound: true }));

vi.mock('src/app/lib/getPartnerThemes', () => ({
  getPartnerThemes: getPartnerThemesMock,
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

describe('onboard partner-theme layouts', () => {
  beforeEach(() => {
    vi.resetModules();
    getPartnerThemesMock.mockReset();
    notFoundMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('abstract layout renders notFound() when getPartnerThemes rejects instead of throwing through prerender', async () => {
    getPartnerThemesMock.mockRejectedValueOnce(
      new Error('Failed to fetch data'),
    );

    const { default: InfosLayout } = await import('./abstract/layout');

    await expect(
      Promise.resolve(InfosLayout({ children: null })),
    ).resolves.toBeDefined();

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('soneium layout renders notFound() when getPartnerThemes rejects instead of throwing through prerender', async () => {
    getPartnerThemesMock.mockRejectedValueOnce(
      new Error('Failed to fetch data'),
    );

    const { default: InfosLayout } = await import('./soneium/layout');

    await expect(
      Promise.resolve(InfosLayout({ children: null })),
    ).resolves.toBeDefined();

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('abstract layout still renders the themed children on a successful match', async () => {
    getPartnerThemesMock.mockResolvedValueOnce({
      data: [{ uid: 'abstract' }],
    });

    const { default: InfosLayout } = await import('./abstract/layout');

    await InfosLayout({ children: 'hello' });

    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
