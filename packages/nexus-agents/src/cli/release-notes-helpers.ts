/**
 * Release Notes Helpers
 *
 * Helper functions for parsing commits and generating release notes.
 *
 * @module cli/release-notes-helpers
 * (Source: Issue #639 - Automated release notes generator)
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

import { execSync } from 'node:child_process';
import {
  type CategorizedCommit,
  type ReleaseNotesCategory,
  COMMIT_TYPE_TO_CATEGORY,
  CATEGORY_ORDER,
} from './release-notes-types.js';

/**
 * Gets the latest git tag.
 *
 * @returns Latest tag or undefined if none exist
 */
export function getLatestTag(): string | undefined {
  try {
    const result = execSync('git describe --tags --abbrev=0', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Gets commits between two references.
 *
 * @param from - Starting reference (tag or commit)
 * @param to - Ending reference (defaults to HEAD)
 * @returns Array of commit lines
 */
export function getCommitsBetween(from: string, to = 'HEAD'): string[] {
  try {
    const result = execSync(`git log ${from}..${to} --oneline --format="%h %s"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result ? result.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Parses a conventional commit message.
 *
 * @param hash - Commit hash
 * @param message - Commit message
 * @returns Categorized commit
 */
export function parseConventionalCommit(hash: string, message: string): CategorizedCommit {
  // Match conventional commit: type(scope)!: subject
  const conventionalRegex = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
  const match = message.match(conventionalRegex);

  if (match) {
    const [, type, scope, breaking, subject] = match;
    const subjectText = subject ?? message;
    const issues = extractIssueNumbers(subjectText);

    return {
      hash,
      type: (type ?? 'other').toLowerCase(),
      ...(scope !== undefined && { scope }),
      subject: subjectText.trim(),
      message,
      breaking: breaking === '!',
      issues,
    };
  }

  // Non-conventional commit
  return {
    hash,
    type: 'other',
    subject: message,
    message,
    breaking: false,
    issues: extractIssueNumbers(message),
  };
}

/**
 * Extracts issue numbers from a commit message.
 *
 * @param message - Commit message
 * @returns Array of issue numbers (e.g., ["#123", "#456"])
 */
export function extractIssueNumbers(message: string): string[] {
  const issueRegex = /#(\d+)/g;
  const matches = message.matchAll(issueRegex);
  return Array.from(matches, (m) => `#${m[1]}`);
}

/**
 * Maps a commit type to a Keep a Changelog category.
 *
 * @param type - Conventional commit type
 * @returns Keep a Changelog category
 */
export function mapTypeToCategory(type: string): string {
  return COMMIT_TYPE_TO_CATEGORY[type.toLowerCase()] || 'Maintenance';
}

/**
 * Groups commits by category.
 *
 * @param commits - Array of categorized commits
 * @returns Array of release notes categories
 */
export function groupCommitsByCategory(commits: CategorizedCommit[]): ReleaseNotesCategory[] {
  const categoryMap = new Map<string, CategorizedCommit[]>();

  for (const commit of commits) {
    const category = mapTypeToCategory(commit.type);
    const existing = categoryMap.get(category) || [];
    existing.push(commit);
    categoryMap.set(category, existing);
  }

  // Sort categories by defined order
  const categories: ReleaseNotesCategory[] = [];
  for (const name of CATEGORY_ORDER) {
    const commits = categoryMap.get(name);
    if (commits && commits.length > 0) {
      categories.push({ name, commits });
    }
  }

  // Add any remaining categories not in the order
  for (const [name, commits] of categoryMap) {
    if (!CATEGORY_ORDER.includes(name) && commits.length > 0) {
      categories.push({ name, commits });
    }
  }

  return categories;
}

/**
 * Formats a single commit as a changelog entry.
 *
 * @param commit - Categorized commit
 * @returns Formatted changelog line
 */
export function formatCommitEntry(commit: CategorizedCommit): string {
  const scopePart = commit.scope ? `**${commit.scope}**: ` : '';
  const issuesPart = commit.issues.length > 0 ? ` (${commit.issues.join(', ')})` : '';
  const breakingPrefix = commit.breaking ? '**BREAKING**: ' : '';

  return `- ${breakingPrefix}${scopePart}${commit.subject}${issuesPart}`;
}

/**
 * Generates changelog format output.
 *
 * @param version - Version being released
 * @param date - Release date (YYYY-MM-DD)
 * @param categories - Categorized release notes
 * @returns Changelog format string
 */
export function generateChangelogFormat(
  version: string,
  date: string,
  categories: ReleaseNotesCategory[]
): string {
  const lines: string[] = [];

  lines.push(`## [${version}] - ${date}`);
  lines.push('');

  for (const category of categories) {
    lines.push(`### ${category.name}`);
    lines.push('');
    for (const commit of category.commits) {
      lines.push(formatCommitEntry(commit));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates JSON format output.
 *
 * @param version - Version being released
 * @param date - Release date
 * @param categories - Categorized release notes
 * @returns JSON string
 */
export function generateJsonFormat(
  version: string,
  date: string,
  categories: ReleaseNotesCategory[]
): string {
  return JSON.stringify(
    {
      version,
      date,
      categories: categories.map((cat) => ({
        name: cat.name,
        commits: cat.commits.map((c) => ({
          hash: c.hash,
          type: c.type,
          scope: c.scope,
          subject: c.subject,
          breaking: c.breaking,
          issues: c.issues,
        })),
      })),
    },
    null,
    2
  );
}

/**
 * Generates markdown format output (GitHub release style).
 *
 * @param version - Version being released
 * @param categories - Categorized release notes
 * @returns Markdown string
 */
export function generateMarkdownFormat(
  version: string,
  categories: ReleaseNotesCategory[]
): string {
  const lines: string[] = [];

  lines.push(`# Release ${version}`);
  lines.push('');

  // Add highlights section
  const featCount = categories.find((c) => c.name === 'Added')?.commits.length ?? 0;
  const fixCount = categories.find((c) => c.name === 'Fixed')?.commits.length ?? 0;
  const totalCount = categories.reduce((sum, c) => sum + c.commits.length, 0);

  lines.push('## Highlights');
  lines.push('');
  lines.push(`This release includes **${totalCount}** changes:`);
  if (featCount > 0) lines.push(`- ${featCount} new features`);
  if (fixCount > 0) lines.push(`- ${fixCount} bug fixes`);
  lines.push('');

  // Add categories
  for (const category of categories) {
    lines.push(`## ${category.name}`);
    lines.push('');
    for (const commit of category.commits) {
      lines.push(formatCommitEntry(commit));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Determines the next version based on commits.
 *
 * @param currentVersion - Current version string (e.g., "2.5.0")
 * @param commits - Categorized commits
 * @returns Suggested next version
 */
export function suggestNextVersion(currentVersion: string, commits: CategorizedCommit[]): string {
  const parts = currentVersion.replace(/^v/, '').split('.').map(Number);
  if (parts.length !== 3) return currentVersion;

  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  // Check for breaking changes
  const hasBreaking = commits.some((c) => c.breaking);
  if (hasBreaking) {
    return `${major + 1}.0.0`;
  }

  // Check for features
  const hasFeatures = commits.some((c) => c.type === 'feat');
  if (hasFeatures) {
    return `${major}.${minor + 1}.0`;
  }

  // Patch version for fixes and other changes
  return `${major}.${minor}.${patch + 1}`;
}
