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

/** Steps that delegate to an action publish outputs we cannot read from YAML. */
function usesAction(jobBody: string, stepId: string): boolean {
  const idAt = jobBody.indexOf(`id: ${stepId}`);
  if (idAt === -1) return true; // unknown step — do not guess
  const rest = jobBody.slice(idAt);
  const nextStep = rest.indexOf('\n      - ');
  const stepBody = nextStep === -1 ? rest : rest.slice(0, nextStep);
  return /^\s+uses:/m.test(stepBody);
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
        for (const m of job.matchAll(/steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)/g)) {
          const [, stepId, output] = m as unknown as [string, string, string];
          if (usesAction(job, stepId)) continue;
          if (!producedOutputs(job, stepId).has(output)) {
            missing.push(`${stepId}.outputs.${output}`);
          }
        }
      }

      expect(missing).toEqual([]);
    });
  }
});
