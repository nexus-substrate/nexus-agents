/**
 * env-schema - Unit Tests (Issue #1016)
 *
 * Tests for centralized NEXUS_* environment variable validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateNexusEnv, getKnownNexusVarNames } from './env-schema.js';
import { readFileSync } from 'node:fs';

import { VOTER_ROLES } from '../cli/vote-types.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, from `<root>/packages/nexus-agents/src/config/`. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('env-schema', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('validateNexusEnv', () => {
    it('returns no warnings for valid env vars', () => {
      vi.stubEnv('NEXUS_V2_MODE', 'full');
      vi.stubEnv('NEXUS_LOG_LEVEL', 'debug');
      vi.stubEnv('NEXUS_TIMEOUT_CLI', '30000');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('recognizes the autonomous-remediation + policy + overlay vars (#3713)', () => {
      vi.stubEnv('NEXUS_AUTO_REMEDIATE', 'audit');
      vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'warn');
      vi.stubEnv('NEXUS_MODELS_OVERLAY_PATH', '/tmp/overlay.yaml');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('recognizes NEXUS_CONTEXT_RANKED (#3236)', () => {
      vi.stubEnv('NEXUS_CONTEXT_RANKED', '1');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('rejects an invalid NEXUS_CONTEXT_RANKED value (#3236)', () => {
      vi.stubEnv('NEXUS_CONTEXT_RANKED', 'yes');
      const result = validateNexusEnv();
      expect(result.invalidVars.map((v) => v.name)).toContain('NEXUS_CONTEXT_RANKED');
    });

    it('recognizes NEXUS_REPO_MAP (#4254)', () => {
      vi.stubEnv('NEXUS_REPO_MAP', '1');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('rejects an invalid NEXUS_REPO_MAP value (#4254)', () => {
      vi.stubEnv('NEXUS_REPO_MAP', 'on');
      const result = validateNexusEnv();
      expect(result.invalidVars.map((v) => v.name)).toContain('NEXUS_REPO_MAP');
    });

    it('recognizes NEXUS_ALLOW_SIMULATE (#4170)', () => {
      vi.stubEnv('NEXUS_ALLOW_SIMULATE', '1');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('flags the never-wired timeout vars removed in #4180 as unknown', () => {
      vi.stubEnv('NEXUS_TEST_TIMEOUT_MS', '60000');
      const result = validateNexusEnv();
      expect(result.unknownVars.map((u) => u.name)).toContain('NEXUS_TEST_TIMEOUT_MS');
    });

    it('rejects an invalid NEXUS_ALLOW_SIMULATE value (#4170)', () => {
      vi.stubEnv('NEXUS_ALLOW_SIMULATE', 'yes');
      const result = validateNexusEnv();
      expect(result.invalidVars.map((v) => v.name)).toContain('NEXUS_ALLOW_SIMULATE');
    });

    it('recognizes NEXUS_META_SHADOW_TRAIN (#3593)', () => {
      vi.stubEnv('NEXUS_META_SHADOW_TRAIN', '1');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('rejects an invalid NEXUS_META_SHADOW_TRAIN value (#3593)', () => {
      vi.stubEnv('NEXUS_META_SHADOW_TRAIN', 'on');
      const result = validateNexusEnv();
      expect(result.invalidVars.map((v) => v.name)).toContain('NEXUS_META_SHADOW_TRAIN');
    });

    it('recognizes NEXUS_ROUTE_MODEL_SELECTION and NEXUS_ROUTE_MODEL_SHADOW (#4197)', () => {
      vi.stubEnv('NEXUS_ROUTE_MODEL_SELECTION', 'true');
      vi.stubEnv('NEXUS_ROUTE_MODEL_SHADOW', '1');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('rejects invalid NEXUS_ROUTE_MODEL_SELECTION / NEXUS_ROUTE_MODEL_SHADOW values (#4197)', () => {
      vi.stubEnv('NEXUS_ROUTE_MODEL_SELECTION', '1');
      vi.stubEnv('NEXUS_ROUTE_MODEL_SHADOW', 'true');
      const result = validateNexusEnv();
      expect(result.invalidVars.map((v) => v.name).sort()).toEqual([
        'NEXUS_ROUTE_MODEL_SELECTION',
        'NEXUS_ROUTE_MODEL_SHADOW',
      ]);
    });

    it('rejects invalid NEXUS_AUTO_REMEDIATE / NEXUS_POLICY_GATE_MODE values (#3713)', () => {
      vi.stubEnv('NEXUS_AUTO_REMEDIATE', 'bogus');
      vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'nope');
      const result = validateNexusEnv();
      expect(result.invalidVars.map((v) => v.name).sort()).toEqual([
        'NEXUS_AUTO_REMEDIATE',
        'NEXUS_POLICY_GATE_MODE',
      ]);
    });

    it('returns no warnings when no NEXUS_* vars are set', () => {
      // Clear all NEXUS_* vars via stubEnv
      for (const key of Object.keys(process.env)) {
        if (key.startsWith('NEXUS_')) {
          vi.stubEnv(key, undefined);
        }
      }
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('detects unknown var with typo suggestion', () => {
      vi.stubEnv('NEXUS_PERIST_LEARNING', 'true');
      const result = validateNexusEnv();
      expect(result.unknownVars.length).toBeGreaterThanOrEqual(1);
      const typo = result.unknownVars.find((u) => u.name === 'NEXUS_PERIST_LEARNING');
      expect(typo).toBeDefined();
      expect(typo?.suggestion).toBe('NEXUS_PERSIST_LEARNING');
    });

    it('detects unknown var with no suggestion when too distant', () => {
      vi.stubEnv('NEXUS_FOOBAR_XYZZY_RANDOM', 'true');
      const result = validateNexusEnv();
      const entry = result.unknownVars.find((u) => u.name === 'NEXUS_FOOBAR_XYZZY_RANDOM');
      expect(entry).toBeDefined();
      expect(entry?.suggestion).toBeNull();
    });

    it('detects invalid enum value for NEXUS_V2_MODE', () => {
      vi.stubEnv('NEXUS_V2_MODE', 'invalid');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_V2_MODE');
      expect(inv).toBeDefined();
      expect(inv?.value).toBe('invalid');
    });

    it('detects invalid integer value for NEXUS_TIMEOUT_CLI', () => {
      vi.stubEnv('NEXUS_TIMEOUT_CLI', 'abc');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_TIMEOUT_CLI');
      expect(inv).toBeDefined();
      expect(inv?.value).toBe('abc');
    });

    it('detects invalid boolean value for NEXUS_AUTH_ENABLED', () => {
      vi.stubEnv('NEXUS_AUTH_ENABLED', 'maybe');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_AUTH_ENABLED');
      expect(inv).toBeDefined();
      expect(inv?.value).toBe('maybe');
    });

    it('detects invalid log level', () => {
      vi.stubEnv('NEXUS_LOG_LEVEL', 'verbose');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_LOG_LEVEL');
      expect(inv).toBeDefined();
      expect(inv?.value).toBe('verbose');
    });

    it('reports multiple issues simultaneously', () => {
      vi.stubEnv('NEXUS_PERIST_LEARNING', 'true');
      vi.stubEnv('NEXUS_V2_MODE', 'invalid');
      vi.stubEnv('NEXUS_TIMEOUT_CLI', 'not-a-number');
      const result = validateNexusEnv();
      expect(result.unknownVars.length).toBeGreaterThanOrEqual(1);
      expect(result.invalidVars.length).toBeGreaterThanOrEqual(2);
    });

    it('accepts all valid boolean values', () => {
      vi.stubEnv('NEXUS_AUTH_ENABLED', 'true');
      const result = validateNexusEnv();
      const boolInvalids = result.invalidVars.filter((v) => v.name === 'NEXUS_AUTH_ENABLED');
      expect(boolInvalids).toHaveLength(0);
    });

    it('accepts valid NEXUS_REFLECTIVE_MEMORY shadow mode', () => {
      vi.stubEnv('NEXUS_REFLECTIVE_MEMORY', 'shadow');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_REFLECTIVE_MEMORY');
      expect(inv).toBeUndefined();
    });

    it('logs warnings when logger is provided', () => {
      vi.stubEnv('NEXUS_PERIST_LEARNING', 'true');
      vi.stubEnv('NEXUS_V2_MODE', 'invalid');
      const warnings: string[] = [];
      const mockLogger = {
        warn: (msg: string) => warnings.push(msg),
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      } as unknown as import('../core/index.js').ILogger;

      validateNexusEnv(mockLogger);

      expect(warnings.length).toBeGreaterThanOrEqual(2);
      expect(warnings.some((w) => w.includes('NEXUS_PERIST_LEARNING'))).toBe(true);
      expect(warnings.some((w) => w.includes('did you mean NEXUS_PERSIST_LEARNING'))).toBe(true);
      expect(warnings.some((w) => w.includes('NEXUS_V2_MODE'))).toBe(true);
    });

    it('suggests NEXUS_V2_DELEGATE for NEXUS_V2_DELEATE', () => {
      vi.stubEnv('NEXUS_V2_DELEATE', 'true');
      const result = validateNexusEnv();
      const entry = result.unknownVars.find((u) => u.name === 'NEXUS_V2_DELEATE');
      expect(entry).toBeDefined();
      expect(entry?.suggestion).toBe('NEXUS_V2_DELEGATE');
    });
  });

  describe('code-read variables are registered (#5142)', () => {
    // Verified live before the fix: each of these produced an unknownVars entry
    // while production code read the value, so the typo detector accused the
    // user of a typo they had not made.

    it('recognizes NEXUS_MCP_DEPTH, read by the codex MCP nesting guard', () => {
      vi.stubEnv('NEXUS_MCP_DEPTH', '1');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('reports a non-integer NEXUS_MCP_DEPTH as invalid rather than ignoring it', () => {
      vi.stubEnv('NEXUS_MCP_DEPTH', 'abc');
      const result = validateNexusEnv();
      expect(result.invalidVars.map((v) => v.name)).toContain('NEXUS_MCP_DEPTH');
    });

    it('accepts 0 for NEXUS_JOB_MAX_CONCURRENT_TOTAL, which disables async dispatch', () => {
      vi.stubEnv('NEXUS_JOB_MAX_CONCURRENT_TOTAL', '0');
      const result = validateNexusEnv();
      expect(result.invalidVars).toHaveLength(0);
    });

    it('recognizes the path and token variables', () => {
      vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', '/tmp/votes.jsonl');
      vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'https://example.test/v1');
      vi.stubEnv('NEXUS_SENSITIVE_REFS', 'alpha,beta');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('accepts the full parseBoolEnv set for NEXUS_VERSION_CHECK', () => {
      for (const value of ['true', 'false', '1', '0', 'TRUE']) {
        vi.stubEnv('NEXUS_VERSION_CHECK', value);
        expect(validateNexusEnv().invalidVars).toHaveLength(0);
      }
    });

    it('rejects "yes" for a parseBoolEnv variable, which the helper silently discards', () => {
      // parseBoolEnv accepts only true|1|false|0; `yes` falls through to the
      // default, so reporting it is what stops a silent no-op (#5155).
      vi.stubEnv('NEXUS_VERSION_CHECK', 'yes');
      const result = validateNexusEnv();
      expect(result.invalidVars.map((v) => v.name)).toContain('NEXUS_VERSION_CHECK');
    });

    it('accepts NEXUS_REPUTATION_GATING in mixed case, as the consumer lowercases it', () => {
      vi.stubEnv('NEXUS_REPUTATION_GATING', 'Enforce');
      expect(validateNexusEnv().invalidVars).toHaveLength(0);
    });
  });

  describe('dynamic variable families (#5142)', () => {
    it('recognizes every NEXUS_VOTER_MODEL_<ROLE> built from VOTER_ROLES', () => {
      for (const role of Object.keys(VOTER_ROLES)) {
        vi.stubEnv(`NEXUS_VOTER_MODEL_${role.toUpperCase()}`, 'claude-opus');
      }
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
    });

    it('still flags a NEXUS_VOTER_MODEL_ suffix that is not a real role', () => {
      // Without this the family check would accept anything and could not fail.
      vi.stubEnv('NEXUS_VOTER_MODEL_NOTAROLE', 'claude-opus');
      const result = validateNexusEnv();
      expect(result.unknownVars.map((u) => u.name)).toContain('NEXUS_VOTER_MODEL_NOTAROLE');
    });

    it('recognizes a per-tool NEXUS_JOB_MAX_CONCURRENT_<TOOL> override', () => {
      vi.stubEnv('NEXUS_JOB_MAX_CONCURRENT_ORCHESTRATE', '2');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
    });

    it('does not treat a bare family prefix with no suffix as known', () => {
      vi.stubEnv('NEXUS_VOTER_MODEL_', 'x');
      const result = validateNexusEnv();
      expect(result.unknownVars.map((u) => u.name)).toContain('NEXUS_VOTER_MODEL_');
    });
  });

  describe('getKnownNexusVarNames', () => {
    it('returns a non-empty array of known variable names', () => {
      const names = getKnownNexusVarNames();
      expect(names.length).toBeGreaterThan(40);
    });

    it('includes core known variables', () => {
      const names = getKnownNexusVarNames();
      expect(names).toContain('NEXUS_TIMEOUT_CLI');
      expect(names).toContain('NEXUS_V2_MODE');
      expect(names).toContain('NEXUS_LOG_LEVEL');
      expect(names).toContain('NEXUS_PERSIST_LEARNING');
      expect(names).toContain('NEXUS_AUTH_ENABLED');
      expect(names).toContain('NEXUS_BILLING_MODE');
    });

    it('does not register the never-wired timeout vars removed in #4180', () => {
      const names = getKnownNexusVarNames();
      expect(names).not.toContain('NEXUS_TEST_TIMEOUT_MS');
      expect(names).not.toContain('NEXUS_TIMEOUT_CLISIMPLE');
      expect(names).not.toContain('NEXUS_TIMEOUT_CLICOMPLEX');
    });

    it('all names start with NEXUS_', () => {
      const names = getKnownNexusVarNames();
      for (const name of names) {
        expect(name).toMatch(/^NEXUS_/);
      }
    });
  });
});

// =============================================================================
// The schema must know every variable the docs tell people to set (#4722)
// =============================================================================

describe('documented NEXUS_* vars are all in the schema (#4722)', () => {
  // `NEXUS_DATA_DIR` sat in CLAUDE.md's most-used table and not in this schema,
  // so setting the documented variable made `validateNexusEnv` report it as an
  // UNKNOWN var — with a typo suggestion for a name spelled correctly. Three
  // siblings were missing the same way. Nothing connected the two lists.
  // Reads AGENTS.md, not CLAUDE.md (#5151). The env table moved there so every
  // harness sees it; checking CLAUDE.md would gate the table in the one file
  // only Claude reads, which is what this guarantee was quietly doing before.
  // CLAUDE.md still renders the same table — it is injected from this source —
  // so nothing is lost by checking the origin instead of the copy.
  const AGENTS_MD = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8');

  /** Every `NEXUS_*` name appearing in backticks in AGENTS.md. */
  function documentedVars(): string[] {
    const found = new Set<string>();
    for (const m of AGENTS_MD.matchAll(/`(NEXUS_[A-Z0-9_]+)`/g)) {
      const name = m[1];
      if (name !== undefined) found.add(name);
    }
    return [...found].sort();
  }

  it('finds the documented list it is checking against', () => {
    // Guard the guard: a regex that matched nothing would make the assertion
    // below pass over an empty set, which is the failure this file is about.
    expect(documentedVars().length).toBeGreaterThan(10);
  });

  it('recognizes every documented variable', () => {
    // AGENTS.md also names variables that were REMOVED (#2977, #4180) and
    // documents them as removed; those must stay out of the schema.
    const removed = new Set(
      documentedVars().filter((v) =>
        new RegExp(`\`${v}\`[^\\n]*(?:removed|were removed)`, 'i').test(AGENTS_MD)
      )
    );
    const schemaKeys = new Set(getKnownNexusVarNames());

    const missing = documentedVars().filter((v) => !schemaKeys.has(v) && !removed.has(v));

    expect(missing).toEqual([]);
  });
});

// =============================================================================
// CONFIGURATION.md is the authoritative list, and it was unguarded (#5159)
// =============================================================================

describe('documented NEXUS_* vars in CONFIGURATION.md are all in the schema (#5159)', () => {
  // The #4722 guarantee reads AGENTS.md, which carries only the MOST-USED
  // table and explicitly defers to CONFIGURATION.md for the full list. So the
  // authoritative document was the one nothing checked: measured on
  // 2026-08-29, 16 of the 22 variables registered by #5142 were already
  // documented here while unregistered, and the test built to catch exactly
  // that could not see any of them.
  const CONFIG_MD = readFileSync(join(REPO_ROOT, 'docs/getting-started/CONFIGURATION.md'), 'utf8');

  const BASELINE = JSON.parse(
    readFileSync(join(REPO_ROOT, 'docs/ops/env-schema-coverage-baseline.json'), 'utf8')
  ) as { intentional: Record<string, unknown>; debt: string[] };

  /** Every `NEXUS_*` name appearing in backticks in CONFIGURATION.md. */
  function documentedVars(): string[] {
    const found = new Set<string>();
    for (const m of CONFIG_MD.matchAll(/`(NEXUS_[A-Z0-9_]+)`/g)) {
      const name = m[1];
      if (name !== undefined) found.add(name);
    }
    return [...found].sort();
  }

  it('finds the documented list it is checking against', () => {
    // Guard the guard, same as the AGENTS.md check: a regex that matched
    // nothing would make the assertion below pass over an empty set, which is
    // the exact failure this file exists to prevent.
    expect(documentedVars().length).toBeGreaterThan(50);
  });

  it('recognizes every documented variable', () => {
    // Three documented populations are legitimately absent from the schema:
    //
    //  1. REMOVED vars (#2977, #4180). CONFIGURATION.md documents them AS
    //     removed so a user who still has one set can find out why it stopped
    //     working. Registering them would resurrect names with no reader.
    //  2. Accepted debt already tracked in the coverage baseline (#5142) —
    //     registering those needs a per-variable judgment on the accepted
    //     value set, which is #5156, not this test.
    //  3. Script-scoped vars, marked as such in their doc row: they are read
    //     under scripts/, never by the server, so the runtime schema that
    //     validates the server's own process env is the wrong home for them.
    //
    // Anything else documented-but-unregistered is the #4722 defect: the user
    // sets a documented name and gets an unknown-variable warning, often
    // suggesting a DIFFERENT spelling that does work.
    // Removed vars are listed as prose under `### Removed …` headings, not as
    // table rows, so this collects every name inside such a section rather
    // than pattern-matching a row. Each section runs to the next heading.
    const removed = new Set<string>();
    for (const m of CONFIG_MD.matchAll(/^#{2,3} Removed[^\n]*$/gim)) {
      const start = m.index ?? 0;
      const rest = CONFIG_MD.slice(start + m[0].length);
      const nextHeading = rest.search(/^#{2,3} /m);
      const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
      for (const n of section.matchAll(/`(NEXUS_[A-Z0-9_]+)`/g)) {
        const name = n[1];
        if (name !== undefined) removed.add(name);
      }
    }
    const scriptScoped = new Set(
      documentedVars().filter((v) =>
        new RegExp(`\`${v}\`[^\\n]*script-scoped`, 'i').test(CONFIG_MD)
      )
    );
    const baselined = new Set([...BASELINE.debt, ...Object.keys(BASELINE.intentional)]);
    const schemaKeys = new Set(getKnownNexusVarNames());

    const missing = documentedVars().filter(
      (v) => !schemaKeys.has(v) && !removed.has(v) && !baselined.has(v) && !scriptScoped.has(v)
    );

    expect(missing).toEqual([]);
  });

  it('does not document a name that no code reads under a real one it shadows', () => {
    // NEXUS_RATE_LIMIT was documented as "Requests per minute, default 60"
    // with no reader anywhere, while the variable that actually does that —
    // NEXUS_RATE_LIMIT_RPM, same description, same default (defaults.ts:153) —
    // was documented nowhere. A user following the doc set a name that did
    // nothing and got a warning naming a spelling they had never seen.
    expect(CONFIG_MD).not.toMatch(/`NEXUS_RATE_LIMIT`/);
    expect(CONFIG_MD).toMatch(/`NEXUS_RATE_LIMIT_RPM`/);
  });
});
