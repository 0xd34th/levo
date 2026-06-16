/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendMessageMock,
  useChatMock,
  getAccessTokenMock,
} = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  useChatMock: vi.fn(),
  getAccessTokenMock: vi.fn(async () => 'access-token'),
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (...args: unknown[]) => useChatMock(...args),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock('@privy-io/react-auth', () => ({
  useIdentityToken: () => ({ identityToken: null }),
  usePrivy: () => ({ getAccessToken: getAccessTokenMock }),
}));

vi.mock('@/components/send-button', () => ({
  SendButton: ({
    amount,
    coinType,
    username,
    recipientType,
    availableBalance,
  }: {
    amount: string;
    coinType: string;
    username: string;
    recipientType: string | null;
    availableBalance?: string | null;
  }) => (
    <button
      type="button"
      data-testid="mock-send-button"
      data-amount={amount}
      data-coin-type={coinType}
      data-username={username}
      data-recipient-type={recipientType ?? ''}
      data-available-balance={availableBalance ?? ''}
    >
      Review recipient
    </button>
  ),
}));

vi.mock('@/components/coin-selector', () => ({
  CoinSelector: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-coin-selector"
      data-value={value}
      onClick={() => onValueChange('0x123::foo::FOO')}
    >
      Select coin
    </button>
  ),
}));

vi.mock('./SevenKSwapPanel', () => ({
  SevenKSwapPanel: () => <div>Powered by 7K Aggregator</div>,
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => ({
    suiAddress: '0xowner',
    loading: false,
    error: null,
  }),
}));

vi.mock('@/lib/use-coin-balance', () => ({
  useCoinBalance: (_address: string | null, coinType: string) => ({
    balance: coinType === '0x123::foo::FOO' ? '2500' : '10000000000',
    loading: false,
    error: null,
  }),
}));

import { AgentChatPanel, AgentResponseText, MessageBubble, ToolPartView, formatAgentChatHttpError } from './AgentChatPanel';

function clickByText(host: HTMLElement, text: string) {
  const button = Array.from(host.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function inputByLabel(host: HTMLElement, label: string) {
  const field = Array.from(host.querySelectorAll('input')).find((candidate) =>
    candidate.getAttribute('aria-label') === label,
  );
  if (!field) throw new Error(`Input not found: ${label}`);
  return field;
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('AgentChatPanel preset gates', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
    useChatMock.mockReturnValue({
      messages: [],
      sendMessage: sendMessageMock,
      status: 'ready',
      error: null,
    });
    sendMessageMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('opens an Object input gate instead of sending the on-chain preset immediately', async () => {
    await act(async () => {
      root.render(<AgentChatPanel onMandateCreated={() => {}} />);
    });

    await act(async () => {
      clickByText(host, 'Object');
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Enter object ID');
    expect(host.textContent).toContain('Ask agent');
  });

  it('requires valid object input before submitting the generated on-chain prompt', async () => {
    await act(async () => {
      root.render(<AgentChatPanel onMandateCreated={() => {}} />);
    });
    await act(async () => {
      clickByText(host, 'Object');
    });

    const objectInput = inputByLabel(host, 'Object ID');
    await typeInto(objectInput, 'not-an-object');
    expect(Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Ask agent'))).toHaveProperty('disabled', true);

    await typeInto(objectInput, '0x6');
    await act(async () => {
      clickByText(host, 'Ask agent');
    });

    expect(sendMessageMock).toHaveBeenCalledWith({ text: 'What is the Sui object 0x6?' });
  });

  it('opens the Trade send form with amount and .sui recipient fields without sending chat', async () => {
    await act(async () => {
      root.render(<AgentChatPanel onMandateCreated={() => {}} />);
    });

    await act(async () => {
      clickByText(host, 'Send');
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Send to Sui');
    expect(host.querySelector('[data-testid="mock-coin-selector"]')).toBeTruthy();
    expect(inputByLabel(host, 'Amount')).toBeTruthy();
    expect(inputByLabel(host, 'Recipient address or .sui')).toBeTruthy();
  });

  it('passes the selected send coin and its balance into SendButton', async () => {
    await act(async () => {
      root.render(<AgentChatPanel onMandateCreated={() => {}} />);
    });

    await act(async () => {
      clickByText(host, 'Send');
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="mock-coin-selector"]')?.click();
    });

    const sendButton = host.querySelector<HTMLButtonElement>('[data-testid="mock-send-button"]');
    expect(sendButton?.dataset.coinType).toBe('0x123::foo::FOO');
    expect(sendButton?.dataset.availableBalance).toBe('2500');
  });

  it('opens the 7K swap panel instead of the Cetus terminal', async () => {
    await act(async () => {
      root.render(<AgentChatPanel onMandateCreated={() => {}} />);
    });

    await act(async () => {
      clickByText(host, 'Swap');
    });

    expect(host.textContent).toContain('Powered by 7K Aggregator');
    expect(host.textContent).not.toContain('Cetus');
  });

  it('can open the swap surface from an initial URL surface prop', async () => {
    await act(async () => {
      root.render(<AgentChatPanel onMandateCreated={() => {}} initialSurface="swap" />);
    });

    expect(host.textContent).toContain('Powered by 7K Aggregator');
  });

  it('opens the official Sui Bridge only after bridge handoff review', async () => {
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null);
    await act(async () => {
      root.render(<AgentChatPanel onMandateCreated={() => {}} />);
    });

    await act(async () => {
      clickByText(host, 'Bridge');
    });

    expect(openMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Review bridge handoff');

    await act(async () => {
      clickByText(host, 'Review handoff');
    });

    expect(openMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Handoff review');

    await act(async () => {
      clickByText(host, 'Open Sui Bridge');
    });

    expect(openMock).toHaveBeenCalledWith('https://bridge.sui.io/', '_blank', 'noopener,noreferrer');
    openMock.mockRestore();
  });
});

describe('AgentChatPanel error formatting', () => {
  it('formats unauthenticated chat failures as user-facing copy', () => {
    expect(formatAgentChatHttpError(401, { error: 'Not authenticated' })).toBe('Sign in to use agent chat.');
  });

  it('uses payload error text without leaking raw JSON', () => {
    expect(formatAgentChatHttpError(503, { error: 'DEEPSEEK_API_KEY is not configured on this server' })).toBe(
      'DEEPSEEK_API_KEY is not configured on this server',
    );
  });
});

describe('AgentResponseText', () => {
  it('renders common model markdown as structured text instead of raw tokens', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText
        text={'Here is **SUI** today:\n\n- Price unavailable\n- Try portfolio\n\nWant **DeFi** next?'}
      />,
    );

    expect(markup).toContain('<strong>SUI</strong>');
    expect(markup).toContain('<ul');
    expect(markup).toContain('<li');
    expect(markup).not.toContain('**SUI**');
    expect(markup).not.toContain('- Price unavailable');
  });

  it('turns list runs into bullets even when the model does not add a blank line', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText text={'Here is what I can tell you:\n- **Token**: SUI\n- **Chain**: Sui Mainnet'} />,
    );

    expect(markup).toContain('<p');
    expect(markup).toContain('<ul');
    expect(markup).toContain('<strong>Token</strong>');
    expect(markup).not.toContain('- <strong>Token</strong>');
  });

  it('renders simple markdown tables instead of exposing raw pipe syntax', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText
        text={'Here is the latest on SUI:\n\n| Metric | Value |\n|---|---|\n| **Price** | $0.00 |\n| 24h Volume | N/A |'}
      />,
    );

    expect(markup).toContain('<table');
    expect(markup).toContain('<th');
    expect(markup).toContain('Metric');
    expect(markup).toContain('<strong>Price</strong>');
    expect(markup).not.toContain('| Metric | Value |');
    expect(markup).not.toContain('|---|---|');
  });

  it('renders ordered lists and emphasis from model fallback copy', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText
        text={'Here is what I *can* help you explore:\n1. **Your wallet portfolio** — see holdings\n2. **A specific pool** — fetch data'}
      />,
    );

    expect(markup).toContain('<em>can</em>');
    expect(markup).toContain('<ol');
    expect(markup).toContain('<li');
    expect(markup).toContain('<strong>Your wallet portfolio</strong>');
    expect(markup).not.toContain('1. <strong>Your wallet portfolio</strong>');
    expect(markup).not.toContain('*can*');
  });

  it('renders markdown headings without exposing hash markers', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText text={'Here is the latest:\n\n## SUI Market\n- Price: $1.03\n\n### Standout Pools'} />,
    );

    expect(markup).toContain('SUI Market');
    expect(markup).toContain('Standout Pools');
    expect(markup).not.toContain('## SUI Market');
    expect(markup).not.toContain('### Standout Pools');
  });

  it('renders markdown separators instead of exposing dash runs', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText text={'Here is the latest:\n\n---\n\n### Top Pools'} />,
    );

    expect(markup).toContain('<hr');
    expect(markup).toContain('Top Pools');
    expect(markup).not.toContain('---');
  });

  it('renders blockquotes without exposing quote markers', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText text={'> Live bridge execution is not available in Levo right now.'} />,
    );

    expect(markup).toContain('Live bridge execution is not available');
    expect(markup).not.toContain('&gt;');
    expect(markup).not.toContain('> Live bridge');
  });

  it('renders inline code spans without exposing backtick markers', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText
        text={
          'Tokens appearing in recent trades:\n- ZSWAP (`0x8070e3615d59a18a04acde27afffcdafc6331695617c4018c527e3b23e53da94::zswap::ZSWAP`)\n- ``0x6`` – Clock'
        }
      />,
    );

    expect(markup).toContain('<code');
    expect(markup).toContain('0x8070e3615d59a18a04acde27afffcdafc6331695617c4018c527e3b23e53da94::zswap::ZSWAP');
    expect(markup).toContain('0x6');
    expect(markup).not.toContain('`0x8070e3615d59a18a04acde27afffcdafc6331695617c4018c527e3b23e53da94');
    expect(markup).not.toContain('``0x6``');
  });

  it('renders inline markdown links without exposing bracket syntax', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText text={'Open [bridge route](https://www.okx.com/web3/dex-swap/bridge?fromChain=ethereum&toChain=sui).'} />,
    );

    expect(markup).toContain('<a');
    expect(markup).toContain('href="https://www.okx.com/web3/dex-swap/bridge?fromChain=ethereum&amp;toChain=sui"');
    expect(markup).toContain('bridge route');
    expect(markup).not.toContain('[bridge route]');
  });

  it('renders bare-domain markdown links with parenthesized query text', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText
        text={
          'Earn mandate handoff: [Open guided form](levo.finance/agent/new?intent=Auto-harvest%20yield%20(every%2024h)%20from%20Earn).'
        }
      />,
    );

    expect(markup).toContain('<a');
    expect(markup).toContain('href="https://levo.finance/agent/new?intent=Auto-harvest%20yield%20(every%2024h)%20from%20Earn"');
    expect(markup).toContain('Open guided form');
    expect(markup).not.toContain('[Open guided form]');
  });

  it('renders relative markdown links from mandate follow-up copy', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText
        text={
          '👉 \n[Continue to guided mandate form](/agent/new?intent=Manual%20withdraw%20from%20Earn%20%E2%80%94%20conservative%20caps%3A%20small%20per-tx%20limit%2C%20manual%20trigger%20only%2C%20no%20recurring%20schedule%2C%20short%20expiry)'
        }
      />,
    );

    expect(markup).toContain('<a');
    expect(markup).toContain('href="/agent/new?intent=Manual%20withdraw%20from%20Earn%20%E2%80%94%20conservative%20caps%3A%20small%20per-tx%20limit%2C%20manual%20trigger%20only%2C%20no%20recurring%20schedule%2C%20short%20expiry"');
    expect(markup).toContain('Continue to guided mandate form');
    expect(markup).not.toContain('[Continue to guided mandate form]');
  });

  it('renders markdown links whose href contains balanced parentheses', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText
        text={
          'Open [guided form](levo.finance/agent/new?intent=Manual%20execution%20(no%20cron%20schedule).) when ready.'
        }
      />,
    );

    expect(markup).toContain('<a');
    expect(markup).toContain('href="https://levo.finance/agent/new?intent=Manual%20execution%20(no%20cron%20schedule)."');
    expect(markup).toContain('guided form');
    expect(markup).not.toContain('[guided form]');
  });

  it('renders bare-domain bridge markdown links from assistant bridge copy', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText
        text={
          "Live bridge execution isn't available in Levo at the moment. You can check routes and complete the bridge on OKX Bridge: 👉 [Open OKX Bridge](okx.com/web3/dex-swap/bridge?fromChain=ethereum&toChain=sui&token=ETH)"
        }
      />,
    );

    expect(markup).toContain('<a');
    expect(markup).toContain('href="https://okx.com/web3/dex-swap/bridge?fromChain=ethereum&amp;toChain=sui&amp;token=ETH"');
    expect(markup).toContain('Open OKX Bridge');
    expect(markup).not.toContain('[Open OKX Bridge]');
  });

  it('strips stray backticks from plain text fallback segments', () => {
    const markup = renderToStaticMarkup(<AgentResponseText text={'Stores a `timestamp_ms` field'} />);

    expect(markup).toContain('timestamp_ms');
    expect(markup).not.toContain('`timestamp_ms`');
  });

  it('hides provider diagnostics from assistant fallback copy', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText text={'BlockVision returned an error while loading NFT stats.'} />,
    );

    expect(markup).toContain('the data provider returned an error');
    expect(markup).not.toContain('BlockVision');
  });

  it('hides internal quote-provider configuration details from assistant fallback copy', () => {
    const markup = renderToStaticMarkup(
      <AgentResponseText text={'Both the OKX and 7K quote adapters are not running on this server.'} />,
    );

    expect(markup).toContain('live quote routes are unavailable right now');
    expect(markup).not.toContain('quote adapters are not running');
    expect(markup).not.toContain('on this server');
  });
});

describe('ToolPartView', () => {
  it('renders tool errors as terminal user-facing messages instead of running forever', () => {
    const markup = renderToStaticMarkup(
      <ToolPartView
        part={{ type: 'tool-get_trending', state: 'output-error', errorText: 'BlockVision timed out' }}
        onMandateCreated={() => {}}
      />,
    );

    expect(markup).toContain('Tool unavailable');
    expect(markup).toContain('the data provider timed out');
    expect(markup).not.toContain('BlockVision');
    expect(markup).not.toContain('Running tool-get_trending');
  });
});

describe('MessageBubble', () => {
  it('keeps assistant text and tool parts in chronological order', () => {
    const markup = renderToStaticMarkup(
      <MessageBubble
        message={{
          id: 'message-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Checking market data.' },
            { type: 'tool-get_token', state: 'output-error', errorText: 'Provider unavailable' },
            { type: 'text', text: 'Fallback summary.' },
          ],
        }}
        onMandateCreated={() => {}}
      />,
    );

    expect(markup.indexOf('Checking market data.')).toBeLessThan(markup.indexOf('Tool unavailable'));
    expect(markup.indexOf('Tool unavailable')).toBeLessThan(markup.indexOf('Fallback summary.'));
  });
});
