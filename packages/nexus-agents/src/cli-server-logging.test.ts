/** Real stdio startup regression coverage for logging.destination (#6946). */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggingConfigSchema } from './config/schemas.js';
import { createLogger } from './core/logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const cliSource = resolve(here, 'cli.ts');
const tsxLoader = createRequire(import.meta.url).resolve('tsx');
const EXIT_WAIT_MS = 90_000;
const WARNING_REASON = 'stdout carries MCP JSON-RPC in server mode';
const INITIALIZE_LINE = `${JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'logging-test', version: '1' },
  },
})}\n`;

function serverEnv(workDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('VITEST') || key === 'NODE_ENV') continue;
    env[key] = value;
  }
  env['NEXUS_DATA_DIR'] = join(workDir, 'data');
  env['NEXUS_CONFIG_PATH'] = join(workDir, 'nexus-agents.yaml');
  env['NEXUS_SUBPROCESS_DEPTH'] = '0';
  env['NEXUS_LOG_LEVEL'] = 'info';
  env['TMPDIR'] = workDir;
  return env;
}

/** Close server stdin after a real response and capture all output through exit. */
function runCli(
  workDir: string,
  args: string[] = ['--mode=server']
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['--import', tsxLoader, cliSource, ...args], {
    cwd: workDir,
    env: serverEnv(workDir),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return new Promise((resolveExit, rejectExit) => {
    let stdout = '';
    let stderr = '';
    let timeoutError: Error | undefined;
    const guard = setTimeout(() => {
      timeoutError = new Error(`server did not respond and exit:\n${stderr.slice(-2000)}`);
      child.kill('SIGKILL');
    }, EXIT_WAIT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes('"id":1')) child.stdin.end();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(guard);
      rejectExit(error);
    });
    child.on('close', (code) => {
      clearTimeout(guard);
      if (timeoutError !== undefined) rejectExit(timeoutError);
      else resolveExit({ code, stdout, stderr });
    });
    child.stdin.write(INITIALIZE_LINE);
  });
}

describe('server logging over stdio', () => {
  let workDir: string;

  beforeEach(() => {
    const scratchRoot = resolve(here, '../.nexus-agents');
    mkdirSync(scratchRoot, { recursive: true });
    workDir = mkdtempSync(join(scratchRoot, 'logging-6946-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it.each(['info', 'debug', 'error'])(
    'keeps stdout JSON-RPC only and warns once with logging.level=%s',
    async (level) => {
      writeFileSync(
        join(workDir, 'nexus-agents.yaml'),
        `logging:\n  destination: stdout\n  level: ${level}\n  format: json\n`
      );

      const { code, stdout, stderr } = await runCli(workDir);

      expect(code, stderr.slice(-2000)).toBe(0);
      const lines = stdout.trim().split('\n');
      // A missing response is failure, not evidence of a clean stream.
      expect(stdout.trim()).not.toBe('');
      const frames = lines.map((line) => JSONRPCMessageSchema.parse(JSON.parse(line)));
      expect(frames).toContainEqual(expect.objectContaining({ id: 1, result: expect.any(Object) }));
      expect(stderr.split('\n').filter((line) => line.includes(WARNING_REASON))).toHaveLength(1);
      expect(stderr).toContain('logging.destination');
      if (level !== 'error') {
        expect(stderr).toContain('Loading built-in workflow templates');
        expect(stdout).not.toContain('Loading built-in workflow templates');
        expect(stderr).toContain('MCP server started successfully');
      }
    },
    120_000
  );

  it('does not warn when logging.destination is already stderr', async () => {
    writeFileSync(join(workDir, 'nexus-agents.yaml'), 'logging:\n  destination: stderr\n');

    const { code, stdout, stderr } = await runCli(workDir);

    expect(code, stderr.slice(-2000)).toBe(0);
    expect(stdout.trim()).not.toBe('');
    for (const line of stdout.trim().split('\n')) {
      expect(JSONRPCMessageSchema.safeParse(JSON.parse(line)).success).toBe(true);
    }
    expect(stderr).not.toContain(WARNING_REASON);
    expect(stderr).toContain('MCP server started successfully');
  }, 120_000);

  it('keeps CLI command output on stdout without a server warning', async () => {
    writeFileSync(join(workDir, 'nexus-agents.yaml'), 'logging:\n  destination: stdout\n');

    const { code, stdout, stderr } = await runCli(workDir, ['--help']);

    expect(code, stderr.slice(-2000)).toBe(0);
    expect(stdout).toContain('USAGE:');
    expect(stderr).not.toContain(WARNING_REASON);
  }, 120_000);
});

describe('CLI logging destination', () => {
  afterEach(() => {
    createLogger().setDestination?.('stderr');
    vi.restoreAllMocks();
  });

  it('still accepts stdout config and writes CLI info logs there', () => {
    const config = LoggingConfigSchema.parse({ destination: 'stdout', level: 'info' });
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const logger = createLogger({ component: 'cli' });
    logger.setLevel(config.level);
    logger.setDestination?.(config.destination);

    logger.info('CLI stdout log');

    expect(stdout).toHaveBeenCalledOnce();
    expect(String(stdout.mock.calls[0]?.[0])).toContain('CLI stdout log');
    expect(stderr).not.toHaveBeenCalled();
  });
});
