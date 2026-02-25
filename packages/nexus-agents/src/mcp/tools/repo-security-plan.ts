/**
 * nexus-agents/mcp - Repository Security Plan Logic
 *
 * Generates a language-aware security scanning pipeline recommendation
 * by composing repo_analyze output with scanner registry data.
 * Fetches fresh data from vulnerability-scanner-registry GitHub Releases;
 * falls back to embedded snapshot if fetch fails.
 *
 * @module mcp/tools/repo-security-plan
 * (Source: Issue #1079, externalization vote 6-0 unanimous)
 */

import type { RepoAnalysis } from './repo-analyze-types.js';
import type {
  RepoSecurityPlanInput,
  RepoSecurityPlan,
  ScannerRecommendation,
  ConflictWarning,
  CoverageAnalysis,
} from './repo-security-plan-types.js';
import { analyzeGitHubRepo } from './repo-analyze.js';
import { getRegistryManifest } from './scanner-registry-fetcher.js';
import type { RegistryScanner, LanguageMatrixEntry } from './scanner-registry-fetcher.js';
import { FALLBACK_SCANNER_DATA } from './repo-security-plan-fallback.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'repo-security-plan' });

// ============================================================================
// Scanner Data Interface (common shape for fetched + fallback)
// ============================================================================

/** Internal scanner entry used by plan builder. */
export interface ScannerEntry {
  readonly name: string;
  readonly displayName: string;
  readonly categories: readonly string[];
  readonly license: string;
  readonly pricingModel: string;
  readonly supersedes?: readonly string[];
}

/** Language mapping: category → scanner names. */
interface LanguageMapping {
  readonly sast: readonly string[];
  readonly sca: readonly string[];
  readonly secrets: readonly string[];
}

/** Resolved scanner data for plan building. */
export interface ScannerData {
  readonly scanners: readonly ScannerEntry[];
  readonly languageMap: Readonly<Record<string, LanguageMapping>>;
  readonly source: 'registry' | 'fallback';
}

// Re-export for consumers
export { FALLBACK_SCANNER_DATA } from './repo-security-plan-fallback.js';

// ============================================================================
// Registry → ScannerData Conversion
// ============================================================================

function convertRegistryScanner(s: RegistryScanner): ScannerEntry {
  const supersedes = s.relationships?.filter((r) => r.type === 'supersedes').map((r) => r.target);
  return {
    name: s.name,
    displayName: s.displayName,
    categories: s.categories,
    license: s.license,
    pricingModel: s.pricingModel,
    ...(supersedes !== undefined && supersedes.length > 0 ? { supersedes } : {}),
  };
}

/** Known PascalCase language names from GitHub API. Handles registry keys like "typescript" → "TypeScript". */
const LANGUAGE_PASCAL_MAP: Readonly<Record<string, string>> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  java: 'Java',
  csharp: 'C#',
  'c#': 'C#',
  cpp: 'C++',
  'c++': 'C++',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  hcl: 'HCL',
  shell: 'Shell',
  dockerfile: 'Dockerfile',
};

function normalizeLangName(lang: string): string {
  const lower = lang.toLowerCase();
  return LANGUAGE_PASCAL_MAP[lower] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}

function convertLanguageMatrix(
  matrix: Readonly<Record<string, LanguageMatrixEntry>>
): Record<string, LanguageMapping> {
  const result: Record<string, LanguageMapping> = {};
  for (const [lang, entry] of Object.entries(matrix)) {
    // Normalize language name to PascalCase (GitHub API returns PascalCase like "TypeScript")
    const normalized = normalizeLangName(lang);
    result[normalized] = {
      sast: entry.sast ?? [],
      sca: entry.sca ?? [],
      secrets: entry.secrets ?? [],
    };
  }
  return result;
}

/** Resolve scanner data: fetch from registry, fall back to embedded. */
export async function resolveScannerData(): Promise<ScannerData> {
  const manifest = await getRegistryManifest();
  if (manifest !== null) {
    logger.info('Using live scanner registry', {
      version: manifest.version,
      scanners: manifest.scanners.length,
    });
    return {
      scanners: manifest.scanners.map(convertRegistryScanner),
      languageMap: convertLanguageMatrix(manifest.languageMatrix),
      source: 'registry',
    };
  }

  logger.info('Using fallback scanner data');
  return FALLBACK_SCANNER_DATA;
}

// ============================================================================
// CI Snippet Generation (GitHub Actions only for v1)
// ============================================================================

const CI_SNIPPETS: Readonly<Record<string, string>> = {
  semgrep: '- uses: semgrep/semgrep-action@v1\n  with:\n    config: auto',
  codeql: '- uses: github/codeql-action/analyze@v3',
  trivy: '- uses: aquasecurity/trivy-action@master\n  with:\n    scan-type: fs',
  gitleaks: '- uses: gitleaks/gitleaks-action@v2',
  bandit: '- run: pip install bandit && bandit -r . -f json',
  gosec: '- uses: securego/gosec@master\n  with:\n    args: ./...',
  checkov: '- uses: bridgecrewio/checkov-action@master',
  grype: '- uses: anchore/scan-action@v4\n  with:\n    path: .',
  snyk: '- uses: snyk/actions/node@master # adjust for language',
  shellcheck: '- uses: ludeeus/action-shellcheck@master',
};

function generateCiSnippet(name: string, ci: string | null): string | null {
  if (ci !== 'github-actions') return null;
  return CI_SNIPPETS[name] ?? null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function findScanner(name: string, scanners: readonly ScannerEntry[]): ScannerEntry | undefined {
  return scanners.find((s) => s.name === name);
}

function isAlreadyUsed(name: string, existing: readonly string[]): boolean {
  return existing.some((t) => t.toLowerCase().includes(name.toLowerCase()));
}

/** Context passed to recommendation collectors. */
interface RecContext {
  readonly existing: readonly string[];
  readonly ciProvider: string | null;
  readonly language: string | null;
  readonly categoryFilter: ReadonlySet<string> | null;
  readonly maxScanners: number;
  readonly scanners: readonly ScannerEntry[];
}

/** Options for collecting recommendations in a single category. */
interface CategoryRecOptions {
  readonly names: readonly string[];
  readonly category: string;
  readonly rationale: (entry: ScannerEntry) => string;
  readonly priority: 'critical' | 'recommended';
  readonly ctx: RecContext;
}

/** Collect recommendations for a single category. */
function collectCategoryRecs(recs: ScannerRecommendation[], opts: CategoryRecOptions): void {
  for (const name of opts.names) {
    if (recs.length >= opts.ctx.maxScanners) break;
    if (isAlreadyUsed(name, opts.ctx.existing)) continue;
    const entry = findScanner(name, opts.ctx.scanners);
    if (!entry) continue;
    if (opts.ctx.categoryFilter && !opts.ctx.categoryFilter.has(opts.category)) continue;
    const isFirst = opts.category === 'sast' && recs.length === 0;
    recs.push({
      name,
      displayName: entry.displayName,
      category: opts.category,
      license: entry.license,
      pricingModel: entry.pricingModel,
      rationale: opts.rationale(entry),
      priority: isFirst ? 'critical' : opts.priority,
      ciSnippet: generateCiSnippet(name, opts.ctx.ciProvider),
    });
  }
}

/** Collect language-specific recommendations (SAST + SCA + secrets). */
function collectLanguageRecs(
  langMap: LanguageMapping,
  recs: ScannerRecommendation[],
  ctx: RecContext
): void {
  const lang = ctx.language ?? 'unknown';
  collectCategoryRecs(recs, {
    names: langMap.sast,
    category: 'sast',
    rationale: (e) => `${e.displayName} provides SAST for ${lang}`,
    priority: 'recommended',
    ctx,
  });
  collectCategoryRecs(recs, {
    names: langMap.sca,
    category: 'sca',
    rationale: (e) => `${e.displayName} provides SCA for ${lang} dependencies`,
    priority: 'critical',
    ctx,
  });
  collectCategoryRecs(recs, {
    names: langMap.secrets,
    category: 'secrets',
    rationale: () => 'Detects leaked credentials and API keys in source code',
    priority: 'critical',
    ctx,
  });
}

/** Try to add a single scanner if not already present. */
function tryAddScanner(
  scannerName: string,
  category: string,
  rationale: string,
  recs: ScannerRecommendation[],
  ctx: RecContext
): void {
  if (recs.length >= ctx.maxScanners) return;
  if (ctx.categoryFilter && !ctx.categoryFilter.has(category)) return;
  if (isAlreadyUsed(scannerName, ctx.existing)) return;
  if (recs.some((r) => r.name === scannerName)) return;
  const entry = findScanner(scannerName, ctx.scanners);
  if (!entry) return;
  recs.push({
    name: scannerName,
    displayName: entry.displayName,
    category,
    license: entry.license,
    pricingModel: entry.pricingModel,
    rationale,
    priority: 'recommended',
    ciSnippet: generateCiSnippet(scannerName, ctx.ciProvider),
  });
}

// ============================================================================
// Conflict Detection
// ============================================================================

function detectConflicts(
  recs: readonly ScannerRecommendation[],
  scanners: readonly ScannerEntry[]
): readonly ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const names = new Set(recs.map((r) => r.name));
  detectSuperseded(names, scanners, warnings);
  detectRedundant(recs, warnings);
  return warnings;
}

function detectSuperseded(
  names: ReadonlySet<string>,
  scanners: readonly ScannerEntry[],
  warnings: ConflictWarning[]
): void {
  for (const scanner of scanners) {
    if (!names.has(scanner.name)) continue;
    if (!scanner.supersedes) continue;
    for (const old of scanner.supersedes) {
      if (names.has(old)) {
        warnings.push({
          scanners: [old, scanner.name],
          type: 'superseded',
          recommendation: `${scanner.displayName} supersedes ${old}. Remove ${old}.`,
        });
      }
    }
  }
}

function detectRedundant(
  recs: readonly ScannerRecommendation[],
  warnings: ConflictWarning[]
): void {
  const catMap = new Map<string, string[]>();
  for (const rec of recs) {
    const arr = catMap.get(rec.category) ?? [];
    arr.push(rec.name);
    catMap.set(rec.category, arr);
  }
  for (const [cat, scanners] of catMap) {
    if (scanners.length > 2) {
      const count = String(scanners.length);
      warnings.push({
        scanners,
        type: 'redundant',
        recommendation: `${count} scanners for ${cat}. Consider keeping top 2.`,
      });
    }
  }
}

// ============================================================================
// Coverage Analysis
// ============================================================================

const ALL_CATEGORIES = ['sast', 'dast', 'sca', 'secrets', 'container', 'iac'];

function buildCoverage(
  recs: readonly ScannerRecommendation[],
  existing: readonly string[],
  scanners: readonly ScannerEntry[]
): readonly CoverageAnalysis[] {
  return ALL_CATEGORIES.map((cat) => {
    const found = recs.filter((r) => r.category === cat).map((r) => r.name);
    const existingMatch = existing.some((t) =>
      scanners.some((s) => s.categories.includes(cat) && t.toLowerCase().includes(s.name))
    );
    return { category: cat, covered: found.length > 0 || existingMatch, scanners: found };
  });
}

// ============================================================================
// Plan Assembly
// ============================================================================

/** Options for buildPlanFromAnalysis (allows optional fields for testability). */
interface BuildPlanOptions {
  readonly repo: string;
  readonly categories?: readonly string[] | undefined;
  readonly maxScanners?: number | undefined;
}

/** Generate a security scanning plan for a repository (fetches live data). */
export async function generateSecurityPlan(
  input: RepoSecurityPlanInput
): Promise<RepoSecurityPlan> {
  const [analysis, data] = await Promise.all([
    analyzeGitHubRepo({ repo: input.repo, depth: 'deep' }),
    resolveScannerData(),
  ]);
  return buildPlanFromAnalysis(analysis, input, data);
}

/** Collect infrastructure-specific scanner recommendations. */
function collectInfraRecs(
  analysis: RepoAnalysis,
  recs: ScannerRecommendation[],
  ctx: RecContext
): void {
  if (analysis.hasDockerfile) {
    tryAddScanner(
      'trivy',
      'container',
      'Dockerfile detected — scan container images for vulnerabilities',
      recs,
      ctx
    );
  }
  if (analysis.hasHelmCharts) {
    tryAddScanner(
      'checkov',
      'iac',
      'Helm charts detected — scan IaC for misconfigurations',
      recs,
      ctx
    );
  }
}

/** Pure function: build plan from analysis + scanner data (testable). */
export function buildPlanFromAnalysis(
  analysis: RepoAnalysis,
  input: BuildPlanOptions,
  data?: ScannerData
): RepoSecurityPlan {
  const resolved = data ?? FALLBACK_SCANNER_DATA;
  const ctx: RecContext = {
    existing: analysis.securityTooling,
    ciProvider: analysis.ciProvider,
    language: analysis.language,
    categoryFilter: input.categories ? new Set(input.categories) : null,
    maxScanners: input.maxScanners ?? 10,
    scanners: resolved.scanners,
  };

  const recs: ScannerRecommendation[] = [];
  const langMap = analysis.language !== null ? resolved.languageMap[analysis.language] : undefined;
  if (langMap) collectLanguageRecs(langMap, recs, ctx);
  collectInfraRecs(analysis, recs, ctx);

  const conflicts = detectConflicts(recs, resolved.scanners);
  const coverage = buildCoverage(recs, analysis.securityTooling, resolved.scanners);
  const uncovered = coverage.filter((c) => !c.covered).map((c) => c.category);

  return {
    repo: analysis.name,
    language: analysis.language,
    framework: analysis.framework,
    ciProvider: analysis.ciProvider,
    existingTooling: analysis.securityTooling,
    recommendations: recs,
    conflicts,
    coverage,
    gapsSummary: [
      ...analysis.gaps,
      ...(uncovered.length > 0 ? [`Uncovered categories: ${uncovered.join(', ')}`] : []),
    ],
  };
}
