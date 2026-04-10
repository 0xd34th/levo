import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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

import { ActionButtonRow } from './action-button-row';

describe('ActionButtonRow', () => {
  it('renders the Earn action in the old third-button slot', () => {
    const markup = renderToStaticMarkup(
      <ActionButtonRow depositHref="/deposit" />,
    );

    const depositIndex = markup.indexOf('>Deposit<');
    const sendIndex = markup.indexOf('>Send<');
    const earnIndex = markup.indexOf('>Earn<');

    expect(depositIndex).toBeGreaterThanOrEqual(0);
    expect(sendIndex).toBeGreaterThan(depositIndex);
    expect(earnIndex).toBeGreaterThan(sendIndex);
    expect(markup).toContain('href="/earn"');
  });
});
