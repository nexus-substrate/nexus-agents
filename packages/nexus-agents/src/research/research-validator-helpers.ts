/**
 * nexus-agents/research - Research Validator Helpers
 *
 * Helper functions for validating the research registry.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 * @see docs/research/RESEARCH_INDEX.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  PapersRegistry,
  TechniquesRegistry,
  ValidationIssue,
  ResearchPaper,
  ResearchTechnique,
  IntegrationFile,
} from './research-schemas.js';
import { getIntegrationFilePath, isIntegrationFileRequired } from './research-schemas.js';
import type { ValidatorOptions, CreateIssueOptions } from './research-validator-types.js';

/**
 * Create a validation issue using options object pattern.
 */
export function createIssue(options: CreateIssueOptions): ValidationIssue {
  const { severity, code, message, file, issuePath, suggestion } = options;

  // Build the issue object, conditionally adding optional fields
  // to comply with exactOptionalPropertyTypes
  const base = { severity, code, message, file };

  if (issuePath !== undefined && suggestion !== undefined) {
    return { ...base, path: issuePath, suggestion };
  }
  if (issuePath !== undefined) {
    return { ...base, path: issuePath };
  }
  if (suggestion !== undefined) {
    return { ...base, suggestion };
  }
  return base;
}

/**
 * Validate a single paper entry.
 */
export function validatePaper(
  paperId: string,
  paper: ResearchPaper,
  techniqueIds: ReadonlySet<string>
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for empty topics
  if (paper.topics.length === 0) {
    issues.push(
      createIssue({
        severity: 'warning',
        code: 'PAPER_NO_TOPICS',
        message: `Paper "${paperId}" has no topics assigned`,
        file: 'papers.yaml',
        issuePath: `papers.${paperId}.topics`,
        suggestion:
          'Add at least one topic from: consensus, routing, memory, code-generation, cli-tools, orchestration, security',
      })
    );
  }

  // Check techniques_extracted references
  for (const techniqueRef of paper.techniques_extracted) {
    if (!techniqueIds.has(techniqueRef)) {
      issues.push(
        createIssue({
          severity: 'error',
          code: 'ORPHANED_TECHNIQUE_REF',
          message: `Paper "${paperId}" references non-existent technique "${techniqueRef}"`,
          file: 'papers.yaml',
          issuePath: `papers.${paperId}.techniques_extracted`,
          suggestion: `Either add the technique to techniques.yaml or remove this reference`,
        })
      );
    }
  }

  // Check arXiv ID format if present
  if (paper.arxiv_id !== undefined) {
    const arxivPattern = /^\d{4}\.\d{4,5}(v\d+)?$/;
    if (!arxivPattern.test(paper.arxiv_id)) {
      issues.push(
        createIssue({
          severity: 'warning',
          code: 'INVALID_ARXIV_FORMAT',
          message: `Paper "${paperId}" has invalid arXiv ID format: "${paper.arxiv_id}"`,
          file: 'papers.yaml',
          issuePath: `papers.${paperId}.arxiv_id`,
          suggestion: 'arXiv ID should be in format XXXX.XXXXX (e.g., 2501.06322)',
        })
      );
    }
  }

  return issues;
}

/**
 * Validate all papers.
 */
export function validatePapers(
  papers: PapersRegistry,
  techniqueIds: ReadonlySet<string>
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [paperId, paper] of Object.entries(papers.papers)) {
    issues.push(...validatePaper(paperId, paper, techniqueIds));
  }

  return issues;
}

/**
 * Validate source paper references for a technique.
 */
export function validateSourcePapers(
  techniqueId: string,
  sourcePapers: readonly string[],
  paperIds: ReadonlySet<string>
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const paperRef of sourcePapers) {
    if (!paperIds.has(paperRef)) {
      issues.push(
        createIssue({
          severity: 'error',
          code: 'ORPHANED_PAPER_REF',
          message: `Technique "${techniqueId}" references non-existent paper "${paperRef}"`,
          file: 'techniques.yaml',
          issuePath: `techniques.${techniqueId}.source_papers`,
          suggestion: `Either add the paper to papers.yaml or remove this reference`,
        })
      );
    }
  }

  return issues;
}

/**
 * Validate technique dependency references.
 */
export function validateDependencies(
  techniqueId: string,
  dependencies: readonly string[],
  techniqueIds: ReadonlySet<string>
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const depRef of dependencies) {
    if (!techniqueIds.has(depRef)) {
      issues.push(
        createIssue({
          severity: 'error',
          code: 'ORPHANED_DEPENDENCY_REF',
          message: `Technique "${techniqueId}" depends on non-existent technique "${depRef}"`,
          file: 'techniques.yaml',
          issuePath: `techniques.${techniqueId}.dependencies`,
          suggestion: `Either add the technique to techniques.yaml or remove this dependency`,
        })
      );
    }
  }

  return issues;
}

/**
 * Context for integration file validation.
 */
interface IntegrationFileContext {
  readonly techniqueId: string;
  readonly integrationFiles: readonly IntegrationFile[];
  readonly projectRoot: string;
}

/**
 * Validate integration file existence for implemented techniques.
 */
export function validateIntegrationFiles(
  context: IntegrationFileContext
): readonly ValidationIssue[] {
  const { techniqueId, integrationFiles, projectRoot } = context;
  const issues: ValidationIssue[] = [];

  for (const file of integrationFiles) {
    const filePath = getIntegrationFilePath(file);
    const fullPath = path.join(projectRoot, filePath);
    const isRequired = isIntegrationFileRequired(file);

    if (!fs.existsSync(fullPath)) {
      issues.push(
        createIssue({
          severity: isRequired ? 'error' : 'warning',
          code: 'MISSING_INTEGRATION_FILE',
          message: `Technique "${techniqueId}" references missing file: ${filePath}`,
          file: 'techniques.yaml',
          issuePath: `techniques.${techniqueId}.integration_files`,
          suggestion: isRequired
            ? `Create the file or mark technique as not implemented`
            : `Create the file or remove the reference`,
        })
      );
    }
  }

  return issues;
}

/**
 * Validate implementation status consistency.
 */
export function validateImplementationStatus(
  techniqueId: string,
  technique: ResearchTechnique
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (technique.status === 'implemented' && technique.integration_files.length === 0) {
    issues.push(
      createIssue({
        severity: 'warning',
        code: 'IMPLEMENTED_NO_FILES',
        message: `Technique "${techniqueId}" is marked as implemented but has no integration files`,
        file: 'techniques.yaml',
        issuePath: `techniques.${techniqueId}.integration_files`,
        suggestion: 'Add the files where this technique is implemented',
      })
    );
  }

  return issues;
}

/**
 * Validate high priority techniques have tracking issues.
 */
export function validateHighPriorityIssue(
  techniqueId: string,
  technique: ResearchTechnique
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const { priority } = technique;
  const isHighPriority = priority === 'P1' || priority === 'P2';
  const needsIssue = technique.status !== 'implemented' && technique.status !== 'rejected';

  if (isHighPriority && technique.implementation_issue === null && needsIssue) {
    issues.push(
      createIssue({
        severity: 'info',
        code: 'HIGH_PRIORITY_NO_ISSUE',
        message: `Technique "${techniqueId}" is ${priority} but has no implementation issue`,
        file: 'techniques.yaml',
        issuePath: `techniques.${techniqueId}.implementation_issue`,
        suggestion: 'Create a GitHub issue to track implementation',
      })
    );
  }

  return issues;
}

/** Context for validating a technique. */
interface TechniqueValidationContext {
  readonly techniqueId: string;
  readonly technique: ResearchTechnique;
  readonly paperIds: ReadonlySet<string>;
  readonly techniqueIds: ReadonlySet<string>;
  readonly options: ValidatorOptions;
}

/**
 * Validate a single technique entry.
 */
export function validateTechnique(context: TechniqueValidationContext): readonly ValidationIssue[] {
  const { techniqueId, technique, paperIds, techniqueIds, options } = context;
  const issues: ValidationIssue[] = [];

  // Validate source paper references
  issues.push(...validateSourcePapers(techniqueId, technique.source_papers, paperIds));

  // Validate dependency references
  issues.push(...validateDependencies(techniqueId, technique.dependencies, techniqueIds));

  // Validate integration files if checking enabled and technique is implemented
  if (options.checkFileExistence && technique.status === 'implemented') {
    issues.push(
      ...validateIntegrationFiles({
        techniqueId,
        integrationFiles: technique.integration_files,
        projectRoot: options.projectRoot,
      })
    );
  }

  // Validate implementation status consistency
  issues.push(...validateImplementationStatus(techniqueId, technique));

  // Validate high priority techniques have tracking issues
  issues.push(...validateHighPriorityIssue(techniqueId, technique));

  return issues;
}

/**
 * Validate all techniques.
 */
export function validateTechniques(
  techniques: TechniquesRegistry,
  paperIds: ReadonlySet<string>,
  options: ValidatorOptions
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const techniqueIds = new Set(Object.keys(techniques.techniques));

  for (const [techniqueId, technique] of Object.entries(techniques.techniques)) {
    issues.push(
      ...validateTechnique({
        techniqueId,
        technique,
        paperIds,
        techniqueIds,
        options,
      })
    );
  }

  return issues;
}

/**
 * Validate cross-references between papers and techniques.
 */
export function validateCrossReferences(
  papers: PapersRegistry,
  techniques: TechniquesRegistry
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build reverse lookup: which techniques claim each paper
  const paperToTechniques = new Map<string, string[]>();
  for (const [techniqueId, technique] of Object.entries(techniques.techniques)) {
    for (const paperRef of technique.source_papers) {
      const existing = paperToTechniques.get(paperRef) ?? [];
      existing.push(techniqueId);
      paperToTechniques.set(paperRef, existing);
    }
  }

  // Check if papers' techniques_extracted matches techniques' source_papers
  for (const [paperId, paper] of Object.entries(papers.papers)) {
    const claimedByTechniques = paperToTechniques.get(paperId) ?? [];
    const paperClaims = new Set(paper.techniques_extracted);

    // Check for techniques that claim this paper but paper doesn't list them
    for (const techniqueId of claimedByTechniques) {
      if (!paperClaims.has(techniqueId)) {
        issues.push(
          createIssue({
            severity: 'warning',
            code: 'TECHNIQUE_NOT_IN_PAPER',
            message: `Technique "${techniqueId}" claims paper "${paperId}" but paper doesn't list it`,
            file: 'papers.yaml',
            issuePath: `papers.${paperId}.techniques_extracted`,
            suggestion: `Add "${techniqueId}" to the paper's techniques_extracted array`,
          })
        );
      }
    }
  }

  return issues;
}
