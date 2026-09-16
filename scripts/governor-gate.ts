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
 * @module scripts/governor-gate
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runGovernorPathsTouched } from './governor-paths-touched.js';
import { runRequiredJobsCheck } from './check-required-jobs.js';
import { runRatificationGate } from './check-governor-ratification.js';
import { runCodeownersErrors } from './check-codeowners-errors.js';

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

/** Dispatch one measured step, preserving its exit status without reinterpretation. */
export async function runGovernorGate(argv: readonly string[]): Promise<number> {
  const [step, ...args] = argv;
  if (!['touched', 'required-jobs', 'ratification', 'codeowners-errors'].includes(step ?? '')) {
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
  const { targetDir, forwarded } = target;
  switch (step) {
    case 'touched':
      // Changed files come from the environment; the governor set is policy.
      return runGovernorPathsTouched(POLICY_DIR);
    case 'required-jobs':
      return runRequiredJobsCheck(targetDir);
    case 'ratification':
      return runRatificationGate(process.env, targetDir);
    case 'codeowners-errors':
      return runCodeownersErrors(targetDir, forwarded);
    default:
      return 2;
  }
}

if (process.argv[1]?.endsWith('governor-gate.ts') === true) {
  void runGovernorGate(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
