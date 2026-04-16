/**
 * nexus-agents/agents - SecurityExpert Helpers
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
  // Additional OWASP Top 10 patterns (#1404)
  {
    pattern: /ssrf|server.?side.?request|fetch.*url.*user/i,
    severity: 'critical',
    type: 'A10:2021 - SSRF',
    description: 'Potential server-side request forgery detected',
    remediation: 'Validate and restrict outbound request targets; use allowlists',
    cweId: 'CWE-918',
  },
  {
    pattern: /xml.*parse|xpath|xslt|entity/i,
    severity: 'high',
    type: 'A05:2021 - Security Misconfiguration',
    description: 'XML processing code may be vulnerable to XXE attacks',
    remediation: 'Disable external entity processing in XML parsers',
    cweId: 'CWE-611',
  },
  {
    pattern: /deserializ|unpickle|unserializ|readObject/i,
    severity: 'critical',
    type: 'A08:2021 - Integrity Failures',
    description: 'Insecure deserialization detected',
    remediation: 'Validate serialized data; use safe alternatives like JSON',
    cweId: 'CWE-502',
  },
  {
    pattern: /jwt|jsonwebtoken|bearer.*token/i,
    severity: 'high',
    type: 'A02:2021 - Cryptographic Failures',
    description: 'JWT handling requires algorithm verification',
    remediation: 'Verify JWT algorithm; reject none/HS256 when RS256 expected',
    cweId: 'CWE-347',
  },
  {
    pattern: /path.*join|readFile.*req|fs.*user/i,
    severity: 'high',
    type: 'A01:2021 - Broken Access Control',
    description: 'Path traversal risk in file operations with user input',
    remediation: 'Resolve and validate paths against root directory',
    cweId: 'CWE-22',
  },
  {
    pattern: /crypto.*md5|sha1|des\b|rc4/i,
    severity: 'medium',
    type: 'A02:2021 - Cryptographic Failures',
    description: 'Weak or deprecated cryptographic algorithm detected',
    remediation: 'Use SHA-256+ for hashing; AES-256-GCM for encryption',
    cweId: 'CWE-327',
  },
  {
    pattern: /cors.*\*|access-control-allow-origin.*\*/i,
    severity: 'medium',
    type: 'A05:2021 - Security Misconfiguration',
    description: 'Overly permissive CORS configuration detected',
    remediation: 'Restrict Access-Control-Allow-Origin to specific trusted domains',
    cweId: 'CWE-942',
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
function isSecPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSecStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function applySecOptionalFields(
  result: SecurityAnalysisResult,
  p: Record<string, unknown>
): void {
  if (isSecPlainObject(p['compliance'])) {
    result.compliance = p['compliance'] as unknown as NonNullable<SecurityAnalysisResult['compliance']>;
  }
  if (isSecStringArray(p['recommendations'])) result.recommendations = p['recommendations'];
  if (isSecStringArray(p['warnings'])) result.warnings = p['warnings'];
}

function buildSecurityCore(
  p: Record<string, unknown>,
  validVulns: Vulnerability[],
  calculateScore: (vulns: Vulnerability[]) => number
): SecurityAnalysisResult {
  const score = p['securityScore'];
  const conf = p['confidence'];
  return {
    content: typeof p['content'] === 'string' ? p['content'] : 'Security analysis completed',
    vulnerabilities: validVulns,
    securityScore:
      typeof score === 'number' && score >= 0 && score <= 100 ? score : calculateScore(validVulns),
    confidence: typeof conf === 'number' && conf >= 0 && conf <= 1 ? conf : 0.7,
  };
}

export function parseSecurityResult(
  text: string,
  calculateScore: (vulns: Vulnerability[]) => number,
  validator: (v: unknown) => { success: boolean; data?: Vulnerability }
): SecurityAnalysisResult {
  try {
    const jsonText = extractJsonFromText(text);
    // Runtime type guards instead of `as Partial<T>` (#1913 Class A).
    const rawParsed: unknown = JSON.parse(jsonText);
    if (!isSecPlainObject(rawParsed)) throw new Error('Parsed value is not a plain object');

    // Validate vulnerabilities array items via the caller-supplied validator
    const vulnCandidates = Array.isArray(rawParsed['vulnerabilities']) ? rawParsed['vulnerabilities'] : [];
    const validVulns = vulnCandidates
      .map((v) => validator(v))
      .filter((r) => r.success)
      .map((r) => r.data as Vulnerability);

    const result = buildSecurityCore(rawParsed, validVulns, calculateScore);
    applySecOptionalFields(result, rawParsed);
    return result;
  } catch {
    // JSON parse failed — fall back to heuristic detection on model output (#1404)
    const heuristicVulns = detectHeuristicVulnerabilities(text);
    const score = calculateScore(heuristicVulns);
    return {
      content: text,
      vulnerabilities: heuristicVulns,
      securityScore: score,
      confidence: heuristicVulns.length > 0 ? 0.5 : 0.3,
    };
  }
}

/**
 * Extracts JSON from text that may contain markdown code blocks.
 */
function extractJsonFromText(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? text.trim();
}
