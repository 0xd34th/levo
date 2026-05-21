import { describe, expect, it } from 'vitest';
import { formatAgentChatHttpError } from './AgentChatPanel';

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
