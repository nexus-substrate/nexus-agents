/** Provider previews reach both actual MCP representations (#7435). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { McpServer } from '../sdk-types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerResearchDiscoverTool } from './research-discover.js';
import { RateLimiter } from '../middleware/rate-limiter.js';

// Keep credential acquisition controlled alongside HTTP; the provider/parser is real.
vi.mock('../../scm/token-resolver.js', () => ({
  resolveToken: vi.fn().mockResolvedValue({ ok: false, error: { message: 'No fixture token' } }),
}));

const ItemSchema = z.object({
  source: z.string(),
  title: z.string(),
  url: z.string(),
  description: z.string(),
  relevanceScore: z.number(),
});
const ResponseSchema = z.object({
  items: z.array(ItemSchema),
  totalFound: z.number(),
  newItems: z.number(),
  filteredByRelevance: z.number(),
});
const ToolReplySchema = z.object({
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
  structuredContent: z.unknown(),
  isError: z.boolean().optional(),
});

describe('research discovery preview over SDK transport (#7435)', () => {
  let server: McpServer;
  let client: Client;
  const fetchFixture = vi.fn();

  beforeEach(async () => {
    fetchFixture.mockReset();
    vi.stubGlobal('fetch', fetchFixture);
    server = new McpServer({ name: 'research-preview-server', version: '1.0.0' });
    client = new Client({ name: 'research-preview-client', version: '1.0.0' });
    registerResearchDiscoverTool(server, {
      rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100 }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    try {
      await Promise.all([client.close(), server.close()]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  function repositoryResponse(description: string): void {
    fetchFixture.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              full_name: 'fixture/research-preview-7435',
              html_url: 'https://github.com/fixture/research-preview-7435',
              description,
            },
          ],
        }),
        { status: 200 }
      )
    );
  }

  async function discover(relevanceThreshold: number): Promise<z.infer<typeof ResponseSchema>> {
    const result = ToolReplySchema.parse(
      await client.callTool({
        name: 'research_discover',
        arguments: { topic: 'routing', source: 'github', maxResults: 1, relevanceThreshold },
      })
    );
    expect(result.isError).not.toBe(true);
    const text = result.content.find((item) => item.type === 'text');
    if (text?.type !== 'text') throw new Error('Actual MCP text response missing');
    const decoded: unknown = JSON.parse(text.text);
    expect(decoded).toEqual(result.structuredContent);
    return ResponseSchema.parse(decoded);
  }

  it('returns the marked provider preview in text and structured content', async () => {
    repositoryResponse('a'.repeat(241_979));

    const result = await discover(0);

    expect(result.items).toEqual([
      {
        source: 'github',
        title: 'fixture/research-preview-7435',
        url: 'https://github.com/fixture/research-preview-7435',
        description: `${'a'.repeat(197)}...`,
        relevanceScore: 0,
      },
    ]);
    expect(result.totalFound).toBe(1);
    expect(result.newItems).toBe(1);
  });

  it('scores the preview without counting a keyword beyond its bound', async () => {
    repositoryResponse(`${'a'.repeat(210)} routing`);

    const result = await discover(0.35);

    expect(result.items).toEqual([]);
    expect(result.totalFound).toBe(1);
    expect(result.newItems).toBe(0);
    expect(result.filteredByRelevance).toBe(1);
  });

  it('keeps an in-preview match and its existing relevance formula', async () => {
    repositoryResponse('routing notes');

    const result = await discover(0.35);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.description).toBe('routing notes');
    expect(result.items[0]?.relevanceScore).toBe(0.8);
  });
});
