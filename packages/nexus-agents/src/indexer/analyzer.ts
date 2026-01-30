/**
 * nexus-agents/indexer - Module Analyzer
 *
 * Analyzes extracted file entries to build module dependency graphs
 * and aggregate statistics.
 *
 * (Source: Issue #240)
 */

import * as path from 'node:path';
import { getTimeProvider } from '../core/index.js';
import type { FileEntry, ModuleEntry, ModuleStats, IndexStats, CodebaseIndex } from './types.js';
import { SCHEMA_VERSION } from './types.js';

// ============================================================================
// Module Purpose Detection
// ============================================================================

/**
 * Purpose descriptions for known modules.
 */
const MODULE_PURPOSES: Record<string, string> = {
  core: 'Types, Result<T,E>, errors, logger',
  config: 'Configuration loading, validation, Zod schemas',
  adapters: 'Model adapters (Claude, OpenAI, Gemini, Ollama)',
  agents: 'Agent framework, TechLead, Experts, collaboration',
  workflows: 'Workflow engine, templates, execution',
  mcp: 'MCP server, tool definitions',
  cli: 'CLI interface, mode detection, commands',
  'cli-adapters': 'External CLI integrations (Claude, Gemini, Codex)',
  context: 'Context management, token counting, memory',
  consensus: 'Multi-agent consensus, voting strategies',
  learning: 'Feedback collection, outcome tracking',
  indexer: 'Codebase indexing and documentation',
  security: 'Sandbox execution, secrets management',
};

/**
 * Detects the purpose of a module based on its name and content.
 */
export function detectModulePurpose(moduleName: string, files: readonly FileEntry[]): string {
  // Check known purposes
  const known = MODULE_PURPOSES[moduleName];
  if (known !== undefined) {
    return known;
  }

  // Generate purpose from file descriptions
  const descriptions = files
    .filter((f) => f.description !== undefined)
    .map((f) => f.description)
    .slice(0, 3);

  if (descriptions.length > 0) {
    return descriptions.join('; ');
  }

  // Fallback to generic purpose based on name
  return `${moduleName} module`;
}

// ============================================================================
// Package Name Extraction
// ============================================================================

/**
 * Extracts package name from an import specifier.
 * Handles scoped packages (@scope/package), node: builtins, and regular packages.
 */
function extractPackageName(specifier: string): string | undefined {
  if (specifier.startsWith('@')) {
    // Scoped package: @scope/package
    const parts = specifier.split('/');
    const scope = parts[0];
    const name = parts[1];
    if (scope !== undefined && name !== undefined) {
      return `${scope}/${name}`;
    }
    return undefined;
  }

  if (specifier.startsWith('node:')) {
    return specifier;
  }

  // Regular package
  const parts = specifier.split('/');
  return parts[0];
}

// ============================================================================
// Module Analysis
// ============================================================================

/**
 * Groups files by their top-level module directory.
 */
export function groupFilesByModule(files: readonly FileEntry[]): Map<string, FileEntry[]> {
  const modules = new Map<string, FileEntry[]>();

  for (const file of files) {
    // Get the top-level directory as the module name
    const parts = file.path.split('/');
    const moduleName = parts.length > 1 ? (parts[0] ?? 'root') : 'root';

    const existing = modules.get(moduleName);
    if (existing !== undefined) {
      existing.push(file);
    } else {
      modules.set(moduleName, [file]);
    }
  }

  return modules;
}

/**
 * Collects external package names from a single file's dependencies.
 */
function collectExternalPackages(file: FileEntry, packages: Set<string>): void {
  for (const dep of file.dependencies) {
    if (dep.isExternal) {
      const pkgName = extractPackageName(dep.specifier);
      if (pkgName !== undefined) {
        packages.add(pkgName);
      }
    }
  }
}

/**
 * Extracts unique external package names from dependencies.
 */
export function extractExternalPackages(files: readonly FileEntry[]): string[] {
  const packages = new Set<string>();

  for (const file of files) {
    collectExternalPackages(file, packages);
  }

  return Array.from(packages).sort();
}

/**
 * Computes statistics for a module.
 */
export function computeModuleStats(files: readonly FileEntry[]): ModuleStats {
  let totalLines = 0;
  let exportCount = 0;
  let internalDeps = 0;
  let externalDeps = 0;

  for (const file of files) {
    totalLines += file.lines;
    exportCount += file.exports.length;

    for (const dep of file.dependencies) {
      if (dep.isExternal) {
        externalDeps++;
      } else {
        internalDeps++;
      }
    }
  }

  return {
    fileCount: files.length,
    totalLines,
    exportCount,
    internalDeps,
    externalDeps,
  };
}

/** Resolves a relative import to its target module name. */
function resolveTargetModule(filePath: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = path.join(path.dirname(filePath), specifier);
  const parts = resolved.split('/');
  return parts[0];
}

/** Checks if a target module is a valid cross-module dependency. */
function isValidModuleDep(
  targetModule: string | undefined,
  moduleName: string,
  allModules: Set<string>
): targetModule is string {
  return targetModule !== undefined && targetModule !== moduleName && allModules.has(targetModule);
}

/**
 * Detects which other modules a module depends on.
 */
export function detectModuleDependencies(
  moduleName: string,
  files: readonly FileEntry[],
  allModules: Set<string>
): string[] {
  const deps = new Set<string>();

  for (const file of files) {
    for (const dep of file.dependencies) {
      if (dep.isExternal) continue;

      const targetModule = resolveTargetModule(file.path, dep.specifier);
      if (isValidModuleDep(targetModule, moduleName, allModules)) {
        deps.add(targetModule);
      }
    }
  }

  return Array.from(deps).sort();
}

/**
 * Analyzes files and builds module entries.
 */
export function analyzeModules(files: readonly FileEntry[]): Map<string, ModuleEntry> {
  const filesByModule = groupFilesByModule(files);
  const moduleNames = new Set(filesByModule.keys());
  const modules = new Map<string, ModuleEntry>();

  for (const [moduleName, moduleFiles] of filesByModule) {
    modules.set(moduleName, {
      name: moduleName,
      path: moduleName === 'root' ? '.' : moduleName,
      purpose: detectModulePurpose(moduleName, moduleFiles),
      files: moduleFiles,
      stats: computeModuleStats(moduleFiles),
      dependsOn: detectModuleDependencies(moduleName, moduleFiles, moduleNames),
    });
  }

  return modules;
}

// ============================================================================
// Index Building
// ============================================================================

/**
 * Computes global index statistics.
 */
export function computeIndexStats(modules: Map<string, ModuleEntry>): IndexStats {
  let totalFiles = 0;
  let totalLines = 0;
  let totalExports = 0;
  const externalPackages = new Set<string>();

  for (const module of modules.values()) {
    totalFiles += module.stats.fileCount;
    totalLines += module.stats.totalLines;
    totalExports += module.stats.exportCount;

    // Collect external packages using the shared helper
    for (const file of module.files) {
      collectExternalPackages(file, externalPackages);
    }
  }

  return {
    totalFiles,
    totalLines,
    totalExports,
    moduleCount: modules.size,
    externalPackages: Array.from(externalPackages).sort(),
  };
}

/**
 * Builds a complete codebase index from extracted files.
 */
export function buildIndex(files: readonly FileEntry[]): CodebaseIndex {
  const modules = analyzeModules(files);
  const stats = computeIndexStats(modules);

  // Generate timestamp in ET timezone
  const now = new Date(getTimeProvider().now());
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = etFormatter.formatToParts(now);
  const getPart = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';

  const timestamp = `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}-05:00`;

  // Convert modules map to record
  const modulesRecord: Record<string, ModuleEntry> = {};
  for (const [name, entry] of modules) {
    modulesRecord[name] = entry;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: timestamp,
    stats,
    modules: modulesRecord,
  };
}
