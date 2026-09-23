/**
 * Ratchet for #5393 acceptance item 3: every `runAsJob` / `runJobInBackground`
 * call site classifies its runner's relationship to `cancel_job`'s signal.
 *
 * `runAsJob` derives `signalAccepted` from `run.length`, so an arity-3 runner
 * is a claim that cancellation interrupts the body, and an arity ≤2 runner is
 * a claim that it does not. Either is fine; what is not fine is a runner whose
 * arity nobody chose — "not cancellable" and "not got to yet" read the same in
 * the job record. So each site must carry a `#5393` note within the six lines
 * above its `run` property, saying `arity 3` — or `arity 4` once it also takes
 * the #6162 `progress` heartbeat — (and the closure must then actually take
 * that many parameters) or `deliberately arity-N` with the reason.
 *
 * Source-scanning by design: the classification is a comment, and nothing else
 * can see a comment.
 *
 * @module mcp/jobs/run-as-job-classification.test
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools');
const NOTE_WINDOW = 6;

interface Site {
  readonly file: string;
  readonly line: number;
  readonly runLine: string;
  readonly note: string;
}

function findSites(file: string, source: string): Site[] {
  const lines = source.split('\n');
  const sites: Site[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\brun(AsJob|JobInBackground)\b\s*[<(]/.test(lines[i] ?? '')) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
      const candidate = lines[j] ?? '';
      if (!/^\s*run\s*[:,]/.test(candidate)) continue;
      const note = lines.slice(Math.max(0, j - NOTE_WINDOW), j).join('\n');
      sites.push({ file, line: j + 1, runLine: candidate.trim(), note });
      break;
    }
  }
  return sites;
}

const ADOPTERS = [
  'consensus-vote.ts',
  'dev-pipeline-tool.ts',
  'execute-spec-tool.ts',
  'orchestrate.ts',
  'pipeline-tool.ts',
  'pr-review-tool.ts',
  'run-graph-workflow.ts',
  'run-tool.ts',
  'run-workflow.ts',
  'supply-chain-tradeoff-panel.ts',
];

describe('every runAsJob call site classifies its cancel-signal arity (#5393)', () => {
  const sites = readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .flatMap((f) => findSites(f, readFileSync(join(TOOLS_DIR, f), 'utf8')));

  it('finds the known adopters — the empty case is a broken scan, not a clean tree', () => {
    expect([...new Set(sites.map((s) => s.file))].sort()).toEqual(ADOPTERS);
  });

  it.each(sites.map((s) => [`${s.file}:${String(s.line)}`, s] as const))(
    '%s carries a #5393 note that matches its runner arity',
    (_label, site) => {
      expect(site.note, `no #5393 note above: ${site.runLine}`).toContain('#5393');
      const threaded = /arity [34]/.test(site.note);
      const deliberate = /deliberately arity-[0-2]/.test(site.note);
      expect(threaded !== deliberate, `note must say one of the two: ${site.note}`).toBe(true);
      if (threaded) {
        const declared = /arity 4/.test(site.note) ? 4 : 3;
        const params = [/\w+/, /\w+/, /\w+/, /\w+/].slice(0, declared).map((p) => p.source);
        expect(
          site.runLine,
          `an "arity ${String(declared)}" note on a runner that does not take ${String(declared)}`
        ).toMatch(new RegExp(`^run:\\s*\\(\\s*${params.join('\\s*,\\s*')}\\s*\\)`));
      } else {
        expect(site.runLine, 'a "deliberately arity" note on a 3-parameter runner').not.toMatch(
          /^run:\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+/
        );
      }
    }
  );

  it('the signal-taking set is exactly the panel, graph and pipeline tools', () => {
    const threaded = sites.filter((s) => /arity [34]/.test(s.note)).map((s) => s.file);
    expect([...new Set(threaded)].sort()).toEqual([
      'consensus-vote.ts',
      // #6305: stage-boundary gates in `runDevPipeline` / the graph executor.
      'dev-pipeline-tool.ts',
      'pipeline-tool.ts',
      'pr-review-tool.ts',
      'run-graph-workflow.ts',
      'supply-chain-tradeoff-panel.ts',
    ]);
  });
});
