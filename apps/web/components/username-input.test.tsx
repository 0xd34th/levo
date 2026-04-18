import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  detectRecipientTypeMock,
  normalizeRecipientInputMock,
} = vi.hoisted(() => ({
  detectRecipientTypeMock: vi.fn(),
  normalizeRecipientInputMock: vi.fn((value: string) => value),
}));

vi.mock('@/lib/recipient', () => ({
  detectRecipientType: detectRecipientTypeMock,
}));

vi.mock('@/lib/send-form', () => ({
  MAX_SUI_ADDRESS_LENGTH: 128,
  normalizeRecipientInput: normalizeRecipientInputMock,
}));

import { UsernameInput } from './username-input';

describe('UsernameInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeRecipientInputMock.mockImplementation((value: string) => value);
  });

  it('uses the wider plain leading inset for address-mode input', () => {
    detectRecipientTypeMock.mockReturnValue('SUI_ADDRESS');

    const markup = renderToStaticMarkup(
      <UsernameInput value="0x1234" onValueChange={vi.fn()} />,
    );

    expect(markup).toContain('pl-6');
    expect(markup).toContain('font-mono text-sm');
    expect(markup).not.toContain('pl-5');
  });

  it('uses the widened prefix spacing contract for X-handle input', () => {
    detectRecipientTypeMock.mockReturnValue('X_HANDLE');

    const markup = renderToStaticMarkup(
      <UsernameInput value="alice" onValueChange={vi.fn()} />,
    );

    expect(markup).toContain('left-6');
    expect(markup).toContain('pl-14');
    expect(markup).not.toContain('left-5');
    expect(markup).not.toContain('pl-12');
  });
});
