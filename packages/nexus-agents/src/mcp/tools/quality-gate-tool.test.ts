/**
 * Tests for run_quality_gate MCP tool (#3356 Step 1).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Mock the gate-check factory modules so tests never shell out to tsc/eslint/etc.
vi.mock('../../security/quality-gate.js', async () => {
  const actual = await vi.importActual<typeof import('../../security/quality-gate.js')>(
    '../../security/quality-gate.js'
  );
  return {
    ...actual,
    checkTypeCheck: vi.fn(
      () => () => Promise.resolve({ name: 'type_check', verdict: 'pass', details: 'ok' })
    ),
    checkLint: vi.fn(() => () => Promise.resolve({ name: 'lint', verdict: 'pass', details: 'ok' })),
    checkTests: vi.fn(
      () => () => Promise.resolve({ name: 'tests', verdict: 'pass', details: 'ok' })
    ),
    checkBuild: vi.fn(
      () => () => Promise.resolve({ name: 'build', verdict: 'pass', details: 'ok' })
    ),
  };
});

vi.mock('../../pipeline/security-gate.js', () => ({
  checkSecurityScan: vi.fn(
    () => () => Promise.resolve({ name: 'security_scan', verdict: 'pass', details: 'ok' })
  ),
}));

import {
  RunQualityGateInputSchema,
  registerRunQualityGateTool,
  type RunQualityGateDeps,
} from './quality-gate-tool.js';
import { checkTypeCheck, checkLint, checkTests, checkBuild } from '../../security/quality-gate.js';
import { checkSecurityScan } from '../../pipeline/security-gate.js';
import { REGISTERED_TOOL_NAMES } from './index.js';

function makeDeps(): RunQualityGateDeps {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    },
    rateLimiter: { tryAcquire: vi.fn().mockReturnValue(true) },
  } as unknown as RunQualityGateDeps;
}

type RegisteredCallback = (
  args: unknown
) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

function captureRegisteredHandler(): {
  server: { registerTool: ReturnType<typeof vi.fn> };
  getHandler: () => RegisteredCallback;
} {
  let captured: RegisteredCallback | undefined;
  const registerTool = vi.fn((_name: string, _config: unknown, cb: RegisteredCallback): void => {
    captured = cb;
  });
  return {
    server: { registerTool },
    getHandler: () => {
      if (captured === undefined) throw new Error('handler not registered');
      return captured;
    },
  };
}

describe('RunQualityGateInputSchema', () => {
  it('accepts an empty object — all fields optional', () => {
    expect(RunQualityGateInputSchema.safeParse({}).success).toBe(true);
  });

  it('defaults checks to typecheck/lint/tests', () => {
    expect(RunQualityGateInputSchema.parse({}).checks).toEqual(['typecheck', 'lint', 'tests']);
  });

  it('defaults iteration to 1', () => {
    expect(RunQualityGateInputSchema.parse({}).iteration).toBe(1);
  });

  it('rejects an unknown check name (allowlist enforced by enum)', () => {
    expect(RunQualityGateInputSchema.safeParse({ checks: ['rm -rf /'] }).success).toBe(false);
  });

  it('rejects iteration below 1', () => {
    expect(RunQualityGateInputSchema.safeParse({ iteration: 0 }).success).toBe(false);
  });
});

describe('run_quality_gate handler', () => {
  let projectDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a real directory inside cwd so it passes the resolveInsideRoot guard.
    projectDir = mkdtempSync(join(process.cwd(), 'qg-test-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('valid input → success result with verdict/summary/feedback shape', async () => {
    const cap = captureRegisteredHandler();
    registerRunQualityGateTool(cap.server as never, makeDeps());

    const result = await cap.getHandler()({ projectDir, checks: ['typecheck'] });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as {
      stage: string;
      verdict: string;
      summary: { pass: number; fail: number; skip: number };
      feedback: string;
    };
    expect(payload.stage).toBe('qa');
    expect(payload.verdict).toBe('pass');
    expect(payload.summary).toEqual({ pass: 1, fail: 0, skip: 0 });
    expect(typeof payload.feedback).toBe('string');
  });

  it('maps the checks allowlist to the right factories', async () => {
    const cap = captureRegisteredHandler();
    registerRunQualityGateTool(cap.server as never, makeDeps());

    await cap.getHandler()({
      projectDir,
      checks: ['typecheck', 'lint', 'tests', 'build', 'security'],
    });

    expect(checkTypeCheck).toHaveBeenCalledWith(expect.stringContaining('qg-test-'));
    expect(checkLint).toHaveBeenCalledWith(expect.stringContaining('qg-test-'));
    expect(checkTests).toHaveBeenCalledWith(expect.stringContaining('qg-test-'));
    expect(checkBuild).toHaveBeenCalledTimes(1);
    expect(checkSecurityScan).toHaveBeenCalledWith(expect.stringContaining('qg-test-'));
  });

  it('nonexistent projectDir → structured error, no throw', async () => {
    const cap = captureRegisteredHandler();
    registerRunQualityGateTool(cap.server as never, makeDeps());

    const result = await cap.getHandler()({
      projectDir: join(process.cwd(), 'definitely-does-not-exist-xyz'),
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/projectDir/i);
  });

  it('path-traversal projectDir escaping cwd → structured error, no throw', async () => {
    const cap = captureRegisteredHandler();
    registerRunQualityGateTool(cap.server as never, makeDeps());

    const result = await cap.getHandler()({ projectDir: '../../../../etc' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/projectDir/i);
  });

  it('a file path (not a directory) → structured error', async () => {
    const cap = captureRegisteredHandler();
    registerRunQualityGateTool(cap.server as never, makeDeps());

    const result = await cap.getHandler()({ projectDir: join(process.cwd(), 'package.json') });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/projectDir/i);
  });
});

describe('run_quality_gate registration', () => {
  it('appears in REGISTERED_TOOL_NAMES', () => {
    expect(REGISTERED_TOOL_NAMES).toContain('run_quality_gate');
  });
});
