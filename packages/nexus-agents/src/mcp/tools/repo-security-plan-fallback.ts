/**
 * nexus-agents/mcp - Fallback Scanner Data
 *
 * Embedded snapshot of the vulnerability-scanner-registry manifest.
 * Used when the live registry fetch fails (network issues, gh CLI
 * unavailable, etc.). Updated periodically from the canonical
 * registry at github.com/williamzujkowski/vulnerability-scanner-registry.
 *
 * @module mcp/tools/repo-security-plan-fallback
 * (Source: Consensus vote — externalize scanner registry, 6-0 unanimous)
 */

import type { ScannerData } from './repo-security-plan.js';

// ============================================================================
// Fallback Scanner Entries (27 scanners)
// ============================================================================

const FALLBACK_SCANNERS: ScannerData['scanners'] = [
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
// Fallback Language Map (16 languages)
// ============================================================================

const FALLBACK_LANGUAGE_MAP: ScannerData['languageMap'] = {
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
  PHP: {
    sast: ['phpstan', 'semgrep'],
    sca: ['trivy'],
    secrets: ['gitleaks'],
  },
  'C#': {
    sast: ['codeql', 'semgrep'],
    sca: ['trivy'],
    secrets: ['gitleaks'],
  },
  C: {
    sast: ['cppcheck', 'codeql', 'semgrep'],
    sca: ['trivy'],
    secrets: ['gitleaks'],
  },
  'C++': {
    sast: ['cppcheck', 'codeql', 'semgrep'],
    sca: ['trivy'],
    secrets: ['gitleaks'],
  },
  Rust: {
    sast: ['semgrep'],
    sca: ['cargo-audit', 'trivy'],
    secrets: ['gitleaks'],
  },
  Kotlin: {
    sast: ['detekt', 'semgrep', 'codeql'],
    sca: ['trivy'],
    secrets: ['gitleaks'],
  },
  Swift: {
    sast: ['codeql', 'semgrep'],
    sca: ['trivy'],
    secrets: ['gitleaks'],
  },
  Scala: {
    sast: ['semgrep', 'spotbugs'],
    sca: ['trivy'],
    secrets: ['gitleaks'],
  },
  Shell: {
    sast: ['shellcheck', 'semgrep'],
    sca: [],
    secrets: ['gitleaks'],
  },
  HCL: {
    sast: ['checkov', 'tfsec'],
    sca: ['trivy'],
    secrets: ['gitleaks'],
  },
};

// ============================================================================
// Exported Fallback
// ============================================================================

/** Embedded scanner data snapshot used when live registry is unavailable. */
export const FALLBACK_SCANNER_DATA: ScannerData = {
  scanners: FALLBACK_SCANNERS,
  languageMap: FALLBACK_LANGUAGE_MAP,
  source: 'fallback',
};
