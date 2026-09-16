/**
 * Stable base-ref entrypoint for governor-review.yml (#6369).
 * The base checkout supplies code, dependencies AND POLICY — the CODEOWNERS
 * governor section, governance/required-jobs.json, governance/allowed_signers,
 * the genesis allowlist; --target supplies head DATA — the changed files, the
 * ledger, workflows, package.json, git history. A PR may change what is
 * checked, never what checks it or the rules it is checked against.
 * Add checks behind this interface. Ledger formats ship reader-first on main.
 *
 * Usage: governor-gate.ts <step> --target <dir> [--ref <sha>]
 * Steps: touched | required-jobs | ratification | codeowners-errors | pr-review-audit
 * @module scripts/governor-gate
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runGovernorPathsTouched } from './governor-paths-touched.js';
import { runRequiredJobsCheck } from './check-required-jobs.js';
import { runRatificationGate } from './check-governor-ratification.js';
import { runCodeownersErrors } from './check-codeowners-errors.js';
import { runGovernorReviewGate } from './check-governor-review.js';

/** The gate checkout — this script's own repository root — where policy is read from. */
const POLICY_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** Missing or empty target is a usage error, never an implicit cwd selection. */
function readTarget(
  args: readonly string[]
): { targetDir: string; forwarded: string[] } | undefined {
  const targetAt = args.indexOf('--target');
  const targetDir = targetAt < 0 ? undefined : args[targetAt + 1];
  if (targetDir === undefined || targetDir === '' || targetDir.startsWith('--')) return undefined;
  return {
    targetDir,
    forwarded: args.filter((_, index) => index !== targetAt && index !== targetAt + 1),
  };
}

/** The steps the workflow may name, each bound to its runner. Adding a check = adding a row here, on main. */
const STEPS: Readonly<
  Record<string, (targetDir: string, forwarded: readonly string[]) => number | Promise<number>>
> = {
  // Changed files come from the environment; the governor set is policy.
  touched: () => runGovernorPathsTouched(POLICY_DIR),
  'required-jobs': (targetDir) => runRequiredJobsCheck(targetDir),
  ratification: (targetDir) => runRatificationGate(process.env, targetDir),
  'codeowners-errors': (targetDir, forwarded) => runCodeownersErrors(targetDir, forwarded),
  // #6377: the pr_review audit gate — ledger and git diff from the target,
  // CODEOWNERS and the genesis allowlist from this checkout.
  'pr-review-audit': (targetDir, forwarded) => runGovernorReviewGate(forwarded, { targetDir }),
};

/** Dispatch one measured step, preserving its exit status without reinterpretation. */
export async function runGovernorGate(argv: readonly string[]): Promise<number> {
  const [step, ...args] = argv;
  // Own keys only: a step named like an Object prototype member is unknown, not a runner.
  const runner = step !== undefined && Object.hasOwn(STEPS, step) ? STEPS[step] : undefined;
  if (runner === undefined) {
    console.error(
      `[governor-gate] unknown step: ${step === undefined || step === '' ? '(empty)' : step}`
    );
    return 2;
  }
  const target = readTarget(args);
  if (target === undefined) {
    console.error('[governor-gate] --target <dir> is required; no checkout was selected.');
    return 2;
  }
  return runner(target.targetDir, target.forwarded);
}

if (process.argv[1]?.endsWith('governor-gate.ts') === true) {
  void runGovernorGate(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
