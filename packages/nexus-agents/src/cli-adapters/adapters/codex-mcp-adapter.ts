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
import { ok, err } from '../../core/index.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';

/**
 * Default execution options for Codex MCP.
 */
const DEFAULT_OPTIONS: Required<ExecutionOptions> = {
  timeoutMs: 120_000, // 2 minutes
  allowRetry: true,
  maxRetries: 2,
  trackUsage: true,
};

/**
 * MCP tool call result structure.
 */
interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

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

  constructor(options?: { model?: string; logger?: ILogger }) {
    this.logger = options?.logger ?? createLogger({ component: 'codex-mcp-adapter' });
    this.model = options?.model ?? 'o3';
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
      name: this.getModelDisplayName(),
      contextWindow: 400_000,
      maxOutput: 100_000,
      costPerMillionInput: this.getCostPerMillionInput(),
      costPerMillionOutput: this.getCostPerMillionOutput(),
    };
  }

  /**
   * Initializes the MCP connection to Codex.
   */
  async initialize(): Promise<void> {
    if (this.connected) {
      return;
    }

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
   * Executes a task on Codex via MCP.
   */
  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

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
        this.logger.info('Task executed successfully via MCP', {
          cli: this.name,
          attempt,
          durationMs: result.value.durationMs,
        });
        return result;
      }

      lastError = result.error;

      if (!result.error.retryable || attempt === maxAttempts) {
        this.logger.warn('Task execution failed', {
          cli: this.name,
          attempt,
          error: result.error.message,
          retryable: result.error.retryable,
        });
        return result;
      }

      this.logger.debug('Retrying task execution', {
        cli: this.name,
        attempt,
        nextAttempt: attempt + 1,
      });

      await this.delay(Math.pow(2, attempt) * 1000);
    }

    return err(lastError ?? this.createError('UNKNOWN', 'Unknown error'));
  }

  /**
   * Executes task via MCP client.
   */
  private async executeViaClient(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    const startTime = Date.now();

    if (this.client === undefined) {
      return err(this.createError('CONNECTION_ERROR', 'MCP client not initialized'));
    }

    try {
      const result = await Promise.race([
        this.callExecuteTool(task),
        this.createTimeout(options.timeoutMs),
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
   * Calls the execute tool on Codex MCP server.
   */
  private async callExecuteTool(task: CliTask): Promise<McpToolResult> {
    if (this.client === undefined) {
      throw new Error('Client not initialized');
    }

    const result = await this.client.callTool({
      name: 'execute',
      arguments: {
        prompt: task.content,
        ...(task.model !== undefined && { model: task.model }),
        ...(task.systemPrompt !== undefined && { system: task.systemPrompt }),
        ...(task.maxTokens !== undefined && { max_tokens: task.maxTokens }),
      },
    });

    return result as McpToolResult;
  }

  /**
   * Creates a timeout promise.
   */
  private createTimeout(ms: number): Promise<null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, ms);
    });
  }

  /**
   * Parses MCP tool result to CLI response.
   */
  private parseToolResult(result: McpToolResult, startTime: number): Result<CliResponse, CliError> {
    if (result.isError === true) {
      const errorText = this.extractTextFromContent(result.content);
      return err(this.createError('EXECUTION_ERROR', errorText ?? 'Tool execution failed'));
    }

    const text = this.extractTextFromContent(result.content);
    if (text === null) {
      return err(this.createError('PARSE_ERROR', 'No text content in response'));
    }

    return ok({
      text,
      durationMs: Date.now() - startTime,
      raw: result,
    });
  }

  /**
   * Extracts text from MCP content array.
   */
  private extractTextFromContent(content?: Array<{ type: string; text?: string }>): string | null {
    if (content === undefined || content.length === 0) {
      return null;
    }

    const textContents = content
      .filter((c) => c.type === 'text' && c.text !== undefined)
      .map((c) => c.text as string);

    return textContents.length > 0 ? textContents.join('\n') : null;
  }

  /**
   * Handles execution errors.
   */
  private handleExecutionError(error: unknown): Result<CliResponse, CliError> {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ENOENT') || message.includes('not found')) {
      return err(this.createError('NOT_FOUND', 'codex CLI not found', error as Error));
    }

    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return err(this.createError('TIMEOUT', 'Execution timed out', error as Error));
    }

    if (message.includes('connection') || message.includes('disconnect')) {
      this.connected = false;
      return err(this.createError('CONNECTION_ERROR', message, error as Error));
    }

    return err(this.createError('EXECUTION_ERROR', message, error as Error));
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
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        version: 'unknown',
        versionStatus: 'unsupported',
        message: error instanceof Error ? error.message : 'Health check failed',
        lastChecked: new Date(),
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

        const match = /(\d+\.\d+\.\d+)/.exec(stdout.trim());
        const version = match?.[1] ?? '0.0.0';
        this.cachedVersion = version;
        resolve(version);
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Gets current capacity status.
   */
  getCapacity(): Promise<CapacityStatus> {
    // Capacity tracking requires API integration
    // For now, return high availability
    return Promise.resolve({
      remainingTokens: Number.MAX_SAFE_INTEGER,
      remainingRequests: Number.MAX_SAFE_INTEGER,
      resetTime: new Date(Date.now() + 3600_000),
      utilizationPercent: 0,
      exhausted: false,
    });
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

  /**
   * Gets model display name.
   */
  private getModelDisplayName(): string {
    const displayNames: Record<string, string> = {
      o3: 'O3',
      'o3-mini': 'O3 Mini',
      'o4-mini': 'O4 Mini',
    };

    return displayNames[this.model] ?? this.model;
  }

  /**
   * Gets cost per million input tokens.
   */
  private getCostPerMillionInput(): number {
    const costs: Record<string, number> = {
      o3: 10.0,
      'o3-mini': 1.1,
      'o4-mini': 1.1,
    };

    return costs[this.model] ?? 1.1;
  }

  /**
   * Gets cost per million output tokens.
   */
  private getCostPerMillionOutput(): number {
    const costs: Record<string, number> = {
      o3: 40.0,
      'o3-mini': 4.4,
      'o4-mini': 4.4,
    };

    return costs[this.model] ?? 4.4;
  }

  /**
   * Creates a CLI error.
   */
  private createError(code: CliError['code'], message: string, cause?: Error): CliError {
    const retryable = ['RATE_LIMITED', 'TIMEOUT', 'CONNECTION_ERROR'].includes(code);

    return {
      code,
      message,
      cli: this.name,
      retryable,
      ...(cause !== undefined && { cause }),
    };
  }

  /**
   * Delays for the specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
