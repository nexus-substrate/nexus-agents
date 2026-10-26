/** Even a pre-write refusal consumes the experiment and must leave inspectable evidence. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from './script-paths.js';
import {
  launcherFailure,
  persistCanaryResult,
  readCanaryLaunchContext,
  readCanarySnapshotEvidence,
} from './native-approval-canary.js';
const roots: string[] = [];
const temporary = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'canary-receipt-'));
  roots.push(p);
  return p;
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
const report = (root: string): string =>
  join(root, '.nexus-agents/native-approval-canary/result.json');

function snapshotFixture(root: string): void {
  mkdirSync(join(root, 'governance'));
  mkdirSync(join(root, '.nexus-agents/native-approval-canary'), { recursive: true });
  writeFileSync(join(root, 'governance/native-approval-canary-source-snapshot.json'), '{}\n');
  writeFileSync(
    join(root, '.nexus-agents/native-approval-canary/source-snapshot.json'),
    JSON.stringify({
      status: 'verified',
      complete: true,
      writeAttempted: false,
      scope: 'one-shot-7629-canary-readiness-only',
      sourceFileCount: 1,
      sourceSha256: 'a'.repeat(64),
      authoredBaseTree: 'b'.repeat(40),
      manifestSha256: createHash('sha256').update('{}\n').digest('hex'),
    })
  );
}
it('binds the validated snapshot hashes into the final result artifact', () => {
  const root = temporary();
  snapshotFixture(root);
  const snapshot = readCanarySnapshotEvidence(root);
  persistCanaryResult(root, launcherFailure(new Error('dirty-checkout')), snapshot);
  const saved: unknown = JSON.parse(readFileSync(report(root), 'utf8'));
  expect(saved).toMatchObject({
    sourceSnapshot: {
      sourceSha256: 'a'.repeat(64),
      manifestSha256: createHash('sha256').update('{}\n').digest('hex'),
    },
  });
});
it('refuses a snapshot report whose manifest bytes have changed', () => {
  const root = temporary();
  snapshotFixture(root);
  writeFileSync(
    join(root, 'governance/native-approval-canary-source-snapshot.json'),
    '{"changed":true}'
  );
  expect(() => {
    readCanarySnapshotEvidence(root);
  }).toThrow('source-snapshot-evidence-mismatch');
});
it('refuses absent or unverified snapshot evidence before launch', () => {
  const root = temporary();
  snapshotFixture(root);
  writeFileSync(
    join(root, '.nexus-agents/native-approval-canary/source-snapshot.json'),
    '{"status":"refused"}'
  );
  expect(() => {
    readCanarySnapshotEvidence(root);
  }).toThrow();
});

describe('canary launcher failure evidence', () => {
  it('keeps a canonical repository root when the shared test override is set', async () => {
    vi.stubEnv('NEXUS_SCRIPT_ROOT', '/fixture/override');
    vi.resetModules();
    const paths = await import('./script-paths.js');
    expect(paths.ROOT).toBe('/fixture/override');
    expect(paths.REPOSITORY_ROOT).toBe(ROOT);
  });
  it('retains a concrete launcher refusal with private file permissions', () => {
    const root = temporary();
    persistCanaryResult(root, launcherFailure(new Error('dirty-checkout')));
    const saved: unknown = JSON.parse(readFileSync(report(root), 'utf8'));
    expect(saved).toMatchObject({
      status: 'unmeasured',
      reason: 'launcher-refused',
      writeAttempted: false,
      diagnostic: { code: 'dirty-checkout' },
    });
    if (process.platform !== 'win32') expect(statSync(report(root)).mode & 0o777).toBe(0o600);
  });
  it('does not overwrite an existing attempt record', () => {
    const root = temporary();
    const first = launcherFailure(new Error('dirty-checkout'));
    persistCanaryResult(root, first);
    const bytes = readFileSync(report(root), 'utf8');
    expect(() => {
      persistCanaryResult(root, launcherFailure(new Error('ungoverned-source')));
    }).toThrow();
    expect(readFileSync(report(root), 'utf8')).toBe(bytes);
  });
  it('persists schema refusal fields without input values or arbitrary exception messages', () => {
    const root = temporary();
    let cause: unknown;
    try {
      readCanaryLaunchContext({}, () => '', '', root);
    } catch (error) {
      cause = error;
    }
    persistCanaryResult(root, launcherFailure(cause));
    const saved: unknown = JSON.parse(readFileSync(report(root), 'utf8'));
    expect(saved).toMatchObject({
      status: 'unmeasured',
      writeAttempted: false,
      diagnostic: { code: 'invalid-evidence-shape' },
    });
    expect(
      JSON.stringify(launcherFailure(new Error('fixture-private-value-never-log')))
    ).not.toContain('fixture-private-value-never-log');
  });
});
