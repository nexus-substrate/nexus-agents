/**
 * Research Index Operations
 *
 * Extracted from research-command.ts to stay under file size limits.
 * Handles stats, refresh, and check operations on the research index.
 *
 * @module cli/research-helpers-index-ops
 * @see Issue #237 (Epic #225)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  parseRegistry,
  generateIndexMarkdown,
  generateStatsJson,
  generateSummaryReport,
} from '../indexer/research-index/index.js';

/** Gets the registry path. */
function getRegistryPath(): string {
  return path.resolve(process.cwd(), 'docs/research/registry');
}

/** Gets the index output path. */
function getIndexPath(): string {
  return path.resolve(process.cwd(), 'docs/research/RESEARCH_INDEX.md');
}

/**
 * Handle stats subcommand - show research statistics.
 */
export async function handleStatsCommand(options: Record<string, unknown>): Promise<string> {
  const registryPath = getRegistryPath();
  const result = parseRegistry({ registryPath });

  if (!result.ok) {
    return `Error: Failed to parse registry: ${result.error.message}`;
  }

  const index = result.value;
  const format = options['format'] as string | undefined;

  // Ensure async compliance (future: may add async registry operations)
  await Promise.resolve();

  if (format === 'json') {
    return generateStatsJson(index);
  }

  return generateSummaryReport(index);
}

/**
 * Handle refresh subcommand - regenerate RESEARCH_INDEX.md.
 */
export async function handleRefreshCommand(options: Record<string, unknown>): Promise<string> {
  const outputPath = (options['output'] as string | undefined) ?? getIndexPath();
  const registryPath = getRegistryPath();
  const result = parseRegistry({ registryPath });

  if (!result.ok) {
    return `Error: Failed to parse registry: ${result.error.message}`;
  }

  const index = result.value;
  const mdResult = generateIndexMarkdown(index);

  if (!mdResult.ok) {
    return `Error: Failed to generate markdown: ${mdResult.error.message}`;
  }

  // Write the index
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, mdResult.value, 'utf-8');

  const stats = index.stats;
  return [
    `Research index regenerated successfully`,
    `  Output: ${outputPath}`,
    `  Papers: ${String(stats.totalPapers)}`,
    `  Techniques: ${String(stats.totalTechniques)}`,
    `  Implemented: ${String(stats.techniquesByStatus.implemented)}`,
  ].join('\n');
}

/**
 * Handle check subcommand - check if index is up to date.
 */
export async function handleCheckCommand(): Promise<string> {
  const indexPath = getIndexPath();

  // Check if index exists
  try {
    await fs.access(indexPath);
  } catch {
    return `Error: Research index not found: ${indexPath}. Run 'nexus-agents research refresh' first.`;
  }

  // Parse registry and generate fresh index
  const registryPath = getRegistryPath();
  const result = parseRegistry({ registryPath });

  if (!result.ok) {
    return `Error: Failed to parse registry: ${result.error.message}`;
  }

  const mdResult = generateIndexMarkdown(result.value);
  if (!mdResult.ok) {
    return `Error: Failed to generate markdown: ${mdResult.error.message}`;
  }

  // Read existing index
  const existingContent = await fs.readFile(indexPath, 'utf-8');
  const freshContent = mdResult.value;

  // Compare (normalize whitespace for comparison)
  const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const isFresh = normalize(existingContent) === normalize(freshContent);

  if (isFresh) {
    return `Research index is up to date (${String(result.value.stats.totalTechniques)} techniques)`;
  }

  return `Research index is out of date. Run "nexus-agents research refresh" to update.`;
}
