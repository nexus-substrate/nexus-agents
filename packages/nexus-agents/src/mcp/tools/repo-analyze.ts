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

/** Detect security tooling from files. */
export function detectSecurityTooling(entries: readonly string[]): readonly string[] {
  const tools: string[] = [];
  if (entries.includes('.semgrep.yml') || entries.includes('.semgrep')) tools.push('semgrep');
  if (entries.includes('.snyk')) tools.push('snyk');
  if (entries.includes('SECURITY.md')) tools.push('security-policy');
  if (entries.includes('.trivyignore')) tools.push('trivy');
  if (entries.includes('CODEOWNERS')) tools.push('codeowners');
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
  [['.semgrep.yml', '.semgrep', '.trivyignore'], 'No SAST/SCA security scanning configured'],
  [['tests', 'test', '__tests__', 'spec'], 'No test directory detected'],
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
    sca: ['trivy', 'npm audit'],
  },
  JavaScript: {
    sast: ['semgrep (p/javascript, p/nodejs)', 'eslint-plugin-security'],
    sca: ['trivy', 'npm audit'],
  },
  Python: {
    sast: ['semgrep (p/python)', 'bandit'],
    sca: ['trivy', 'pip-audit'],
  },
  Java: {
    sast: ['semgrep (p/java)', 'spotbugs + find-sec-bugs'],
    sca: ['trivy', 'OWASP dependency-check'],
  },
  Go: {
    sast: ['semgrep (p/golang)', 'gosec'],
    sca: ['trivy', 'govulncheck'],
  },
  Rust: {
    sast: ['semgrep (p/rust)'],
    sca: ['trivy', 'cargo-audit'],
  },
  'C++': {
    sast: ['semgrep (p/c)', 'cppcheck'],
    sca: ['trivy'],
  },
  C: {
    sast: ['semgrep (p/c)', 'cppcheck'],
    sca: ['trivy'],
  },
  Kotlin: {
    sast: ['semgrep (p/kotlin)', 'detekt'],
    sca: ['trivy', 'OWASP dependency-check'],
  },
  Swift: {
    sast: ['semgrep (p/swift)'],
    sca: ['trivy'],
  },
  Ruby: {
    sast: ['semgrep (p/ruby)', 'brakeman'],
    sca: ['trivy', 'bundler-audit'],
  },
  PHP: {
    sast: ['semgrep (p/php)', 'phpstan'],
    sca: ['trivy', 'composer audit'],
  },
  Shell: {
    sast: ['semgrep (p/bash)', 'shellcheck'],
    sca: [],
  },
  HCL: {
    sast: ['semgrep (p/terraform)', 'tfsec'],
    sca: ['trivy'],
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
  const hasSca = securityTooling.includes('trivy') || securityTooling.includes('snyk');

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
  topLevelEntries: readonly string[]
): RepoAnalysis {
  const ciProvider = detectCiProvider(topLevelEntries);
  const secTooling = detectSecurityTooling(topLevelEntries);
  const hasTests =
    topLevelEntries.includes('tests') ||
    topLevelEntries.includes('test') ||
    topLevelEntries.includes('__tests__') ||
    topLevelEntries.includes('spec');

  return {
    name: metadata.full_name,
    language: metadata.language,
    framework: detectFramework(topLevelEntries),
    packageManager: detectPackageManager(topLevelEntries),
    ciProvider,
    securityTooling: secTooling,
    hasDockerfile:
      topLevelEntries.includes('Dockerfile') ||
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

/** Fetch repo data from GitHub and produce analysis. */
export async function analyzeGitHubRepo(input: RepoAnalyzeInput): Promise<RepoAnalysis> {
  const repoId = normalizeRepoId(input.repo);

  // Use gh CLI for API access (available in nexus-agents environment)
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  // Fetch repo metadata
  const { stdout: metaJson } = await execFileAsync('gh', [
    'api',
    `repos/${repoId}`,
    '--jq',
    '{name: .name, full_name: .full_name, description: .description, language: .language, default_branch: .default_branch, stargazers_count: .stargazers_count, license: .license}',
  ]);
  const metadata = JSON.parse(metaJson.trim()) as GhRepoMetadata;

  // Fetch top-level directory listing
  const { stdout: contentsJson } = await execFileAsync('gh', [
    'api',
    `repos/${repoId}/contents`,
    '--jq',
    '[.[].name]',
  ]);
  const entries = JSON.parse(contentsJson.trim()) as string[];

  return analyzeRepo(metadata, entries);
}
