#!/usr/bin/env npx tsx
/**
 * check-docs-indexed.ts - Validate all docs are in canonical index
 *
 * This script enforces that all documentation files are properly indexed
 * in docs/README.md (the canonical documentation index).
 *
 * Usage:
 *   npx tsx scripts/check-docs-indexed.ts           # Check for unindexed docs
 *   npx tsx scripts/check-docs-indexed.ts --verbose # Detailed output
 *   npx tsx scripts/check-docs-indexed.ts --fix     # Show what to add
 *
 * Exit codes:
 *   0 - All docs are indexed
 *   1 - Unindexed docs found
 *
 * (Source: Issue #628, Epic #625)
 */

/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const INDEX_FILE = path.join(DOCS_DIR, 'README.md');

// Directories excluded from index requirement
const EXCLUDED_DIRS = [
  '.audit',
  '.generated',
  '_legacy',
  'api', // TypeDoc generated
  'node_modules',
  'research/topics', // Deep research files - referenced from topic READMEs
];

// Files excluded from index requirement
const EXCLUDED_FILES = [
  'README.md', // The index itself
  'INDEX.yaml', // Machine-readable companion
  'llms.txt', // Generated
  'llms-full.txt', // Generated
];

// Patterns excluded from index requirement (regex)
const EXCLUDED_PATTERNS = [
  /^architecture\/REVIEW_.*\.md$/, // Historical architecture reviews
  /^research\/PROPOSAL_.*\.md$/, // Internal research proposals
  /^research\/.*PROPOSAL.*\.md$/, // Internal proposals (any naming with PROPOSAL)
  /^research\/consensus-vote-.*\.md$/, // Historical consensus vote records
];

// ============================================================================
// File Discovery
// ============================================================================

function findMarkdownFiles(dir: string, relativeTo: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(relativeTo, fullPath);

    if (entry.isDirectory()) {
      // Skip excluded directories
      if (EXCLUDED_DIRS.some((exc) => relativePath.includes(exc))) {
        continue;
      }
      files.push(...findMarkdownFiles(fullPath, relativeTo));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // Skip excluded files
      if (EXCLUDED_FILES.includes(entry.name)) {
        continue;
      }
      // Skip files matching excluded patterns
      if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(relativePath))) {
        continue;
      }
      files.push(relativePath);
    }
  }

  return files;
}

// ============================================================================
// Index Parsing
// ============================================================================

interface IndexedFiles {
  docsFiles: Set<string>;
  rootFiles: Set<string>;
}

function extractIndexedFiles(indexContent: string): IndexedFiles {
  const result: IndexedFiles = {
    docsFiles: new Set<string>(),
    rootFiles: new Set<string>(),
  };

  // Match markdown links like [text](path/to/file.md)
  // Capture everything between ( and .md) - handle normalization in code
  const linkPattern = /\[([^\]]*)\]\(([^)]+\.md)\)/g;
  let match;

  while ((match = linkPattern.exec(indexContent)) !== null) {
    const rawPath = match[2];
    if (rawPath === undefined) continue;
    let filePath = rawPath;

    // Normalize path (remove leading ./ but NOT ../)
    if (filePath.startsWith('./') && !filePath.startsWith('../')) {
      filePath = filePath.slice(2);
    }

    // Handle relative paths from docs/README.md perspective
    if (filePath.startsWith('../')) {
      // Root-level files like ../CLAUDE.md - track separately
      const rootFile = filePath.replace(/^\.\.\//, '');
      result.rootFiles.add(rootFile);
      continue;
    }

    result.docsFiles.add(filePath);
  }

  return result;
}

// ============================================================================
// Main Logic
// ============================================================================

interface CheckResult {
  success: boolean;
  totalDocs: number;
  indexedDocs: number;
  unindexedDocs: string[];
  extraIndexed: string[];
}

function checkDocsIndexed(verbose: boolean): CheckResult {
  const result: CheckResult = {
    success: true,
    totalDocs: 0,
    indexedDocs: 0,
    unindexedDocs: [],
    extraIndexed: [],
  };

  // Find all markdown files in docs/
  const allDocs = findMarkdownFiles(DOCS_DIR, DOCS_DIR);
  result.totalDocs = allDocs.length;

  if (verbose) {
    console.log(`Found ${String(result.totalDocs)} markdown files in docs/\n`);
  }

  // Read and parse the index
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`✗ Canonical index not found: ${INDEX_FILE}`);
    result.success = false;
    return result;
  }

  const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
  const indexed = extractIndexedFiles(indexContent);
  result.indexedDocs = indexed.docsFiles.size;

  if (verbose) {
    console.log(`Index references ${String(result.indexedDocs)} docs/ files`);
    console.log(`Index references ${String(indexed.rootFiles.size)} root files\n`);
  }

  // Find unindexed docs
  for (const doc of allDocs) {
    if (!indexed.docsFiles.has(doc)) {
      result.unindexedDocs.push(doc);
    }
  }

  // Find indexed files that don't exist (stale references) - only for docs/ files
  for (const indexedFile of indexed.docsFiles) {
    const fullPath = path.join(DOCS_DIR, indexedFile);
    if (!fs.existsSync(fullPath)) {
      result.extraIndexed.push(indexedFile);
    }
  }

  result.success = result.unindexedDocs.length === 0 && result.extraIndexed.length === 0;

  return result;
}

function printResults(result: CheckResult, showFix: boolean): void {
  console.log('Canonical Index Validation');
  console.log('==========================\n');

  console.log(`Total docs found: ${String(result.totalDocs)}`);
  console.log(`Indexed in README: ${String(result.indexedDocs)}`);
  console.log(`Unindexed: ${String(result.unindexedDocs.length)}`);
  console.log(`Stale references: ${String(result.extraIndexed.length)}\n`);

  if (result.unindexedDocs.length > 0) {
    console.log('✗ Unindexed documentation files:');
    result.unindexedDocs.forEach((f) => {
      console.log(`  - ${f}`);
    });
    console.log('');

    if (showFix) {
      console.log('Add these to docs/README.md:\n');
      result.unindexedDocs.forEach((f) => {
        const name = path.basename(f, '.md');
        console.log(`| [${name}](./${f}) | Description | Status |`);
      });
      console.log('');
    }
  }

  if (result.extraIndexed.length > 0) {
    console.log('✗ Stale index references (files no longer exist):');
    result.extraIndexed.forEach((f) => {
      console.log(`  - ${f}`);
    });
    console.log('');
  }

  if (result.success) {
    console.log('✓ All documentation files are properly indexed');
  } else {
    console.log('✗ Index validation failed');
    console.log('\nAll documentation must be indexed in docs/README.md.');
    console.log('See: docs/ops/docops-spec.md for governance rules.');
  }
}

// ============================================================================
// CLI
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const showFix = args.includes('--fix');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
check-docs-indexed.ts - Validate all docs are in canonical index

Usage:
  npx tsx scripts/check-docs-indexed.ts [options]

Options:
  --verbose, -v  Show detailed output
  --fix          Show markdown snippets to add to index
  --help, -h     Show this help message

Exit codes:
  0 - All docs indexed
  1 - Unindexed docs found

Excluded from checking:
  Directories: ${EXCLUDED_DIRS.join(', ')}
  Files: ${EXCLUDED_FILES.join(', ')}
  Patterns: REVIEW_*.md, *PROPOSAL*.md, consensus-vote-*.md
`);
    process.exit(0);
  }

  const result = checkDocsIndexed(verbose);
  printResults(result, showFix);
  process.exit(result.success ? 0 : 1);
}

main();
