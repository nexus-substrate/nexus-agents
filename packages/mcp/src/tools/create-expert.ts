/**
 * @nexus-agents/mcp - Create Expert Tool
 *
 * MCP tool for creating expert agents dynamically.
 * Supports built-in expert types: code, architecture, security, documentation, testing.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger, AgentCapability } from '@nexus-agents/core';
import {
  ExpertFactory,
  Expert,
  type BuiltInExpertType,
  BUILT_IN_EXPERTS,
} from '@nexus-agents/agents';

/**
 * Input schema for create_expert tool.
 */
export const CreateExpertInputSchema = z.object({
  role: z
    .enum([
      'code_expert',
      'architecture_expert',
      'security_expert',
      'documentation_expert',
      'testing_expert',
    ])
    .describe('Expert role to create'),
  modelPreference: z.string().optional().describe('Preferred model (e.g., claude-sonnet-4)'),
});

/**
 * Type for validated create expert input.
 */
export type CreateExpertInput = z.infer<typeof CreateExpertInputSchema>;

/**
 * Expert factory interface for dependency injection.
 */
export interface IExpertFactory {
  createBuiltIn(
    type: BuiltInExpertType,
    options?: { modelOverrides?: { modelId?: string } }
  ): { ok: true; value: Expert } | { ok: false; error: Error };
}

/**
 * Dependencies for create_expert tool.
 */
export interface CreateExpertDeps {
  /** Expert factory for creating experts */
  expertFactory: IExpertFactory;
  /** Registry to track created experts */
  expertRegistry: Map<string, Expert>;
  /** Optional logger */
  logger?: ILogger;
}

/**
 * Response from create_expert tool.
 */
export interface CreateExpertResponse {
  /** Unique expert ID */
  expertId: string;
  /** Expert role */
  role: string;
  /** List of capabilities */
  capabilities: readonly AgentCapability[];
  /** Expert status */
  status: 'ready';
}

/**
 * Maps role to built-in expert type.
 */
const ROLE_TO_EXPERT_TYPE: Record<string, BuiltInExpertType> = {
  code_expert: 'code',
  architecture_expert: 'architecture',
  security_expert: 'security',
  documentation_expert: 'documentation',
  testing_expert: 'testing',
};

/**
 * Validates the role and returns the corresponding expert type.
 */
function getExpertType(role: string): BuiltInExpertType | undefined {
  return ROLE_TO_EXPERT_TYPE[role];
}

/**
 * Builds the create expert response.
 */
function buildResponse(expert: Expert): CreateExpertResponse {
  return {
    expertId: expert.id,
    role: expert.role,
    capabilities: expert.capabilities,
    status: 'ready',
  };
}

/**
 * Creates an expert using the factory.
 */
function createExpertFromFactory(
  deps: CreateExpertDeps,
  expertType: BuiltInExpertType,
  modelPreference?: string
): { ok: true; value: Expert } | { ok: false; error: string } {
  const options =
    modelPreference !== undefined ? { modelOverrides: { modelId: modelPreference } } : undefined;

  const result = deps.expertFactory.createBuiltIn(expertType, options);

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  return { ok: true, value: result.value };
}

/**
 * Handles the create_expert tool execution.
 */
function handleCreateExpert(
  deps: CreateExpertDeps,
  args: CreateExpertInput
): { ok: true; value: CreateExpertResponse } | { ok: false; error: string } {
  const { role, modelPreference } = args;

  // Map role to expert type
  const expertType = getExpertType(role);
  if (expertType === undefined) {
    return { ok: false, error: `Invalid role: ${role}` };
  }

  // Create expert
  const createResult = createExpertFromFactory(deps, expertType, modelPreference);
  if (!createResult.ok) {
    return { ok: false, error: createResult.error };
  }

  const expert = createResult.value;

  // Track in registry
  deps.expertRegistry.set(expert.id, expert);

  // Log creation
  deps.logger?.info('Expert created', {
    expertId: expert.id,
    role: expert.role,
    capabilities: expert.capabilities,
  });

  return { ok: true, value: buildResponse(expert) };
}

/**
 * Registers the create_expert tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerCreateExpertTool(server: McpServer, deps: CreateExpertDeps): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Consistent with other tools in codebase
  server.tool(
    'create_expert',
    'Create a specialized expert agent for code, architecture, security, documentation, or testing tasks',
    {
      role: z
        .enum([
          'code_expert',
          'architecture_expert',
          'security_expert',
          'documentation_expert',
          'testing_expert',
        ])
        .describe('Expert role to create'),
      modelPreference: z.string().optional().describe('Preferred model (e.g., claude-sonnet-4)'),
    },
    (args) => {
      // Validate input
      const validationResult = CreateExpertInputSchema.safeParse(args);
      if (!validationResult.success) {
        const errorMessage = validationResult.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Validation error: ${errorMessage}` }],
        };
      }

      // Execute tool logic
      const result = handleCreateExpert(deps, validationResult.data);

      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to create expert: ${result.error}` }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.value, null, 2) }],
      };
    }
  );
}

/**
 * Creates default dependencies for the create_expert tool.
 *
 * @param logger - Optional logger instance
 * @returns CreateExpertDeps with default factory and empty registry
 */
export function createDefaultDeps(logger?: ILogger): CreateExpertDeps {
  const deps: CreateExpertDeps = {
    expertFactory: ExpertFactory,
    expertRegistry: new Map<string, Expert>(),
  };
  if (logger !== undefined) {
    deps.logger = logger;
  }
  return deps;
}

/**
 * Gets the list of available expert roles.
 */
export function getAvailableRoles(): string[] {
  return Object.keys(ROLE_TO_EXPERT_TYPE);
}

/**
 * Gets capabilities for a given expert role.
 */
export function getCapabilitiesForRole(role: string): readonly AgentCapability[] | undefined {
  const expertType = getExpertType(role);
  if (expertType === undefined) {
    return undefined;
  }
  return BUILT_IN_EXPERTS[expertType].capabilities;
}
