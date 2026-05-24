/**
 * Upstream MCP Client Manager (#1498)
 *
 * Manages connections to external MCP servers via stdio transport.
 * Supports lazy connect, health checking, and graceful shutdown.
 * Reuses the StdioClientTransport/Client pattern from codex-mcp-adapter.
 *
 * @module mcp/gateway/upstream-client
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { UpstreamServerConfig } from '../../config/schemas-gateway.js';

/** Resolved environment variables (expanding {env:VAR} references). */
function resolveEnv(env: Record<string, string> | undefined): Record<string, string> {
  if (env === undefined) return {};
  const resolved: Record<string, string> = {};
  for (const [key, val] of Object.entries(env)) {
    const match = /^\{env:(\w+)\}$/.exec(val);
    if (match?.[1] !== undefined) {
      const envKey: string = match[1];
      const envVal = process.env[envKey];
      if (envVal !== undefined) resolved[key] = envVal;
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

/**
 * Minimal env baseline forwarded to upstream MCP subprocesses. Closes the
 * supply-chain leak in the prior `{ ...process.env, ... }` pattern — keys
 * like ANTHROPIC_API_KEY, OPENAI_API_KEY, GITHUB_TOKEN are no longer handed
 * to third-party servers the operator wired into the gateway.
 */
const UPSTREAM_BASELINE_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TZ',
  'PWD',
  'SHELL',
  'TERM',
] as const;

function buildUpstreamEnv(configEnv: Record<string, string> | undefined): Record<string, string> {
  const baseline: Record<string, string> = {};
  for (const key of UPSTREAM_BASELINE_KEYS) {
    const value = process.env[key];
    if (value !== undefined) baseline[key] = value;
  }
  return { ...baseline, ...resolveEnv(configEnv) };
}

/** State of an upstream connection. */
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';

/**
 * Manages a single upstream MCP server connection.
 */
export class UpstreamClient {
  readonly name: string;
  private readonly config: UpstreamServerConfig;
  private readonly log: ILogger;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private state: ConnectionState = 'disconnected';
  private tools: readonly Tool[] = [];

  constructor(config: UpstreamServerConfig, logger?: ILogger) {
    this.name = config.name;
    this.config = config;
    this.log = logger ?? createLogger({ component: `upstream:${config.name}` });
  }

  /** Connect to the upstream server. Idempotent. */
  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    if (this.state === 'connecting') return;

    this.state = 'connecting';
    try {
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: [...this.config.args],
        env: buildUpstreamEnv(this.config.env),
      });
      this.client = new Client(
        { name: `nexus-upstream-${this.name}`, version: '1.0.0' },
        { capabilities: {} }
      );
      await this.client.connect(this.transport);

      // Discover tools from the upstream server
      const result = await this.client.listTools();
      this.tools = result.tools;
      this.state = 'connected';
      this.log.info('Upstream server connected', {
        name: this.name,
        toolCount: this.tools.length,
        tools: this.tools.map((t) => t.name),
      });
    } catch (error: unknown) {
      this.state = 'failed';
      const msg = error instanceof Error ? error.message : String(error);
      this.log.warn('Upstream server connection failed', {
        name: this.name,
        error: msg,
      });
      throw error;
    }
  }

  /** Get available tools (prefixed with server name). */
  getTools(): readonly Tool[] {
    return this.tools.map((t) => ({
      ...t,
      name: `${this.name}.${t.name}`,
      description: `[${this.name}] ${t.description ?? ''}`,
    }));
  }

  /** Call a tool on the upstream server. Returns the raw SDK result. */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<Awaited<ReturnType<Client['callTool']>>> {
    if (this.client === null || this.state !== 'connected') {
      if (this.config.lazy) {
        await this.connect();
      } else {
        throw new Error(`Upstream server ${this.name} not connected`);
      }
    }
    const activeClient = this.client;
    if (activeClient === null) throw new Error(`Upstream server ${this.name} not connected`);
    return activeClient.callTool({ name: toolName, arguments: args });
  }

  /** Check if the server is healthy. */
  async ping(): Promise<boolean> {
    if (this.client === null || this.state !== 'connected') return false;
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /** Gracefully shut down the connection. */
  async shutdown(): Promise<void> {
    if (this.client !== null) {
      try {
        await this.client.close();
      } catch {
        // Best-effort shutdown
      }
      this.client = null;
    }
    if (this.transport !== null) {
      try {
        await this.transport.close();
      } catch {
        // Best-effort cleanup
      }
      this.transport = null;
    }
    this.state = 'disconnected';
    this.tools = [];
    this.log.info('Upstream server disconnected', { name: this.name });
  }

  /** Get current connection state. */
  getState(): ConnectionState {
    return this.state;
  }
}

/**
 * Manages multiple upstream MCP server connections.
 */
export class UpstreamClientManager {
  private readonly clients: Map<string, UpstreamClient> = new Map();
  private readonly log: ILogger;

  constructor(logger?: ILogger) {
    this.log = logger ?? createLogger({ component: 'UpstreamClientManager' });
  }

  /** Register upstream servers from config. */
  registerServers(configs: readonly UpstreamServerConfig[]): void {
    for (const config of configs) {
      if (this.clients.has(config.name)) {
        this.log.warn('Duplicate upstream server name', { name: config.name });
        continue;
      }
      this.clients.set(config.name, new UpstreamClient(config, this.log));
      this.log.info('Registered upstream server', {
        name: config.name,
        command: config.command,
        lazy: config.lazy,
      });
    }
  }

  /** Connect all non-lazy servers. */
  async connectEager(): Promise<void> {
    for (const client of this.clients.values()) {
      if (client.getState() === 'disconnected') {
        try {
          await client.connect();
        } catch {
          // Already logged in UpstreamClient.connect
        }
      }
    }
  }

  /** Get all available tools across all connected upstream servers. */
  getAllTools(): readonly Tool[] {
    const tools: Tool[] = [];
    for (const client of this.clients.values()) {
      if (client.getState() === 'connected') {
        tools.push(...client.getTools());
      }
    }
    return tools;
  }

  /** Route a prefixed tool call to the appropriate upstream server. */
  async callTool(
    prefixedName: string,
    args: Record<string, unknown>
  ): Promise<Awaited<ReturnType<Client['callTool']>> | null> {
    const dotIndex = prefixedName.indexOf('.');
    if (dotIndex === -1) return null;

    const serverName = prefixedName.slice(0, dotIndex);
    const toolName = prefixedName.slice(dotIndex + 1);
    const client = this.clients.get(serverName);
    if (client === undefined) return null;

    return client.callTool(toolName, args);
  }

  /** Check if a tool name is an upstream prefixed tool. */
  isUpstreamTool(name: string): boolean {
    const dotIndex = name.indexOf('.');
    if (dotIndex === -1) return false;
    return this.clients.has(name.slice(0, dotIndex));
  }

  /** Shut down all upstream connections. */
  async shutdownAll(): Promise<void> {
    const promises = [...this.clients.values()].map((c) => c.shutdown());
    await Promise.allSettled(promises);
    this.clients.clear();
    this.log.info('All upstream servers shut down');
  }

  /** Get health status of all upstream servers. */
  getStatus(): ReadonlyArray<{ name: string; state: string }> {
    return [...this.clients.entries()].map(([name, client]) => ({
      name,
      state: client.getState(),
    }));
  }
}
