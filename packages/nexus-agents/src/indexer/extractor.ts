/**
 * nexus-agents/indexer - File Extractor
 *
 * Uses ts-morph to extract exports, imports, and metadata from TypeScript files.
 *
 * (Source: Issue #240)
 */

// Re-export category detection
export { detectFileCategory } from './category-detection.js';

// Re-export export extraction
export { extractExports } from './export-extraction.js';

// Re-export dependency extraction
export { extractDependencies } from './dependency-extraction.js';

// Re-export description extraction
export { extractDescription } from './description-extraction.js';

// Re-export project extraction
export { extractFileEntry, extractProject, type ExtractionResult } from './project-extraction.js';
