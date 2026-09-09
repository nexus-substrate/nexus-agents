/**
 * Every `steps.<id>.outputs.<name>` a job consumes must have a producer in the
 * same job (#4698 follow-up).
 *
 * The ratification backstop consumed `steps.evidence.outputs.label_actor` while
 * its own `evidence` step never wrote it. The reference resolved to an empty
 * string, the gate read that as "applier unknown", and every label-ratified
 * governor PR reddened `main` after merge. Nothing failed at author time: YAML
 * is happy, and an unset output is empty rather than an error.
 *
 * That is the NO-PRODUCER shape, and it is mechanically detectable, so it
 * should not need a human to notice it twice.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_DIR = join(process.cwd(), '.github', 'workflows');

/** A `run:` step can only publish an output by writing `name=` to $GITHUB_OUTPUT. */
function producedOutputs(jobBody: string, stepId: string): Set<string> {
  const produced = new Set<string>();
  // Find the step with this id, then read to the start of the next step.
  const idAt = jobBody.indexOf(`id: ${stepId}`);
  if (idAt === -1) return produced;
  const rest = jobBody.slice(idAt);
  const nextStep = rest.indexOf('\n      - ');
  const stepBody = nextStep === -1 ? rest : rest.slice(0, nextStep);
  // `name=` after a quote, backtick or space. Deliberately loose: outputs are
  // written by `echo "name=..."`, by heredocs, and by `appendFileSync` with a
  // template literal (registry-refresh.yml does the last). Matching only `echo`
  // reported that file as broken when it is fine.
  for (const m of stepBody.matchAll(/[\s"'`]([A-Za-z_][A-Za-z0-9_-]*)=/g)) {
    produced.add(m[1] as string);
  }
  // Heredoc form: `echo 'name<<EOF'`
  for (const m of stepBody.matchAll(/["']([A-Za-z_][A-Za-z0-9_-]*)<</g)) {
    produced.add(m[1] as string);
  }
  return produced;
}

/** Whether the job declares a step with this id at all. */
function declaresStep(jobBody: string, stepId: string): boolean {
  return jobBody.includes(`id: ${stepId}`);
}

/**
 * Steps that delegate to an action publish outputs we cannot read from YAML.
 *
 * #6029: this used to return TRUE for a step the job does not declare, with the
 * comment "unknown step — do not guess". But the caller reads a true here as
 * `continue`, so "do not guess" became "do not check" — and a reference to a
 * step that DOES NOT EXIST in the job is the strongest possible form of the
 * no-producer defect, not the weakest. It was the one case this test skipped.
 *
 * That is exactly how `governor-ratification` read `steps.changed.outputs.base`
 * from the sibling `governor-review` job for its whole life while this test
 * reported the file clean. Absence is now the caller's business; this function
 * answers only its own question, and its contract requires a declared step.
 */
function usesAction(jobBody: string, stepId: string): boolean {
  const idAt = jobBody.indexOf(`id: ${stepId}`);
  if (idAt === -1) return false;
  const rest = jobBody.slice(idAt);
  const nextStep = rest.indexOf('\n      - ');
  const stepBody = nextStep === -1 ? rest : rest.slice(0, nextStep);
  return /^\s+uses:/m.test(stepBody);
}

/**
 * Drop `#` comment lines before scanning for references (#6029).
 *
 * A comment that NAMES a step reference is a mention, not a reference. Without
 * this the test flags prose — which it did, on the very comment explaining this
 * defect. Same ordering lesson as #6030 and #6026: decide what counts as a real
 * occurrence BEFORE counting.
 */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

describe('workflow step-output wiring (#4698)', () => {
  const files = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  it('finds workflows to check', () => {
    // Guard the guard: an empty directory would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file}: every consumed step output has a producer in the same job`, () => {
      const text = readFileSync(join(WORKFLOW_DIR, file), 'utf8');
      // Split on job keys (two-space indent under `jobs:`) so producer lookup
      // stays within the job that consumes the value.
      const jobs = text.split(/\n {2}(?=[A-Za-z0-9_-]+:\n)/);
      const missing: string[] = [];

      for (const job of jobs) {
        const scannable = withoutComments(job);
        for (const m of scannable.matchAll(/steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)/g)) {
          const [, stepId, output] = m as unknown as [string, string, string];
          // An ABSENT step is reported, not skipped (#6029). Step outputs are
          // job-scoped, so this is a cross-job reference that silently resolves
          // to the empty string.
          if (!declaresStep(job, stepId)) {
            missing.push(`${stepId}.outputs.${output} (no such step in this job)`);
            continue;
          }
          if (usesAction(job, stepId)) continue;
          if (!producedOutputs(job, stepId).has(output)) {
            missing.push(`${stepId}.outputs.${output}`);
          }
        }
      }

      expect(missing).toEqual([]);
    });
  }

  it('reports a reference to a step this job does not declare (#6029)', () => {
    // The case the original skipped. `usesAction` returned true for an unknown
    // id and the caller read that as `continue`, so a cross-job reference --
    // which resolves to the empty string at runtime -- was never checked.
    const job = [
      '  consumer:',
      '    steps:',
      '      - name: use it',
      '        env:',
      '          VALUE: ${{ steps.elsewhere.outputs.thing }}',
      '        run: echo "${VALUE}"',
    ].join('\n');
    expect(declaresStep(job, 'elsewhere')).toBe(false);
  });

  it('a step that IS declared and writes the output is not reported', () => {
    const job = [
      '  producer:',
      '    steps:',
      '      - id: mine',
      '        run: echo "thing=1" >> "${GITHUB_OUTPUT}"',
      '      - name: use it',
      '        run: echo ${{ steps.mine.outputs.thing }}',
    ].join('\n');
    expect(declaresStep(job, 'mine')).toBe(true);
    expect(producedOutputs(job, 'mine').has('thing')).toBe(true);
  });

  it('a COMMENT naming a reference is a mention, not a reference (#6029)', () => {
    const withComment = [
      '  job:',
      '    steps:',
      '      # historical: this used to read steps.gone.outputs.value',
      '      - id: here',
      '        run: echo "value=1" >> "${GITHUB_OUTPUT}"',
    ].join('\n');
    const scanned = withoutComments(withComment);
    expect(scanned).not.toContain('steps.gone.outputs.value');
    expect(scanned).toContain('id: here');
  });
});
