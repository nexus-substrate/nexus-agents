/**
 * Fixtures for the governed-decision import gate (#6000 step 2).
 *
 * The block is a stock `no-restricted-imports` configuration, not a custom
 * rule, so there is no RuleTester surface for it: the fixtures run through the
 * ESLint API against the exported block alone (no type information, so the
 * test is fast) and one further case asserts the block is the SAME object
 * `eslint.config.js` ships — a block that fires here but is not wired into the
 * config would be a check that cannot fail in CI.
 *
 * Per #4581 the gate must be shown to FIRE: the invalid cases are the exact
 * bypass shape the probe exists to catch (a governed symbol reached through a
 * legacy re-export home instead of `consensus/decision/`).
 *
 * @module eslint-rules/governed-decision-imports-6000.test
 */

import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import governedDecisionImports, {
  GOVERNED_DECISION_BLOCK_NAME,
} from './governed-decision-imports-6000.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = 'packages/nexus-agents/src';

/** Lint `code` as if it lived at `relPath`, with only the governed block active. */
async function lintAt(relPath, code) {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser, ecmaVersion: 2023, sourceType: 'module' },
      },
      governedDecisionImports,
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, relPath) });
  return result.messages;
}

describe('governed-decision-imports-6000 — a governed symbol is imported only from consensus/decision', () => {
  it('names a sibling import of VOTING_THRESHOLDS from types-core (the barrel bypass)', async () => {
    const messages = await lintAt(
      `${PKG}/consensus/rogue-tally.ts`,
      "import { VOTING_THRESHOLDS } from './types-core.js';\nexport const bar = VOTING_THRESHOLDS.supermajority;\n"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe('no-restricted-imports');
    expect(messages[0].severity).toBe(2);
    expect(messages[0].line).toBe(1);
    expect(messages[0].message).toContain('consensus/decision');
  });

  it('names the same bypass reached from mcp/tools at a different relative depth', async () => {
    const messages = await lintAt(
      `${PKG}/mcp/tools/rogue-vote.ts`,
      "import { VOTING_THRESHOLDS } from '../../consensus/types-core.js';\nexport const bar = VOTING_THRESHOLDS.supermajority;\n"
    );
    expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-imports']);
  });

  it('names resolveVoteDecision imported from the consensus-vote-types re-export home', async () => {
    const messages = await lintAt(
      `${PKG}/mcp/tools/rogue-response.ts`,
      "import { resolveVoteDecision } from './consensus-vote-types.js';\nexport const f = resolveVoteDecision;\n"
    );
    expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-imports']);
  });

  it('names VOTER_ROLES imported from cli/vote-types instead of cli/voter-roles', async () => {
    const messages = await lintAt(
      `${PKG}/cli/rogue-panel.ts`,
      "import { VOTER_ROLES } from './vote-types.js';\nexport const roles = Object.keys(VOTER_ROLES);\n"
    );
    expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-imports']);
  });

  it('names the consensus barrel as a bypass too', async () => {
    const messages = await lintAt(
      `${PKG}/cli/rogue-barrel.ts`,
      "import { determineFinalStatus } from '../consensus/index.js';\nexport const f = determineFinalStatus;\n"
    );
    expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-imports']);
  });

  it('accepts the governed import from consensus/decision', async () => {
    const messages = await lintAt(
      `${PKG}/consensus/fine-tally.ts`,
      "import { VOTING_THRESHOLDS } from './decision/thresholds.js';\nexport const bar = VOTING_THRESHOLDS.supermajority;\n"
    );
    expect(messages).toEqual([]);
  });

  it('accepts an ungoverned symbol from the same legacy home', async () => {
    const messages = await lintAt(
      `${PKG}/consensus/fine-types.ts`,
      "import type { ConsensusAlgorithm } from './types-core.js';\nexport type A = ConsensusAlgorithm;\n"
    );
    expect(messages).toEqual([]);
  });

  it('exempts test files, which assert the legacy homes re-export the same binding', async () => {
    const messages = await lintAt(
      `${PKG}/consensus/identity.test.ts`,
      "import { VOTING_THRESHOLDS } from './types-core.js';\nexport const bar = VOTING_THRESHOLDS;\n"
    );
    expect(messages).toEqual([]);
  });

  it('exempts the re-export homes themselves — an export is not a use', async () => {
    const messages = await lintAt(
      `${PKG}/consensus/types.ts`,
      "export { VOTING_THRESHOLDS } from './types-core.js';\n"
    );
    expect(messages).toEqual([]);
  });

  it('is the same block object eslint.config.js ships (wiring)', async () => {
    const config = (await import('../eslint.config.js')).default;
    const shipped = config.find((entry) => entry.name === GOVERNED_DECISION_BLOCK_NAME);
    expect(shipped).toBe(governedDecisionImports);
  });
});
