/**
 * Component Scanner for Self-Evaluation MVP
 *
 * Scans codebase components and extracts metrics for evaluation.
 * Part of the Self-Evaluation Protocol (#136).
 *
 * @module self-eval/component-scanner
 * (Source: Issue #137, Multi-Agent Evaluation research)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, extname, relative } from 'node:path';
import type { ILogger } from '../core/index.js';
import { createLogger, getTimeProvider } from '../core/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Information about a single component (file).
 */
export interface ComponentInfo {
  /** Relative path from scan root */
  readonly path: string;
  /** File name without extension */
  readonly name: string;
  /** Total lines of code (excluding blank lines) */
  readonly lines: number;
  /** Estimated cyclomatic complexity */
  readonly complexity: number;
  /** Test coverage percentage (null if unknown) */
  readonly testCoverage: number | null;
  /** Import dependencies */
  readonly dependencies: readonly string[];
  /** Whether this is a test file */
  readonly isTest: boolean;
  /** File size in bytes */
  readonly sizeBytes: number;
  /** Number of exported symbols */
  readonly exportCount: number;
}

/**
 * Complete inventory of scanned components.
 */
export interface ComponentInventory {
  /** All scanned components */
  readonly components: readonly ComponentInfo[];
  /** Scan timestamp */
  readonly scanTime: Date;
  /** Root directory that was scanned */
  readonly directory: string;
  /** Scan duration in milliseconds */
  readonly durationMs: number;
  /** Total files scanned */
  readonly totalFiles: number;
  /** Total lines of code */
  readonly totalLines: number;
}

/**
 * Scanner configuration options.
 */
export interface ScannerConfig {
  /** File extensions to include (default: ['.ts']) */
  readonly extensions?: readonly string[];
  /** Skip test files (default: false) */
  readonly skipTests?: boolean;
  /** Maximum file size to scan in bytes (default: 1MB) */
  readonly maxFileSize?: number;
  /** Logger instance */
  readonly logger?: ILogger;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_EXTENSIONS = ['.ts'] as const;
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB

/** Patterns that indicate complexity. */
const COMPLEXITY_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\s*{/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bswitch\s*\(/g,
  /\bcase\s+/g,
  /\bcatch\s*\(/g,
  /\?\?/g,
  /\?\./g,
  /\?.*:/g, // ternary
] as const;

/** Pattern to extract imports. */
const IMPORT_PATTERN =
  /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|[\w]+)\s+from\s+)?['"]([^'"]+)['"]/g;

/** Pattern to count exports. */
const EXPORT_PATTERN =
  /export\s+(?:default\s+)?(?:class|function|const|let|var|type|interface|enum)/g;

// ============================================================================
// Scanner Implementation
// ============================================================================

/**
 * Scans codebase components and extracts metrics.
 */
export class ComponentScanner {
  private readonly extensions: readonly string[];
  private readonly skipTests: boolean;
  private readonly maxFileSize: number;
  private readonly log: ILogger;

  constructor(config?: ScannerConfig) {
    this.extensions = config?.extensions ?? DEFAULT_EXTENSIONS;
    this.skipTests = config?.skipTests ?? false;
    this.maxFileSize = config?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.log = config?.logger ?? createLogger({ component: 'component-scanner' });
  }

  /**
   * Scan a directory and return component inventory.
   */
  async scan(directory: string): Promise<ComponentInventory> {
    const startTime = getTimeProvider().now();
    this.log.info('Starting component scan', { directory });

    const files = await this.findFiles(directory);
    const components: ComponentInfo[] = [];

    for (const filePath of files) {
      const component = await this.analyzeFile(directory, filePath);
      if (component) {
        components.push(component);
      }
    }

    const inventory: ComponentInventory = {
      components,
      scanTime: new Date(getTimeProvider().now()),
      directory,
      durationMs: getTimeProvider().now() - startTime,
      totalFiles: components.length,
      totalLines: components.reduce((sum, c) => sum + c.lines, 0),
    };

    this.log.info('Scan complete', {
      files: inventory.totalFiles,
      lines: inventory.totalLines,
      durationMs: inventory.durationMs,
    });

    return inventory;
  }

  /**
   * Find all matching files in directory.
   */
  private async findFiles(directory: string): Promise<string[]> {
    const files: string[] = [];

    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.findFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (this.extensions.includes(ext)) {
          if (this.skipTests && entry.name.includes('.test.')) {
            continue;
          }
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Analyze a single file and extract metrics.
   */
  private async analyzeFile(root: string, filePath: string): Promise<ComponentInfo | null> {
    try {
      const stats = await stat(filePath);

      if (stats.size > this.maxFileSize) {
        this.log.warn('File too large, skipping', { path: filePath, size: stats.size });
        return null;
      }

      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(root, filePath);
      const name = basename(filePath, extname(filePath));
      const isTest = filePath.includes('.test.') || filePath.includes('.spec.');

      return {
        path: relativePath,
        name,
        lines: this.countLines(content),
        complexity: this.estimateComplexity(content),
        testCoverage: null, // Would need coverage report integration
        dependencies: this.extractDependencies(content),
        isTest,
        sizeBytes: stats.size,
        exportCount: this.countExports(content),
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.log.error('Failed to analyze file', err, { filePath });
      return null;
    }
  }

  /**
   * Count non-blank lines of code.
   */
  private countLines(content: string): number {
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  }

  /**
   * Estimate cyclomatic complexity based on control flow patterns.
   */
  private estimateComplexity(content: string): number {
    let complexity = 1; // Base complexity

    for (const pattern of COMPLEXITY_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Extract import dependencies.
   */
  private extractDependencies(content: string): string[] {
    const deps: string[] = [];
    let match: RegExpExecArray | null;

    // Reset lastIndex for global regex
    IMPORT_PATTERN.lastIndex = 0;

    while ((match = IMPORT_PATTERN.exec(content)) !== null) {
      const dep = match[1];
      if (dep !== undefined && dep.length > 0 && !deps.includes(dep)) {
        deps.push(dep);
      }
    }

    return deps;
  }

  /**
   * Count exported symbols.
   */
  private countExports(content: string): number {
    const matches = content.match(EXPORT_PATTERN);
    return matches?.length ?? 0;
  }
}

/**
 * Create a component scanner with default configuration.
 */
export function createComponentScanner(config?: ScannerConfig): ComponentScanner {
  return new ComponentScanner(config);
}

/**
 * Convenience function to scan a directory.
 */
export async function scanComponents(
  directory: string,
  config?: ScannerConfig
): Promise<ComponentInventory> {
  const scanner = createComponentScanner(config);
  return scanner.scan(directory);
}
