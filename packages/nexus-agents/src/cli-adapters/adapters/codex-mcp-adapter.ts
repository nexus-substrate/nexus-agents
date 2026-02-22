/**
 * nexus-agents/cli-adapters - Codex MCP Adapter
 *
 * MCP-based adapter for Codex CLI. Preferred transport for Codex integration.
 * Extends BaseCliAdapter to reuse retry logic, health checks, version
 * detection, and capacity tracking.
 *
 * (Source: Issue #1140 — Migrated to BaseCliAdapter base class)
 *
 * SECURITY: All spawn() calls use array-based args without shell interpolation.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  CliName,
  CliTransport,
  CliTask,
  CliResponse,
  CliError,
  ModelInfo,
  ExecutionOptions,
  BaseAdapterOptions,
} from '../types.js';
import type { Result } from '../../core/index.js';
import { getErrorMessage, ok, err, getTimeProvider, createLogger } from '../../core/index.js';
import { BaseCliAdapter } from '../base-adapter.js';

import {
  CODEX_LEGACY_DEFAULTS,
  type McpToolResult,
  extractTextFromContent,
  createTimeout,
  determineErrorCode,
} from './codex-mcp-adapter-helpers.js';
import {
  getDefaultModelForCli,
  getCliModelName,
  buildModelInfo,
} from '../../config/model-config-helpers.js';

/**
 * Codex CLI adapter using MCP transport.
 *
 * Extends BaseCliAdapter which provides:
 * - Retry logic with exponential backoff
 * - Health checks with version compatibility
 * - Capacity tracking
 * - Error creation helpers
 */
export class CodexMcpAdapter extends BaseCliAdapter {
  readonly name: CliName = 'codex';
  readonly transport: CliTransport = 'mcp';

  private readonly model: string;
  private client: Client | undefined;
  private mcpTransport: StdioClientTransport | undefined;
  private connected = false;

  constructor(options?: BaseAdapterOptions) {
    super(options?.logger ?? createLogger({ component: 'codex-mcp-adapter' }));
    this.model = options?.model ?? getCliModelName(getDefaultModelForCli('codex'));
  }

  /**
   * Gets Codex model information.
   * Resolves from canonical registry when possible, falls back to legacy lookup.
   */
  getModelInfo(): ModelInfo {
    const fromRegistry = buildModelInfo('codex', this.model);
    if (fromRegistry !== undefined) return fromRegistry;
    return {
      id: this.model,
      name: CODEX_LEGACY_DEFAULTS.displayNames[this.model] ?? this.model,
      contextWindow: CODEX_LEGACY_DEFAULTS.contextWindow,
      maxOutput: CODEX_LEGACY_DEFAULTS.maxOutput,
      costPerMillionInput:
        CODEX_LEGACY_DEFAULTS.inputCosts[this.model] ?? CODEX_LEGACY_DEFAULTS.inputCost,
      costPerMillionOutput:
        CODEX_LEGACY_DEFAULTS.outputCosts[this.model] ?? CODEX_LEGACY_DEFAULTS.outputCost,
    };
  }

  /**
   * Initializes the MCP connection to Codex.
   */
  async initialize(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.initCapacityTracker();
    this.logger.debug('Initializing Codex MCP connection');

    try {
      this.mcpTransport = new StdioClientTransport({
        command: 'codex',
        args: ['mcp-server'],
        stderr: 'pipe',
      });

      this.client = new Client({ name: 'nexus-agents', version: '2.0.0' }, { capabilities: {} });
      await this.client.connect(this.mcpTransport);
      this.connected = true;
      this.initialized = true;
      this.logger.info('Codex MCP connection established');
    } catch (error) {
      this.connected = false;
      const connectionError = error instanceof Error ? error : new Error('Connection failed');
      this.logger.error('Failed to initialize Codex MCP connection', connectionError);
      throw error;
    }
  }

  /**
   * Executes a task via MCP client.
   * Called by BaseCliAdapter.execute() with retry handling.
   */
  async executeTask(
    _task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    const startTime = getTimeProvider().now();

    if (this.client === undefined) {
      return err(this.createError('CONNECTION_ERROR', 'MCP client not initialized'));
    }

    try {
      const result = await Promise.race([
        this.callCodexTool(_task),
        createTimeout(options.timeoutMs),
      ]);

      if (result === null) {
        return err(this.createError('TIMEOUT', 'Execution timed out'));
      }

      return this.parseToolResult(result, startTime);
    } catch (error) {
      return this.handleExecutionError(error);
    }
  }

  /**
   * Calls the codex or codex-reply tool on Codex MCP server.
   * @see https://developers.openai.com/codex/mcp/
   */
  private async callCodexTool(task: CliTask): Promise<McpToolResult> {
    if (this.client === undefined) {
      throw new Error('Client not initialized');
    }

    const isReply = task.sessionId !== undefined && task.sessionId !== '';
    const toolName = isReply ? 'codex-reply' : 'codex';

    const baseArgs = {
      prompt: task.content,
      ...(task.model !== undefined && { model: task.model }),
    };

    const args = isReply
      ? { ...baseArgs, threadId: task.sessionId }
      : {
          ...baseArgs,
          sandbox: 'read-only' as const,
          'approval-policy': 'on-failure' as const,
        };

    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    });

    return result as McpToolResult;
  }

  /**
   * Parses MCP tool result to CLI response.
   */
  private parseToolResult(result: McpToolResult, startTime: number): Result<CliResponse, CliError> {
    if (result.isError === true) {
      const errorText = extractTextFromContent(result.content);
      return err(this.createError('EXECUTION_ERROR', errorText ?? 'Tool execution failed'));
    }

    const text = extractTextFromContent(result.content);
    if (text === null) {
      return err(this.createError('PARSE_ERROR', 'No text content in response'));
    }

    return ok({
      text,
      durationMs: getTimeProvider().now() - startTime,
      raw: result,
    });
  }

  /**
   * Handles execution errors.
   */
  private handleExecutionError(error: unknown): Result<CliResponse, CliError> {
    const message = getErrorMessage(error);
    const errorCode = determineErrorCode(message);

    if (errorCode === 'CONNECTION_ERROR') {
      this.connected = false;
    }

    return err(this.createError(errorCode, message, error as Error));
  }

  /**
   * Disposes the adapter and closes MCP connection.
   */
  async dispose(): Promise<void> {
    if (this.mcpTransport !== undefined) {
      this.logger.debug('Closing Codex MCP connection');
      await this.mcpTransport.close();
      this.mcpTransport = undefined;
    }
    this.client = undefined;
    this.connected = false;
    this.initialized = false;
  }
}
