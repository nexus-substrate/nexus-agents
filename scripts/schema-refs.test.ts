/**
 * Every relative `$schema` reference resolves to a file that exists (#4612).
 *
 * A `$schema` pointing at a missing file is not inert: an editor resolves it
 * to nothing and silently offers no validation, which looks exactly like
 * "validated and fine". The author of a manifest entry gets no completion, no
 * type checking, and no warning that they got neither.
 *
 * When this test was written, **three** relative references existed and
 * **none** of them resolved — every manifest under `docs/ops/` declared a
 * schema that had never been committed. The lines were removed rather than
 * backfilled: each manifest already has an enforcing script that is the
 * authoritative validator, and a JSON Schema drifting from that script would
 * be worse than no schema.
 *
 * This test is what makes writing one later safe: add the schema file and the
 * `$schema` line together, and the reference stays honest.
 *
 * @module scripts/schema-refs.test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, globSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

interface SchemaRef {
  readonly file: string;
  readonly ref: string;
  readonly resolved: string;
}

function jsonFiles(): string[] {
  return globSync('**/*.json', {
    cwd: process.cwd(),
    exclude: (p: string) =>
      p.includes('node_modules') ||
      p.includes('.git/') ||
      p.includes('worktrees') ||
      p.includes('/dist/') ||
      p.startsWith('coverage/'),
  });
}

/** File count the guard actually scanned — a broken glob makes it vacuous. */
function relativeSchemaRefsScanCount(): number {
  return jsonFiles().length;
}

function relativeSchemaRefs(): SchemaRef[] {
  const files = jsonFiles();
  const refs: SchemaRef[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(process.cwd(), file), 'utf8'));
    } catch {
      continue; // Malformed JSON is another test's problem.
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const ref = (parsed as Record<string, unknown>)['$schema'];
    // A URL reference is resolved by the editor over the network, not from
    // the tree, so it is out of scope here.
    if (typeof ref !== 'string' || ref.startsWith('http')) continue;
    refs.push({ file, ref, resolved: normalize(join(dirname(file), ref)) });
  }
  return refs;
}

describe('relative $schema references (#4612)', () => {
  it('resolve to a file that exists', () => {
    const dangling = relativeSchemaRefs().filter(
      (r) => !existsSync(join(process.cwd(), r.resolved))
    );

    expect(
      dangling.map((r) => `${r.file} -> ${r.ref}`),
      'These declare a schema that is not in the repo. An editor resolves it to nothing and offers no validation, which is indistinguishable from validating cleanly. Add the schema file, or drop the $schema line.'
    ).toEqual([]);
  });

  it('scans a non-trivial number of JSON files', () => {
    // Guard the guard: a broken glob would make the assertion above vacuous,
    // and an empty scan passes it perfectly.
    const scanned = relativeSchemaRefsScanCount();

    expect(scanned).toBeGreaterThan(20);
  });
});
