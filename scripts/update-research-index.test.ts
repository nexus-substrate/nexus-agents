/**
 * Tests for the research index generator (#6002).
 *
 * The generator's `--check` used to compare only the sha256 checksums of the
 * source registries recorded in the provenance comment — never the body it
 * emits. A hand-edit to the generated body survived CI as long as the
 * registries were unchanged, and `generate` produced a ~180-line column-padding
 * diff that prettier (via lint-staged) then reverted. These tests pin both
 * halves of the fix: the output is prettier-formatted before it is written, and
 * `--check` regenerates into memory and compares against the committed body.
 *
 * Same isolation pattern as `inject-governance.test.ts` (#3954): a temp sandbox
 * seeded with small registries, `NEXUS_SCRIPT_ROOT` redirecting the script's
 * path graph at it, and the exported functions run in-process with console
 * output captured.
 *
 * @module scripts/update-research-index.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as prettier from 'prettier';

const REAL_ROOT = join(import.meta.dirname, '..');

const PAPERS_YAML = `schema_version: '1.0'
papers:
  arxiv-0001.00001:
    title: 'A Paper About Consensus'
    url: https://arxiv.org/abs/0001.00001
    topics:
      - consensus
    reviewed_date: 2026-01-06
    summary: |
      One-line summary of the consensus paper.
  arxiv-0002.00002:
    title: 'A Paper About Routing'
    url: https://arxiv.org/abs/0002.00002
    topics:
      - routing
    reviewed_date: 2026-02-01
    summary: |
      One-line summary of the routing paper.
`;

const TECHNIQUES_YAML = `schema_version: '1.0'
techniques:
  quorum-detection:
    name: Quorum Detection
    source_papers:
      - arxiv-0001.00001
    topic: consensus
    tags:
      - quorum
    metrics:
      latency_reduction: 2x
    status: implemented
    priority: P1
    implementation_issue: 119
  bandit-routing:
    name: Bandit Routing
    source_papers:
      - arxiv-0002.00002
    topic: routing
    tags:
      - bandit
    status: planned
    priority: P2
`;

let SANDBOX = '';
let core: {
  runGenerate: () => Promise<boolean>;
  checkIndex: () => Promise<boolean>;
  renderIndex: (dateStr: string) => Promise<string>;
};

function box(rel: string): string {
  return join(SANDBOX, rel);
}

const INDEX = 'docs/research/RESEARCH_INDEX.md';
const PAPERS = 'docs/research/registry/papers.yaml';
const TECHNIQUES = 'docs/research/registry/techniques.yaml';

function seedRegistries(): void {
  mkdirSync(box('docs/research/registry'), { recursive: true });
  writeFileSync(box(PAPERS), PAPERS_YAML);
  writeFileSync(box(TECHNIQUES), TECHNIQUES_YAML);
}

beforeAll(async () => {
  SANDBOX = mkdtempSync(join(tmpdir(), 'update-research-index-'));
  cpSync(join(REAL_ROOT, '.prettierrc'), box('.prettierrc'));
  seedRegistries();
  process.env['NEXUS_SCRIPT_ROOT'] = SANDBOX;
  core = await import('./update-research-index.js');
});

afterAll(() => {
  delete process.env['NEXUS_SCRIPT_ROOT'];
  if (SANDBOX !== '') rmSync(SANDBOX, { recursive: true, force: true });
});

/** Run one exported entry point in-process, capturing console output. */
async function run(fn: () => Promise<boolean>): Promise<{ ok: boolean; output: string }> {
  const lines: string[] = [];
  const push = (...a: unknown[]): void => void lines.push(a.map(String).join(' '));
  const log = vi.spyOn(console, 'log').mockImplementation(push);
  const err = vi.spyOn(console, 'error').mockImplementation(push);
  try {
    const ok = await fn();
    return { ok, output: lines.join('\n') };
  } finally {
    log.mockRestore();
    err.mockRestore();
  }
}

const CHECKSUM_STALE = 'techniques.yaml has changed';
const BODY_DIFFERS = 'body differs from its regeneration';

beforeEach(async () => {
  seedRegistries();
  rmSync(box(INDEX), { force: true });
  const gen = await run(core.runGenerate);
  expect(gen.ok).toBe(true);
});

describe('generate', () => {
  it('is byte-identical across two runs and prettier-clean', async () => {
    const first = readFileSync(box(INDEX), 'utf-8');
    const second = await run(core.runGenerate);
    expect(second.ok).toBe(true);
    expect(readFileSync(box(INDEX), 'utf-8')).toBe(first);
    expect(await prettier.check(first, { filepath: box(INDEX) })).toBe(true);
  });

  it('emits the frontmatter first and the provenance checksums', () => {
    const content = readFileSync(box(INDEX), 'utf-8');
    expect(content.startsWith('---\ntitle: Research Index\n')).toBe(true);
    expect(content).toMatch(/papers: sha256:[a-f0-9]{16}/);
    expect(content).toMatch(/techniques: sha256:[a-f0-9]{16}/);
    expect(content).toContain('**Total Papers:** 2 | **Techniques:** 2');
  });

  it('keeps the on-disk date stamp when the body is otherwise unchanged', async () => {
    const stamped = readFileSync(box(INDEX), 'utf-8').replaceAll(
      /\d{4}-\d{2}-\d{2} \(ET\)/g,
      '2000-01-01 (ET)'
    );
    writeFileSync(box(INDEX), stamped);
    const again = await run(core.runGenerate);
    expect(again.ok).toBe(true);
    expect(again.output).toContain('unchanged');
    expect(readFileSync(box(INDEX), 'utf-8')).toBe(stamped);
  });
});

describe('--check', () => {
  it('passes on a freshly generated index', async () => {
    const res = await run(core.checkIndex);
    expect(res.ok).toBe(true);
    expect(res.output).toContain('Research index is up to date.');
  });

  it('fails on a hand-edit to the generated body with registries unchanged, naming the line', async () => {
    const content = readFileSync(box(INDEX), 'utf-8');
    const lines = content.split('\n');
    const at = lines.findIndex((l) => l.startsWith('| [Quorum Detection]'));
    expect(at).toBeGreaterThan(0);
    lines[at] = lines[at]!.replace('| consensus ', '| hand-edited ');
    writeFileSync(box(INDEX), lines.join('\n'));

    const res = await run(core.checkIndex);
    expect(res.ok).toBe(false);
    expect(res.output).toContain(BODY_DIFFERS);
    expect(res.output).toContain(`RESEARCH_INDEX.md:${String(at + 1)}`);
    expect(res.output).toContain(`expected: ${content.split('\n')[at]!}`);
    expect(res.output).toContain(`on disk:  ${lines[at]}`);
    expect(res.output).not.toContain(CHECKSUM_STALE);
    expect(res.output).not.toContain('Research index is up to date.');
  });

  it('still reports a stale registry checksum', async () => {
    writeFileSync(box(TECHNIQUES), `${TECHNIQUES_YAML}    complexity: low\n`);
    const res = await run(core.checkIndex);
    expect(res.ok).toBe(false);
    expect(res.output).toContain(CHECKSUM_STALE);
  });

  it('reports BOTH causes when the checksum is stale and the body is hand-edited', async () => {
    const content = readFileSync(box(INDEX), 'utf-8');
    writeFileSync(box(INDEX), content.replace('| consensus ', '| hand-edited '));
    writeFileSync(box(TECHNIQUES), `${TECHNIQUES_YAML}    complexity: low\n`);
    const res = await run(core.checkIndex);
    expect(res.ok).toBe(false);
    expect(res.output).toContain(CHECKSUM_STALE);
    expect(res.output).toContain(BODY_DIFFERS);
  });

  it('ignores the generation date: an index regenerated on another day is not drift', async () => {
    const content = readFileSync(box(INDEX), 'utf-8');
    writeFileSync(box(INDEX), content.replaceAll(/\d{4}-\d{2}-\d{2} \(ET\)/g, '2000-01-01 (ET)'));
    const res = await run(core.checkIndex);
    expect(res.ok).toBe(true);
  });

  it('renderIndex is what --check compares against: same date, same bytes', async () => {
    const content = readFileSync(box(INDEX), 'utf-8');
    const date = /\*\*Generated:\*\* (\d{4}-\d{2}-\d{2})/.exec(content)?.[1];
    expect(date).toBeDefined();
    expect(await core.renderIndex(date!)).toBe(content);
  });
});
