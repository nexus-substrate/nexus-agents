/**
 * Fixtures for `no-vacuous-verdict`, seeded from the measured census.
 *
 * The invalid cases are the real defect sites found in this tree, reduced to
 * their shape. The valid cases are real non-defect sites — the guarded, the
 * literal, the type guards, the filter predicates — because a detector that
 * only proves it stays quiet has proved nothing. Per #4581, the rule must be
 * shown to FIRE, or it is itself a check that cannot fail.
 *
 * @module eslint-rules/no-vacuous-verdict.test
 */

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import rule from './no-vacuous-verdict.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2023, sourceType: 'module' },
});

const vacuous = [{ messageId: 'vacuousVerdict' }];

ruleTester.run('no-vacuous-verdict', rule, {
  valid: [
    // Guarded: the author already reasoned about empty.
    `function f(checks: C[]) {
       if (checks.length === 0) return 'pending';
       const passed = checks.every((c) => c.ok);
       return passed;
     }`,
    `const allSuccess = results.length > 0 && results.every((r) => r.success);`,

    // Provably non-empty: a literal with a floor of one.
    `const allPassed = [a, b, c].every((p) => p.passed);`,
    `const phases = [one(), two()];
     const allPassed = phases.every((p) => p.passed);`,

    // Type predicates narrow, they do not judge.
    `function areAllStrings(outputs: unknown[]): outputs is string[] {
       return outputs.every((o) => typeof o === 'string');
     }`,
    `function isStrArr(v: unknown): v is string[] {
       return Array.isArray(v) && v.every((x) => typeof x === 'string');
     }`,

    // A predicate handed to a collection method is not a verdict.
    `const matched = store.all().filter((v) => preds.every((p) => p(v)));`,

    // Not a verdict name: incidental data, correctly left alone.
    `const depsResolved = task.dependencies.every((d) => resolved.has(d));`,
    `const stepIds = ids.every((id) => isStepCompleted(ctx, id));`,

    // Plain `.some()` on empty is `false` — the pessimistic answer, so safe.
    `const anyFailed = results.some((r) => !r.ok);`,
    `const hasCritical = findings.some((f) => f.severity === 'critical');`,

    // Already migrated to the helper.
    `const passed = allOf(checks, (c) => c.ok, false);`,
  ],

  invalid: [
    // release-announce-command.ts:376 — a release that announced nothing.
    {
      code: `const allSuccess = results.every((r) => r.success);`,
      errors: vacuous,
    },
    // voting-protocol.ts:310 — a session finalized on zero ballots.
    {
      code: `const allVoted = session.committee.every((id) => votes.has(id));`,
      errors: vacuous,
    },
    // pr-reviewer-helpers.ts:259 — zero reviews counted as unanimous approval.
    {
      code: `const allApproved = reviews.every((r) => r.approved);`,
      errors: vacuous,
    },
    // scenario-runner.ts:113 — a scenario that asserted nothing.
    {
      code: `const passed = validations.every((v) => v.passed);`,
      errors: vacuous,
    },
    // claims-verify.ts:202 — an emptied registry verifying clean, as a property.
    {
      code: `function verify() { return { results, passed: results.every((r) => r.ok) }; }`,
      errors: vacuous,
    },
    // parallel-executor.ts:370 — the verdict is the function's own return.
    {
      code: `function allSucceeded(results: StepResult[]): boolean {
               return results.every((r) => r.status === 'success');
             }`,
      errors: vacuous,
    },
    // release-announce-command.ts:478 — the verdict is an exit code.
    {
      code: `function isAllHealthy(input: I): boolean {
               return input.clis.every((c) => c.installed);
             }`,
      errors: vacuous,
    },
    // release-validate-helpers.ts:91 — negated `.some()` as a pass signal.
    {
      code: `const summary = { passed: !findings.some((f) => f.severity === 'error') };`,
      errors: vacuous,
    },
    // A verdict written to a field rather than a local.
    {
      code: `class R { run(items) { this.healthy = items.every((i) => i.up); } }`,
      errors: vacuous,
    },
    // An arrow function bound to a verdict name.
    {
      code: `const isValid = (rules) => rules.every((r) => r.satisfied);`,
      errors: vacuous,
    },
  ],
});
