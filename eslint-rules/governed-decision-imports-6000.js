/**
 * Governed-decision import gate (#6000 step 2).
 *
 * Step 1 (#6160) moved the pure verdict computation — the threshold bars,
 * strategy resolution, and the tally→approved/rejected/no_quorum function —
 * into `consensus/decision/` (plus the voter panel into `cli/voter-roles.ts`),
 * and left every previous home re-exporting the same binding so the public
 * surface stayed byte-identical. Step 3 makes `consensus/decision/` a governor
 * path. This block is what makes step 3 mean something: a verdict site under
 * `src/consensus`, `src/cli` or `src/mcp/tools` reaches the governed symbols
 * ONLY through the governed modules, so a change to how a verdict is computed
 * can only land in a file the governor owns.
 *
 * Stock `no-restricted-imports`, shaped exactly like the #5191 and #5142
 * blocks in eslint.config.js (buy the detection, build only the wrapper —
 * epic #5121 constraint 1). `eslint-plugin-import` is not installed, and the
 * stock rule already expresses this: `patterns.group` names the legacy homes,
 * `importNames` keeps the ban to the governed symbols, so every other export
 * of those modules is untouched.
 *
 * WHAT IT CATCHES: `import { VOTING_THRESHOLDS } from './types-core.js'` (or
 * `../consensus/types.js`, `../consensus/index.js`, `./result-builder.js`,
 * `./consensus-vote-types.js`, `./vote-types.js`) for any governed symbol.
 *
 * WHAT IT CANNOT CATCH, stated rather than papered over:
 *  - an inline re-implementation that imports nothing (`if (ratio >= 0.667)`)
 *    — `scripts/arch-lint-inline-verdict.ts` ratchets the literal form;
 *  - control flow that short-circuits the imported verdict (`decision || true`)
 *    — no static probe sees that; it is a review concern (#6000 contrarian);
 *  - a dynamic `await import('./types-core.js')` — same gap as #5191 before
 *    #5313; none exists for these homes today.
 *
 * Exported as its own module so the fixtures in the sibling test can run it
 * without type information, and so the wiring test can assert eslint.config.js
 * ships THIS object.
 *
 * @module eslint-rules/governed-decision-imports-6000
 */

export const GOVERNED_DECISION_BLOCK_NAME = 'nexus-agents/governed-decision-imports-6000';

/**
 * The symbols step 1 moved. Listed by name, not by home: `resolveStrategy`,
 * `strategyToAlgorithm` and `evaluateThreshold` were private before step 1 and
 * no legacy home re-exports them today, but a future re-export through one
 * would be exactly the bypass this block exists to refuse.
 */
export const GOVERNED_DECISION_SYMBOLS = Object.freeze([
  // decision/thresholds.ts
  'VOTING_THRESHOLDS',
  'SUPERMAJORITY_THRESHOLD',
  'ERROR_FLOOR_FRACTION',
  // decision/strategy.ts
  'resolveStrategy',
  'strategyToAlgorithm',
  'getDefaultErrorPolicy',
  // decision/verdict.ts
  'evaluateThreshold',
  'determineFinalStatus',
  'mapOutcomeToDecision',
  'resolveVoteDecision',
  // cli/voter-roles.ts
  'VOTER_ROLES',
]);

/**
 * The legacy homes and the barrels that re-export them. Both the
 * directory-qualified form (`../consensus/types-core.js`, any depth) and the
 * sibling form (`./types-core.js`) are listed: `**` does not match a
 * specifier with no directory segment, and the sibling form is how every
 * in-tree importer inside `consensus/` reaches these modules.
 */
const LEGACY_HOMES = [
  '**/consensus/types-core.js',
  './types-core.js',
  '**/consensus/types.js',
  './types.js',
  '**/consensus/index.js',
  './index.js',
  '**/consensus/result-builder.js',
  './result-builder.js',
  '**/mcp/tools/consensus-vote-types.js',
  './consensus-vote-types.js',
  '**/cli/vote-types.js',
  './vote-types.js',
];

/** @type {import('eslint').Linter.Config} */
const governedDecisionImports = {
  name: GOVERNED_DECISION_BLOCK_NAME,
  files: [
    'packages/nexus-agents/src/consensus/**/*.ts',
    'packages/nexus-agents/src/cli/**/*.ts',
    'packages/nexus-agents/src/mcp/tools/**/*.ts',
  ],
  ignores: [
    // The re-export homes and barrels: an `export { X } from` is a re-export,
    // not a use, and the rule reports those too. Same reasoning as the
    // `exports/cli-adapters.ts` exemption in the #5191 block.
    'packages/nexus-agents/src/consensus/types-core.ts',
    'packages/nexus-agents/src/consensus/types.ts',
    'packages/nexus-agents/src/consensus/index.ts',
    'packages/nexus-agents/src/consensus/result-builder.ts',
    'packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts',
    'packages/nexus-agents/src/cli/vote-types.ts',
    // Step 1's tests assert each legacy home re-exports the SAME binding
    // (`toBe`), which requires importing it from the legacy home.
    '**/*.test.ts',
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: LEGACY_HOMES,
            importNames: [...GOVERNED_DECISION_SYMBOLS],
            message:
              'Verdict computation is governed (#6000): import this from consensus/decision/{thresholds,strategy,verdict}.js or cli/voter-roles.js, not from a legacy re-export home. A verdict site outside those modules is a bypass of the governor path.',
          },
        ],
      },
    ],
  },
};

export default governedDecisionImports;
