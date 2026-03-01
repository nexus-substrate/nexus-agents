/**
 * nexus-agents/mcp - Prompt Registration
 *
 * Registers all MCP prompt templates on the server.
 * Each prompt is defined declaratively in prompt-definitions.ts
 * and wired here via `server.registerPrompt()`.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

import type { ILogger } from '../../core/index.js';

import { PROMPT_DEFINITIONS, type PromptDefinition } from './prompt-definitions.js';

export {
  PROMPT_DEFINITIONS,
  type PromptDefinition,
  type PromptMessage,
} from './prompt-definitions.js';

/**
 * Result of prompt registration.
 */
export interface PromptRegistrationResult {
  /** Names of registered prompts */
  readonly prompts: readonly string[];
}

/**
 * Registers all prompt templates on the MCP server.
 *
 * Iterates `PROMPT_DEFINITIONS` and calls `server.registerPrompt()` for each.
 * The SDK handles argument validation via the Zod schemas defined in each prompt.
 *
 * @param server - The MCP server instance
 * @param logger - Logger for registration events
 * @returns The list of registered prompt names
 */
export function registerPrompts(server: McpServer, logger: ILogger): PromptRegistrationResult {
  const registered: string[] = [];

  for (const definition of PROMPT_DEFINITIONS) {
    registerSinglePrompt(server, definition, logger);
    registered.push(definition.name);
  }

  logger.info('Prompt templates registered', {
    count: registered.length,
    prompts: registered,
  });

  return { prompts: registered };
}

/**
 * Registers a single prompt definition on the server.
 */
function registerSinglePrompt(
  server: McpServer,
  definition: PromptDefinition,
  logger: ILogger
): void {
  server.registerPrompt(
    definition.name,
    {
      description: definition.description,
      argsSchema: definition.argsSchema,
    },
    (args: Record<string, string | undefined>): GetPromptResult => {
      logger.debug('Prompt requested', { prompt: definition.name });

      const messages = definition.buildMessages(args);

      return {
        description: definition.description,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      };
    }
  );
}
