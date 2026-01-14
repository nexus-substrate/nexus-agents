/**
 * Research Registry Helper Functions
 *
 * Entry point that re-exports from specialized modules:
 * - research-helpers-io.ts - Registry I/O operations
 * - research-helpers-status.ts - Status computation and formatting
 * - research-helpers-overlap.ts - Overlap detection and analysis
 * - research-helpers-arxiv.ts - arXiv paper fetching and parsing
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 */

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Registry I/O
export {
  REGISTRY_PATH,
  TECHNIQUES_FILE,
  PAPERS_FILE,
  getProjectRoot,
  loadTechniquesRegistry,
  loadPapersRegistry,
  saveTechniquesRegistry,
  savePapersRegistry,
} from './research-helpers-io.js';

// Status helpers
export {
  toStatusSummary,
  filterByStatus,
  countByStatus,
  getResearchStatus,
  formatStatusResult,
} from './research-helpers-status.js';

// Overlap helpers
export {
  calculateTagOverlap,
  findSharedTags,
  determineRelationship,
  findOverlaps,
  formatOverlapResult,
} from './research-helpers-overlap.js';

// arXiv helpers
export { fetchArxivMetadata, paperExists, addResearchPaper } from './research-helpers-arxiv.js';
