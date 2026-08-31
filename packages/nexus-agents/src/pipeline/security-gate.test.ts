/**
 * Security Gate Tests (#1681, #1684)
 */

import { describe, it, expect, vi } from 'vitest';
import { checkSecurityScan } from './security-gate.js';

// Mock the security scan to avoid needing semgrep
const queryOsvBatchMock = vi.fn();
vi.mock('../security/osv-lookup.js', () => ({
  queryOsvBatch: (deps: unknown): unknown => queryOsvBatchMock(deps),
}));

vi.mock('../mcp/tools/security-scan.js', () => ({
  executeSecurityScan: vi.fn(),
}));

import { executeSecurityScan } from '../mcp/tools/security-scan.js';

const mockScan = vi.mocked(executeSecurityScan);

describe('checkSecurityScan', () => {
  it('passes when no blocking findings', async () => {
    mockScan.mockResolvedValue({
      scanner: 'semgrep',
      totalFindings: 3,
      findings: [
        {
          id: '1',
          scanner: 'semgrep',
          rule: 'r1',
          severity: 'low',
          message: 'test',
          file: 'a.ts',
          startLine: 1,
          cweIds: [],
          confidence: 0.5,
        },
        {
          id: '2',
          scanner: 'semgrep',
          rule: 'r2',
          severity: 'medium',
          message: 'test',
          file: 'b.ts',
          startLine: 2,
          cweIds: [],
          confidence: 0.5,
        },
      ],
      errors: [],
    });
    const check = checkSecurityScan('/tmp/test');
    const result = await check();
    expect(result.verdict).toBe('pass');
    expect(result.details).toContain('none blocking');
    // A clean scan says "none blocking" once. Mutation testing showed no test
    // pinned the `blocking > 0` guard, so dropping it — printing a redundant
    // "0 blocking" beside "none blocking" — went unnoticed.
    expect(result.details).not.toContain('0 blocking');
  });

  it('fails on critical findings', async () => {
    mockScan.mockResolvedValue({
      scanner: 'semgrep',
      totalFindings: 1,
      findings: [
        {
          id: '1',
          scanner: 'semgrep',
          rule: 'sql-injection',
          severity: 'critical',
          message: 'SQLi',
          file: 'db.ts',
          startLine: 42,
          cweIds: ['CWE-89'],
          confidence: 0.9,
        },
      ],
      errors: [],
    });
    const check = checkSecurityScan('/tmp/test');
    const result = await check();
    expect(result.verdict).toBe('fail');
    // Was `toContain('confirmed blocking')`, which pinned the #5119 misreport:
    // nothing confirmed anything, a fabricated default verdict did.
    expect(result.details).toContain('1 blocking');
  });

  it('skips when scanner unavailable', async () => {
    mockScan.mockResolvedValue({ error: 'semgrep not installed' });
    const check = checkSecurityScan('/tmp/test');
    const result = await check();
    expect(result.verdict).toBe('skip');
  });
});

describe('the gate makes no triage claim it cannot back (#5119 item 1)', () => {
  it('does not describe a blocking finding as "confirmed"', async () => {
    // Nothing triages. `triageFn` had zero production producers, so
    // `defaultTriageDelegate` fabricated `{confirmed: true, confidence: 0.5}`
    // for every finding and the summary reported the result as CONFIRMED
    // blocking — a verdict word backed by no verdict. A finding blocks
    // because its severity blocks; the summary must say only that.
    mockScan.mockResolvedValue({
      scanner: 'semgrep',
      totalFindings: 1,
      findings: [
        {
          id: '1',
          scanner: 'semgrep',
          rule: 'sql-injection',
          severity: 'critical',
          message: 'SQLi',
          file: 'db.ts',
          startLine: 42,
          cweIds: ['CWE-89'],
          confidence: 0.9,
        },
      ],
      errors: [],
    } as never);

    const result = await checkSecurityScan('/tmp/test', ['p/default'], { enableOsv: false })();

    expect(result.verdict).toBe('fail');
    expect(result.details).toContain('1 blocking');
    expect(result.details).not.toContain('confirmed');
  });

  it('never claims findings were filtered as false positives', async () => {
    // `falsePositiveCount` was structurally 0 on every production path, so the
    // `if (falsePositives > 0)` branch that renders this phrase could not fire.
    // A phrase that can only ever be absent is not a report; assert it is gone
    // for good rather than absent by accident.
    mockScan.mockResolvedValue({
      scanner: 'semgrep',
      totalFindings: 2,
      findings: [
        {
          id: '1',
          scanner: 'semgrep',
          rule: 'r1',
          severity: 'high',
          message: 'h',
          file: 'a.ts',
          startLine: 1,
          cweIds: [],
          confidence: 0.9,
        },
        {
          id: '2',
          scanner: 'semgrep',
          rule: 'r2',
          severity: 'low',
          message: 'l',
          file: 'b.ts',
          startLine: 2,
          cweIds: [],
          confidence: 0.4,
        },
      ],
      errors: [],
    } as never);

    const result = await checkSecurityScan('/tmp/test', ['p/default'], { enableOsv: false })();

    expect(result.details).not.toContain('false positive');
  });

  it('blocks every blocking-severity finding, with no path that drops one', async () => {
    // What the deleted seam was actually protecting, kept as the invariant it
    // reduces to: two highs in, two highs blocking. #2933 was a bug in which
    // triage dropped a high whose verdict went missing; with no triage there
    // is no filter and therefore no drop, and this pins that.
    mockScan.mockResolvedValue({
      scanner: 'semgrep',
      totalFindings: 3,
      findings: [
        {
          id: 'high_a',
          scanner: 'semgrep',
          rule: 'r1',
          severity: 'high',
          message: 'a',
          file: 'a.ts',
          startLine: 1,
          cweIds: [],
          confidence: 0.9,
        },
        {
          id: 'high_b',
          scanner: 'semgrep',
          rule: 'r2',
          severity: 'high',
          message: 'b',
          file: 'b.ts',
          startLine: 2,
          cweIds: [],
          confidence: 0.9,
        },
        {
          id: 'low_1',
          scanner: 'semgrep',
          rule: 'r3',
          severity: 'low',
          message: 'c',
          file: 'c.ts',
          startLine: 3,
          cweIds: [],
          confidence: 0.4,
        },
      ],
      errors: [],
    } as never);

    const result = await checkSecurityScan('/tmp/test', ['p/default'], { enableOsv: false })();

    expect(result.verdict).toBe('fail');
    expect(result.details).toContain('2 blocking');
  });
});

describe('OSV lookup failures are not a clean scan (#5018)', () => {
  const cleanScan = { scanner: 'semgrep', totalFindings: 0, findings: [] };

  it('says OSV was not checked when the lookups errored', async () => {
    // `queryOsv` returns `{ vulnerabilities: [], error: 'HTTP 503' }` on a
    // non-200 or a timeout. `runOsvCheck` flat-mapped only `vulnerabilities`,
    // so an unreachable OSV API was byte-identical to a clean dependency scan
    // and the summary said "none blocking".
    mockScan.mockResolvedValue(cleanScan as never);
    queryOsvBatchMock.mockResolvedValue([
      { packageName: 'left-pad', vulnerabilities: [], error: 'HTTP 503' },
    ]);

    const result = await checkSecurityScan(process.cwd(), ['p/default'], { enableOsv: true })();

    expect(result.details).toContain('OSV not checked');
    expect(result.details).not.toContain('none blocking');
  });

  it('says the OSV check did not run when the whole check throws', async () => {
    // The counterpart to the test above, and the hole it left. #5018 made a
    // PARTIAL failure visible by counting `failedLookups` — but the outer
    // `catch` around the entire check returned `OSV_EMPTY`, whose
    // `failedLookups` is 0. So a manifest read error or a throwing
    // `queryOsvBatch` reset the very counter that disclosure depends on, and
    // `buildScanSummary` fell through to "none blocking" — precisely the string
    // #5018's own comment says the counter exists to prevent.
    //
    // A boundary-validation sweep independently dropped `osv-lookup.ts` as
    // "already fixed" BECAUSE of that counter, which is how the two halves hid
    // each other.
    mockScan.mockResolvedValue(cleanScan as never);
    queryOsvBatchMock.mockRejectedValue(new Error('ENOTFOUND api.osv.dev'));

    const result = await checkSecurityScan(process.cwd(), ['p/default'], { enableOsv: true })();

    expect(result.details).toContain('OSV check did not run');
    expect(result.details).not.toContain('none blocking');
  });

  it('still says none blocking when OSV is deliberately disabled', async () => {
    // The case that must NOT be labelled a failure. `enableOsv: false` and a
    // manifest with no dependencies are honest empties; only the catch is not.
    // Collapsing all three into one "unchecked" message would make the new
    // phrase meaningless by printing it on every opted-out run.
    mockScan.mockResolvedValue(cleanScan as never);

    const result = await checkSecurityScan(process.cwd(), ['p/default'], { enableOsv: false })();

    expect(result.details).not.toContain('OSV check did not run');
    expect(result.details).toContain('none blocking');
  });

  it('still says none blocking when OSV genuinely found nothing', async () => {
    // The pair: a real clean result must not be reported as unchecked.
    mockScan.mockResolvedValue(cleanScan as never);
    queryOsvBatchMock.mockResolvedValue([
      { packageName: 'left-pad', vulnerabilities: [], error: null },
    ]);

    const result = await checkSecurityScan(process.cwd(), ['p/default'], { enableOsv: true })();

    expect(result.details).toContain('none blocking');
    expect(result.details).not.toContain('OSV not checked');
  });
});
