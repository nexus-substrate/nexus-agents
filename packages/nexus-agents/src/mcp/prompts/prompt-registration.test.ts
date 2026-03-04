/**
 * Tests for MCP prompt registration wiring.
 *
 * Verifies that registerPrompts() correctly wires all prompt definitions
 * to the MCP server and that callbacks produce valid GetPromptResult payloads.
 * (Source: Issue #1377)
 */

import { describe, it, expect, vi } from 'vitest';
import { registerPrompts } from './index.js';
import { PROMPT_DEFINITIONS } from './prompt-definitions.js';

describe('registerPrompts', () => {
  function createMockServer(): {
    registerPrompt: ReturnType<typeof vi.fn>;
  } {
    return { registerPrompt: vi.fn() };
  }

  function createMockLogger(): {
    info: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  } {
    return {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  it('registers all prompt definitions on the server', () => {
    const server = createMockServer();
    const logger = createMockLogger();

    const result = registerPrompts(server as never, logger as never);

    expect(server.registerPrompt).toHaveBeenCalledTimes(PROMPT_DEFINITIONS.length);
    expect(result.prompts).toHaveLength(PROMPT_DEFINITIONS.length);
  });

  it('returns registered prompt names', () => {
    const server = createMockServer();
    const logger = createMockLogger();

    const result = registerPrompts(server as never, logger as never);

    for (const definition of PROMPT_DEFINITIONS) {
      expect(result.prompts).toContain(definition.name);
    }
  });

  it('registers each prompt with correct name and description', () => {
    const server = createMockServer();
    const logger = createMockLogger();

    registerPrompts(server as never, logger as never);

    for (let i = 0; i < PROMPT_DEFINITIONS.length; i++) {
      const definition = PROMPT_DEFINITIONS[i];
      if (definition === undefined) continue;
      const call = server.registerPrompt.mock.calls[i] as unknown[];
      expect(call[0]).toBe(definition.name);
      expect(call[1]).toEqual(expect.objectContaining({ description: definition.description }));
    }
  });

  it('prompt callbacks return valid GetPromptResult', () => {
    const server = createMockServer();
    const logger = createMockLogger();

    registerPrompts(server as never, logger as never);

    for (let i = 0; i < server.registerPrompt.mock.calls.length; i++) {
      const call = server.registerPrompt.mock.calls[i] as unknown[];
      const callback = call[2] as (args: Record<string, string>) => {
        description: string;
        messages: Array<{ role: string; content: unknown }>;
      };

      // Call with empty args — all prompts should handle missing args gracefully
      const result = callback({});

      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('messages');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);

      // Verify message structure
      for (const msg of result.messages) {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        expect(['user', 'assistant']).toContain(msg.role);
      }
    }
  });

  it('logs registration count', () => {
    const server = createMockServer();
    const logger = createMockLogger();

    registerPrompts(server as never, logger as never);

    expect(logger.info).toHaveBeenCalledWith(
      'Prompt templates registered',
      expect.objectContaining({ count: PROMPT_DEFINITIONS.length })
    );
  });
});
