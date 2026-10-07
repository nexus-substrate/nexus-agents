import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import { registerRunQualityGateTool } from './quality-gate-tool.js';

const mockExec = vi.hoisted(() => vi.fn());
vi.mock('../../cli-adapters/exec-file-tree.js', () => ({ execFileTree: mockExec }));

const partialScan = JSON.stringify({
  runs: [
    {
      tool: { driver: { name: 'semgrep', rules: [] } },
      results: [
        {
          ruleId: 'eval',
          level: 'error',
          message: { text: 'unsafe eval' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'a.js' },
                region: { startLine: 1, snippet: { text: 'eval(a)' } },
              },
            },
          ],
        },
      ],
      invocations: [
        {
          executionSuccessful: true,
          toolExecutionNotifications: [
            {
              descriptor: { id: 'Other syntax error' },
              level: 'warning',
              message: { text: 'Other syntax error at line p.js:1: unsupported syntax' },
            },
          ],
        },
      ],
    },
  ],
});

describe('run_quality_gate security coverage (#7238)', () => {
  let directory: string;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    directory = await mkdtemp(join(process.cwd(), 'qg-security-'));
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc' } })
    );
    mockExec.mockReset();
    mockExec.mockImplementation((_binary: string, args: string[]) => {
      if (args.includes('--sarif')) {
        return Promise.reject(
          Object.assign(new Error('Command failed: semgrep'), {
            code: 3,
            stdout: partialScan,
            stderr: '',
          })
        );
      }
      return Promise.resolve({ stdout: args.includes('--version') ? '1.0.0' : '', stderr: '' });
    });
    server = new McpServer({ name: 'quality-gate-test', version: '1.0.0' });
    client = new Client({ name: 'quality-gate-test', version: '1.0.0' });
    registerRunQualityGateTool(server, {
      rateLimiter: new RateLimiter({ capacity: 10, refillRate: 10 }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('fails overall for a high finding and a parse diagnostic beside a passing check', async () => {
    const result = await client.callTool({
      name: 'run_quality_gate',
      arguments: { projectDir: directory, checks: ['typecheck', 'security'] },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const payload: unknown = JSON.parse(content[0]?.text ?? '{}');
    expect(payload).toMatchObject({
      verdict: 'fail',
      summary: { pass: 1, fail: 1, skip: 0 },
      checks: [
        { name: 'type_check', verdict: 'pass' },
        {
          name: 'security_scan',
          verdict: 'fail',
          blockingFindings: [{ rule: 'eval', file: 'a.js', severity: 'high' }],
        },
      ],
    });
  });
});
