/**
 * Finding Triage — LLM False Positive Filter for SARIF Findings (#1681 Phase 2)
 *
 * Uses security expert to assess SARIF findings for exploitability,
 * filtering false positives before presenting to users.
 *
 * @module security/finding-triage
 */

import { z } from 'zod';
import type { SecurityFinding } from './sarif-types.js';
import { SEVERITY_ORDER } from './sarif-types.js';
import { readFileSync } from 'node:fs';

/** Verdict from triage assessment. */
export const TriageVerdictSchema = z.object({
  confirmed: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(1000),
  suggestedSeverity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
});

export type TriageVerdict = z.infer<typeof TriageVerdictSchema>;

/** Configuration for triage. */
export interface TriageConfig {
  maxFindings: number;
  contextLines: number;
  minConfidence: number;
}

export const DEFAULT_CONFIG: TriageConfig = {
  maxFindings: 10,
  contextLines: 5,
  minConfidence: 0.5,
};

/**
 * Read source code around a finding location.
 */
function readContext(finding: SecurityFinding, contextLines: number): string {
  try {
    const content = readFileSync(finding.file, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, finding.startLine - contextLines - 1);
    const end = Math.min(lines.length, finding.endLine ?? finding.startLine + contextLines);
    return lines.slice(start, end).join('\n');
  } catch {
    return finding.snippet ?? '';
  }
}

/**
 * Build triage prompt for security expert.
 */
function buildTriagePrompt(finding: SecurityFinding, context: string): string {
  const { id, rule, message, file, startLine, severity, cweIds } = finding;
  return `## Security Finding Assessment

You are assessing a security finding for exploitability to determine if it is a false positive.

### Finding Details
- **ID**: ${id}
- **Rule**: ${rule}
- **Severity**: ${severity}
- **File**: ${file}:${String(startLine)}
- **CWEs**: ${cweIds.join(', ') || 'None'}

### Description
${message}

### Source Context (lines ${String(startLine - 3)}-${String(startLine + 3)})
\`\`\`
${context}
\`\`\`

## Assessment Task
Analyze the finding and answer:
1. Is this finding exploitable in practice? (Consider: is the data tainted? Is there sanitization? Is there an attack vector?)
2. What is your confidence level (0-1)?
3. What severity is appropriate if confirmed?

Respond with a JSON object:
{
  "confirmed": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentence explanation",
  "suggestedSeverity": "critical|high|medium|low|info"
}

Only respond with JSON, no additional text.`;
}

/**
 * Parse triage response from expert.
 */
function parseTriageResponse(response: string): TriageVerdict | null {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }
  try {
    const jsonStr: string = jsonMatch[0];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(jsonStr);
    return TriageVerdictSchema.parse(parsed);
  } catch {
    return null;
  }
}

/**
 * Triage a single finding using the security expert.
 *
 * @param finding - Security finding to triage
 * @param delegateFn - Function to delegate to model
 * @param config - Triage configuration
 * @returns Triage verdict or null on failure
 */
export async function triageFinding(
  finding: SecurityFinding,
  delegateFn: (prompt: string) => Promise<string>,
  config: TriageConfig = DEFAULT_CONFIG
): Promise<TriageVerdict | null> {
  const context = readContext(finding, config.contextLines);
  const prompt = buildTriagePrompt(finding, context);

  try {
    const response = await delegateFn(prompt);
    const verdict = parseTriageResponse(response);

    if (verdict === null) {
      return null;
    }

    if (verdict.confidence < config.minConfidence) {
      return { ...verdict, confirmed: false };
    }

    return verdict;
  } catch {
    return null;
  }
}

/**
 * Filter false positives from findings.
 *
 * @param findings - Array of security findings
 * @param delegateFn - Function to delegate to model
 * @param config - Triage configuration
 * @returns Findings filtered by triage (only confirmed ones)
 */
export async function triageFindings(
  findings: SecurityFinding[],
  delegateFn: (prompt: string) => Promise<string>,
  config: TriageConfig = DEFAULT_CONFIG
): Promise<{ original: SecurityFinding[]; triaged: TriageVerdict[] }> {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  const toTriaged = sorted.slice(0, config.maxFindings);

  const results: TriageVerdict[] = [];
  for (const finding of toTriaged) {
    const verdict = await triageFinding(finding, delegateFn, config);
    if (verdict !== null) {
      results.push(verdict);
    }
  }

  return {
    original: findings,
    triaged: results,
  };
}
