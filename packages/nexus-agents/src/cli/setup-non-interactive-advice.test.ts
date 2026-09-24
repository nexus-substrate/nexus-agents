/**
 * `nexus-agents setup` refusal advice must work when followed (#6761).
 *
 * With no TTY, or with `CI=true`, setup refuses unless `--non-interactive` is
 * passed. The refusal used to say "Run with --non-interactive or set CI=true",
 * and setting `CI=true` produced the same refusal. These tests read the
 * remedies out of the printed refusal, apply each one ALONE through the real
 * `parseCliArgs` → `handleSetupCommandAsync` path, and require exit 0.
 *
 * @module cli/setup-non-interactive-advice.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCliArgs } from '../cli.js';
import { handleSetupCommandAsync } from '../cli-commands-handlers-setup.js';

// Avoid spawning real CLIs during detection (same stub as setup-command.test.ts).
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn(() => {
      throw new Error('not found');
    }),
    execFileSync: vi.fn(() => {
      throw new Error('not found');
    }),
  };
});

/** Dry run that touches no harness config, so a successful run writes nothing. */
const BASE_ARGV = [
  'setup',
  '--dry-run',
  '--skip-mcp',
  '--skip-rules',
  '--skip-hooks',
  '--skip-config',
  '--skip-opencode',
  '--skip-gemini',
  '--skip-codex',
];

const ENV_KEYS = ['CI', 'CONTINUOUS_INTEGRATION'] as const;

interface Remedy {
  readonly flags: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly label: string;
}

/** Every `--flag` and every `NAME=value` the refusal offers, each as a standalone remedy. */
function extractRemedies(message: string): Remedy[] {
  const flags = [...message.matchAll(/(?<![\w-])--[a-z][a-z-]*/g)].map((m) => m[0]);
  const envs = [...message.matchAll(/\b([A-Z][A-Z0-9_]*)=(\S+?)[.,]?(?=\s|$)/g)];
  return [
    ...flags.map((f) => ({ flags: [f], env: {}, label: f })),
    ...envs.map((m) => ({
      flags: [],
      env: { [m[1] ?? '']: m[2] ?? '' },
      label: `${m[1] ?? ''}=${m[2] ?? ''}`,
    })),
  ];
}

describe('setup refusal advice works when followed (#6761)', () => {
  let output: string;
  let savedEnv: Record<string, string | undefined>;
  let savedTty: boolean | undefined;

  beforeEach(() => {
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    savedTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of ENV_KEYS) {
      const v = savedEnv[k];
      if (v === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = v;
    }
    Object.defineProperty(process.stdout, 'isTTY', { value: savedTty, configurable: true });
  });

  const environments: ReadonlyArray<{ name: string; env: Record<string, string> }> = [
    { name: 'no TTY, CI unset', env: {} },
    { name: 'no TTY, CI=true', env: { CI: 'true' } },
  ];

  for (const environment of environments) {
    it(`${environment.name}: every remedy the refusal names succeeds on its own`, async () => {
      for (const k of ENV_KEYS) Reflect.deleteProperty(process.env, k);
      Object.assign(process.env, environment.env);

      const refused = await handleSetupCommandAsync(parseCliArgs(BASE_ARGV));
      expect(refused.exitCode).toBe(1);
      const refusal = output;
      expect(refusal).toContain('Non-interactive environment detected');

      const remedies = extractRemedies(refusal);
      // Empty case: a refusal that offers nothing is not advice.
      expect(remedies.map((r) => r.label)).toContain('--non-interactive');

      for (const remedy of remedies) {
        for (const k of ENV_KEYS) Reflect.deleteProperty(process.env, k);
        Object.assign(process.env, environment.env, remedy.env);
        output = '';

        const followed = await handleSetupCommandAsync(
          parseCliArgs([...BASE_ARGV, ...remedy.flags])
        );

        expect({ remedy: remedy.label, exitCode: followed.exitCode }).toEqual({
          remedy: remedy.label,
          exitCode: 0,
        });
        expect(output).not.toContain('Non-interactive environment detected');
      }
    });
  }
});
