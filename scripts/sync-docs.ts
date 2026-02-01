#!/usr/bin/env npx tsx
/**
 * sync-docs.ts - Synchronize canonical docs to website content
 *
 * Transforms canonical documentation from docs/ to Starlight format
 * for the Astro documentation website.
 *
 * Usage:
 *   npx tsx scripts/sync-docs.ts           # Sync all docs
 *   npx tsx scripts/sync-docs.ts --dry-run # Show what would change
 *   npx tsx scripts/sync-docs.ts --check   # Check if in sync (for CI)
 *   npx tsx scripts/sync-docs.ts --verbose # Verbose output
 *
 * (Source: Issue #609, Epic #608)
 * (Consensus: 100% APPROVED, 3/3 agents)
 */

/* eslint-disable no-console */
/* eslint-disable complexity */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

interface DocMapping {
  /** Source glob pattern or file path (relative to repo root) */
  source: string;
  /** Destination directory or file (relative to website/src/content/docs/) */
  dest: string;
  /** Optional title override */
  titleOverride?: string;
}

/**
 * Mapping of canonical docs to website locations.
 * Order matters for processing.
 */
const DOC_MAPPINGS: DocMapping[] = [
  // Getting started docs
  { source: 'docs/getting-started/INSTALLATION.md', dest: 'getting-started/installation.md' },
  { source: 'docs/getting-started/CONFIGURATION.md', dest: 'getting-started/configuration.md' },

  // Architecture docs
  { source: 'docs/architecture/AGENT_SYSTEM.md', dest: 'architecture/agent-system.md' },
  {
    source: 'docs/architecture/CONSENSUS_PROTOCOLS.md',
    dest: 'architecture/consensus-protocols.md',
  },
  { source: 'docs/architecture/ROUTING_SYSTEM.md', dest: 'architecture/routing-system.md' },
  { source: 'docs/architecture/MEMORY_SYSTEM.md', dest: 'architecture/memory-system.md' },
  { source: 'docs/architecture/MCP_PROTOCOL.md', dest: 'architecture/mcp-protocol.md' },
  { source: 'docs/architecture/SECURITY.md', dest: 'architecture/security.md' },
  {
    source: 'docs/architecture/CONTEXT_LOAD_BALANCING.md',
    dest: 'architecture/context-load-balancing.md',
    titleOverride: 'Context Load Balancing',
  },
  {
    source: 'docs/architecture/README.md',
    dest: 'architecture/overview.md',
    titleOverride: 'Architecture Overview',
  },

  // Development docs
  { source: 'docs/development/AGENT_DEVELOPMENT.md', dest: 'development/agent-development.md' },
  { source: 'docs/development/TOOL_DEVELOPMENT.md', dest: 'development/tool-development.md' },
  { source: 'docs/development/MEMORY_DEVELOPMENT.md', dest: 'development/memory-development.md' },
  { source: 'CONTRIBUTING.md', dest: 'development/contributing.md' },

  // Guides
  { source: 'docs/guides/DEBUGGING_OBSERVABILITY.md', dest: 'guides/debugging-observability.md' },
  { source: 'docs/guides/MCP_INTEGRATION.md', dest: 'guides/mcp-integration.md' },
  { source: 'docs/guides/WORKFLOW_TEMPLATES.md', dest: 'guides/workflow-templates.md' },
  { source: 'docs/ENTRYPOINTS.md', dest: 'guides/cli-usage.md', titleOverride: 'CLI Usage' },
  { source: 'docs/TROUBLESHOOTING.md', dest: 'guides/troubleshooting.md' },

  // Research docs
  { source: 'docs/research/RESEARCH_INDEX.md', dest: 'research/research-index.md' },
  {
    source: 'docs/research/CONTRIBUTING.md',
    dest: 'research/contributing.md',
    titleOverride: 'Contributing Research',
  },
  {
    source: 'docs/research/topics/consensus/README.md',
    dest: 'research/consensus.md',
    titleOverride: 'Consensus Research',
  },
  {
    source: 'docs/research/topics/routing/README.md',
    dest: 'research/routing.md',
    titleOverride: 'Routing Research',
  },
  {
    source: 'docs/research/topics/memory/README.md',
    dest: 'research/memory.md',
    titleOverride: 'Memory Research',
  },

  // Getting started
  { source: 'QUICK_START.md', dest: 'getting-started/quick-start.md' },
  { source: 'README.md', dest: 'getting-started/introduction.md', titleOverride: 'Introduction' },
];

// ============================================================================
// Types
// ============================================================================

interface TransformResult {
  sourcePath: string;
  destPath: string;
  title: string;
  description: string;
  content: string;
  changed: boolean;
}

interface SyncOptions {
  dryRun: boolean;
  check: boolean;
  verbose: boolean;
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Extracts title from first H1 heading.
 */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    // Remove any trailing badges like "**Tier 3** |"
    let title = match[1].trim();
    title = title.replace(/\*\*Tier \d\*\*\s*\|?\s*/g, '').trim();
    return title;
  }
  return 'Untitled';
}

/**
 * Extracts description from first paragraph after title.
 */
function extractDescription(content: string): string {
  // Remove YAML frontmatter if exists (only at very start of file, no 'm' flag)
  let text = content.replace(/^---\n[\s\S]*?\n---\n*/, '');

  // Remove title line
  text = text.replace(/^#\s+.+\n+/m, '');

  // Remove badges, tier markers, and hub lines
  text = text.replace(/^\*\*[^*]+\*\*\s*\|[^\n]*\n+/gm, '');
  text = text.replace(/^---+\n+/gm, '');
  text = text.replace(/^\*\*Hub:\*\*[^\n]*\n+/gm, '');
  text = text.replace(/^\*\*Tier \d\*\*[^\n]*\n+/gm, '');

  // Get first paragraph (non-empty, non-heading, non-link line)
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty, headings, tables, lists, code fences, and reference-style lines
    if (
      trimmed &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('|') &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('[') &&
      !trimmed.startsWith('`') &&
      !trimmed.match(/^\*\*[^*]+\*\*:/)
    ) {
      // Truncate long descriptions
      if (trimmed.length > 200) {
        return trimmed.slice(0, 197) + '...';
      }
      return trimmed;
    }
  }

  return '';
}

/**
 * Removes the first H1 heading and metadata lines from content.
 */
function removeFirstHeading(content: string): string {
  // Remove YAML frontmatter if exists (only at very start of file, no 'm' flag)
  let text = content.replace(/^---\n[\s\S]*?\n---\n*/, '');

  // Remove first H1 and any following badges/separators
  text = text.replace(/^#\s+.+\n+/m, '');

  // Remove tier badges and hub lines (can appear multiple times)
  text = text.replace(/^\*\*Tier \d\*\*[^\n]*\n+/gm, '');
  text = text.replace(/^\*\*Hub:\*\*[^\n]*\n+/gm, '');
  text = text.replace(/^\*\*[^*]+\*\*\s*\|\s*[^\n]*\n+/gm, '');

  return text.trim();
}

/**
 * Fixes relative links for website context.
 */
function fixRelativeLinks(content: string): string {
  // Fix links to other docs
  let fixed = content;

  // Convert absolute paths like ../../CONTRIBUTING.md to relative website paths
  fixed = fixed.replace(
    /\]\(\.\.\/\.\.\/CONTRIBUTING\.md\)/g,
    '](/nexus-agents/development/contributing/)'
  );

  fixed = fixed.replace(
    /\]\(\.\.\/\.\.\/QUICK_START\.md\)/g,
    '](/nexus-agents/getting-started/quick-start/)'
  );

  fixed = fixed.replace(
    /\]\(\.\.\/\.\.\/README\.md\)/g,
    '](/nexus-agents/getting-started/introduction/)'
  );

  // Fix architecture links
  fixed = fixed.replace(
    /\]\(\.\/([A-Z_]+)\.md\)/g,
    (_match: string, name: string) =>
      `](/nexus-agents/architecture/${name.toLowerCase().replace(/_/g, '-')}/)`
  );

  // Fix relative links within docs/
  fixed = fixed.replace(
    /\]\(\.\.\/architecture\/([A-Z_]+)\.md\)/g,
    (_match: string, name: string) =>
      `](/nexus-agents/architecture/${name.toLowerCase().replace(/_/g, '-')}/)`
  );

  fixed = fixed.replace(
    /\]\(\.\.\/development\/([A-Z_]+)\.md\)/g,
    (_match: string, name: string) =>
      `](/nexus-agents/development/${name.toLowerCase().replace(/_/g, '-')}/)`
  );

  return fixed;
}

/**
 * Generates Starlight-compatible frontmatter.
 */
function generateFrontmatter(title: string, description: string): string {
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedDesc = description.replace(/"/g, '\\"');

  let fm = '---\n';
  fm += `title: "${escapedTitle}"\n`;
  if (escapedDesc) {
    fm += `description: "${escapedDesc}"\n`;
  }
  fm += '---\n\n';

  return fm;
}

/**
 * Transforms a canonical doc to Starlight format.
 */
function transformDoc(
  sourcePath: string,
  destPath: string,
  titleOverride?: string
): TransformResult | null {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const fullSourcePath = path.join(repoRoot, sourcePath);
  const fullDestPath = path.join(repoRoot, 'website/src/content/docs', destPath);

  // Check source exists
  if (!fs.existsSync(fullSourcePath)) {
    console.error(`  ✗ Source not found: ${sourcePath}`);
    return null;
  }

  const sourceContent = fs.readFileSync(fullSourcePath, 'utf-8');

  // Extract metadata
  const title = titleOverride ?? extractTitle(sourceContent);
  const description = extractDescription(sourceContent);

  // Transform content
  let transformedContent = removeFirstHeading(sourceContent);
  transformedContent = fixRelativeLinks(transformedContent);

  // Generate final content with frontmatter
  const finalContent = generateFrontmatter(title, description) + transformedContent;

  // Check if changed
  let changed = true;
  if (fs.existsSync(fullDestPath)) {
    const existingContent = fs.readFileSync(fullDestPath, 'utf-8');
    changed = existingContent !== finalContent;
  }

  return {
    sourcePath,
    destPath,
    title,
    description,
    content: finalContent,
    changed,
  };
}

// ============================================================================
// Sync Functions
// ============================================================================

/**
 * Ensures destination directory exists.
 */
function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Syncs all configured docs.
 */
function syncDocs(options: SyncOptions): { success: boolean; changed: number; total: number } {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  let changed = 0;
  let total = 0;
  let hasErrors = false;

  console.log('Syncing canonical docs to website...\n');

  for (const mapping of DOC_MAPPINGS) {
    total++;

    const result = transformDoc(mapping.source, mapping.dest, mapping.titleOverride);

    if (!result) {
      hasErrors = true;
      continue;
    }

    const status = result.changed ? '→' : '✓';
    const action = result.changed ? 'update' : 'up-to-date';

    if (options.verbose || result.changed) {
      console.log(`  ${status} ${mapping.source}`);
      console.log(`    ${action}: ${mapping.dest}`);
      if (options.verbose) {
        console.log(`    title: "${result.title}"`);
      }
    }

    if (result.changed) {
      changed++;

      if (!options.dryRun && !options.check) {
        const fullDestPath = path.join(repoRoot, 'website/src/content/docs', mapping.dest);
        ensureDir(fullDestPath);
        fs.writeFileSync(fullDestPath, result.content);
      }
    }
  }

  console.log('');
  console.log(
    `Summary: ${String(changed)} changed, ${String(total - changed)} up-to-date, ${String(total)} total`
  );

  if (options.dryRun) {
    console.log('\n[DRY RUN] No files were modified.');
  }

  if (options.check && changed > 0) {
    console.log('\n✗ Website content is out of sync with canonical docs.');
    console.log('  Run "npx tsx scripts/sync-docs.ts" to update.');
    return { success: false, changed, total };
  }

  if (!hasErrors && changed === 0) {
    console.log('\n✓ Website content is in sync with canonical docs.');
  }

  return { success: !hasErrors, changed, total };
}

// ============================================================================
// CLI
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);

  const options: SyncOptions = {
    dryRun: args.includes('--dry-run'),
    check: args.includes('--check'),
    verbose: args.includes('--verbose'),
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
sync-docs.ts - Synchronize canonical docs to website content

Usage:
  npx tsx scripts/sync-docs.ts [options]

Options:
  --dry-run   Show what would change without modifying files
  --check     Check if in sync (exit 1 if not, for CI)
  --verbose   Show detailed output
  --help, -h  Show this help message

Examples:
  npx tsx scripts/sync-docs.ts           # Sync all docs
  npx tsx scripts/sync-docs.ts --dry-run # Preview changes
  npx tsx scripts/sync-docs.ts --check   # CI validation
`);
    process.exit(0);
  }

  const result = syncDocs(options);

  if (!result.success) {
    process.exit(1);
  }

  if (options.check && result.changed > 0) {
    process.exit(1);
  }
}

main();
