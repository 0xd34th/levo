import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentResponseText, formatAgentChatHttpError } from './AgentChatPanel';

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
});
