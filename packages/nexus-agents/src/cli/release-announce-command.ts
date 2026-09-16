/**
 * Release Announce Command
 *
 * CLI command for generating release announcements.
 * Supports blog posts and Bluesky social media.
 *
 * @module cli/release-announce-command
 * (Source: Issue #641 - Release announcement bot)
 */

/* eslint-disable no-console -- stdout is this command's user-facing output; the logger writes to stderr */

import { readFileSync, existsSync } from 'node:fs';
import { colors } from './ansi-output.js';
import {
  type ReleaseAnnounceOptions,
  type ReleaseAnnounceResult,
  type ChannelAnnouncementResult,
  type BlogPostMetadata,
  type AnnouncementChannel,
  BLUESKY_LIMITS,
} from './release-announce-types.js';
import {
  getLatestTag,
  tryGetCommitsBetween,
  parseConventionalCommit,
  groupCommitsByCategory,
} from './release-notes-helpers.js';
import { getBlueskyConfig, createBlueskyPost } from './bluesky-client.js';
import { allOf } from '../utils/verdict-aggregation.js';

/**
 * Default options for the release-announce command.
 */
const DEFAULT_OPTIONS: Partial<ReleaseAnnounceOptions> = {
  channels: ['blog', 'bluesky'],
  dryRun: false,
  verbose: false,
};

/** An optional CLI/config string given as the empty string is treated as not given. */
function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/** Today's date as YYYY-MM-DD, from the ISO timestamp. */
function isoDateToday(): string {
  return new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
}

/**
 * Extracts highlights from CHANGELOG.md for a version.
 *
 * @param version - Version to extract highlights for
 * @returns Array of highlight strings
 */
function extractHighlightsFromChangelog(version: string): string[] {
  if (!existsSync('CHANGELOG.md')) return [];

  const changelog = readFileSync('CHANGELOG.md', 'utf-8');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const versionRegex = new RegExp(`## \\[${escaped}\\][^#]*`, 's');
  const match = changelog.match(versionRegex);

  if (!match) return [];

  // Extract first 5 bullet points from Added section. The capture group
  // requires at least one bullet, so a matched group is never empty.
  const addedMatch = match[0].match(/### Added\n((?:- .+\n)+)/);
  const added = addedMatch?.[1];
  if (added !== undefined) {
    return added
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .slice(0, 5)
      .map((l) =>
        l
          .replace(/^- /, '')
          .replace(/\(#\d+\)/g, '')
          .trim()
      );
  }

  return [];
}

/** Explicit highlights win; an explicit empty list is kept as-is (nothing to announce). */
function resolveHighlights(options: ReleaseAnnounceOptions): string[] {
  return options.highlights ?? extractHighlightsFromChangelog(options.version);
}

/** An explicit release URL wins; an empty one is unusable and falls back to the tag URL. */
function resolveReleaseUrl(options: ReleaseAnnounceOptions): string {
  return isNonEmpty(options.releaseUrl)
    ? options.releaseUrl
    : `https://github.com/nexus-substrate/nexus-agents/releases/tag/v${options.version}`;
}

/** Commit statistics for the blog post's "By the Numbers" panel. */
interface BlogCommitStats {
  totalCommits: number;
  featCount: number;
  fixCount: number;
  refactorCount: number;
  categories: ReturnType<typeof groupCommitsByCategory>;
}

/**
 * Collects commit stats since the latest tag. Closes #2980 (announce-command
 * path): if git fails or the ref is bad, fall back to an empty stat panel
 * rather than silently generating a blog post claiming "0 new features." The
 * blog post still generates because the announce-command's main purpose
 * (creating a template the operator hand-edits) doesn't depend on commit
 * stats being populated — but we leave a comment trail so they notice.
 */
function collectBlogCommitStats(): BlogCommitStats {
  const fromRef = getLatestTag() ?? 'HEAD~50';
  const commitsResult = tryGetCommitsBetween(fromRef, 'HEAD');
  const commits = commitsResult.kind === 'ok' ? commitsResult.commits : [];
  if (commitsResult.kind !== 'ok') {
    const detail =
      commitsResult.kind === 'invalid_ref'
        ? `invalid ref: ${commitsResult.ref}`
        : commitsResult.reason;
    console.warn(
      `[release-announce] git log failed for ${fromRef}..HEAD (${detail}); commit stats will be zero.`
    );
  }
  const parsedCommits = commits.map((line) => {
    const spaceIndex = line.indexOf(' ');
    return parseConventionalCommit(line.substring(0, spaceIndex), line.substring(spaceIndex + 1));
  });
  const categories = groupCommitsByCategory(parsedCommits);
  const countOf = (name: string): number =>
    categories.find((c) => c.name === name)?.commits.length ?? 0;

  return {
    totalCommits: commits.length,
    featCount: countOf('Added'),
    fixCount: countOf('Fixed'),
    refactorCount: countOf('Changed'),
    categories,
  };
}

/** Lists up to five commits of one category, or a pointer to the CHANGELOG when there are none. */
function renderTopCommits(categories: BlogCommitStats['categories'], name: string): string {
  const commits = categories.find((c) => c.name === name)?.commits.slice(0, 5) ?? [];
  if (commits.length === 0) return 'See CHANGELOG.md for details.';
  // An empty scope renders the same as no scope.
  return commits
    .map((c) => `- ${isNonEmpty(c.scope) ? `**${c.scope}**: ` : ''}${c.subject}`)
    .join('\n');
}

function renderBlogFrontmatter(frontmatter: BlogPostMetadata): string {
  return `---
title: "${frontmatter.title}"
date: ${frontmatter.date}
description: "${frontmatter.description}"
tags: [${frontmatter.tags.map((t) => `"${t}"`).join(', ')}]
author: "${frontmatter.author}"
---
`;
}

function renderBlogSummary(version: string, stats: BlogCommitStats, highlights: string[]): string {
  return `
# nexus-agents v${version} Released

**BLUF (Bottom Line Up Front):**

I've released nexus-agents v${version} with ${String(stats.totalCommits)} changes including ${String(stats.featCount)} new features and ${String(stats.fixCount)} bug fixes. This release focuses on improved multi-agent orchestration, better developer experience, and enhanced reliability.

**Why it matters:** Multi-agent AI orchestration is becoming essential for complex software development tasks. This release makes it easier to leverage multiple AI models effectively.

---

## Release Highlights

${highlights.map((h) => `- **${h}**`).join('\n')}

---

## By the Numbers

I analyzed the changes in this release:

- **Total commits:** ${String(stats.totalCommits)}
- **New features:** ${String(stats.featCount)}
- **Bug fixes:** ${String(stats.fixCount)}
- **Refactoring:** ${String(stats.refactorCount)}

---
`;
}

function renderBlogChanges(categories: BlogCommitStats['categories']): string {
  return `
## Key Changes

### New Features

${renderTopCommits(categories, 'Added')}

### Bug Fixes

${renderTopCommits(categories, 'Fixed')}

---
`;
}

function renderBlogFooter(version: string, releaseUrl: string): string {
  return `
## Installation

\`\`\`bash
npm install -g nexus-agents@${version}
nexus-agents doctor  # Verify installation
\`\`\`

---

## Key Takeaways

- Multi-agent orchestration continues to improve developer productivity
- The fitness scoring system helps maintain architectural quality
- Consensus voting provides better decision-making for AI-generated content

---

## Further Reading

### Official Resources
- [GitHub Release](${releaseUrl})
- [Full Changelog](https://github.com/nexus-substrate/nexus-agents/blob/main/CHANGELOG.md)
- [Documentation](https://github.com/nexus-substrate/nexus-agents)

---

*Released via multi-agent orchestration*
`;
}

/**
 * Generates blog post content following the blog template.
 *
 * @param options - Announcement options
 * @returns Blog post markdown content
 */
function generateBlogPost(options: ReleaseAnnounceOptions): string {
  const highlights = resolveHighlights(options);
  const stats = collectBlogCommitStats();

  const frontmatter: BlogPostMetadata = {
    title: `nexus-agents v${options.version} Released: Multi-Agent Orchestration Improvements`,
    date: isoDateToday(),
    description: `Announcing nexus-agents v${options.version} with ${String(stats.featCount)} new features, ${String(stats.fixCount)} bug fixes, and improved multi-agent orchestration capabilities.`,
    tags: ['nexus-agents', 'release', 'mcp', 'ai', 'multi-agent'],
    author: 'William Zujkowski',
  };

  return (
    renderBlogFrontmatter(frontmatter) +
    renderBlogSummary(options.version, stats, highlights) +
    renderBlogChanges(stats.categories) +
    renderBlogFooter(options.version, resolveReleaseUrl(options))
  );
}

/**
 * Generates Bluesky post content.
 *
 * @param options - Announcement options
 * @returns Bluesky post content (within character limit)
 */
function generateBlueskyPost(options: ReleaseAnnounceOptions): string {
  const highlights = resolveHighlights(options);
  // A blank first highlight is nothing to announce, the same as none.
  const firstHighlight = highlights[0];
  const highlight = isNonEmpty(firstHighlight) ? firstHighlight : 'new features and improvements';

  const releaseUrl = resolveReleaseUrl(options);

  // Build post within character limit
  let post = `🚀 nexus-agents v${options.version} released!\n\n`;
  post += `Highlights: ${highlight}\n\n`;
  post += `${releaseUrl}\n\n`;
  post += `#AI #MCP #MultiAgent #OpenSource`;

  // Truncate if needed
  if (post.length > BLUESKY_LIMITS.MAX_CHARS) {
    const truncateLength = BLUESKY_LIMITS.MAX_CHARS - 3;
    post = post.substring(0, truncateLength) + '...';
  }

  return post;
}

/**
 * Announces to blog channel. Synchronous: it only renders the post; publishing
 * is a manual step (see below).
 *
 * @param options - Announcement options
 * @returns Channel result
 */
function announceToBlog(options: ReleaseAnnounceOptions): ChannelAnnouncementResult {
  const content = generateBlogPost(options);
  const filename = `${isoDateToday()}-nexus-agents-v${options.version.replace(/\./g, '-')}-release.md`;

  if (options.dryRun) {
    return {
      channel: 'blog',
      success: true,
      content,
      url: `(dry-run) src/posts/${filename}`,
    };
  }

  // In a real implementation, this would create a PR to the blog repo
  // For now, we'll output the content for manual posting
  console.log(
    `${colors.dim}Blog post content generated. Create manually in blog repo.${colors.reset}`
  );

  return {
    channel: 'blog',
    success: true,
    content,
    url: `Manual: src/posts/${filename}`,
  };
}

/**
 * Announces to Bluesky channel.
 *
 * @param options - Announcement options
 * @returns Channel result
 */
async function announceToBluesky(
  options: ReleaseAnnounceOptions
): Promise<ChannelAnnouncementResult> {
  const content = generateBlueskyPost(options);

  if (options.dryRun) {
    return {
      channel: 'bluesky',
      success: true,
      content,
      url: '(dry-run)',
    };
  }

  // Check for Bluesky credentials
  const config = getBlueskyConfig();

  if (!config) {
    return {
      channel: 'bluesky',
      success: false,
      content,
      error: 'BLUESKY_HANDLE and BLUESKY_APP_PASSWORD environment variables required.',
    };
  }

  // Post to Bluesky via AT Protocol
  const result = await createBlueskyPost(config, content);

  if (!result.success) {
    return {
      channel: 'bluesky',
      success: false,
      content,
      ...(result.error !== undefined && { error: result.error }),
    };
  }

  return {
    channel: 'bluesky',
    success: true,
    content,
    ...(result.url !== undefined && { url: result.url }),
  };
}

/**
 * Runs the release-announce command.
 *
 * @param options - Command options
 * @returns Announcement result
 */
export async function runReleaseAnnounce(
  options: Partial<ReleaseAnnounceOptions> & { version: string }
): Promise<ReleaseAnnounceResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options } as ReleaseAnnounceOptions;

  if (opts.verbose) {
    console.log(`${colors.cyan}${colors.bold}Release Announcement Generator${colors.reset}`);
    console.log(`${colors.dim}Version: ${opts.version}${colors.reset}`);
    console.log(`${colors.dim}Channels: ${opts.channels.join(', ')}${colors.reset}`);
    console.log('');
  }

  const results: ChannelAnnouncementResult[] = [];

  for (const channel of opts.channels) {
    if (opts.verbose) {
      console.log(`${colors.dim}Generating ${channel} announcement...${colors.reset}`);
    }

    let result: ChannelAnnouncementResult;
    switch (channel) {
      case 'blog':
        result = announceToBlog(opts);
        break;
      case 'bluesky':
        result = await announceToBluesky(opts);
        break;
      default:
        result = {
          channel,
          success: false,
          content: '',
          error: `Unknown channel: ${String(channel)}`,
        };
    }
    results.push(result);
  }

  // Announcing nothing is not a successful announcement (#4581): `[].every()`
  // is `true`, so a filtered-to-empty channel list used to report a clean run.
  const allSuccess = allOf(results, (r) => r.success, false);

  return {
    success: allSuccess,
    version: opts.version,
    channels: results,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Prints the announcement result to console.
 *
 * @param result - Announcement result
 * @param verbose - Whether to show verbose output
 */
export function printReleaseAnnounceResult(result: ReleaseAnnounceResult, verbose = false): void {
  console.log('');
  console.log(`${colors.cyan}${colors.bold}Release Announcement Report${colors.reset}`);
  console.log(`${colors.dim}${'═'.repeat(50)}${colors.reset}`);
  console.log(`${colors.dim}Version:${colors.reset} ${result.version}`);
  console.log(`${colors.dim}Duration:${colors.reset} ${String(result.durationMs)}ms`);
  console.log('');

  for (const channel of result.channels) {
    const status = channel.success
      ? `${colors.green}✓${colors.reset}`
      : `${colors.red}✗${colors.reset}`;
    console.log(`${status} ${colors.bold}${channel.channel.toUpperCase()}${colors.reset}`);

    if (isNonEmpty(channel.url)) {
      console.log(`  ${colors.dim}URL:${colors.reset} ${channel.url}`);
    }
    if (isNonEmpty(channel.error)) {
      console.log(`  ${colors.red}Error:${colors.reset} ${channel.error}`);
    }

    if (verbose) {
      console.log(`  ${colors.dim}Content preview:${colors.reset}`);
      const preview = channel.content.split('\n').slice(0, 5).join('\n');
      console.log(`  ${colors.dim}${preview}...${colors.reset}`);
    }
    console.log('');
  }

  if (result.channels.length === 0) {
    console.log(`${colors.yellow}${colors.bold}⚠ No announcements were generated${colors.reset}`);
  } else if (allOf(result.channels, (c) => c.success, false)) {
    console.log(`${colors.green}${colors.bold}✓ All announcements generated${colors.reset}`);
  } else {
    console.log(`${colors.yellow}${colors.bold}⚠ Some announcements failed${colors.reset}`);
  }
}

/**
 * Resolves the version to announce: an explicit non-empty `--version`, else
 * the `version` field of ./package.json. Returns undefined when neither yields one.
 */
function resolveAnnounceVersion(explicit: string | undefined): string | undefined {
  if (isNonEmpty(explicit)) return explicit;
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { version?: string };
    return isNonEmpty(pkg.version) ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * CLI command handler for release-announce.
 *
 * @param args - Command arguments
 * @returns Exit code
 */
export async function releaseAnnounceCommand(args: {
  positionals: string[];
  options: {
    version?: string;
    channels?: string;
    dryRun?: boolean;
    verbose?: boolean;
    releaseUrl?: string;
  };
}): Promise<number> {
  const version = resolveAnnounceVersion(args.options.version);
  if (version === undefined) {
    console.error(`${colors.red}Error: Could not determine version${colors.reset}`);
    return 1;
  }

  // Parse channels
  const channelList = args.options.channels?.split(',') ?? ['blog', 'bluesky'];
  const channels = channelList.filter(
    (c): c is AnnouncementChannel => c === 'blog' || c === 'bluesky'
  );
  if (channels.length === 0) {
    console.error(
      `${colors.red}Error: No known announcement channels in "${channelList.join(',')}" ` +
        `(known: blog, bluesky)${colors.reset}`
    );
    return 1;
  }

  const result = await runReleaseAnnounce({
    version,
    channels,
    dryRun: args.options.dryRun ?? false,
    verbose: args.options.verbose ?? false,
    ...(args.options.releaseUrl !== undefined && { releaseUrl: args.options.releaseUrl }),
  });

  printReleaseAnnounceResult(result, args.options.verbose);
  return allOf(result.channels, (c) => c.success, false) ? 0 : 1;
}
