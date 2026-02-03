/**
 * Bluesky Client
 *
 * AT Protocol client for posting to Bluesky.
 * Encapsulates authentication, posting, and error handling.
 *
 * @module cli/bluesky-client
 * (Source: Issue #642 - Bluesky AT Protocol posting)
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */

import { AtpAgent, RichText } from '@atproto/api';

/**
 * Result of a Bluesky post operation.
 */
export interface BlueskyPostResult {
  success: boolean;
  uri?: string;
  cid?: string;
  url?: string;
  error?: string;
}

/**
 * Bluesky client configuration.
 */
export interface BlueskyConfig {
  handle: string;
  appPassword: string;
  service?: string;
}

/**
 * Gets Bluesky configuration from environment variables.
 *
 * @returns Configuration or undefined if not configured
 */
export function getBlueskyConfig(): BlueskyConfig | undefined {
  const handle = process.env.BLUESKY_HANDLE;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;

  if (!handle || !appPassword) {
    return undefined;
  }

  return {
    handle,
    appPassword,
    service: process.env.BLUESKY_SERVICE ?? 'https://bsky.social',
  };
}

/**
 * Creates a Bluesky post.
 *
 * @param config - Bluesky configuration
 * @param text - Post text content
 * @returns Post result with URI and URL
 */
export async function createBlueskyPost(
  config: BlueskyConfig,
  text: string
): Promise<BlueskyPostResult> {
  const agent = new AtpAgent({ service: config.service ?? 'https://bsky.social' });

  try {
    // Authenticate
    await agent.login({
      identifier: config.handle,
      password: config.appPassword,
    });

    // Create rich text with facets (links, mentions, hashtags)
    const richText = new RichText({ text });
    await richText.detectFacets(agent);

    // Create post
    const response = await agent.post({
      text: richText.text,
      ...(richText.facets !== undefined && { facets: richText.facets }),
      createdAt: new Date().toISOString(),
    });

    // Extract post URL from URI
    // URI format: at://did:plc:xxx/app.bsky.feed.post/yyy
    const uriParts = response.uri.split('/');
    const rkey = uriParts[4] ?? '';
    const url = `https://bsky.app/profile/${config.handle}/post/${rkey}`;

    return {
      success: true,
      uri: response.uri,
      cid: response.cid,
      url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Handle specific AT Protocol errors
    if (message.includes('Invalid identifier or password')) {
      return {
        success: false,
        error: 'Authentication failed. Check BLUESKY_HANDLE and BLUESKY_APP_PASSWORD.',
      };
    }

    if (message.includes('Rate limit')) {
      return {
        success: false,
        error: 'Rate limited by Bluesky. Please try again later.',
      };
    }

    return {
      success: false,
      error: `Failed to post to Bluesky: ${message}`,
    };
  }
}
