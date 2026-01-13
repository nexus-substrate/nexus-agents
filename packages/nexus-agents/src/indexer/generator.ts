/**
 * nexus-agents/indexer - Output Generator
 *
 * Generates YAML index files and Mermaid dependency diagrams.
 *
 * (Source: Issue #240)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'yaml';
import type { CodebaseIndex, GeneratorOptions } from './types.js';
import { DEFAULT_GENERATOR_OPTIONS } from './types.js';

// ============================================================================
// YAML Generation
// ============================================================================

/**
 * Converts a codebase index to YAML format.
 */
export function indexToYaml(index: CodebaseIndex): string {
  // Custom formatting for better readability
  const doc = new yaml.Document(index);
  doc.commentBefore =
    ' Nexus-Agents Codebase Index\n Generated automatically - do not edit manually';

  return doc.toString({
    lineWidth: 120,
    minContentWidth: 20,
  });
}

/**
 * Converts a codebase index to JSON format.
 */
export function indexToJson(index: CodebaseIndex): string {
  return JSON.stringify(index, null, 2);
}

// ============================================================================
// Mermaid Diagram Generation
// ============================================================================

/** Sanitizes a module name to be a valid Mermaid node ID. */
function sanitizeId(name: string): string {
  return name.replace(/-/g, '_');
}

/** Formats a module node with stats for Mermaid. */
function formatModuleNode(name: string, fileCount: number, totalLines: number): string {
  return `  ${sanitizeId(name)}["${name}<br/>${String(fileCount)} files, ${String(totalLines)} lines"]`;
}

/** Module category definition for grouping. */
interface ModuleCategory {
  readonly names: readonly string[];
  readonly label: string;
}

const MODULE_CATEGORIES: readonly ModuleCategory[] = [
  { names: ['core', 'config'], label: 'Core modules' },
  { names: ['agents', 'consensus', 'learning'], label: 'Agent modules' },
  { names: ['adapters', 'cli-adapters', 'context'], label: 'Infrastructure modules' },
  { names: ['mcp', 'cli', 'workflows'], label: 'Interface modules' },
];

/** Adds module nodes for a category to the lines array. */
function addCategoryNodes(
  modules: readonly { name: string; stats: { fileCount: number; totalLines: number } }[],
  label: string,
  lines: string[],
  isFirst: boolean
): void {
  if (modules.length === 0) return;
  if (!isFirst) lines.push('');
  lines.push(`  %% ${label}`);
  for (const m of modules) {
    lines.push(formatModuleNode(m.name, m.stats.fileCount, m.stats.totalLines));
  }
}

/**
 * Generates a Mermaid flowchart showing module dependencies.
 */
export function generateMermaidDiagram(index: CodebaseIndex): string {
  const lines: string[] = ['```mermaid', 'flowchart LR', ''];
  const modules = Object.values(index.modules);

  // Group and add categorized modules
  const categorized = new Set<string>();
  let isFirst = true;

  for (const cat of MODULE_CATEGORIES) {
    const catModules = modules.filter((m) => cat.names.includes(m.name));
    catModules.forEach((m) => categorized.add(m.name));
    addCategoryNodes(catModules, cat.label, lines, isFirst);
    if (catModules.length > 0) isFirst = false;
  }

  // Add uncategorized modules
  const otherModules = modules.filter((m) => !categorized.has(m.name));
  addCategoryNodes(otherModules, 'Other modules', lines, isFirst);

  // Add dependency edges
  lines.push('', '  %% Dependencies');
  for (const m of modules) {
    for (const dep of m.dependsOn) {
      lines.push(`  ${sanitizeId(m.name)} --> ${sanitizeId(dep)}`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * Generates a markdown file with the dependency diagram.
 */
export function generateDiagramMarkdown(index: CodebaseIndex): string {
  const lines: string[] = [];
  const stats = index.stats;

  lines.push('# Module Dependency Graph');
  lines.push('');
  lines.push(`> Generated: ${index.generatedAt}`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(`- **Total Modules:** ${String(stats.moduleCount)}`);
  lines.push(`- **Total Files:** ${String(stats.totalFiles)}`);
  lines.push(`- **Total Lines:** ${stats.totalLines.toLocaleString()}`);
  lines.push(`- **Total Exports:** ${String(stats.totalExports)}`);
  lines.push('');
  lines.push('## Dependency Diagram');
  lines.push('');
  lines.push(generateMermaidDiagram(index));
  lines.push('');
  lines.push('## Module Details');
  lines.push('');

  const modules = Object.values(index.modules).sort((a, b) => a.name.localeCompare(b.name));

  for (const m of modules) {
    lines.push(`### ${m.name}`);
    lines.push('');
    lines.push(`**Purpose:** ${m.purpose}`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Files | ${String(m.stats.fileCount)} |`);
    lines.push(`| Lines | ${m.stats.totalLines.toLocaleString()} |`);
    lines.push(`| Exports | ${String(m.stats.exportCount)} |`);
    lines.push(`| Internal Deps | ${String(m.stats.internalDeps)} |`);
    lines.push(`| External Deps | ${String(m.stats.externalDeps)} |`);
    lines.push('');

    if (m.dependsOn.length > 0) {
      lines.push(`**Depends on:** ${m.dependsOn.join(', ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// File Output
// ============================================================================

/**
 * Writes the codebase index to a file.
 */
export async function writeIndex(
  index: CodebaseIndex,
  options: Partial<GeneratorOptions> = {}
): Promise<void> {
  const opts = { ...DEFAULT_GENERATOR_OPTIONS, ...options };

  // Ensure output directory exists
  const outputDir = path.dirname(opts.outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Write index file
  const content = opts.format === 'yaml' ? indexToYaml(index) : indexToJson(index);
  await fs.writeFile(opts.outputPath, content, 'utf-8');

  // Write diagram if requested
  if (opts.generateDiagram && opts.diagramPath !== undefined) {
    const diagramDir = path.dirname(opts.diagramPath);
    await fs.mkdir(diagramDir, { recursive: true });
    const diagramContent = generateDiagramMarkdown(index);
    await fs.writeFile(opts.diagramPath, diagramContent, 'utf-8');
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Result of validating an index against the codebase.
 */
export interface ValidationResult {
  /** Whether the index is valid (up to date) */
  readonly valid: boolean;
  /** Files in codebase but not in index */
  readonly missingFiles: readonly string[];
  /** Files in index but not in codebase */
  readonly extraFiles: readonly string[];
  /** Files with changed line counts */
  readonly modifiedFiles: readonly string[];
}

/**
 * Validates that an index matches the current codebase state.
 */
export function validateIndex(
  index: CodebaseIndex,
  currentFiles: readonly { path: string; lines: number }[]
): ValidationResult {
  const missingFiles: string[] = [];
  const extraFiles: string[] = [];
  const modifiedFiles: string[] = [];

  // Build a map of indexed files
  const indexedFiles = new Map<string, number>();
  for (const module of Object.values(index.modules)) {
    for (const file of module.files) {
      indexedFiles.set(file.path, file.lines);
    }
  }

  // Check for missing and modified files
  const currentPaths = new Set<string>();
  for (const file of currentFiles) {
    currentPaths.add(file.path);
    const indexedLines = indexedFiles.get(file.path);
    if (indexedLines === undefined) {
      missingFiles.push(file.path);
    } else if (indexedLines !== file.lines) {
      modifiedFiles.push(file.path);
    }
  }

  // Check for extra files
  for (const indexedPath of indexedFiles.keys()) {
    if (!currentPaths.has(indexedPath)) {
      extraFiles.push(indexedPath);
    }
  }

  return {
    valid: missingFiles.length === 0 && extraFiles.length === 0 && modifiedFiles.length === 0,
    missingFiles,
    extraFiles,
    modifiedFiles,
  };
}
