/* eslint-disable max-lines -- cohesive module, governance allows 400-600 */
/**
 * nexus-agents/mcp - Repository Analyze Logic
 *
 * Inspects a GitHub repository and returns structured analysis
 * including language, tooling, CI, security, and gap identification.
 *
 * @module mcp/tools/repo-analyze
 * (Source: Issue #1074)
 */

import type { RepoAnalyzeInput, RepoAnalysis } from './repo-analyze-types.js';

// ============================================================================
// Helpers
// ============================================================================

/** Normalize "owner/repo" from either "owner/repo" or full GitHub URL. */
export function normalizeRepoId(input: string): string {
  const urlMatch = /github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/|$)/.exec(input);
  const matched = urlMatch?.[1] ?? '';
  if (matched.length > 0) return matched;
  if (/^[^/]+\/[^/]+$/.test(input)) return input;
  throw new Error(`Invalid repo format: "${input}". Use "owner/name" or a GitHub URL.`);
}

/** Package manager detection rules: [files, manager]. First match wins. */
const PACKAGE_MANAGER_RULES: ReadonlyArray<readonly [readonly string[], string]> = [
  [['pnpm-lock.yaml'], 'pnpm'],
  [['yarn.lock'], 'yarn'],
  [['package-lock.json', 'package.json'], 'npm'],
  [['Cargo.toml'], 'cargo'],
  [['go.mod'], 'go'],
  [['requirements.txt', 'pyproject.toml'], 'pip'],
  [['Gemfile'], 'bundler'],
  [['pom.xml'], 'maven'],
  [['build.gradle', 'build.gradle.kts'], 'gradle'],
];

/** Detect package manager from top-level files. */
export function detectPackageManager(entries: readonly string[]): string | null {
  for (const [files, manager] of PACKAGE_MANAGER_RULES) {
    if (files.some((f) => entries.includes(f))) return manager;
  }
  return null;
}

/** Detect CI provider from directory structure. */
export function detectCiProvider(entries: readonly string[]): string | null {
  if (entries.includes('.github')) return 'github-actions';
  if (entries.includes('.gitlab-ci.yml')) return 'gitlab-ci';
  if (entries.includes('Jenkinsfile')) return 'jenkins';
  if (entries.includes('.circleci')) return 'circleci';
  if (entries.includes('.travis.yml')) return 'travis';
  if (entries.includes('azure-pipelines.yml')) return 'azure-devops';
  if (entries.includes('concourse')) return 'concourse';
  return null;
}

/** Tool names detectable from CI workflow filenames (#1674). */
const WORKFLOW_SECURITY_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  ['semgrep', 'semgrep'],
  ['codeql', 'codeql'],
  ['grype', 'grype'],
  ['snyk', 'snyk'],
];

/** Detect security tools from .github/workflows/ filenames. */
function detectWorkflowSecurity(
  workflowEntries: readonly string[],
  existing: readonly string[]
): readonly string[] {
  const wfLower = workflowEntries.map((w) => w.toLowerCase());
  const found: string[] = [];
  for (const [pattern, tool] of WORKFLOW_SECURITY_PATTERNS) {
    if (!existing.includes(tool) && wfLower.some((w) => w.includes(pattern))) {
      found.push(tool);
    }
  }
  return found;
}

/** Root-level config files that imply a security tool is in use. */
const ROOT_SECURITY_FILES: ReadonlyArray<readonly [readonly string[], string]> = [
  [['.semgrep.yml', '.semgrep'], 'semgrep'],
  [['.snyk'], 'snyk'],
  [['SECURITY.md'], 'security-policy'],
  [['.grype.yaml'], 'grype'],
  [['CODEOWNERS'], 'codeowners'],
  // gitleaks (#2732). Catches `.gitleaks.toml` (canonical) plus legacy
  // `gitleaks.toml` / `.gitleaksignore` variants. Without this, a repo
  // carrying `.gitleaks.toml` reported `existingTooling` without gitleaks,
  // and `repo_security_plan` then showed `secrets: covered: true,
  // scanners: []` (covered by existing-but-undetected tooling).
  [['.gitleaks.toml', 'gitleaks.toml', '.gitleaksignore'], 'gitleaks'],
];

/** Detect security tooling from root files and CI workflow filenames (#1674). */
export function detectSecurityTooling(
  entries: readonly string[],
  workflowEntries?: readonly string[]
): readonly string[] {
  const tools: string[] = [];
  for (const [files, tool] of ROOT_SECURITY_FILES) {
    if (files.some((f) => entries.includes(f))) tools.push(tool);
  }
  if (workflowEntries !== undefined) {
    tools.push(...detectWorkflowSecurity(workflowEntries, tools));
  }
  return tools;
}

/** Detect framework from package manager config. */
export function detectFramework(entries: readonly string[]): string | null {
  if (entries.includes('helmfile.yaml') || entries.includes('helmfile.yaml.gotmpl'))
    return 'helmfile';
  if (entries.includes('next.config.js') || entries.includes('next.config.ts')) return 'nextjs';
  if (entries.includes('angular.json')) return 'angular';
  if (entries.includes('vite.config.ts') || entries.includes('vite.config.js')) return 'vite';
  if (entries.includes('tsconfig.json') && entries.includes('package.json')) return 'typescript';
  return null;
}

/** Gap detection rules: [files-any-present, gap message]. */
const GAP_RULES: ReadonlyArray<readonly [readonly string[], string]> = [
  [['SECURITY.md'], 'No SECURITY.md policy'],
  [['CODEOWNERS'], 'No CODEOWNERS file'],
  [['LICENSE', 'LICENSE.md'], 'No LICENSE file'],
  [
    ['.semgrep.yml', '.semgrep', '.grype.yaml', '.snyk'],
    'No SAST/SCA security scanning configured',
  ],
  // Test detection handled separately via detectTestInfra (supports monorepo + co-located patterns)
  [['.gitignore'], 'No .gitignore file'],
];

/** Scanner recommendation per language. Canonical source: secure-language-stacks. */
interface LanguageScanners {
  readonly sast: readonly string[];
  readonly sca: readonly string[];
}

const LANGUAGE_SCANNER_MATRIX: Readonly<Record<string, LanguageScanners>> = {
  TypeScript: {
    sast: ['semgrep (p/typescript, p/nodejs)', 'eslint-plugin-security'],
    sca: ['osv-scanner', 'npm audit'],
  },
  JavaScript: {
    sast: ['semgrep (p/javascript, p/nodejs)', 'eslint-plugin-security'],
    sca: ['osv-scanner', 'npm audit'],
  },
  Python: {
    sast: ['semgrep (p/python)', 'bandit'],
    sca: ['osv-scanner', 'pip-audit'],
  },
  Java: {
    sast: ['semgrep (p/java)', 'spotbugs + find-sec-bugs'],
    sca: ['osv-scanner', 'OWASP dependency-check'],
  },
  Go: {
    sast: ['semgrep (p/golang)', 'gosec'],
    sca: ['osv-scanner', 'govulncheck'],
  },
  Rust: {
    sast: ['semgrep (p/rust)'],
    sca: ['osv-scanner', 'cargo-audit'],
  },
  'C++': {
    sast: ['semgrep (p/c)', 'cppcheck'],
    sca: ['osv-scanner'],
  },
  C: {
    sast: ['semgrep (p/c)', 'cppcheck'],
    sca: ['osv-scanner'],
  },
  Kotlin: {
    sast: ['semgrep (p/kotlin)', 'detekt'],
    sca: ['osv-scanner', 'OWASP dependency-check'],
  },
  Swift: {
    sast: ['semgrep (p/swift)'],
    sca: ['osv-scanner'],
  },
  Ruby: {
    sast: ['semgrep (p/ruby)', 'brakeman'],
    sca: ['osv-scanner', 'bundler-audit'],
  },
  PHP: {
    sast: ['semgrep (p/php)', 'phpstan'],
    sca: ['osv-scanner', 'composer audit'],
  },
  Shell: {
    sast: ['semgrep (p/bash)', 'shellcheck'],
    sca: [],
  },
  HCL: {
    sast: ['semgrep (p/terraform)', 'tfsec'],
    sca: ['osv-scanner'],
  },
};

/** Generate language-specific scanner recommendations when SAST/SCA is missing. */
export function getLanguageRecommendations(
  language: string | null,
  securityTooling: readonly string[]
): readonly string[] {
  if (language === null) return [];
  const scanners = LANGUAGE_SCANNER_MATRIX[language];
  if (scanners === undefined) return [];

  const hasSast = securityTooling.includes('semgrep') || securityTooling.includes('snyk');
  const hasSca =
    securityTooling.includes('osv-scanner') ||
    securityTooling.includes('grype') ||
    securityTooling.includes('snyk');

  const recs: string[] = [];
  if (!hasSast && scanners.sast.length > 0) {
    const tools = scanners.sast.join(', ');
    recs.push(`${language} project missing SAST: ${tools}`);
  }
  if (!hasSca && scanners.sca.length > 0) {
    const tools = scanners.sca.join(', ');
    recs.push(`${language} project missing SCA: ${tools}`);
  }
  return recs;
}

/** SAST tool names that suppress the generic gap message. */
const SAST_TOOLS = new Set(['semgrep', 'codeql', 'snyk']);
const SAST_GAP_MSG = 'No SAST/SCA security scanning configured';

/** Remove the SAST/SCA gap if any SAST tool was detected (#1674). */
function removeSastGapIfToolDetected(gaps: string[], secTools: readonly string[]): void {
  if (secTools.some((t) => SAST_TOOLS.has(t))) {
    const idx = gaps.indexOf(SAST_GAP_MSG);
    if (idx !== -1) gaps.splice(idx, 1);
  }
}

/** Identify gaps in repository best practices. */
export function identifyGaps(
  entries: readonly string[],
  ciProvider: string | null,
  language?: string | null,
  securityTooling?: readonly string[]
): readonly string[] {
  const gaps: string[] = [];
  if (ciProvider === null) gaps.push('No CI/CD configuration detected');
  for (const [files, message] of GAP_RULES) {
    if (!files.some((f) => entries.includes(f))) gaps.push(message);
  }
  // Test detection: uses detectTestInfra for monorepo + co-located pattern support (#1130)
  if (!detectTestInfra(entries)) gaps.push('No test directory detected');

  // Remove SAST/SCA gap if workflow-level security was detected (#1674)
  removeSastGapIfToolDetected(gaps, securityTooling ?? []);

  // Language-specific recommendations when generic SAST/SCA gap detected
  const hasGenericSecGap = gaps.includes('No SAST/SCA security scanning configured');
  if (
    hasGenericSecGap &&
    language !== null &&
    language !== undefined &&
    securityTooling !== undefined
  ) {
    const langRecs = getLanguageRecommendations(language, securityTooling);
    gaps.push(...langRecs);
  }

  return gaps;
}

// ============================================================================
// Core
// ============================================================================

/** GitHub repo metadata from the API. */
export interface GhRepoMetadata {
  readonly name: string;
  readonly full_name: string;
  readonly description: string | null;
  readonly language: string | null;
  readonly default_branch: string;
  readonly stargazers_count: number;
  readonly license: { readonly spdx_id: string } | null;
}

/** Analyze a GitHub repository given its metadata and file tree. */
export function analyzeRepo(
  metadata: GhRepoMetadata,
  topLevelEntries: readonly string[],
  workflowEntries?: readonly string[]
): RepoAnalysis {
  const ciProvider = detectCiProvider(topLevelEntries);
  const secTooling = detectSecurityTooling(topLevelEntries, workflowEntries);
  const hasTests = detectTestInfra(topLevelEntries);

  return {
    name: metadata.full_name,
    language: metadata.language,
    framework: detectFramework(topLevelEntries),
    packageManager: detectPackageManager(topLevelEntries),
    ciProvider,
    securityTooling: secTooling,
    // Match `Dockerfile`, `Dockerfile.<purpose>` (e.g. `Dockerfile.sandbox`),
    // and docker-compose variants. Pre-#2730 the check was exact-match only,
    // so a repo with three legitimate `Dockerfile.*` files reported false.
    hasDockerfile:
      topLevelEntries.some((e) => e === 'Dockerfile' || e.startsWith('Dockerfile.')) ||
      topLevelEntries.includes('docker-compose.yml') ||
      topLevelEntries.includes('docker-compose.yaml'),
    hasHelmCharts:
      topLevelEntries.includes('Chart.yaml') ||
      topLevelEntries.includes('charts') ||
      topLevelEntries.includes('helm'),
    hasMakefile: topLevelEntries.includes('Makefile'),
    hasTests,
    license: metadata.license?.spdx_id ?? null,
    description: metadata.description,
    defaultBranch: metadata.default_branch,
    stars: metadata.stargazers_count,
    topLevelEntries: [...topLevelEntries],
    gaps: identifyGaps(topLevelEntries, ciProvider, metadata.language, secTooling),
  };
}

/** Non-code languages to exclude when detecting primary language. */
const MARKUP_LANGUAGES = new Set([
  'HTML',
  'CSS',
  'SCSS',
  'Less',
  'Markdown',
  'Roff',
  'SVG',
  'XML',
  'XSLT',
  'Mustache',
  'Handlebars',
  'EJS',
]);

/** Detect primary language from GitHub languages API (byte counts). */
function detectPrimaryLanguage(
  languages: Record<string, number>,
  fallback: string | null
): string | null {
  const sorted = Object.entries(languages)
    .filter(([lang]) => !MARKUP_LANGUAGES.has(lang))
    .sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  return top !== undefined ? top[0] : fallback;
}

/** Check for test infrastructure beyond top-level directories. */
function detectTestInfra(entries: readonly string[]): boolean {
  const testDirs = ['tests', 'test', '__tests__', 'spec'];
  if (testDirs.some((d) => entries.includes(d))) return true;
  // Check for test config files (co-located test pattern, monorepos)
  const testConfigs = [
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mts',
    'vitest.workspace.ts',
    'vitest.workspace.js',
    'jest.config.ts',
    'jest.config.js',
    'jest.config.mjs',
    'cypress.config.ts',
    'cypress.config.js',
    'playwright.config.ts',
    '.mocharc.yml',
    '.mocharc.json',
  ];
  if (testConfigs.some((c) => entries.includes(c))) return true;
  // Monorepo: packages/ dir + package.json implies co-located tests
  return entries.includes('packages') && entries.includes('package.json');
}

/** Infer code language from project files when GitHub reports markup. */
function inferLanguageFromEntries(
  entries: readonly string[],
  fallback: string | null
): string | null {
  if (entries.includes('tsconfig.json')) return 'TypeScript';
  if (entries.includes('Cargo.toml')) return 'Rust';
  if (entries.includes('go.mod')) return 'Go';
  if (entries.includes('pyproject.toml') || entries.includes('setup.py')) return 'Python';
  if (entries.includes('pom.xml') || entries.includes('build.gradle')) return 'Java';
  if (entries.includes('Gemfile')) return 'Ruby';
  if (entries.includes('package.json')) return 'JavaScript';
  return fallback;
}

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: { timeout?: number }
) => Promise<{ stdout: string }>;

/** Lazy-load promisified execFile. */
async function getExecFile(): Promise<ExecFileFn> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  return promisify(execFile);
}

/** Fetch repo metadata and languages via GitHub API. */
async function fetchRepoData(
  repoId: string,
  exec: ExecFileFn
): Promise<{ metadata: GhRepoMetadata; entries: string[] }> {
  const { stdout: metaJson } = await exec(
    'gh',
    [
      'api',
      `repos/${repoId}`,
      '--jq',
      '{name: .name, full_name: .full_name, description: .description, language: .language, default_branch: .default_branch, stargazers_count: .stargazers_count, license: .license}',
    ],
    { timeout: 30_000 }
  );
  let metadata: GhRepoMetadata;
  try {
    metadata = JSON.parse(metaJson.trim()) as GhRepoMetadata;
  } catch {
    throw new Error(`Failed to parse repo metadata for ${repoId}: ${metaJson.slice(0, 200)}`);
  }
  const { stdout: contentsJson } = await exec(
    'gh',
    ['api', `repos/${repoId}/contents`, '--jq', '[.[].name]'],
    { timeout: 30_000 }
  );
  let entries: string[];
  try {
    const parsed: unknown = JSON.parse(contentsJson.trim());
    entries = Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    throw new Error(`Failed to parse repo contents for ${repoId}: ${contentsJson.slice(0, 200)}`);
  }
  return { metadata, entries };
}

/** Resolve NOASSERTION license via the GitHub license API. */
async function resolveLicense(repoId: string, exec: ExecFileFn): Promise<string | null> {
  try {
    const { stdout } = await exec(
      'gh',
      ['api', `repos/${repoId}/license`, '--jq', '.license.spdx_id'],
      { timeout: 15_000 }
    );
    const spdxId = stdout.trim();
    if (spdxId !== '' && spdxId !== 'null' && spdxId !== 'NOASSERTION') {
      return spdxId;
    }
  } catch {
    // Keep NOASSERTION if license API also fails
  }
  return null;
}

/** Resolve primary language, falling back to entry inference for markup repos. */
async function resolveLanguage(
  repoId: string,
  entries: readonly string[],
  metadata: GhRepoMetadata,
  exec: ExecFileFn
): Promise<string | null> {
  let languages: Record<string, number> = {};
  try {
    const { stdout } = await exec('gh', ['api', `repos/${repoId}/languages`], { timeout: 15_000 });
    languages = JSON.parse(stdout.trim()) as Record<string, number>;
  } catch {
    /* fall back to metadata.language */
  }
  const primary = detectPrimaryLanguage(languages, metadata.language);
  if (primary === null || MARKUP_LANGUAGES.has(primary)) {
    return inferLanguageFromEntries(entries, primary);
  }
  return primary;
}

/** Fetch workflow filenames from .github/workflows/ (#1674). Best-effort. */
async function fetchWorkflowEntries(repoId: string, exec: ExecFileFn): Promise<readonly string[]> {
  try {
    const { stdout } = await exec(
      'gh',
      ['api', `repos/${repoId}/contents/.github/workflows`, '--jq', '[.[].name]'],
      { timeout: 15_000 }
    );
    const parsed: unknown = JSON.parse(stdout.trim());
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    return []; // No workflows directory or API error — graceful fallback
  }
}

/** Fetch repo data from GitHub and produce analysis. */
export async function analyzeGitHubRepo(input: RepoAnalyzeInput): Promise<RepoAnalysis> {
  const repoId = normalizeRepoId(input.repo);
  const exec = await getExecFile();
  const { metadata, entries } = await fetchRepoData(repoId, exec);

  const primaryLang = await resolveLanguage(repoId, entries, metadata, exec);
  const enhanced = { ...metadata, language: primaryLang };

  // Resolve null or NOASSERTION license when LICENSE file exists
  const hasLicenseFile = entries.includes('LICENSE') || entries.includes('LICENSE.md');
  const licenseUnresolved = enhanced.license === null || enhanced.license.spdx_id === 'NOASSERTION';
  if (licenseUnresolved && hasLicenseFile) {
    const resolved = await resolveLicense(repoId, exec);
    if (resolved !== null) enhanced.license = { spdx_id: resolved };
  }

  // Fetch workflow filenames for CI-level security detection (#1674)
  const workflowEntries = entries.includes('.github')
    ? await fetchWorkflowEntries(repoId, exec)
    : [];

  return analyzeRepo(enhanced, entries, workflowEntries);
}
