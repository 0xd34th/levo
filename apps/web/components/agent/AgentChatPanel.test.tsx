import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentResponseText, MessageBubble, ToolPartView, formatAgentChatHttpError } from './AgentChatPanel';

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
