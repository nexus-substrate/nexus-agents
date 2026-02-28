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

/** Lazily loads @atproto/api (optional dependency). */
async function loadAtproto(): Promise<
  | {
      AtpAgent: typeof import('@atproto/api').AtpAgent;
      RichText: typeof import('@atproto/api').RichText;
    }
  | undefined
> {
  try {
    const mod = await import('@atproto/api');
    return { AtpAgent: mod.AtpAgent, RichText: mod.RichText };
  } catch {
    return undefined;
  }
}

/** Maps AT Protocol errors to user-friendly messages. */
function mapAtpError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (message.includes('Invalid identifier or password'))
    return 'Authentication failed. Check BLUESKY_HANDLE and BLUESKY_APP_PASSWORD.';
  if (message.includes('Rate limit')) return 'Rate limited by Bluesky. Please try again later.';
  return `Failed to post to Bluesky: ${message}`;
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
  const atp = await loadAtproto();
  if (!atp)
    return { success: false, error: 'Missing optional dependency: npm install @atproto/api' };

  const agent = new atp.AtpAgent({ service: config.service ?? 'https://bsky.social' });

  try {
    await agent.login({ identifier: config.handle, password: config.appPassword });

    const richText = new atp.RichText({ text });
    await richText.detectFacets(agent);

    const response = await agent.post({
      text: richText.text,
      ...(richText.facets !== undefined && { facets: richText.facets }),
      createdAt: new Date().toISOString(),
    });

    const rkey = response.uri.split('/')[4] ?? '';
    const url = `https://bsky.app/profile/${config.handle}/post/${rkey}`;
    return { success: true, uri: response.uri, cid: response.cid, url };
  } catch (error) {
    return { success: false, error: mapAtpError(error) };
  }
}
