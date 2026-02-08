/**
 * nexus-agents/cli-adapters - Codex MCP Adapter
 *
 * MCP-based adapter for Codex CLI using MCP server mode.
 * This is the preferred transport for Codex integration.
 *
 * (Source: cli-project_plan.md v2.1.0, Issue #90)
 * (Source: docs/research/cli-integration-architecture.md)
 *
 * SECURITY NOTE (shell: true in getVersion):
 * Uses shell: true only for version check command.
 * This is acceptable because the command and args are hardcoded constants.
 * See codex-adapter.ts for detailed security rationale.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  ICliAdapter,
  CliName,
  CliTransport,
  CliTask,
  CliResponse,
  CliError,
  HealthStatus,
  CapacityStatus,
  ModelInfo,
  CapabilityProfile,
  ExecutionOptions,
} from '../types.js';
import { DEFAULT_CAPABILITIES } from '../types.js';
import type { Result } from '../../core/index.js';
import { ok, err, getTimeProvider } from '../../core/index.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import {
  DEFAULT_CODEX_MCP_OPTIONS,
  type McpToolResult,
  getModelDisplayName,
  getContextWindow,
  getMaxOutput,
  getCostPerMillionInput,
  getCostPerMillionOutput,
  extractTextFromContent,
  createCliError,
  delay,
  createTimeout,
  determineErrorCode,
  parseVersionFromOutput,
} from './codex-mcp-adapter-helpers.js';
import { CapacityTracker, createCapacityTracker } from '../capacity-tracker.js';
import { getDefaultModelForCli, getCliModelName } from '../../config/model-config-helpers.js';

/**
 * Codex CLI adapter using MCP transport.
 *
 * This adapter spawns Codex as an MCP server and communicates
 * using the MCP protocol for more stable integration.
 */
export class CodexMcpAdapter implements ICliAdapter {
  readonly name: CliName = 'codex';
  readonly transport: CliTransport = 'mcp';

  private readonly logger: ILogger;
  private readonly model: string;
  private client: Client | undefined;
  private mcpTransport: StdioClientTransport | undefined;
  private connected = false;
  private cachedVersion: string | undefined;
  private capacityTracker: CapacityTracker | null = null;

  constructor(options?: { model?: string; logger?: ILogger }) {
    this.logger = options?.logger ?? createLogger({ component: 'codex-mcp-adapter' });
    this.model = options?.model ?? getCliModelName(getDefaultModelForCli('codex'));
  }

  /**
   * Gets the capability profile for Codex.
   */
  get capabilities(): CapabilityProfile {
    return DEFAULT_CAPABILITIES.codex;
  }

  /**
   * Gets Codex model information.
   */
  getModelInfo(): ModelInfo {
    return {
      id: this.model,
      name: getModelDisplayName(this.model),
      contextWindow: getContextWindow(this.model),
      maxOutput: getMaxOutput(this.model),
      costPerMillionInput: getCostPerMillionInput(this.model),
      costPerMillionOutput: getCostPerMillionOutput(this.model),
    };
  }

  /**
   * Initializes the MCP connection to Codex.
   */
  async initialize(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.capacityTracker = createCapacityTracker(this.name);
    this.logger.debug('Initializing Codex MCP connection');

    try {
      // Create transport that spawns Codex as MCP server
      this.mcpTransport = new StdioClientTransport({
        command: 'codex',
        args: ['mcp-server'],
        stderr: 'pipe',
      });

      // Create MCP client
      this.client = new Client({ name: 'nexus-agents', version: '2.0.0' }, { capabilities: {} });

      // Connect to the transport
      await this.client.connect(this.mcpTransport);
      this.connected = true;

      this.logger.info('Codex MCP connection established');
    } catch (error) {
      this.connected = false;
      const connectionError = error instanceof Error ? error : new Error('Connection failed');
      this.logger.error('Failed to initialize Codex MCP connection', connectionError);
      throw error;
    }
  }

  /**
   * Handles successful execution result - records usage and logs.
   */
  private handleSuccess(result: Result<CliResponse, CliError>, attempt: number): void {
    if (!result.ok) return;
    this.capacityTracker?.recordUsage(result.value.usage);
    this.logger.info('Task executed successfully via MCP', {
      cli: this.name,
      attempt,
      durationMs: result.value.durationMs,
      tokensUsed: result.value.usage?.totalTokens,
    });
  }

  /**
   * Handles failed execution result - logs warning.
   */
  private handleFailure(result: Result<CliResponse, CliError>, attempt: number): void {
    if (result.ok) return;
    this.logger.warn('Task execution failed', {
      cli: this.name,
      attempt,
      error: result.error.message,
      retryable: result.error.retryable,
    });
  }

  /**
   * Executes a task on Codex via MCP.
   */
  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    const opts = { ...DEFAULT_CODEX_MCP_OPTIONS, ...options };

    if (!this.connected || this.client === undefined) {
      await this.initialize();
    }

    this.logger.debug('Executing task on Codex via MCP', {
      contentLength: task.content.length,
      model: task.model ?? this.model,
    });

    let lastError: CliError | undefined;
    const maxAttempts = opts.allowRetry ? opts.maxRetries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.executeViaClient(task, opts);

      if (result.ok) {
        this.handleSuccess(result, attempt);
        return result;
      }

      lastError = result.error;
      const isTerminal = !result.error.retryable || attempt === maxAttempts;

      if (isTerminal) {
        this.handleFailure(result, attempt);
        return result;
      }

      this.logger.debug('Retrying task execution', { cli: this.name, attempt });
      await delay(Math.pow(2, attempt) * 1000);
    }

    return err(lastError ?? createCliError('UNKNOWN', 'Unknown error', this.name));
  }

  /**
   * Executes task via MCP client.
   */
  private async executeViaClient(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    const startTime = getTimeProvider().now();

    if (this.client === undefined) {
      return err(createCliError('CONNECTION_ERROR', 'MCP client not initialized', this.name));
    }

    try {
      const result = await Promise.race([
        this.callCodexTool(task),
        createTimeout(options.timeoutMs),
      ]);

      if (result === null) {
        return err(createCliError('TIMEOUT', 'Execution timed out', this.name));
      }

      return this.parseToolResult(result, startTime);
    } catch (error) {
      return this.handleExecutionError(error);
    }
  }

  /**
   * Calls the codex or codex-reply tool on Codex MCP server.
   *
   * The Codex MCP server exposes two tools:
   * - `codex` - Initiates a new session
   * - `codex-reply` - Continues an existing session using threadId
   *
   * @see https://developers.openai.com/codex/mcp/
   */
  private async callCodexTool(task: CliTask): Promise<McpToolResult> {
    if (this.client === undefined) {
      throw new Error('Client not initialized');
    }

    // Use codex-reply for session continuation, codex for new sessions
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
      return err(
        createCliError('EXECUTION_ERROR', errorText ?? 'Tool execution failed', this.name)
      );
    }

    const text = extractTextFromContent(result.content);
    if (text === null) {
      return err(createCliError('PARSE_ERROR', 'No text content in response', this.name));
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
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = determineErrorCode(message);

    if (errorCode === 'CONNECTION_ERROR') {
      this.connected = false;
    }

    return err(createCliError(errorCode, message, this.name, error as Error));
  }

  /**
   * Performs a health check.
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Try to initialize if not connected
      if (!this.connected) {
        await this.initialize();
      }

      const version = await this.getVersion();

      return {
        healthy: true,
        version,
        versionStatus: 'supported',
        lastChecked: new Date(getTimeProvider().now()),
      };
    } catch (error) {
      return {
        healthy: false,
        version: 'unknown',
        versionStatus: 'unsupported',
        message: error instanceof Error ? error.message : 'Health check failed',
        lastChecked: new Date(getTimeProvider().now()),
      };
    }
  }

  /**
   * Gets CLI version.
   */
  async getVersion(): Promise<string> {
    if (this.cachedVersion !== undefined && this.cachedVersion !== '') {
      return this.cachedVersion;
    }

    // Use subprocess to get version (quick check)
    const { spawn } = await import('node:child_process');

    return new Promise((resolve, reject) => {
      const childProcess = spawn('codex', ['--version'], {
        shell: true,
        timeout: 10_000,
      });

      let stdout = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('Failed to get codex version'));
          return;
        }

        const version = parseVersionFromOutput(stdout);
        this.cachedVersion = version;
        resolve(version);
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Gets current capacity status based on tracked usage.
   * @see Issue #456 - Real API rate limit tracking
   */
  getCapacity(): Promise<CapacityStatus> {
    if (this.capacityTracker === null) {
      return Promise.resolve({
        remainingTokens: Number.MAX_SAFE_INTEGER,
        remainingRequests: Number.MAX_SAFE_INTEGER,
        resetTime: new Date(getTimeProvider().now() + 3600_000),
        utilizationPercent: 0,
        exhausted: false,
      });
    }
    return Promise.resolve(this.capacityTracker.getCapacity());
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
  }
}
