/**
 * nexus-agents/cli - Link Validation Formatters
 *
 * Formatting functions for link validation results.
 * Extracted from link-validator.ts for file size compliance.
 *
 * @module cli/index-command-link-formatters
 * (Source: Issue #396)
 */

import type { LinkValidationResult } from './index-command-link-types.js';

/**
 * Formats link validation results as a table.
 */
export function formatLinkValidationTable(result: LinkValidationResult): string {
  const lines: string[] = [];
  const { summary } = result;

  lines.push('');
  lines.push('╭──────────────────────────────────────────────────────────────────────────────╮');
  lines.push('│                        Link Validation Report                               │');
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push(`│  Files scanned: ${String(summary.totalFiles).padEnd(58)}│`);
  lines.push(`│  Total links: ${String(summary.totalLinks).padEnd(60)}│`);
  lines.push(`│  Broken links: ${String(summary.brokenLinks).padEnd(59)}│`);
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push('│  By Type:                                                                    │');
  lines.push(
    `│    Internal: ${String(summary.byType.internal.total)} total, ${String(summary.byType.internal.broken)} broken`.padEnd(
      76
    ) + '│'
  );
  lines.push(
    `│    External: ${String(summary.byType.external.total)} total, ${String(summary.byType.external.broken)} broken`.padEnd(
      76
    ) + '│'
  );
  lines.push(
    `│    Anchor: ${String(summary.byType.anchor.total)} total, ${String(summary.byType.anchor.broken)} broken`.padEnd(
      76
    ) + '│'
  );

  if (summary.brokenLinks > 0) {
    lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
    lines.push('│  Broken Links:                                                               │');

    for (const file of result.files) {
      if (file.brokenLinks.length > 0) {
        lines.push(
          `│                                                                              │`
        );
        const fileDisplay =
          file.filePath.length > 72 ? '...' + file.filePath.slice(-69) : file.filePath;
        lines.push(`│  ${fileDisplay.padEnd(74)}│`);
        for (const link of file.brokenLinks) {
          const lineInfo = `    L${String(link.line)}:${String(link.column)}`;
          const urlDisplay = link.url.length > 40 ? link.url.slice(0, 37) + '...' : link.url;
          const errorDisplay =
            link.error.length > 20 ? link.error.slice(0, 17) + '...' : link.error;
          lines.push(
            `│  ${lineInfo.padEnd(12)} ${urlDisplay.padEnd(42)} ${errorDisplay.padEnd(17)}│`
          );
        }
      }
    }
  }

  lines.push('╰──────────────────────────────────────────────────────────────────────────────╯');
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats link validation results as JSON.
 */
export function formatLinkValidationJson(result: LinkValidationResult): string {
  return JSON.stringify(result, null, 2);
}
