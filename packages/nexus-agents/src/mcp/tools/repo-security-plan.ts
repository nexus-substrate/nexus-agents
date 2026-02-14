/**
 * nexus-agents/mcp - Repository Security Plan Logic
 *
 * Generates a language-aware security scanning pipeline recommendation
 * by composing repo_analyze output with embedded scanner registry data.
 *
 * @module mcp/tools/repo-security-plan
 * (Source: Issue #1079, 3-0 consensus vote)
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

// ============================================================================
// Embedded Scanner Registry (snapshot from vulnerability-scanner-registry)
// ============================================================================

interface ScannerEntry {
  readonly name: string;
  readonly displayName: string;
  readonly categories: readonly string[];
  readonly license: string;
  readonly pricingModel: string;
  readonly supersedes?: readonly string[];
  readonly competesWIth?: readonly string[];
}

const SCANNER_REGISTRY: readonly ScannerEntry[] = [
  {
    name: 'semgrep',
    displayName: 'Semgrep',
    categories: ['sast', 'secrets'],
    license: 'LGPL-2.1',
    pricingModel: 'freemium',
  },
  {
    name: 'codeql',
    displayName: 'CodeQL',
    categories: ['sast'],
    license: 'MIT',
    pricingModel: 'freemium',
    competesWIth: ['semgrep'],
  },
  {
    name: 'bandit',
    displayName: 'Bandit',
    categories: ['sast'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'gosec',
    displayName: 'Gosec',
    categories: ['sast'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'brakeman',
    displayName: 'Brakeman',
    categories: ['sast'],
    license: 'MIT',
    pricingModel: 'free',
  },
  {
    name: 'phpstan',
    displayName: 'PHPStan',
    categories: ['sast'],
    license: 'MIT',
    pricingModel: 'freemium',
  },
  {
    name: 'shellcheck',
    displayName: 'ShellCheck',
    categories: ['sast'],
    license: 'GPL-3.0',
    pricingModel: 'free',
  },
  {
    name: 'cppcheck',
    displayName: 'Cppcheck',
    categories: ['sast'],
    license: 'GPL-3.0',
    pricingModel: 'free',
  },
  {
    name: 'detekt',
    displayName: 'detekt',
    categories: ['sast'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'spotbugs',
    displayName: 'SpotBugs',
    categories: ['sast'],
    license: 'LGPL-2.1',
    pricingModel: 'free',
  },
  {
    name: 'eslint-security',
    displayName: 'eslint-plugin-security',
    categories: ['sast'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'sonarqube',
    displayName: 'SonarQube',
    categories: ['sast', 'sca'],
    license: 'LGPL-3.0',
    pricingModel: 'freemium',
  },
  {
    name: 'trivy',
    displayName: 'Trivy',
    categories: ['sca', 'container', 'iac', 'sbom'],
    license: 'Apache-2.0',
    pricingModel: 'free',
    supersedes: ['tfsec'],
  },
  {
    name: 'snyk',
    displayName: 'Snyk',
    categories: ['sca', 'sast', 'container'],
    license: 'Proprietary',
    pricingModel: 'freemium',
  },
  {
    name: 'grype',
    displayName: 'Grype',
    categories: ['sca', 'container'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'npm-audit',
    displayName: 'npm audit',
    categories: ['sca'],
    license: 'Artistic-2.0',
    pricingModel: 'free',
  },
  {
    name: 'pip-audit',
    displayName: 'pip-audit',
    categories: ['sca'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'cargo-audit',
    displayName: 'cargo-audit',
    categories: ['sca'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'bundler-audit',
    displayName: 'bundler-audit',
    categories: ['sca'],
    license: 'GPL-3.0',
    pricingModel: 'free',
  },
  {
    name: 'govulncheck',
    displayName: 'govulncheck',
    categories: ['sca'],
    license: 'BSD-3-Clause',
    pricingModel: 'free',
  },
  {
    name: 'owasp-dependency-check',
    displayName: 'OWASP Dependency-Check',
    categories: ['sca'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'gitleaks',
    displayName: 'Gitleaks',
    categories: ['secrets'],
    license: 'MIT',
    pricingModel: 'free',
  },
  {
    name: 'trufflehog',
    displayName: 'TruffleHog',
    categories: ['secrets'],
    license: 'AGPL-3.0',
    pricingModel: 'freemium',
  },
  {
    name: 'checkov',
    displayName: 'Checkov',
    categories: ['iac', 'sca'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'tfsec',
    displayName: 'tfsec',
    categories: ['iac'],
    license: 'MIT',
    pricingModel: 'free',
  },
  {
    name: 'owasp-zap',
    displayName: 'OWASP ZAP',
    categories: ['dast', 'api'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
  {
    name: 'syft',
    displayName: 'Syft',
    categories: ['sbom'],
    license: 'Apache-2.0',
    pricingModel: 'free',
  },
];

// ============================================================================
// Language → Scanner Mapping
// ============================================================================

interface LanguageMapping {
  readonly sast: readonly string[];
  readonly sca: readonly string[];
  readonly secrets: readonly string[];
}

const LANGUAGE_MAP: Readonly<Record<string, LanguageMapping>> = {
  TypeScript: {
    sast: ['semgrep', 'eslint-security', 'codeql'],
    sca: ['npm-audit', 'trivy'],
    secrets: ['gitleaks'],
  },
  JavaScript: {
    sast: ['semgrep', 'eslint-security', 'codeql'],
    sca: ['npm-audit', 'trivy'],
    secrets: ['gitleaks'],
  },
  Python: {
    sast: ['bandit', 'semgrep', 'codeql'],
    sca: ['pip-audit', 'trivy'],
    secrets: ['gitleaks'],
  },
  Java: {
    sast: ['codeql', 'semgrep', 'spotbugs'],
    sca: ['owasp-dependency-check', 'trivy'],
    secrets: ['gitleaks'],
  },
  Go: {
    sast: ['gosec', 'semgrep', 'codeql'],
    sca: ['govulncheck', 'trivy'],
    secrets: ['gitleaks'],
  },
  Ruby: {
    sast: ['brakeman', 'semgrep', 'codeql'],
    sca: ['bundler-audit', 'trivy'],
    secrets: ['gitleaks'],
  },
  PHP: { sast: ['phpstan', 'semgrep'], sca: ['trivy'], secrets: ['gitleaks'] },
  'C#': { sast: ['codeql', 'semgrep'], sca: ['trivy'], secrets: ['gitleaks'] },
  C: { sast: ['cppcheck', 'codeql', 'semgrep'], sca: ['trivy'], secrets: ['gitleaks'] },
  'C++': { sast: ['cppcheck', 'codeql', 'semgrep'], sca: ['trivy'], secrets: ['gitleaks'] },
  Rust: { sast: ['semgrep'], sca: ['cargo-audit', 'trivy'], secrets: ['gitleaks'] },
  Kotlin: { sast: ['detekt', 'semgrep', 'codeql'], sca: ['trivy'], secrets: ['gitleaks'] },
  Swift: { sast: ['codeql', 'semgrep'], sca: ['trivy'], secrets: ['gitleaks'] },
  Scala: { sast: ['semgrep', 'spotbugs'], sca: ['trivy'], secrets: ['gitleaks'] },
  Shell: { sast: ['shellcheck', 'semgrep'], sca: [], secrets: ['gitleaks'] },
  HCL: { sast: ['checkov', 'tfsec'], sca: ['trivy'], secrets: ['gitleaks'] },
};

// ============================================================================
// CI Snippet Generation (GitHub Actions only for v1)
// ============================================================================

function generateCiSnippet(scannerName: string, ciProvider: string | null): string | null {
  if (ciProvider !== 'github-actions') return null;

  const snippets: Record<string, string> = {
    semgrep: `- uses: semgrep/semgrep-action@v1\n  with:\n    config: auto`,
    codeql: `- uses: github/codeql-action/analyze@v3`,
    trivy: `- uses: aquasecurity/trivy-action@master\n  with:\n    scan-type: fs`,
    gitleaks: `- uses: gitleaks/gitleaks-action@v2`,
    bandit: `- run: pip install bandit && bandit -r . -f json`,
    gosec: `- uses: securego/gosec@master\n  with:\n    args: ./...`,
    checkov: `- uses: bridgecrewio/checkov-action@master`,
    grype: `- uses: anchore/scan-action@v4\n  with:\n    path: .`,
    snyk: `- uses: snyk/actions/node@master # adjust for language`,
    shellcheck: `- uses: ludeeus/action-shellcheck@master`,
  };

  return snippets[scannerName] ?? null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function findScanner(name: string): ScannerEntry | undefined {
  return SCANNER_REGISTRY.find((s) => s.name === name);
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
}

/** Options for collecting recommendations in a single category. */
interface CategoryRecOptions {
  readonly names: readonly string[];
  readonly category: string;
  readonly rationale: (entry: ScannerEntry) => string;
  readonly priority: 'critical' | 'recommended';
  readonly ctx: RecContext;
}

/** Collect recommendations for a single category from a scanner name list. */
function collectCategoryRecs(recs: ScannerRecommendation[], opts: CategoryRecOptions): void {
  for (const name of opts.names) {
    if (recs.length >= opts.ctx.maxScanners) break;
    if (isAlreadyUsed(name, opts.ctx.existing)) continue;
    const entry = findScanner(name);
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

/** Collect all language-specific recommendations (SAST + SCA + secrets). */
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
  const entry = findScanner(scannerName);
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

function detectConflicts(recs: readonly ScannerRecommendation[]): readonly ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const names = new Set(recs.map((r) => r.name));
  detectSuperseded(names, warnings);
  detectRedundant(recs, warnings);
  return warnings;
}

function detectSuperseded(names: ReadonlySet<string>, warnings: ConflictWarning[]): void {
  for (const scanner of SCANNER_REGISTRY) {
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
  existing: readonly string[]
): readonly CoverageAnalysis[] {
  return ALL_CATEGORIES.map((cat) => {
    const scanners = recs.filter((r) => r.category === cat).map((r) => r.name);
    const existingMatch = existing.some((t) =>
      SCANNER_REGISTRY.some((s) => s.categories.includes(cat) && t.toLowerCase().includes(s.name))
    );
    return { category: cat, covered: scanners.length > 0 || existingMatch, scanners };
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

/** Generate a security scanning plan for a repository. */
export async function generateSecurityPlan(
  input: RepoSecurityPlanInput
): Promise<RepoSecurityPlan> {
  const analysis = await analyzeGitHubRepo({ repo: input.repo, depth: 'deep' });
  return buildPlanFromAnalysis(analysis, input);
}

/** Pure function: build plan from existing analysis (testable). */
export function buildPlanFromAnalysis(
  analysis: RepoAnalysis,
  input: BuildPlanOptions
): RepoSecurityPlan {
  const maxScanners = input.maxScanners ?? 10;
  const categoryFilter = input.categories ? new Set(input.categories) : null;
  const ctx: RecContext = {
    existing: analysis.securityTooling,
    ciProvider: analysis.ciProvider,
    language: analysis.language,
    categoryFilter,
    maxScanners,
  };

  const recs: ScannerRecommendation[] = [];
  const langMap = analysis.language !== null ? LANGUAGE_MAP[analysis.language] : undefined;

  if (langMap) {
    collectLanguageRecs(langMap, recs, ctx);
  }

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

  const conflicts = detectConflicts(recs);
  const coverage = buildCoverage(recs, analysis.securityTooling);
  const uncovered = coverage.filter((c) => !c.covered).map((c) => c.category);
  const gapsSummary = [
    ...analysis.gaps,
    ...(uncovered.length > 0 ? [`Uncovered categories: ${uncovered.join(', ')}`] : []),
  ];

  return {
    repo: analysis.name,
    language: analysis.language,
    framework: analysis.framework,
    ciProvider: analysis.ciProvider,
    existingTooling: analysis.securityTooling,
    recommendations: recs,
    conflicts,
    coverage,
    gapsSummary,
  };
}
