import { describe, expect, it } from 'vitest';
import {
  isAbsoluteHttpUrl,
  resolveBackendRewriteTarget,
  resolvePipelineRewriteTarget,
} from './proxy-rewrites.mjs';

describe('proxy-rewrites', () => {
  describe('isAbsoluteHttpUrl', () => {
    it('accepts absolute https and http URLs', () => {
      expect(isAbsoluteHttpUrl('https://api.jumper.exchange/v1')).toBe(true);
      expect(isAbsoluteHttpUrl('http://localhost:3001')).toBe(true);
    });

    it('rejects missing, malformed, or non-http values', () => {
      expect(isAbsoluteHttpUrl(undefined)).toBe(false);
      expect(isAbsoluteHttpUrl('')).toBe(false);
      expect(isAbsoluteHttpUrl('   ')).toBe(false);
      expect(isAbsoluteHttpUrl('/api/jumper/v1')).toBe(false);
      expect(isAbsoluteHttpUrl('ftp://api.jumper.exchange')).toBe(false);
      expect(isAbsoluteHttpUrl('not a url')).toBe(false);
    });
  });

  describe('resolveBackendRewriteTarget', () => {
    it('installs the rewrite for canonical Jumper backends', () => {
      expect(
        resolveBackendRewriteTarget({
          NEXT_PUBLIC_BACKEND_URL: 'https://api.jumper.exchange/v1',
        }),
      ).toBe('https://api.jumper.exchange/v1');
    });

    it('installs the rewrite for fork deployments with custom backend origins', () => {
      expect(
        resolveBackendRewriteTarget({
          NEXT_PUBLIC_BACKEND_URL: 'https://api.krilly.ai/v1',
        }),
      ).toBe('https://api.krilly.ai/v1');
    });

    it('strips a trailing slash so the rewrite destination is well-formed', () => {
      expect(
        resolveBackendRewriteTarget({
          NEXT_PUBLIC_BACKEND_URL: 'https://api.krilly.ai/v1/',
        }),
      ).toBe('https://api.krilly.ai/v1');
    });

    it('falls back to the default Jumper backend when the env var is empty', () => {
      expect(resolveBackendRewriteTarget({ NEXT_PUBLIC_BACKEND_URL: '' })).toBe(
        'https://api-develop.jumper.exchange/v1',
      );
      expect(resolveBackendRewriteTarget({})).toBe(
        'https://api-develop.jumper.exchange/v1',
      );
    });

    it('returns null when the configured backend URL is not an absolute http(s) URL', () => {
      expect(
        resolveBackendRewriteTarget({
          NEXT_PUBLIC_BACKEND_URL: 'not-a-url',
        }),
      ).toBeNull();
      expect(
        resolveBackendRewriteTarget({
          NEXT_PUBLIC_BACKEND_URL: '/api/jumper/v1',
        }),
      ).toBeNull();
    });
  });

  describe('resolvePipelineRewriteTarget', () => {
    it('installs the rewrite for canonical Jumper pipeline hosts', () => {
      expect(
        resolvePipelineRewriteTarget({
          NEXT_PUBLIC_LIFI_BACKEND_URL: 'https://api.jumper.exchange/pipeline',
        }),
      ).toBe('https://api.jumper.exchange/pipeline');
    });

    it('installs the rewrite for fork deployments with custom pipeline origins', () => {
      expect(
        resolvePipelineRewriteTarget({
          NEXT_PUBLIC_LIFI_BACKEND_URL: 'https://api.krilly.ai/pipeline',
        }),
      ).toBe('https://api.krilly.ai/pipeline');
    });

    it('returns null when the configured pipeline URL is not an absolute http(s) URL', () => {
      expect(
        resolvePipelineRewriteTarget({
          NEXT_PUBLIC_LIFI_BACKEND_URL: 'not-a-url',
        }),
      ).toBeNull();
    });
  });
});
