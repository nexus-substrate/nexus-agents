/**
 * Target-project threading for the voter system prompts (#6110).
 *
 * The seven default prompts (project = 'nexus-agents') are pinned BYTE-FOR-BYTE
 * to `__fixtures__/voter-prompts.default.json`, captured from the tree before
 * #6110 touched `voter-prompts.ts`. A wording change that alters this repo's own
 * panel fails here; a consuming repository that names its project must get
 * prompts that never mention nexus-agents.
 *
 * @module cli/voter-prompts-project.test
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getVoterPrompts, VOTER_SYSTEM_PROMPTS } from './voter-prompts.js';
import type { VoterRole } from './vote-types.js';

const ALL_ROLES: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
];

const FIXTURE_PATH = join(import.meta.dirname, '__fixtures__/voter-prompts.default.json');

function loadDefaultSnapshot(): Record<VoterRole, string> {
  const parsed: unknown = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`fixture is not an object: ${FIXTURE_PATH}`);
  }
  const record = parsed as Record<string, unknown>;
  const out: Partial<Record<VoterRole, string>> = {};
  for (const role of ALL_ROLES) {
    const value = record[role];
    if (typeof value !== 'string') throw new Error(`fixture missing prompt for role ${role}`);
    out[role] = value;
  }
  return out as Record<VoterRole, string>;
}

describe('voter prompts — target project (#6110)', () => {
  describe('default project snapshot', () => {
    const snapshot = loadDefaultSnapshot();

    it('the fixture holds exactly the seven roles', () => {
      expect(Object.keys(snapshot).sort()).toEqual([...ALL_ROLES].sort());
    });

    it.each(ALL_ROLES)('getVoterPrompts() renders the %s prompt byte-identical', (role) => {
      // `toBe` on strings is byte identity — a single changed character fails.
      expect(getVoterPrompts()[role]).toBe(snapshot[role]);
    });

    it.each(ALL_ROLES)(
      "getVoterPrompts('nexus-agents') renders the %s prompt byte-identical",
      (role) => {
        expect(getVoterPrompts('nexus-agents')[role]).toBe(snapshot[role]);
      }
    );

    it('VOTER_SYSTEM_PROMPTS (the module-level default) equals the snapshot', () => {
      expect(VOTER_SYSTEM_PROMPTS).toEqual(snapshot);
    });
  });

  describe('a foreign target project', () => {
    const prompts = getVoterPrompts('acme/widgets');

    it.each(ALL_ROLES)('the %s prompt never mentions nexus-agents', (role) => {
      expect(prompts[role]).not.toContain('nexus-agents');
    });

    it.each(ALL_ROLES)('the %s prompt names the target project', (role) => {
      expect(prompts[role]).toContain('acme/widgets');
    });

    it('the scope_steward and pm prompts do not point at this repo’s CLAUDE.md', () => {
      // The governance file is a property of the target project, not of
      // nexus-agents; a foreign panel judging against "CLAUDE.md" is judging
      // against a file that may not exist in the repository under review.
      expect(prompts.scope_steward).not.toContain('CLAUDE.md');
      expect(prompts.pm).not.toContain('CLAUDE.md');
    });
  });
});
