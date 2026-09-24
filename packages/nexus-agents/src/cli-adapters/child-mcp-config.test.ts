/**
 * The generated child MCP config marks its server as a child (#6795), so the
 * child records its model-driven stdio caller as unmeasured, not tier 1.
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateMcpConfig } from './child-mcp-config.js';

const MCP_CHILD_ENV = 'NEXUS_MCP_CHILD';

interface ConfigShape {
  mcpServers: Record<string, { env?: Record<string, string> }>;
}

async function readEnv(
  options?: Parameters<typeof generateMcpConfig>[0]
): Promise<Record<string, string> | undefined> {
  const generated = await generateMcpConfig({ cliPath: '/x/cli.js', ...options });
  try {
    const parsed = JSON.parse(await readFile(generated.configPath, 'utf-8')) as ConfigShape;
    return parsed.mcpServers['nexus-agents']?.env;
  } finally {
    await generated.cleanup();
  }
}

describe('child MCP config marker (#6795)', () => {
  it('sets the child marker with no caller env', async () => {
    expect(await readEnv()).toEqual({ [MCP_CHILD_ENV]: '1' });
  });

  it('keeps caller env and does not let it unset the marker', async () => {
    const env = await readEnv({ env: { FOO: 'bar', [MCP_CHILD_ENV]: '0' } });
    expect(env).toEqual({ FOO: 'bar', [MCP_CHILD_ENV]: '1' });
  });
});
