/**
 * MCP Prompts & Resources Integration Tests
 *
 * Tests prompt listing/getting and resource listing/reading
 * via InMemoryTransport with a real MCP client.
 *
 * @module mcp/mcp-prompts-resources.test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer, connectTransport } from './server.js';
import { registerPrompts } from './prompts/index.js';
import { BuiltInExpertTypeSchema } from '../agents/index.js';

/** Canonical built-in expert count — derive so adding an expert needs no edit here. */
const EXPERT_COUNT = BuiltInExpertTypeSchema.options.length;
import { registerResources } from './resources/index.js';
import { registerTools } from './tools/index.js';

// ============================================================================
// Test Infrastructure
// ============================================================================

interface TestContext {
  client: Client;
  cleanup: () => Promise<void>;
}

let ctx: TestContext;

beforeAll(async () => {
  const serverResult = createServer();
  if (!serverResult.ok) throw new Error(serverResult.error.message);
  const { server, logger } = serverResult.value;

  // Register infrastructure (needed for registerTools which sets up logger/rateLimiter)
  registerTools(server, { logger });

  // Register prompts and resources
  registerPrompts(server, logger);
  registerResources(server, logger);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const connectResult = await connectTransport(server, serverTransport, logger);
  if (!connectResult.ok) throw new Error(connectResult.error.message);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  ctx = {
    client,
    cleanup: async (): Promise<void> => {
      await client.close();
      await server.close();
    },
  };
});

afterAll(async () => {
  await ctx.cleanup();
});

// ============================================================================
// Prompts Integration Tests
// ============================================================================

describe('prompts/list', () => {
  it('lists all 4 prompt templates', async () => {
    const result = await ctx.client.listPrompts();
    expect(result.prompts.length).toBe(4);
  });

  it('each prompt has name and description', async () => {
    const result = await ctx.client.listPrompts();
    for (const prompt of result.prompts) {
      expect(typeof prompt.name).toBe('string');
      expect(prompt.name.length).toBeGreaterThan(0);
      expect(typeof prompt.description).toBe('string');
    }
  });

  it('includes all expected prompt names', async () => {
    const result = await ctx.client.listPrompts();
    const names = result.prompts.map((p) => p.name);
    expect(names).toContain('orchestrate-task');
    expect(names).toContain('security-review');
    expect(names).toContain('code-review');
    expect(names).toContain('research-survey');
  });
});

describe('prompts/get', () => {
  it('returns messages for orchestrate-task', async () => {
    const result = await ctx.client.getPrompt({
      name: 'orchestrate-task',
      arguments: { task: 'review the codebase' },
    });
    expect(result.messages.length).toBe(2);
    expect(result.messages[0]!.role).toBe('user');
  });

  it('returns messages for security-review', async () => {
    const result = await ctx.client.getPrompt({
      name: 'security-review',
      arguments: { target: 'src/auth/' },
    });
    expect(result.messages.length).toBe(2);
    const lastMessage = result.messages[1]!;
    expect(lastMessage.role).toBe('user');
    const content = lastMessage.content as { type: string; text: string };
    expect(content.text).toContain('src/auth/');
  });

  it('returns messages for code-review', async () => {
    const result = await ctx.client.getPrompt({
      name: 'code-review',
      arguments: { target: 'PR #99' },
    });
    expect(result.messages.length).toBe(2);
  });

  it('returns messages for research-survey with optional maxResults', async () => {
    const result = await ctx.client.getPrompt({
      name: 'research-survey',
      arguments: { topic: 'consensus algorithms', maxResults: '10' },
    });
    expect(result.messages.length).toBe(2);
  });
});

// ============================================================================
// Resource content helper — narrows the text|blob union
// ============================================================================

/** Extract text content from a resource read result entry. */
function getResourceText(content: { uri: string; text?: string; blob?: string }): string {
  if ('text' in content && typeof content.text === 'string') return content.text;
  throw new Error('Expected text resource content, got blob');
}

// ============================================================================
// Resources Integration Tests
// ============================================================================

describe('resources/list', () => {
  it('lists at least 3 resources', async () => {
    const result = await ctx.client.listResources();
    expect(result.resources.length).toBeGreaterThanOrEqual(3);
  });

  it('each resource has uri and name', async () => {
    const result = await ctx.client.listResources();
    for (const resource of result.resources) {
      expect(typeof resource.uri).toBe('string');
      expect(typeof resource.name).toBe('string');
    }
  });

  it('includes models resource', async () => {
    const result = await ctx.client.listResources();
    const uris = result.resources.map((r) => r.uri);
    expect(uris).toContain('nexus://models');
  });

  it('includes experts resource', async () => {
    const result = await ctx.client.listResources();
    const uris = result.resources.map((r) => r.uri);
    expect(uris).toContain('nexus://experts');
  });

  it('includes research resource', async () => {
    const result = await ctx.client.listResources();
    const uris = result.resources.map((r) => r.uri);
    expect(uris).toContain('nexus://research/papers');
  });
});

describe('resources/read - models', () => {
  it('returns valid JSON with model data', async () => {
    const result = await ctx.client.readResource({ uri: 'nexus://models' });
    expect(result.contents.length).toBe(1);
    expect(result.contents[0]!.mimeType).toBe('application/json');

    const data = JSON.parse(getResourceText(result.contents[0]!)) as {
      version: number;
      modelCount: number;
      models: Array<{ id: string; provider: string }>;
    };
    expect(data.version).toBe(3);
    expect(data.modelCount).toBeGreaterThanOrEqual(13);
    expect(data.models.length).toBe(data.modelCount);
  });

  it('includes expected model fields', async () => {
    const result = await ctx.client.readResource({ uri: 'nexus://models' });
    const data = JSON.parse(getResourceText(result.contents[0]!)) as {
      models: Array<Record<string, unknown>>;
    };
    const firstModel = data.models[0]!;
    expect(firstModel).toHaveProperty('id');
    expect(firstModel).toHaveProperty('displayName');
    expect(firstModel).toHaveProperty('provider');
    expect(firstModel).toHaveProperty('contextWindow');
    expect(firstModel).toHaveProperty('pricing');
    expect(firstModel).toHaveProperty('qualityScores');
    expect(firstModel).toHaveProperty('cliName');
  });
});

describe('resources/read - experts', () => {
  it('returns valid JSON with expert data', async () => {
    const result = await ctx.client.readResource({ uri: 'nexus://experts' });
    expect(result.contents.length).toBe(1);

    const data = JSON.parse(getResourceText(result.contents[0]!)) as {
      expertCount: number;
      experts: Array<{ role: string; name: string }>;
    };
    expect(data.expertCount).toBe(EXPERT_COUNT);
    expect(data.experts.length).toBe(EXPERT_COUNT);
  });

  it('includes expected expert roles', async () => {
    const result = await ctx.client.readResource({ uri: 'nexus://experts' });
    const data = JSON.parse(getResourceText(result.contents[0]!)) as {
      experts: Array<{ role: string }>;
    };
    const roles = data.experts.map((e) => e.role);
    expect(roles).toContain('code_expert');
    expect(roles).toContain('security_expert');
    expect(roles).toContain('architecture_expert');
  });
});

describe('resources/read - research', () => {
  it('returns valid JSON (gracefully handles missing registry)', async () => {
    const result = await ctx.client.readResource({ uri: 'nexus://research/papers' });
    expect(result.contents.length).toBe(1);
    expect(result.contents[0]!.mimeType).toBe('application/json');

    const data = JSON.parse(getResourceText(result.contents[0]!)) as Record<string, unknown>;
    // Should have papers array (may be empty if registry not found)
    expect(data).toHaveProperty('papers');
    expect(Array.isArray(data['papers'])).toBe(true);
  });
});
