/**
 * Tests for Annotation Proxy
 *
 * @module mcp/tools/annotation-proxy.test
 * (Source: Issue #993 — Document MCP tool side effects in schema metadata)
 */

import { describe, it, expect, vi } from 'vitest';
import { createAnnotationsProxy } from './annotation-proxy.js';

/** Minimal mock McpServer with registerTool spy. */
function createMockServer(): {
  registerTool: ReturnType<typeof vi.fn>;
} {
  return {
    registerTool: vi.fn(),
  };
}

describe('createAnnotationsProxy', () => {
  it('injects annotations for known tools', () => {
    const mock = createMockServer();
    const proxy = createAnnotationsProxy(mock as never);

    const config = { description: 'test', inputSchema: {} };
    const handler = vi.fn();
    proxy.registerTool('list_experts', config as never, handler as never);

    expect(mock.registerTool).toHaveBeenCalledOnce();
    const [name, enrichedConfig] = mock.registerTool.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe('list_experts');
    expect(enrichedConfig['annotations']).toBeDefined();
    const annotations = enrichedConfig['annotations'] as Record<string, unknown>;
    expect(annotations['readOnlyHint']).toBe(true);
    expect(annotations['idempotentHint']).toBe(true);
  });

  it('does not override existing annotations', () => {
    const mock = createMockServer();
    const proxy = createAnnotationsProxy(mock as never);

    const customAnnotations = { readOnlyHint: false, title: 'Custom' };
    const config = { description: 'test', inputSchema: {}, annotations: customAnnotations };
    const handler = vi.fn();
    proxy.registerTool('list_experts', config as never, handler as never);

    const [, enrichedConfig] = mock.registerTool.mock.calls[0] as [string, Record<string, unknown>];
    expect(enrichedConfig['annotations']).toBe(customAnnotations);
  });

  it('passes through config unchanged for unknown tools', () => {
    const mock = createMockServer();
    const proxy = createAnnotationsProxy(mock as never);

    const config = { description: 'test', inputSchema: {} };
    const handler = vi.fn();
    proxy.registerTool('unknown_tool', config as never, handler as never);

    const [, passedConfig] = mock.registerTool.mock.calls[0] as [string, Record<string, unknown>];
    expect(passedConfig['annotations']).toBeUndefined();
  });

  it('preserves other server methods', () => {
    const mock = createMockServer();

    (mock as Record<string, unknown>)['connect'] = vi.fn();
    const proxy = createAnnotationsProxy(mock as never);
    expect(typeof (proxy as unknown as Record<string, unknown>)['connect']).toBe('function');
  });
});
