/**
 * env-schema - Unit Tests (Issue #1016)
 *
 * Tests for centralized NEXUS_* environment variable validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateNexusEnv, getKnownNexusVarNames } from './env-schema.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';

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

    it('reports NEXUS_AUTH_METHOD as unknown — it never reached enforcement (#5665)', () => {
      // The variable was registered and documented, but the only reader was
      // the startup log line; AuthHandler never consulted it. Removed by panel
      // decision rather than wired, as with #2977 / #4180.
      vi.stubEnv('NEXUS_AUTH_METHOD', 'token');
      const result = validateNexusEnv();
      expect(result.unknownVars.map((v) => v.name)).toContain('NEXUS_AUTH_METHOD');
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

    it('accepts 1/0 for the hook flags, which are read via parseBoolEnv (#5155)', () => {
      // handler-utils.ts reads all three through parseBoolEnv, so `1`/`0` work
      // at runtime (the hook tests set `=1`); the strict boolStr registration
      // reported those spellings invalid — the inverse of the silent no-op.
      for (const name of [
        'NEXUS_HOOK_VERBOSE',
        'NEXUS_DISABLE_SESSIONS',
        'NEXUS_DISABLE_METRICS',
      ]) {
        for (const value of ['1', '0', 'TRUE']) {
          vi.stubEnv(name, value);
          expect(validateNexusEnv().invalidVars.map((v) => v.name)).not.toContain(name);
        }
        vi.unstubAllEnvs();
      }
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

// =============================================================================
// Every parseBoolEnv / parseBoolValue consumer is registered with the
// boolLooseStr shape (#5155)
// =============================================================================

describe('parseBoolEnv consumers are registered as boolLooseStr (#5155)', () => {
  // The #5142 coverage gate (scripts/check-env-schema-coverage.ts) proves a
  // flag the code reads is REGISTERED; it says nothing about the accept-set.
  // A boolean flag registered as strict `boolStr` (`true|false`) would report
  // `NEXUS_X=1` invalid while the helper accepts it — and one registered as a
  // free string would tell the user `yes` works when the helper discards it.
  // So this reads the actual call sites and probes each name against the
  // schema for the exact helper accept-set: `TRUE` in, `yes` out.
  const SRC = join(REPO_ROOT, 'packages/nexus-agents/src');

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        out.push(...sourceFiles(full));
        continue;
      }
      if (!entry.endsWith('.ts') || entry.includes('.test.') || entry.includes('.spec.')) continue;
      out.push(full);
    }
    return out;
  }

  /** One `parseBoolEnv` / `parseBoolValue` argument the scanner could not name. */
  interface UnresolvedBoolRead {
    readonly file: string;
    readonly line: number;
    readonly argument: string;
  }

  interface BoolFlagScan {
    /** NEXUS_* names resolved from the call sites. */
    readonly names: readonly string[];
    /** Call sites whose argument is not a NEXUS_* literal by any known shape. */
    readonly unresolved: readonly UnresolvedBoolRead[];
  }

  /**
   * Call sites whose argument is a runtime value the scanner cannot resolve,
   * keyed by file (relative to `src/`) → the env names that reach it. Each
   * name is probed exactly like a resolved one. A site that is neither
   * resolvable nor listed here FAILS the test, so a new indirect reader has
   * to be tabled with its names before it can pass — the table is the
   * visible, countable set of readers the regex cannot see.
   */
  const INDIRECT_BOOL_READERS: Readonly<Record<string, readonly string[]>> = {
    // `isFeatureDisabled(envVar)` — called from stop.ts, post-tool.ts and
    // session-end.ts with these two members of HookEnvVars.
    'cli/hooks/handlers/handler-utils.ts': ['NEXUS_DISABLE_SESSIONS', 'NEXUS_DISABLE_METRICS'],
  };

  /**
   * Resolve one call argument to a NEXUS_* name. Four shapes are known:
   * a literal (`'NEXUS_X'`), a same-file constant (`const FLAG = 'NEXUS_X'`),
   * a member expression (`HookEnvVars.NEXUS_X` — the member IS the name), and
   * the injected-env form (`source['NEXUS_X']`). Anything else — a parameter,
   * an imported constant, a computed key — is `undefined`, which the caller
   * must treat as a failure, never as "nothing to check".
   */
  function resolveBoolFlagArgument(
    argument: string,
    constants: ReadonlyMap<string, string>
  ): string | undefined {
    const literal = /^['"](NEXUS_[A-Z0-9_]+)['"]$/.exec(argument);
    if (literal?.[1] !== undefined) return literal[1];
    const member = /^\w+\.(NEXUS_[A-Z0-9_]+)$/.exec(argument);
    if (member?.[1] !== undefined) return member[1];
    const bracket = /^\w+\[['"](NEXUS_[A-Z0-9_]+)['"]\]$/.exec(argument);
    if (bracket?.[1] !== undefined) return bracket[1];
    if (/^\w+$/.test(argument)) return constants.get(argument);
    return undefined;
  }

  /**
   * Scan one source text for `parseBoolEnv(...)` / `parseBoolValue(...)` reads.
   * Pure — takes text, not a path — so the unresolved branch can be proven on
   * an inline fixture. The helpers' own definitions in defaults-env.ts are
   * blanked first (newlines kept, so line numbers stay true): the body of
   * `parseBoolEnv` delegates with `parseBoolValue(process.env[envKey], …)`,
   * which is the definition, not a consumer.
   */
  function scanBoolFlagReads(source: string, file: string): BoolFlagScan {
    const code = source.replace(
      /export function parseBool(?:Env|Value)\([^)]*\)[^{]*\{[\s\S]*?\n\}/g,
      (m) => m.replace(/[^\n]/g, '')
    );
    const constants = new Map<string, string>();
    for (const m of code.matchAll(/^(?:export )?const (\w+)\s*=\s*'(NEXUS_[A-Z0-9_]+)'/gm)) {
      if (m[1] !== undefined && m[2] !== undefined) constants.set(m[1], m[2]);
    }
    const names: string[] = [];
    const unresolved: UnresolvedBoolRead[] = [];
    for (const m of code.matchAll(/parseBool(?:Env|Value)\(\s*([^,)]+?)\s*,/g)) {
      const argument = m[1] ?? '';
      const name = resolveBoolFlagArgument(argument, constants);
      if (name !== undefined) names.push(name);
      else unresolved.push({ file, line: code.slice(0, m.index).split('\n').length, argument });
    }
    return { names, unresolved };
  }

  interface TreeScan {
    readonly sites: Map<string, string[]>;
    /** Unresolved sites in files NOT tabled — each one fails the gate. */
    readonly untabled: readonly UnresolvedBoolRead[];
    /** Tabled files that no longer have an unresolved site — stale table. */
    readonly staleTable: readonly string[];
  }

  function scanTree(): TreeScan {
    const sites = new Map<string, string[]>();
    const add = (name: string, file: string): void => {
      sites.set(name, [...(sites.get(name) ?? []), file]);
    };
    const untabled: UnresolvedBoolRead[] = [];
    const filesWithUnresolved = new Set<string>();
    for (const full of sourceFiles(SRC)) {
      const file = full.replace(`${SRC}/`, '');
      const scan = scanBoolFlagReads(readFileSync(full, 'utf8'), file);
      for (const name of scan.names) add(name, file);
      if (scan.unresolved.length === 0) continue;
      filesWithUnresolved.add(file);
      const tabled = INDIRECT_BOOL_READERS[file];
      if (tabled === undefined) untabled.push(...scan.unresolved);
      else for (const name of tabled) add(name, file);
    }
    const staleTable = Object.keys(INDIRECT_BOOL_READERS).filter(
      (f) => !filesWithUnresolved.has(f)
    );
    return { sites, untabled, staleTable };
  }

  const TREE = scanTree();
  const KNOWN_SITES = TREE.sites;

  it('reports an argument it cannot resolve instead of skipping it', () => {
    // The scanner must fail closed: a parameter, an imported constant or a
    // computed key is an env read the gate cannot see, and silently skipping
    // it is how three strict-boolStr hook flags went unprobed (#5155 review).
    const fixture = [
      "const FLAG = 'NEXUS_FIXTURE_CONST';",
      'export function isVerbose(): boolean {',
      '  return parseBoolEnv(Vars.NEXUS_FIXTURE_MEMBER, false);',
      '}',
      'export function isDisabled(envVar: string): boolean {',
      '  return parseBoolEnv(envVar, false);',
      '}',
      "const a = parseBoolEnv('NEXUS_FIXTURE_LITERAL', true);",
      'const b = parseBoolEnv(FLAG, true);',
      "const c = parseBoolValue(source['NEXUS_FIXTURE_BRACKET'], true);",
      'const d = parseBoolValue(source[key], true);',
    ].join('\n');
    const scan = scanBoolFlagReads(fixture, 'fixture.ts');
    expect(scan.names).toEqual([
      'NEXUS_FIXTURE_MEMBER',
      'NEXUS_FIXTURE_LITERAL',
      'NEXUS_FIXTURE_CONST',
      'NEXUS_FIXTURE_BRACKET',
    ]);
    expect(scan.unresolved).toEqual([
      { file: 'fixture.ts', line: 6, argument: 'envVar' },
      { file: 'fixture.ts', line: 11, argument: 'source[key]' },
    ]);
  });

  it('does not count the helper definitions themselves as consumers', () => {
    const helper = [
      'export function parseBoolValue(value: string | undefined, fallback: boolean): boolean {',
      '  return fallback;',
      '}',
      'export function parseBoolEnv(envKey: string, fallback: boolean): boolean {',
      '  return parseBoolValue(process.env[envKey], fallback);',
      '}',
      "const x = parseBoolEnv('NEXUS_FIXTURE_AFTER', false);",
    ].join('\n');
    const scan = scanBoolFlagReads(helper, 'defaults-env.ts');
    expect(scan.unresolved).toEqual([]);
    expect(scan.names).toEqual(['NEXUS_FIXTURE_AFTER']);
  });

  it('finds the call sites it is checking against', () => {
    // Guard the guard: a regex that matched nothing would pass the assertions
    // below over an empty set. The five #5155 flags, the four registered
    // earlier, and the three hook flags are the floor.
    expect(KNOWN_SITES.size).toBeGreaterThanOrEqual(12);
    expect([...KNOWN_SITES.keys()]).toEqual(
      expect.arrayContaining([
        'NEXUS_BUDGET_ENFORCE',
        'NEXUS_DYNAMIC_MODELS',
        'NEXUS_CONTEXT_RETRIEVER_INJECT',
        'NEXUS_GITIGNORE_AUTO',
        'NEXUS_SUBPROCESS_ENV_ALLOWLIST',
        'NEXUS_HOOK_VERBOSE',
        'NEXUS_DISABLE_SESSIONS',
        'NEXUS_DISABLE_METRICS',
      ])
    );
  });

  it('fails on a call site it cannot resolve unless the file is tabled with its names', () => {
    // Name the empty case: an INDIRECT_BOOL_READERS entry with no names would
    // exempt a file from the gate while probing nothing.
    for (const [file, names] of Object.entries(INDIRECT_BOOL_READERS)) {
      expect(names.length, `${file} is tabled with no env names`).toBeGreaterThan(0);
    }
    expect(
      TREE.untabled.map((u) => `${u.file}:${String(u.line)} parseBool*(${u.argument}, …)`)
    ).toEqual([]);
    expect(TREE.staleTable).toEqual([]);
  });

  it('registers every consumer name with the exact helper accept-set', () => {
    const schemaKeys = new Set(getKnownNexusVarNames());
    const unregistered: string[] = [];
    const wrongShape: string[] = [];

    for (const [name, files] of KNOWN_SITES) {
      if (!schemaKeys.has(name)) {
        unregistered.push(`${name} (${files.map((f) => f.replace(`${SRC}/`, '')).join(', ')})`);
        continue;
      }
      // Probe the registered shape rather than reading the source: `TRUE` must
      // be accepted (the helper lowercases) and `yes` must be rejected (the
      // helper discards it).
      vi.stubEnv(name, 'TRUE');
      const acceptsUpper = !validateNexusEnv().invalidVars.some((v) => v.name === name);
      vi.stubEnv(name, 'yes');
      const rejectsYes = validateNexusEnv().invalidVars.some((v) => v.name === name);
      vi.unstubAllEnvs();
      if (!acceptsUpper || !rejectsYes) wrongShape.push(name);
    }

    expect(unregistered).toEqual([]);
    expect(wrongShape).toEqual([]);
  });
});
