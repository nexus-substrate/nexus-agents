/**
 * Release Announce Command
 *
 * CLI command for generating release announcements.
 * Supports blog posts and Bluesky social media.
 *
 * @module cli/release-announce-command
 * (Source: Issue #641 - Release announcement bot)
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */

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
  getCommitsBetween,
  parseConventionalCommit,
  groupCommitsByCategory,
} from './release-notes-helpers.js';
import { getBlueskyConfig, createBlueskyPost } from './bluesky-client.js';

/**
 * Default options for the release-announce command.
 */
const DEFAULT_OPTIONS: Partial<ReleaseAnnounceOptions> = {
  channels: ['blog', 'bluesky'],
  dryRun: false,
  verbose: false,
};

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

  // Extract first 5 bullet points from Added section
  const addedMatch = match[0].match(/### Added\n((?:- .+\n)+)/);
  if (addedMatch?.[1]) {
    return addedMatch[1]
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

/**
 * Generates blog post content following the blog template.
 *
 * @param options - Announcement options
 * @returns Blog post markdown content
 */
function generateBlogPost(options: ReleaseAnnounceOptions): string {
  const highlights = options.highlights || extractHighlightsFromChangelog(options.version);
  const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);

  // Get commit stats
  const fromRef = getLatestTag() || 'HEAD~50';
  const commits = getCommitsBetween(fromRef, 'HEAD');
  const parsedCommits = commits.map((line) => {
    const spaceIndex = line.indexOf(' ');
    return parseConventionalCommit(line.substring(0, spaceIndex), line.substring(spaceIndex + 1));
  });
  const categories = groupCommitsByCategory(parsedCommits);

  const featCount = categories.find((c) => c.name === 'Added')?.commits.length ?? 0;
  const fixCount = categories.find((c) => c.name === 'Fixed')?.commits.length ?? 0;
  const refactorCount = categories.find((c) => c.name === 'Changed')?.commits.length ?? 0;

  const frontmatter: BlogPostMetadata = {
    title: `nexus-agents v${options.version} Released: Multi-Agent Orchestration Improvements`,
    date: today,
    description: `Announcing nexus-agents v${options.version} with ${featCount} new features, ${fixCount} bug fixes, and improved multi-agent orchestration capabilities.`,
    tags: ['nexus-agents', 'release', 'mcp', 'ai', 'multi-agent'],
    author: 'William Zujkowski',
  };

  const content = `---
title: "${frontmatter.title}"
date: ${frontmatter.date}
description: "${frontmatter.description}"
tags: [${frontmatter.tags.map((t) => `"${t}"`).join(', ')}]
author: "${frontmatter.author}"
---

# nexus-agents v${options.version} Released

**BLUF (Bottom Line Up Front):**

I've released nexus-agents v${options.version} with ${commits.length} changes including ${featCount} new features and ${fixCount} bug fixes. This release focuses on improved multi-agent orchestration, better developer experience, and enhanced reliability.

**Why it matters:** Multi-agent AI orchestration is becoming essential for complex software development tasks. This release makes it easier to leverage multiple AI models effectively.

---

## Release Highlights

${highlights.map((h) => `- **${h}**`).join('\n')}

---

## By the Numbers

I analyzed the changes in this release:

- **Total commits:** ${commits.length}
- **New features:** ${featCount}
- **Bug fixes:** ${fixCount}
- **Refactoring:** ${refactorCount}

---

## Key Changes

### New Features

${
  categories
    .find((c) => c.name === 'Added')
    ?.commits.slice(0, 5)
    .map((c) => `- ${c.scope ? `**${c.scope}**: ` : ''}${c.subject}`)
    .join('\n') || 'See CHANGELOG.md for details.'
}

### Bug Fixes

${
  categories
    .find((c) => c.name === 'Fixed')
    ?.commits.slice(0, 5)
    .map((c) => `- ${c.scope ? `**${c.scope}**: ` : ''}${c.subject}`)
    .join('\n') || 'See CHANGELOG.md for details.'
}

---

## Installation

\`\`\`bash
npm install -g nexus-agents@${options.version}
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
- [GitHub Release](${options.releaseUrl || `https://github.com/nexus-substrate/nexus-agents/releases/tag/v${options.version}`})
- [Full Changelog](https://github.com/nexus-substrate/nexus-agents/blob/main/CHANGELOG.md)
- [Documentation](https://github.com/nexus-substrate/nexus-agents)

---

*Released via multi-agent orchestration*
`;

  return content;
}

/**
 * Generates Bluesky post content.
 *
 * @param options - Announcement options
 * @returns Bluesky post content (within character limit)
 */
function generateBlueskyPost(options: ReleaseAnnounceOptions): string {
  const highlights = options.highlights || extractHighlightsFromChangelog(options.version);
  const highlight = highlights[0] || 'new features and improvements';

  const releaseUrl =
    options.releaseUrl ||
    `https://github.com/nexus-substrate/nexus-agents/releases/tag/v${options.version}`;

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
 * Announces to blog channel.
 *
 * @param options - Announcement options
 * @returns Channel result
 */
async function announceToBlog(options: ReleaseAnnounceOptions): Promise<ChannelAnnouncementResult> {
  const content = generateBlogPost(options);
  const filename = `${new Date().toISOString().split('T')[0]}-nexus-agents-v${options.version.replace(/\./g, '-')}-release.md`;

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
        result = await announceToBlog(opts);
        break;
      case 'bluesky':
        result = await announceToBluesky(opts);
        break;
      default:
        result = {
          channel,
          success: false,
          content: '',
          error: `Unknown channel: ${channel}`,
        };
    }
    results.push(result);
  }

  const allSuccess = results.every((r) => r.success);

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
  console.log(`${colors.dim}Duration:${colors.reset} ${result.durationMs}ms`);
  console.log('');

  for (const channel of result.channels) {
    const status = channel.success
      ? `${colors.green}✓${colors.reset}`
      : `${colors.red}✗${colors.reset}`;
    console.log(`${status} ${colors.bold}${channel.channel.toUpperCase()}${colors.reset}`);

    if (channel.url) {
      console.log(`  ${colors.dim}URL:${colors.reset} ${channel.url}`);
    }
    if (channel.error) {
      console.log(`  ${colors.red}Error:${colors.reset} ${channel.error}`);
    }

    if (verbose) {
      console.log(`  ${colors.dim}Content preview:${colors.reset}`);
      const preview = channel.content.split('\n').slice(0, 5).join('\n');
      console.log(`  ${colors.dim}${preview}...${colors.reset}`);
    }
    console.log('');
  }

  const allSuccess = result.channels.every((c) => c.success);
  if (allSuccess) {
    console.log(`${colors.green}${colors.bold}✓ All announcements generated${colors.reset}`);
  } else {
    console.log(`${colors.yellow}${colors.bold}⚠ Some announcements failed${colors.reset}`);
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
  // Determine version
  let version: string;
  if (args.options.version) {
    version = args.options.version;
  } else {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { version?: string };
      if (!pkg.version) {
        console.error(`${colors.red}Error: Could not determine version${colors.reset}`);
        return 1;
      }
      version = pkg.version;
    } catch {
      console.error(`${colors.red}Error: Could not determine version${colors.reset}`);
      return 1;
    }
  }

  // Parse channels
  const channelList = args.options.channels?.split(',') || ['blog', 'bluesky'];
  const channels = channelList.filter(
    (c): c is AnnouncementChannel => c === 'blog' || c === 'bluesky'
  );

  const result = await runReleaseAnnounce({
    version,
    channels,
    dryRun: args.options.dryRun ?? false,
    verbose: args.options.verbose ?? false,
    ...(args.options.releaseUrl !== undefined && { releaseUrl: args.options.releaseUrl }),
  });

  printReleaseAnnounceResult(result, args.options.verbose);
  return result.channels.every((c) => c.success) ? 0 : 1;
}
