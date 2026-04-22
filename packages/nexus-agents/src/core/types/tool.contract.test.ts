/**
 * Contract tests for core/types/tool.ts (#2157).
 *
 * These tests lock in the public shape of the Tool type system. Every MCP
 * tool and every orchestration path depends on these types — a rename or
 * field removal would ripple silently at the type level and only surface
 * at runtime when a specific branch is hit.
 *
 * What this file verifies:
 *
 * - `ToolContentBlock` discriminated union — all three variants construct
 *   cleanly and TS narrows on the `type` field
 * - `ToolResult` required vs optional fields (content required, isError and
 *   structuredContent optional)
 * - `ToolError` class — extends Error, preserves name/message/toolName/input
 * - `ToolInfo` structural shape (all three fields required)
 *
 * The "type-level" tests use `satisfies` to get the compiler to enforce the
 * contract. If a field is renamed or removed, the `satisfies` fails at
 * build time — that's the whole point.
 */

import { describe, it, expect } from 'vitest';
import type { ToolContentBlock, ToolResult, ToolInfo } from './tool.js';
import { ToolError } from './tool.js';

describe('ToolContentBlock discriminated union (#2157)', () => {
  it('accepts text variant', () => {
    const block = { type: 'text', text: 'hello' } satisfies ToolContentBlock;
    expect(block.type).toBe('text');
    // Compile-time narrow: in the text branch, .text must be string.
    if (block.type === 'text') {
      expect(typeof block.text).toBe('string');
    }
  });

  it('accepts image variant with data + mimeType', () => {
    const block = {
      type: 'image',
      data: 'base64data',
      mimeType: 'image/png',
    } satisfies ToolContentBlock;
    expect(block.type).toBe('image');
    if (block.type === 'image') {
      expect(block.data).toBe('base64data');
      expect(block.mimeType).toBe('image/png');
    }
  });

  it('accepts resource variant with only uri', () => {
    // mimeType and text are optional in the resource variant.
    const block = { type: 'resource', uri: 'file:///x.txt' } satisfies ToolContentBlock;
    expect(block.type).toBe('resource');
    if (block.type === 'resource') {
      expect(block.uri).toBe('file:///x.txt');
    }
  });

  it('accepts resource variant with all optional fields', () => {
    const block = {
      type: 'resource',
      uri: 'file:///x.txt',
      mimeType: 'text/plain',
      text: 'inline content',
    } satisfies ToolContentBlock;
    expect(block.type).toBe('resource');
    if (block.type === 'resource') {
      expect(block.mimeType).toBe('text/plain');
      expect(block.text).toBe('inline content');
    }
  });

  it('narrows cleanly on discriminant at runtime', () => {
    // Exercises the narrow with an unknown block — ensures consumers can
    // rely on `block.type` for branch dispatch.
    const blocks: ToolContentBlock[] = [
      { type: 'text', text: 'a' },
      { type: 'image', data: 'b', mimeType: 'image/jpeg' },
      { type: 'resource', uri: 'c' },
    ];
    const seen = new Set<string>();
    for (const b of blocks) {
      switch (b.type) {
        case 'text':
          seen.add(`text:${b.text}`);
          break;
        case 'image':
          seen.add(`image:${b.mimeType}`);
          break;
        case 'resource':
          seen.add(`resource:${b.uri}`);
          break;
      }
    }
    expect(seen.size).toBe(3);
  });
});

describe('ToolResult shape (#2157)', () => {
  it('requires content array', () => {
    const result: ToolResult = { content: [] };
    expect(result.content).toEqual([]);
  });

  it('accepts optional isError flag', () => {
    const errorResult: ToolResult = {
      content: [{ type: 'text', text: 'boom' }],
      isError: true,
    };
    expect(errorResult.isError).toBe(true);
  });

  it('accepts optional structuredContent for JSON responses', () => {
    const result: ToolResult = {
      content: [{ type: 'text', text: '{"ok":true}' }],
      structuredContent: { ok: true },
    };
    expect(result.structuredContent).toEqual({ ok: true });
  });

  it('permits isError to be absent (undefined ≠ false explicitly)', () => {
    const result: ToolResult = { content: [] };
    expect(result.isError).toBeUndefined();
  });
});

describe('ToolError class (#2157)', () => {
  it('extends Error with the expected fields', () => {
    const err = new ToolError('nope', 'my_tool', { bad: 'input' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ToolError);
  });

  it('sets .name to "ToolError" for instanceof-free discrimination', () => {
    const err = new ToolError('x', 'y');
    expect(err.name).toBe('ToolError');
  });

  it('preserves the passed message on .message', () => {
    const err = new ToolError('something failed', 'tool');
    expect(err.message).toBe('something failed');
  });

  it('exposes toolName as a readonly field', () => {
    const err = new ToolError('x', 'create_expert');
    expect(err.toolName).toBe('create_expert');
  });

  it('records the offending input (optional)', () => {
    const input = { query: 'sql injection' };
    const err = new ToolError('blocked', 'sql_tool', input);
    expect(err.input).toEqual(input);
  });

  it('allows omitting input (it is optional)', () => {
    const err = new ToolError('x', 'y');
    expect(err.input).toBeUndefined();
  });
});

describe('ToolInfo shape (#2157)', () => {
  it('requires all three fields (name, description, inputSchema)', () => {
    const info: ToolInfo = {
      name: 'my_tool',
      description: 'does things',
      inputSchema: { type: 'object' },
    };
    expect(info.name).toBe('my_tool');
    expect(info.description).toBe('does things');
    expect(info.inputSchema).toEqual({ type: 'object' });
  });

  it('inputSchema is a plain record, not a specific shape', () => {
    // The type is `Record<string, unknown>` — any JSON-Schema-shaped object
    // must be assignable. This locks the field as a public JSON Schema
    // surface, not a Zod value.
    const info: ToolInfo = {
      name: 't',
      description: 'd',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
    };
    expect(info.inputSchema['type']).toBe('object');
  });
});
