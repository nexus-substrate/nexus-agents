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
export {
  fetchArxivMetadataResult,
  paperExists,
  addResearchPaper,
} from './research-helpers-arxiv.js';
export type { ArxivFetchError, ArxivFetchErrorCode } from './research-helpers-arxiv.js';

// Registry helpers (Issue #299)
export {
  generateRegistryEntry,
  paperExistsInRegistry,
  addPaperToRegistry,
  getCurrentDate,
} from './research-helpers-registry.js';
export type {
  RegistryError,
  RegistryErrorCode,
  AddPaperOptions,
  AddPaperResult,
} from './research-helpers-registry.js';

// Source discovery helpers (Phase 3)
export {
  discoverGitHubRepos,
  discoverGoogleAI,
  discoverMetaFAIR,
  discoverMicrosoftResearch,
  discoverDeepMind,
} from './research-helpers-sources.js';
export type {
  DiscoverError,
  DiscoverErrorCode,
  DiscoveredSource,
} from './research-helpers-sources.js';

// Source I/O helpers (Phase 3)
export {
  loadSourcesRegistry,
  saveSourcesRegistry,
  sourceExistsInRegistry,
  addSourceToRegistry,
} from './research-helpers-sources-io.js';
export type {
  SourceEntry,
  SourcesRegistry,
  SourcesIOError,
} from './research-helpers-sources-io.js';

// Academic source providers (Phase 2A/2B)
export {
  discoverSemanticScholar,
  discoverPapersWithCode,
} from './research-helpers-sources-academic.js';

// Quality scoring (Phase 2E)
export { scoreDiscoveredItem, rankDiscoveredItems } from './research-helpers-scoring.js';
export type { QualityScore } from './research-helpers-scoring.js';

// Index operations (extracted from research-command.ts)
export {
  handleStatsCommand,
  handleRefreshCommand,
  handleCheckCommand,
} from './research-helpers-index-ops.js';

// Issue creation helpers (Phase 4)
export { createResearchIssue, formatResearchIssueBody } from './research-helpers-issues.js';
export type {
  CreateResearchIssueOptions,
  CreateResearchIssueResult,
  IssueCreationError,
  ResearchFinding,
  VoteResultSummary,
} from './research-helpers-issues.js';
