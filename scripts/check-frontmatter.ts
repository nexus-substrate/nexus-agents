#!/usr/bin/env npx tsx
/**
 * check-frontmatter.ts - Validate website docs have proper frontmatter
 *
 * This script ensures all documentation files in the website content
 * directory have required frontmatter fields for Starlight/Astro.
 *
 * Usage:
 *   npx tsx scripts/check-frontmatter.ts           # Check for issues
 *   npx tsx scripts/check-frontmatter.ts --verbose # Detailed output
 *   npx tsx scripts/check-frontmatter.ts --fix     # Add missing frontmatter
 *
 * Exit codes:
 *   0 - All docs have valid frontmatter
 *   1 - Invalid or missing frontmatter found
 *
 * (Source: Issue #629, Epic #625)
 */

/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const WEBSITE_DOCS_DIR = path.join(REPO_ROOT, 'website/src/content/docs');

// Required frontmatter fields
const REQUIRED_FIELDS = ['title', 'description'];

// Optional but recommended fields
const RECOMMENDED_FIELDS = ['sidebar'];

// ============================================================================
// Types
// ============================================================================

interface FrontmatterResult {
  file: string;
  hasFrontmatter: boolean;
  fields: Record<string, string | undefined>;
  missingRequired: string[];
  missingRecommended: string[];
}

interface ValidationResult {
  success: boolean;
  totalFiles: number;
  validFiles: number;
  invalidFiles: FrontmatterResult[];
  warnings: FrontmatterResult[];
}

// ============================================================================
// Frontmatter Parsing
// ============================================================================

function parseFrontmatter(content: string): Record<string, string | undefined> {
  const fields: Record<string, string | undefined> = {};

  // Check for YAML frontmatter delimiters
  if (!content.startsWith('---')) {
    return fields;
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return fields;
  }

  const frontmatterBlock = content.slice(3, endIndex).trim();
  const lines = frontmatterBlock.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    fields[key] = value;
  }

  return fields;
}

function hasFrontmatter(content: string): boolean {
  if (!content.startsWith('---')) {
    return false;
  }
  const endIndex = content.indexOf('---', 3);
  return endIndex !== -1;
}

// ============================================================================
// File Discovery
// ============================================================================

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

// ============================================================================
// Validation
// ============================================================================

function validateFile(filePath: string): FrontmatterResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(WEBSITE_DOCS_DIR, filePath);
  const fields = parseFrontmatter(content);

  const result: FrontmatterResult = {
    file: relativePath,
    hasFrontmatter: hasFrontmatter(content),
    fields,
    missingRequired: [],
    missingRecommended: [],
  };

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    const value = fields[field];
    if (value === undefined || value === '') {
      result.missingRequired.push(field);
    }
  }

  // Check recommended fields
  for (const field of RECOMMENDED_FIELDS) {
    const value = fields[field];
    if (value === undefined) {
      result.missingRecommended.push(field);
    }
  }

  return result;
}

function validateAllFiles(verbose: boolean): ValidationResult {
  const result: ValidationResult = {
    success: true,
    totalFiles: 0,
    validFiles: 0,
    invalidFiles: [],
    warnings: [],
  };

  const files = findMarkdownFiles(WEBSITE_DOCS_DIR);
  result.totalFiles = files.length;

  if (verbose) {
    console.log(`Found ${String(result.totalFiles)} markdown files in website docs\n`);
  }

  for (const file of files) {
    const fileResult = validateFile(file);

    if (!fileResult.hasFrontmatter || fileResult.missingRequired.length > 0) {
      result.invalidFiles.push(fileResult);
    } else if (fileResult.missingRecommended.length > 0) {
      result.warnings.push(fileResult);
      result.validFiles++;
    } else {
      result.validFiles++;
    }
  }

  result.success = result.invalidFiles.length === 0;

  return result;
}

// ============================================================================
// Fix Mode
// ============================================================================

function generateFrontmatter(filePath: string): string {
  const fileName = path.basename(filePath, '.md');
  const title = fileName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `---
title: "${title}"
description: "TODO: Add description"
---

`;
}

function fixFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');

  if (hasFrontmatter(content)) {
    // Has frontmatter but missing fields - more complex fix needed
    return false;
  }

  // Add frontmatter to file without it
  const newContent = generateFrontmatter(filePath) + content;
  fs.writeFileSync(filePath, newContent);
  return true;
}

function fixAllFiles(results: FrontmatterResult[]): number {
  let fixed = 0;

  for (const result of results) {
    if (!result.hasFrontmatter) {
      const fullPath = path.join(WEBSITE_DOCS_DIR, result.file);
      if (fixFile(fullPath)) {
        console.log(`  Fixed: ${result.file}`);
        fixed++;
      }
    }
  }

  return fixed;
}

// ============================================================================
// Output
// ============================================================================

function printResults(result: ValidationResult, showFix: boolean): void {
  console.log('Website Frontmatter Validation');
  console.log('==============================\n');

  console.log(`Total files: ${String(result.totalFiles)}`);
  console.log(`Valid: ${String(result.validFiles)}`);
  console.log(`Invalid: ${String(result.invalidFiles.length)}`);
  console.log(`Warnings: ${String(result.warnings.length)}\n`);

  if (result.invalidFiles.length > 0) {
    console.log('✗ Files with invalid/missing frontmatter:');
    for (const file of result.invalidFiles) {
      if (!file.hasFrontmatter) {
        console.log(`  - ${file.file} (no frontmatter)`);
      } else {
        console.log(`  - ${file.file} (missing: ${file.missingRequired.join(', ')})`);
      }
    }
    console.log('');

    if (showFix) {
      console.log('Attempting to fix files without frontmatter...\n');
      const fixed = fixAllFiles(result.invalidFiles);
      console.log(`\nFixed ${String(fixed)} files.`);
      console.log('Files with missing fields require manual editing.\n');
    }
  }

  if (result.warnings.length > 0) {
    console.log('⚠ Files missing recommended fields:');
    for (const file of result.warnings) {
      console.log(`  - ${file.file} (missing: ${file.missingRecommended.join(', ')})`);
    }
    console.log('');
  }

  if (result.success) {
    console.log('✓ All website docs have valid frontmatter');
  } else {
    console.log('✗ Frontmatter validation failed');
    console.log('\nRequired fields: ' + REQUIRED_FIELDS.join(', '));
    console.log('Run with --fix to add placeholder frontmatter to files without it.');
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
check-frontmatter.ts - Validate website docs have proper frontmatter

Usage:
  npx tsx scripts/check-frontmatter.ts [options]

Options:
  --verbose, -v  Show detailed output
  --fix          Add placeholder frontmatter to files without it
  --help, -h     Show this help message

Exit codes:
  0 - All docs have valid frontmatter
  1 - Invalid or missing frontmatter found

Required fields: ${REQUIRED_FIELDS.join(', ')}
Recommended fields: ${RECOMMENDED_FIELDS.join(', ')}
`);
    process.exit(0);
  }

  if (!fs.existsSync(WEBSITE_DOCS_DIR)) {
    console.error(`✗ Website docs directory not found: ${WEBSITE_DOCS_DIR}`);
    process.exit(1);
  }

  const result = validateAllFiles(verbose);
  printResults(result, showFix);
  process.exit(result.success ? 0 : 1);
}

main();
