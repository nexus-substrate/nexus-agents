/**
 * @nexus-agents/agents - SecurityExpert Helpers
 *
 * Helper functions for the SecurityExpert agent including
 * vulnerability detection and heuristic analysis utilities.
 */

import type { Vulnerability, SecurityAnalysisResult } from './expert-types.js';

// ============================================================================
// Vulnerability Patterns
// ============================================================================

interface VulnerabilityPattern {
  pattern: RegExp;
  severity: Vulnerability['severity'];
  type: string;
  description: string;
  remediation: string;
  cweId?: string;
}

/**
 * Common vulnerability patterns for heuristic detection.
 */
export const VULNERABILITY_PATTERNS: VulnerabilityPattern[] = [
  {
    pattern: /sql|query.*user|database.*input/i,
    severity: 'critical',
    type: 'A03:2021 - Injection',
    description: 'Potential SQL injection vulnerability detected',
    remediation: 'Use parameterized queries or prepared statements',
    cweId: 'CWE-89',
  },
  {
    pattern: /password|secret|api.?key|token/i,
    severity: 'high',
    type: 'A02:2021 - Cryptographic Failures',
    description: 'Potential exposure of sensitive credentials',
    remediation: 'Use secure secrets management and environment variables',
    cweId: 'CWE-798',
  },
  {
    pattern: /eval|exec|system|shell/i,
    severity: 'critical',
    type: 'A03:2021 - Injection',
    description: 'Potential code/command injection risk',
    remediation: 'Avoid dynamic code execution; sanitize all inputs',
    cweId: 'CWE-94',
  },
  {
    pattern: /auth|login|session/i,
    severity: 'high',
    type: 'A07:2021 - Authentication Failures',
    description: 'Authentication-related code requires careful review',
    remediation: 'Implement secure session management and MFA',
    cweId: 'CWE-287',
  },
  {
    pattern: /permission|role|access|admin/i,
    severity: 'high',
    type: 'A01:2021 - Broken Access Control',
    description: 'Access control code detected - verify authorization logic',
    remediation: 'Implement principle of least privilege and verify all access controls',
    cweId: 'CWE-284',
  },
];

// ============================================================================
// Vulnerability Detection
// ============================================================================

interface DetectionOptions {
  enableCweMapping?: boolean | undefined;
  minSeverity?: Vulnerability['severity'] | undefined;
}

/**
 * Detects vulnerabilities using heuristic patterns.
 */
export function detectHeuristicVulnerabilities(
  description: string,
  options: DetectionOptions = {}
): Vulnerability[] {
  const vulnerabilities: Vulnerability[] = [];
  const desc = description.toLowerCase();
  let vulnId = 1;

  for (const p of VULNERABILITY_PATTERNS) {
    if (p.pattern.test(desc)) {
      const vuln: Vulnerability = {
        id: `VULN-${String(vulnId++).padStart(3, '0')}`,
        severity: p.severity,
        type: p.type,
        description: p.description,
        remediation: p.remediation,
      };
      if (options.enableCweMapping === true && p.cweId !== undefined) {
        vuln.cweId = p.cweId;
      }
      vulnerabilities.push(vuln);
    }
  }

  return filterBySeverity(vulnerabilities, options.minSeverity);
}

/**
 * Filters vulnerabilities by minimum severity.
 */
function filterBySeverity(
  vulnerabilities: Vulnerability[],
  minSeverity: Vulnerability['severity'] = 'info'
): Vulnerability[] {
  const severityOrder: Record<Vulnerability['severity'], number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };

  const minLevel = severityOrder[minSeverity];
  return vulnerabilities.filter((v) => severityOrder[v.severity] >= minLevel);
}

// ============================================================================
// Security Analysis Helpers
// ============================================================================

/**
 * Calculates security score based on vulnerabilities.
 */
export function calculateSecurityScore(vulnerabilities: Vulnerability[]): number {
  if (vulnerabilities.length === 0) return 100;

  const severityWeights: Record<Vulnerability['severity'], number> = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
    info: 1,
  };

  const totalDeduction = vulnerabilities.reduce((sum, v) => sum + severityWeights[v.severity], 0);

  return Math.max(0, 100 - totalDeduction);
}

/**
 * Generates recommendations based on vulnerabilities.
 */
export function generateHeuristicRecommendations(vulnerabilities: Vulnerability[]): string[] {
  const recommendations: string[] = [
    'Perform regular security audits',
    'Keep dependencies updated',
    'Implement security headers',
  ];

  const hasCritical = vulnerabilities.some((v) => v.severity === 'critical');
  const hasHigh = vulnerabilities.some((v) => v.severity === 'high');

  if (hasCritical) {
    recommendations.unshift('URGENT: Address critical vulnerabilities immediately');
  }
  if (hasHigh) {
    recommendations.push('Schedule remediation for high-severity findings');
  }

  return recommendations;
}

/**
 * Generates security warnings.
 */
export function generateSecurityWarnings(vulnerabilities: Vulnerability[]): string[] {
  const warnings: string[] = [];

  const criticalCount = vulnerabilities.filter((v) => v.severity === 'critical').length;
  const highCount = vulnerabilities.filter((v) => v.severity === 'high').length;

  if (criticalCount > 0) {
    warnings.push(`Found ${String(criticalCount)} critical vulnerability(s)`);
  }
  if (highCount > 0) {
    warnings.push(`Found ${String(highCount)} high-severity vulnerability(s)`);
  }

  return warnings;
}

/**
 * Parses security result from model response.
 */
export function parseSecurityResult(
  text: string,
  calculateScore: (vulns: Vulnerability[]) => number,
  validator: (v: unknown) => { success: boolean; data?: Vulnerability }
): SecurityAnalysisResult {
  try {
    const jsonText = extractJsonFromText(text);
    const parsed = JSON.parse(jsonText) as Partial<SecurityAnalysisResult>;

    // Validate vulnerabilities
    const validVulns = (parsed.vulnerabilities ?? [])
      .map((v) => validator(v))
      .filter((r) => r.success)
      .map((r) => r.data as Vulnerability);

    const result: SecurityAnalysisResult = {
      content: parsed.content ?? 'Security analysis completed',
      vulnerabilities: validVulns,
      securityScore: parsed.securityScore ?? calculateScore(validVulns),
      confidence: parsed.confidence ?? 0.7,
    };
    if (parsed.compliance !== undefined) result.compliance = parsed.compliance;
    if (parsed.recommendations !== undefined) result.recommendations = parsed.recommendations;
    if (parsed.warnings !== undefined) result.warnings = parsed.warnings;
    return result;
  } catch {
    return { content: text, vulnerabilities: [], securityScore: 50, confidence: 0.3 };
  }
}

/**
 * Extracts JSON from text that may contain markdown code blocks.
 */
function extractJsonFromText(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? text.trim();
}
