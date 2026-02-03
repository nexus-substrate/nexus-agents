/**
 * Release Announce Types
 *
 * Type definitions for the release-announce CLI command.
 *
 * @module cli/release-announce-types
 * (Source: Issue #641 - Release announcement bot)
 */

/**
 * Options for the release-announce command.
 */
export interface ReleaseAnnounceOptions {
  /** Version to announce. */
  version: string;
  /** Announcement channels to use. */
  channels: AnnouncementChannel[];
  /** Whether to run in dry-run mode (preview without publishing). */
  dryRun: boolean;
  /** Whether to show verbose output. */
  verbose: boolean;
  /** GitHub release URL. */
  releaseUrl?: string;
  /** Custom highlights to include. */
  highlights?: string[];
}

/**
 * Supported announcement channels.
 */
export type AnnouncementChannel = 'blog' | 'bluesky';

/**
 * Result from a single channel announcement.
 */
export interface ChannelAnnouncementResult {
  /** Channel name. */
  channel: AnnouncementChannel;
  /** Whether announcement succeeded. */
  success: boolean;
  /** Generated content. */
  content: string;
  /** Published URL (if applicable). */
  url?: string;
  /** Error message (if failed). */
  error?: string;
}

/**
 * Blog post metadata.
 */
export interface BlogPostMetadata {
  /** Post title. */
  title: string;
  /** Post date (YYYY-MM-DD). */
  date: string;
  /** Post description for SEO. */
  description: string;
  /** Post tags. */
  tags: string[];
  /** Author name. */
  author: string;
}

/**
 * Result of the release-announce command.
 */
export interface ReleaseAnnounceResult {
  /** Whether the command succeeded. */
  success: boolean;
  /** Version announced. */
  version: string;
  /** Results from each channel. */
  channels: ChannelAnnouncementResult[];
  /** Duration in milliseconds. */
  durationMs: number;
}

/**
 * Bluesky post limits.
 */
export const BLUESKY_LIMITS = {
  /** Maximum characters per post. */
  MAX_CHARS: 300,
  /** Maximum hashtags recommended. */
  MAX_HASHTAGS: 5,
};
