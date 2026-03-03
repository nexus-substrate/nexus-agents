/**
 * Unit tests for Bluesky Client
 *
 * Tests AT Protocol client for posting to Bluesky.
 * Covers authentication, posting, error handling, and configuration.
 *
 * @module cli/bluesky-client.test
 */

/* eslint-disable @typescript-eslint/no-unsafe-call */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlueskyPost, getBlueskyConfig, type BlueskyConfig } from './bluesky-client.js';

// Mock @atproto/api module
vi.mock('@atproto/api', () => {
  const mockDetectFacets = vi.fn(() => Promise.resolve());

  const MockRichText = vi.fn(function (options: { text: string }) {
    return {
      text: options.text,
      facets: undefined,
      detectFacets: mockDetectFacets,
    };
  });

  const mockPost = vi.fn();
  const mockLogin = vi.fn();

  const MockAtpAgent = vi.fn(function () {
    return {
      login: mockLogin,
      post: mockPost,
    };
  });

  return {
    AtpAgent: MockAtpAgent,
    RichText: MockRichText,
    __mockLogin: mockLogin,
    __mockPost: mockPost,
    __mockDetectFacets: mockDetectFacets,
  };
});

describe('bluesky-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLUESKY_HANDLE;
    delete process.env.BLUESKY_APP_PASSWORD;
    delete process.env.BLUESKY_SERVICE;
  });

  describe('getBlueskyConfig()', () => {
    it('returns undefined when BLUESKY_HANDLE is missing', () => {
      process.env.BLUESKY_APP_PASSWORD = 'test-password';

      const result = getBlueskyConfig();

      expect(result).toBeUndefined();
    });

    it('returns undefined when BLUESKY_APP_PASSWORD is missing', () => {
      process.env.BLUESKY_HANDLE = 'test.bsky.social';

      const result = getBlueskyConfig();

      expect(result).toBeUndefined();
    });

    it('returns undefined when both credentials are missing', () => {
      const result = getBlueskyConfig();

      expect(result).toBeUndefined();
    });

    it('returns config with default service when BLUESKY_SERVICE is not set', () => {
      process.env.BLUESKY_HANDLE = 'test.bsky.social';
      process.env.BLUESKY_APP_PASSWORD = 'test-password';

      const result = getBlueskyConfig();

      expect(result).toEqual({
        handle: 'test.bsky.social',
        appPassword: 'test-password',
        service: 'https://bsky.social',
      });
    });

    it('returns config with custom service when BLUESKY_SERVICE is set', () => {
      process.env.BLUESKY_HANDLE = 'test.bsky.social';
      process.env.BLUESKY_APP_PASSWORD = 'test-password';
      process.env.BLUESKY_SERVICE = 'https://custom.bsky.social';

      const result = getBlueskyConfig();

      expect(result).toEqual({
        handle: 'test.bsky.social',
        appPassword: 'test-password',
        service: 'https://custom.bsky.social',
      });
    });

    it('returns config with empty string credentials', () => {
      process.env.BLUESKY_HANDLE = '';
      process.env.BLUESKY_APP_PASSWORD = '';

      const result = getBlueskyConfig();

      expect(result).toBeUndefined();
    });
  });

  describe('createBlueskyPost()', () => {
    const mockConfig: BlueskyConfig = {
      handle: 'test.bsky.social',
      appPassword: 'test-password',
      service: 'https://bsky.social',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockAtpModule: any;

    beforeEach(async () => {
      mockAtpModule = await import('@atproto/api');
    });

    it('successfully creates a post with all return values', async () => {
      const mockUri = 'at://did:plc:abc123/app.bsky.feed.post/xyz789';
      const mockCid = 'bafyreicid123';

      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: mockUri,
          cid: mockCid,
        })
      );

      const result = await createBlueskyPost(mockConfig, 'Hello Bluesky!');

      expect(result).toEqual({
        success: true,
        uri: mockUri,
        cid: mockCid,
        url: 'https://bsky.app/profile/test.bsky.social/post/xyz789',
      });
    });

    it('calls agent.login with correct credentials', async () => {
      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
          cid: 'cid123',
        })
      );

      await createBlueskyPost(mockConfig, 'Test post');

      expect(mockAtpModule.__mockLogin).toHaveBeenCalledWith({
        identifier: 'test.bsky.social',
        password: 'test-password',
      });
    });

    it('calls detectFacets on RichText', async () => {
      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
          cid: 'cid123',
        })
      );

      await createBlueskyPost(mockConfig, 'Test with #hashtag');

      expect(mockAtpModule.__mockDetectFacets).toHaveBeenCalledTimes(1);
    });

    it('includes facets in post when RichText has facets', async () => {
      const mockFacets = [{ index: { byteStart: 0, byteEnd: 5 } }];

      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
          cid: 'cid123',
        })
      );

      // Mock RichText to return facets

      vi.mocked(mockAtpModule.RichText).mockImplementation(function (options: { text: string }) {
        return {
          text: options.text,
          facets: mockFacets,
          detectFacets: mockAtpModule.__mockDetectFacets,
        };
      });

      await createBlueskyPost(mockConfig, 'Test');

      expect(mockAtpModule.__mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test',
          facets: mockFacets,
        })
      );
    });

    it('includes createdAt timestamp in post', async () => {
      const mockNow = new Date('2026-02-06T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockNow);

      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
          cid: 'cid123',
        })
      );

      await createBlueskyPost(mockConfig, 'Test');

      expect(mockAtpModule.__mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: mockNow.toISOString(),
        })
      );

      vi.useRealTimers();
    });

    it('uses default service when config.service is undefined', async () => {
      const configWithoutService: BlueskyConfig = {
        handle: 'test.bsky.social',
        appPassword: 'test-password',
      };

      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
          cid: 'cid123',
        })
      );

      await createBlueskyPost(configWithoutService, 'Test');

      expect(mockAtpModule.AtpAgent).toHaveBeenCalledWith({
        service: 'https://bsky.social',
      });
    });

    it('handles authentication error', async () => {
      mockAtpModule.__mockLogin.mockImplementation(() =>
        Promise.reject(new Error('Invalid identifier or password'))
      );

      const result = await createBlueskyPost(mockConfig, 'Test');

      expect(result).toEqual({
        success: false,
        error: 'Authentication failed. Check BLUESKY_HANDLE and BLUESKY_APP_PASSWORD.',
      });
    });

    it('handles rate limit error', async () => {
      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.reject(new Error('Rate limit exceeded'))
      );

      const result = await createBlueskyPost(mockConfig, 'Test');

      expect(result).toEqual({
        success: false,
        error: 'Rate limited by Bluesky. Please try again later.',
      });
    });

    it('handles generic error with message', async () => {
      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() => Promise.reject(new Error('Network error')));

      const result = await createBlueskyPost(mockConfig, 'Test');

      expect(result).toEqual({
        success: false,
        error: 'Failed to post to Bluesky: Network error',
      });
    });

    it('handles non-Error exceptions', async () => {
      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        () => Promise.reject('String error')
      );

      const result = await createBlueskyPost(mockConfig, 'Test');

      expect(result).toEqual({
        success: false,
        error: 'Failed to post to Bluesky: Unknown error',
      });
    });

    it('handles malformed URI with missing rkey', async () => {
      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: 'at://did:plc:abc123',
          cid: 'cid123',
        })
      );

      const result = await createBlueskyPost(mockConfig, 'Test');

      expect(result).toEqual({
        success: true,
        uri: 'at://did:plc:abc123',
        cid: 'cid123',
        url: 'https://bsky.app/profile/test.bsky.social/post/',
      });
    });

    it('creates post with empty text', async () => {
      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
          cid: 'cid123',
        })
      );

      const result = await createBlueskyPost(mockConfig, '');

      expect(result.success).toBe(true);
      expect(mockAtpModule.__mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
        })
      );
    });

    it('creates post with very long text', async () => {
      const longText = 'a'.repeat(1000);

      mockAtpModule.__mockLogin.mockImplementation(() => Promise.resolve());
      mockAtpModule.__mockPost.mockImplementation(() =>
        Promise.resolve({
          uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
          cid: 'cid123',
        })
      );

      const result = await createBlueskyPost(mockConfig, longText);

      expect(result.success).toBe(true);
      expect(mockAtpModule.__mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          text: longText,
        })
      );
    });
  });
});
