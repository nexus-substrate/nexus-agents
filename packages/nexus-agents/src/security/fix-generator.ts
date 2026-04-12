/**
 * Fix Generator — Security expert drafts patches for confirmed vulnerabilities (#1681 Phase 2c)
 *
 * Takes a confirmed triage verdict + source context, uses security expert delegate
 * to generate a patch. All generated fixes are advisory-only — trust-classifier
 * must gate any application. Never auto-merge.
 *
 * @module security/fix-generator
 */

import { z } from 'zod';
import type { SecurityFinding } from './sarif-types.js';
import type { TriageVerdict } from './finding-triage.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============================================================================
// Types
// ============================================================================

export const GeneratedFixSchema = z.object({
  /** Unified diff of the proposed fix. */
  diff: z.string().max(5000),
  /** Explanation of what the fix does and why. */
  explanation: z.string().max(1000),
  /** Confidence in the fix correctness (0-1). */
  confidence: z.number().min(0).max(1),
  /** Potential issues or caveats with the fix. */
  caveats: z.array(z.string().max(200)),
  /** Whether the fix requires human review (always true). */
  requiresReview: z.literal(true),
});

export type GeneratedFix = z.infer<typeof GeneratedFixSchema>;

export interface FixGeneratorConfig {
  /** Lines of context around the finding to include (default: 10). */
  readonly contextLines: number;
  /** Max fix attempts before giving up (default: 1). */
  readonly maxAttempts: number;
}

export const DEFAULT_FIX_CONFIG: FixGeneratorConfig = {
  contextLines: 10,
  maxAttempts: 1,
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Read source context around a finding location.
 * Guards against path traversal: scanner-controlled file must resolve inside
 * the current working directory. Otherwise returns '(source unavailable)' to
 * avoid exfiltrating arbitrary files via the LLM prompt.
 */
function readSourceContext(file: string, startLine: number, contextLines: number): string {
  const root = resolve(process.cwd());
  const resolved = resolve(root, file);
  if (!resolved.startsWith(root + '/') && resolved !== root) {
    return '(source unavailable)';
  }
  try {
    const content = readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, startLine - contextLines - 1);
    const end = Math.min(lines.length, startLine + contextLines);
    return lines
      .slice(start, end)
      .map((line, i) => `${String(start + i + 1).padStart(4)} | ${line}`)
      .join('\n');
  } catch {
    return '(source unavailable)';
  }
}

/**
 * Build a fix generation prompt for the security expert.
 */
function buildFixPrompt(
  finding: SecurityFinding,
  verdict: TriageVerdict,
  sourceContext: string
): string {
  return `## Security Fix Generation

You are generating a patch to fix a confirmed security vulnerability.

### Finding
- **Rule**: ${finding.rule}
- **Severity**: ${verdict.suggestedSeverity}
- **File**: ${finding.file}:${String(finding.startLine)}
- **CWEs**: ${finding.cweIds.join(', ') || 'None'}
- **Description**: ${finding.message}
- **Triage reasoning**: ${verdict.reasoning}

### Source Code
\`\`\`
${sourceContext}
\`\`\`

### Instructions
Generate a minimal fix for this vulnerability. The fix should:
1. Address the root cause, not just suppress the finding
2. Preserve existing functionality
3. Follow the existing code style
4. Be as small as possible

Respond with a JSON object:
{
  "diff": "unified diff of the fix (use --- a/ and +++ b/ format)",
  "explanation": "what the fix does and why it addresses the vulnerability",
  "confidence": 0.0-1.0,
  "caveats": ["list of potential issues or things to verify"],
  "requiresReview": true
}

Only respond with JSON, no additional text.`;
}

/**
 * Parse a fix generation response.
 */
function parseFixResponse(response: string): GeneratedFix | null {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch === null) return null;

  try {
    const parsed: unknown = JSON.parse(jsonMatch[0]);
    return GeneratedFixSchema.parse(parsed);
  } catch {
    return null;
  }
}

/**
 * Generate a fix for a confirmed security finding.
 *
 * @param finding - The security finding to fix
 * @param verdict - Triage verdict confirming the finding
 * @param delegateFn - Function to delegate to security expert model
 * @param config - Fix generation configuration
 * @returns Generated fix or null on failure
 */
export async function generateFix(
  finding: SecurityFinding,
  verdict: TriageVerdict,
  delegateFn: (prompt: string) => Promise<string>,
  config: FixGeneratorConfig = DEFAULT_FIX_CONFIG
): Promise<GeneratedFix | null> {
  if (!verdict.confirmed) return null;

  const sourceContext = readSourceContext(finding.file, finding.startLine, config.contextLines);
  const prompt = buildFixPrompt(finding, verdict, sourceContext);

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      const response = await delegateFn(prompt);
      const fix = parseFixResponse(response);
      if (fix !== null) return fix;
    } catch {
      // Continue to next attempt
    }
  }

  return null;
}

/**
 * Generate fixes for a batch of confirmed findings.
 * Only processes confirmed findings. Returns fixes paired with finding IDs.
 */
export async function generateFixBatch(
  findings: ReadonlyArray<{ finding: SecurityFinding; verdict: TriageVerdict }>,
  delegateFn: (prompt: string) => Promise<string>,
  config: FixGeneratorConfig = DEFAULT_FIX_CONFIG
): Promise<Array<{ findingId: string; fix: GeneratedFix | null }>> {
  const confirmed = findings.filter((f) => f.verdict.confirmed);
  const results: Array<{ findingId: string; fix: GeneratedFix | null }> = [];

  for (const { finding, verdict } of confirmed) {
    const fix = await generateFix(finding, verdict, delegateFn, config);
    results.push({ findingId: finding.id, fix });
  }

  return results;
}
