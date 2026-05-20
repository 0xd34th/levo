import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let pathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { SegmentedTabs } from './segmented-tabs';

describe('SegmentedTabs', () => {
  it('exposes the Agent entry in main navigation', () => {
    pathname = '/agent';

    const markup = renderToStaticMarkup(<SegmentedTabs />);

    expect(markup).toContain('href="/agent"');
    expect(markup).toContain('>Agent<');
    expect(markup).toContain('aria-current="page"');
  });
});
