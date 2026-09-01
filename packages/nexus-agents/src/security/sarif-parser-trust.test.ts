/**
 * SARIF parser trust-boundary tests (#5328).
 *
 * SARIF arrives as stdout from an external subprocess (semgrep, via
 * `runSemgrep` in `mcp/tools/security-scan.ts`), so it is untrusted input.
 * These tests pin the three ways the parser used to launder that input into a
 * typed `SecurityFinding` that the security gate then treated as a measurement.
 *
 * @module security/sarif-parser-trust.test
 */

import { describe, it, expect } from 'vitest';
import { parseSarif } from './sarif-parser.js';
import { SecurityFindingSchema } from './sarif-types.js';

/**
 * Build a SARIF log around one result, with no shape constraints on the
 * result itself — the point of these tests is to feed shapes a scanner should
 * never emit, so the helper must not sanitize them.
 */
function sarifWith(result: Record<string, unknown>): string {
  return JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'semgrep', rules: [{ id: 'r1' }] } },
        results: [result],
      },
    ],
  });
}

/** A result whose location is well-formed, so only the field under test varies. */
function resultWithLevel(level: unknown): Record<string, unknown> {
  return {
    ruleId: 'r1',
    level,
    message: { text: 'finding' },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'src/app.ts' },
          region: { startLine: 42 },
        },
      },
    ],
  };
}

describe('unrecognised SARIF level', () => {
  it('does not report an unmapped level as a measured medium severity', () => {
    const result = parseSarif(sarifWith(resultWithLevel('catastrophic')));

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding).toBeDefined();
    if (finding === undefined) return;

    // 'medium' is below BLOCKING_SEVERITIES ({critical, high}) in
    // pipeline/security-gate.ts, so defaulting an unknown level to medium
    // converts "we did not understand this severity" into "does not block the
    // ship gate" with nothing recording the conversion.
    expect(finding.severity).not.toBe('medium');
  });

  it('discloses the unmapped level in the parse errors', () => {
    const result = parseSarif(sarifWith(resultWithLevel('catastrophic')));

    expect(result.errors.join(' ')).toContain('catastrophic');
  });

  it('still maps every level the SARIF spec defines', () => {
    const mapped: Record<string, string> = {
      error: 'high',
      warning: 'medium',
      note: 'low',
      none: 'info',
    };
    for (const [level, expected] of Object.entries(mapped)) {
      const result = parseSarif(sarifWith(resultWithLevel(level)));
      const finding = result.findings[0];
      expect(finding, `level ${level} produced no finding`).toBeDefined();
      expect(finding?.severity, `level ${level}`).toBe(expected);
      expect(result.errors, `level ${level} should not be flagged`).toHaveLength(0);
    }
  });

  it('treats a non-string level as unrecognised rather than indexing with it', () => {
    const result = parseSarif(sarifWith(resultWithLevel(7)));
    const finding = result.findings[0];
    if (finding !== undefined) {
      expect(finding.severity).not.toBe('medium');
    }
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('malformed location fields', () => {
  it('does not emit a finding whose startLine is not a number', () => {
    const result = parseSarif(
      sarifWith({
        ruleId: 'r1',
        level: 'error',
        message: { text: 'finding' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'src/app.ts' },
              region: { startLine: 'not-a-line' },
            },
          },
        ],
      })
    );

    for (const finding of result.findings) {
      expect(typeof finding.startLine).toBe('number');
    }
  });

  it('does not emit a finding whose file path is not a string', () => {
    const result = parseSarif(
      sarifWith({
        ruleId: 'r1',
        level: 'error',
        message: { text: 'finding' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: { nested: 'object' } },
              region: { startLine: 42 },
            },
          },
        ],
      })
    );

    for (const finding of result.findings) {
      expect(typeof finding.file).toBe('string');
    }
  });
});

describe('every emitted finding satisfies its own schema', () => {
  const hostileResults: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    [
      'string startLine',
      {
        ruleId: 'r1',
        level: 'error',
        message: { text: 'm' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'a.ts' },
              region: { startLine: '9' },
            },
          },
        ],
      },
    ],
    [
      'zero startLine',
      {
        ruleId: 'r1',
        level: 'error',
        message: { text: 'm' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'a.ts' },
              region: { startLine: 0 },
            },
          },
        ],
      },
    ],
    [
      'object message',
      {
        ruleId: 'r1',
        level: 'error',
        message: { text: { deep: 1 } },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'a.ts' },
              region: { startLine: 1 },
            },
          },
        ],
      },
    ],
    [
      'numeric ruleId',
      {
        ruleId: 99,
        level: 'error',
        message: { text: 'm' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'a.ts' },
              region: { startLine: 1 },
            },
          },
        ],
      },
    ],
  ];

  // SecurityFindingSchema has existed in sarif-types.ts since #1682 and was
  // never applied to the parser's own output — the finding was constructed by
  // assignment and typechecked only structurally, which an `as` cast satisfies.
  it.each(hostileResults)('%s produces no schema-violating finding', (_name, result) => {
    const parsed = parseSarif(sarifWith(result));
    for (const finding of parsed.findings) {
      const check = SecurityFindingSchema.safeParse(finding);
      expect(check.success, JSON.stringify(finding)).toBe(true);
    }
  });
});

describe('malformed SARIF envelope', () => {
  it('reports a non-array runs rather than treating it as absent', () => {
    const result = parseSarif(JSON.stringify({ version: '2.1.0', runs: 'not-an-array' }));
    expect(result.findings).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports a non-array results rather than iterating it', () => {
    const result = parseSarif(
      JSON.stringify({
        version: '2.1.0',
        runs: [{ tool: { driver: { name: 'semgrep' } }, results: { not: 'an array' } }],
      })
    );
    expect(result.findings).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // A document that is not a SARIF log at all must not be reported as a SARIF
  // log that contained nothing. `[{runs: []}]` used to read `.runs` off an
  // array, get `undefined`, and report 'No runs in SARIF' — which an operator
  // reads as "the scanner ran and found nothing". The envelope check exists to
  // keep those two states distinguishable; asserting only that SOME error was
  // produced would let it be deleted without a test failing.
  it.each([
    ['top-level array', JSON.stringify([{ runs: [] }])],
    ['top-level string', JSON.stringify('semgrep failed')],
    ['top-level number', JSON.stringify(3)],
    ['top-level null', JSON.stringify(null)],
  ])('does not report %s as an empty scan', (_name, json) => {
    const result = parseSarif(json);
    expect(result.findings).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).not.toContain('No runs in SARIF');
    expect(result.errors.join(' ')).toContain('Malformed SARIF log');
  });
});

// ============================================================================
// Follow-up to #5343: the validation added there introduced fail-OPEN paths.
// An adversarial review of the merged commit reproduced each of these.
// ============================================================================

describe('a malformed cosmetic field must not delete a blocking finding', () => {
  function blockingResult(region: Record<string, unknown>): string {
    return sarifWith({
      ruleId: 'r1',
      level: 'error', // maps to 'high' — a BLOCKING severity
      message: { text: 'sql injection' },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'src/db.ts' }, region } }],
    });
  }

  it('keeps the finding when endLine is out of range', () => {
    // endLine is decorative. Discarding the whole result for it deletes a
    // finding that would have failed the ship gate — strictly worse than the
    // laundering #5343 set out to fix.
    const result = parseSarif(blockingResult({ startLine: 5, endLine: 0 }));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe('high');
    expect(result.findings[0]?.startLine).toBe(5);
    expect(result.findings[0]?.endLine).toBeUndefined();
  });

  it('keeps the finding when the snippet is the wrong type', () => {
    const result = parseSarif(
      blockingResult({ startLine: 5, snippet: { text: { nested: true } } })
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe('high');
  });

  it('keeps the finding when startLine is out of range, and says so', () => {
    const result = parseSarif(blockingResult({ startLine: 0 }));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe('high');
    // The line is unusable, so it must not be presented as measured.
    expect(result.errors.join(' ')).toMatch(/line/i);
  });
});

describe('empty strings are not valid finding fields', () => {
  it('does not emit a finding whose rule is an empty string', () => {
    const result = parseSarif(
      sarifWith({
        ruleId: '',
        level: 'error',
        message: { text: 'm' },
        locations: [
          { physicalLocation: { artifactLocation: { uri: 'a.ts' }, region: { startLine: 1 } } },
        ],
      })
    );
    for (const finding of result.findings) {
      expect(SecurityFindingSchema.safeParse(finding).success).toBe(true);
    }
  });

  it('does not emit a finding whose message is an empty string', () => {
    const result = parseSarif(
      sarifWith({
        ruleId: 'r1',
        level: 'error',
        message: { text: '' },
        locations: [
          { physicalLocation: { artifactLocation: { uri: 'a.ts' }, region: { startLine: 1 } } },
        ],
      })
    );
    for (const finding of result.findings) {
      expect(SecurityFindingSchema.safeParse(finding).success).toBe(true);
    }
  });

  it('treats an empty artifact uri as a missing location, not a dropped result', () => {
    const result = parseSarif(
      sarifWith({
        ruleId: 'r1',
        level: 'error',
        message: { text: 'm' },
        locations: [
          { physicalLocation: { artifactLocation: { uri: '' }, region: { startLine: 1 } } },
        ],
      })
    );
    expect(result.errors.join(' ')).toContain('missing location');
  });
});

describe('a rule with one bad field must not silently downgrade its findings', () => {
  it('reads a numeric security-severity rather than discarding the rule', () => {
    // `security-severity` is scanner-defined, not spec-typed, so a number is
    // plausible. Dropping the whole rule cost the finding its CWEs, its help
    // URL, and — because the score outranks `level` — its severity: a 9.8
    // became 'medium' under `level: warning`, crossing the blocking boundary
    // in the fail-OPEN direction.
    const result = parseSarif(
      JSON.stringify({
        version: '2.1.0',
        runs: [
          {
            tool: {
              driver: {
                name: 'semgrep',
                rules: [
                  {
                    id: 'r1',
                    properties: { 'security-severity': 9.8, tags: ['CWE-89'] },
                    helpUri: 'https://example.test/r1',
                  },
                ],
              },
            },
            results: [
              {
                ruleId: 'r1',
                level: 'warning',
                message: { text: 'm' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'a.ts' },
                      region: { startLine: 1 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe('critical');
    expect(result.findings[0]?.cweIds).toContain('CWE-89');
    expect(result.findings[0]?.helpUrl).toBe('https://example.test/r1');
  });
});
