import { describe, expect, it } from 'vitest';
import { isTrustedProfilePictureUrl } from './transaction-history';

describe('isTrustedProfilePictureUrl', () => {
  it('accepts the exact pbs.twimg.com host over https', () => {
    expect(isTrustedProfilePictureUrl('https://pbs.twimg.com/profile_images/avatar.jpg')).toBe(true);
  });

  it('rejects sibling twimg hosts even over https', () => {
    expect(isTrustedProfilePictureUrl('https://evil.twimg.com/profile_images/avatar.jpg')).toBe(false);
  });
});
