/**
 * nexus-agents/cli - Session Commands
 *
 * CLI commands for session management: list, show, export, delete.
 *
 * @module cli/session-commands
 * (Source: Issue #190 - CLI session persistence with SQLite)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { ILogger } from '../core/logger.js';
import { createLogger, getTimeProvider } from '../core/index.js';
import {
  type SessionSummary,
  type SessionWithTasks,
  SessionStorageError,
} from './session-storage-types.js';
import { SQLiteSessionStorage, createSessionStorage } from './session-storage.js';

// ============================================================================
// Types
// ============================================================================

export interface SessionCommandOptions {
  dbPath?: string | undefined;
  logger?: ILogger | undefined;
}

export interface SessionListOptions extends SessionCommandOptions {
  limit?: number | undefined;
  format?: 'table' | 'json' | undefined;
}

export interface SessionShowOptions extends SessionCommandOptions {
  sessionId: string;
  format?: 'text' | 'json' | undefined;
}

export interface SessionExportOptions extends SessionCommandOptions {
  sessionId: string;
  output?: string | undefined;
  format?: 'json' | 'markdown' | undefined;
}

export interface SessionDeleteOptions extends SessionCommandOptions {
  sessionId: string;
  force?: boolean | undefined;
}

export interface SessionPruneOptions extends SessionCommandOptions {
  days: number;
  dryRun?: boolean | undefined;
}

// ============================================================================
// Helpers
// ============================================================================

/** Get default database path. */
export function getDefaultDbPath(): string {
  return path.join(os.homedir(), '.nexus-agents', 'sessions.db');
}

function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function getStorage(
  options: SessionCommandOptions
): Promise<Result<SQLiteSessionStorage, SessionStorageError>> {
  const dbPath = options.dbPath ?? getDefaultDbPath();
  ensureDbDirectory(dbPath);
  const storage = createSessionStorage({ dbPath, logger: options.logger });
  const initResult = await storage.initialize();
  if (!initResult.ok) return initResult;
  return ok(storage);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return String(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (ms < 3600000) return String(mins) + 'm ' + String(secs) + 's';
  const hours = Math.floor(ms / 3600000);
  const remainMins = Math.floor((ms % 3600000) / 60000);
  return String(hours) + 'h ' + String(remainMins) + 'm';
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return '$' + usd.toFixed(4);
  return '$' + usd.toFixed(2);
}

function output(text: string): void {
  process.stdout.write(text + '\n');
}

// ============================================================================
// Commands
// ============================================================================

/** List sessions with summaries. */
export async function sessionList(
  options: SessionListOptions = {}
): Promise<Result<SessionSummary[], SessionStorageError>> {
  const storageResult = await getStorage(options);
  if (!storageResult.ok) return storageResult;
  const storage = storageResult.value;
  try {
    return await storage.listSessions(options.limit ?? 20);
  } finally {
    storage.close();
  }
}

/** Print session list. */
export function printSessionList(
  sessions: SessionSummary[],
  format: 'table' | 'json' = 'table'
): void {
  if (format === 'json') {
    output(JSON.stringify(sessions, null, 2));
    return;
  }
  if (sessions.length === 0) {
    output('No sessions found.');
    return;
  }
  output('\n  Sessions:\n');
  output('  ID                      Status     Tasks  Duration      Tokens  Cost');
  output('  ────────────────────────────────────────────────────────────────────');
  for (const s of sessions) {
    const parts = [
      '  ' + s.id.padEnd(22),
      s.status.padEnd(10),
      String(s.taskCount).padStart(5),
      formatDuration(s.totalDurationMs).padStart(10),
      String(s.totalTokens).padStart(8),
      formatCost(s.totalCostUsd).padStart(8),
    ];
    output(parts.join(' '));
  }
  output('');
}

/** Show session details with tasks. */
export async function sessionShow(
  options: SessionShowOptions
): Promise<Result<SessionWithTasks | null, SessionStorageError>> {
  const storageResult = await getStorage(options);
  if (!storageResult.ok) return storageResult;
  const storage = storageResult.value;
  try {
    return await storage.getSessionWithTasks(options.sessionId);
  } finally {
    storage.close();
  }
}

function getTaskIcon(status: string): string {
  if (status === 'completed') return '✓';
  if (status === 'failed') return '✗';
  return '○';
}

function printTaskDetails(task: SessionWithTasks['tasks'][number]): void {
  const icon = getTaskIcon(task.status);
  const taskText = task.task.length > 60 ? task.task.substring(0, 60) + '...' : task.task;
  output('  ' + icon + ' [' + task.id + '] ' + taskText);
  if (task.durationMs !== undefined) output('    Duration: ' + formatDuration(task.durationMs));
  if (task.tokensUsed !== undefined) output('    Tokens: ' + String(task.tokensUsed));
  if (task.result !== undefined) {
    const resultText =
      task.result.length > 100 ? task.result.substring(0, 100) + '...' : task.result;
    output('    Result: ' + resultText);
  }
}

/** Print session details. */
export function printSessionShow(
  session: SessionWithTasks | null,
  format: 'text' | 'json' = 'text'
): void {
  if (session === null) {
    output('Session not found.');
    return;
  }
  if (format === 'json') {
    output(JSON.stringify(session, null, 2));
    return;
  }
  output('\n  Session: ' + session.id);
  output('  Status:  ' + session.status);
  output('  Created: ' + session.createdAt);
  output('  Updated: ' + session.updatedAt);
  if (Object.keys(session.metadata).length > 0) {
    output('  Metadata: ' + JSON.stringify(session.metadata));
  }
  output('\n  Tasks (' + String(session.tasks.length) + '):\n');
  for (const task of session.tasks) printTaskDetails(task);
  output('');
}

/** Export session to file or stdout. */
export async function sessionExport(
  options: SessionExportOptions
): Promise<Result<string, SessionStorageError>> {
  const sessionResult = await sessionShow({
    sessionId: options.sessionId,
    dbPath: options.dbPath,
    logger: options.logger,
  });
  if (!sessionResult.ok) return sessionResult;
  const session = sessionResult.value;
  if (session === null) {
    return err(
      new SessionStorageError(
        `Session not found: ${options.sessionId}\n` +
          `Hint: Run 'nexus-agents session list' to see available sessions.`
      )
    );
  }
  const content =
    options.format === 'markdown'
      ? formatSessionAsMarkdown(session)
      : JSON.stringify(session, null, 2);
  if (options.output !== undefined) {
    fs.writeFileSync(options.output, content, 'utf-8');
  }
  return ok(content);
}

function formatSessionAsMarkdown(session: SessionWithTasks): string {
  const lines: string[] = [];
  lines.push('# Session: ' + session.id + '\n');
  lines.push('- **Status:** ' + session.status);
  lines.push('- **Created:** ' + session.createdAt);
  lines.push('- **Updated:** ' + session.updatedAt);
  if (Object.keys(session.metadata).length > 0) {
    lines.push('- **Metadata:** `' + JSON.stringify(session.metadata) + '`');
  }
  lines.push('');
  lines.push('## Tasks (' + String(session.tasks.length) + ')\n');
  for (const task of session.tasks) {
    const icon = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳';
    lines.push('### ' + icon + ' ' + task.task + '\n');
    lines.push('- **ID:** ' + task.id);
    lines.push('- **Status:** ' + task.status);
    if (task.durationMs !== undefined)
      lines.push('- **Duration:** ' + formatDuration(task.durationMs));
    if (task.tokensUsed !== undefined) lines.push('- **Tokens:** ' + String(task.tokensUsed));
    if (task.costUsd !== undefined) lines.push('- **Cost:** ' + formatCost(task.costUsd));
    if (task.result !== undefined) {
      lines.push('', '**Result:**', '```', task.result, '```');
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Delete a session. */
export async function sessionDelete(
  options: SessionDeleteOptions
): Promise<Result<boolean, SessionStorageError>> {
  const storageResult = await getStorage(options);
  if (!storageResult.ok) return storageResult;
  const storage = storageResult.value;
  try {
    return await storage.deleteSession(options.sessionId);
  } finally {
    storage.close();
  }
}

/** Prune old sessions. */
export async function sessionPrune(
  options: SessionPruneOptions
): Promise<Result<number, SessionStorageError>> {
  const storageResult = await getStorage(options);
  if (!storageResult.ok) return storageResult;
  const storage = storageResult.value;
  try {
    const cutoff = new Date(getTimeProvider().now() - options.days * 24 * 60 * 60 * 1000);
    if (options.dryRun === true) {
      const listResult = await storage.listSessions(1000);
      if (!listResult.ok) return listResult;
      const oldSessions = listResult.value.filter((s) => new Date(s.updatedAt) < cutoff);
      return ok(oldSessions.length);
    }
    return await storage.prune(cutoff);
  } finally {
    storage.close();
  }
}

// ============================================================================
// CLI Entry Point (split into handlers)
// ============================================================================

async function handleList(args: string[], log: ILogger): Promise<void> {
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '20', 10) : 20;
  const format: 'table' | 'json' = args.includes('--json') ? 'json' : 'table';
  const result = await sessionList({ limit, format, logger: log });
  if (!result.ok) {
    console.error('Error: ' + result.error.message);
    process.exit(1);
  }
  printSessionList(result.value, format);
}

async function handleShow(args: string[], log: ILogger): Promise<void> {
  const sessionId = args[0];
  if (sessionId === undefined) {
    console.error('Error: Session ID required');
    process.exit(1);
  }
  const format: 'text' | 'json' = args.includes('--json') ? 'json' : 'text';
  const result = await sessionShow({ sessionId, format, logger: log });
  if (!result.ok) {
    console.error('Error: ' + result.error.message);
    process.exit(1);
  }
  printSessionShow(result.value, format);
}

async function handleExport(args: string[], log: ILogger): Promise<void> {
  const sessionId = args[0];
  if (sessionId === undefined) {
    console.error('Error: Session ID required');
    process.exit(1);
  }
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : undefined;
  const format: 'json' | 'markdown' = args.includes('--markdown') ? 'markdown' : 'json';
  const result = await sessionExport({ sessionId, output: outputPath, format, logger: log });
  if (!result.ok) {
    console.error('Error: ' + result.error.message);
    process.exit(1);
  }
  if (outputPath === undefined) output(result.value);
  else output('Exported to ' + outputPath);
}

async function handleDelete(args: string[], log: ILogger): Promise<void> {
  const sessionId = args[0];
  if (sessionId === undefined) {
    console.error('Error: Session ID required');
    process.exit(1);
  }
  const result = await sessionDelete({ sessionId, logger: log });
  if (!result.ok) {
    console.error('Error: ' + result.error.message);
    process.exit(1);
  }
  output(result.value ? 'Session deleted.' : 'Session not found.');
}

async function handlePrune(args: string[], log: ILogger): Promise<void> {
  const daysArg = args[0];
  if (daysArg === undefined) {
    console.error('Error: Days argument required');
    process.exit(1);
  }
  const days = parseInt(daysArg, 10);
  const dryRun = args.includes('--dry-run');
  const result = await sessionPrune({ days, dryRun, logger: log });
  if (!result.ok) {
    console.error('Error: ' + result.error.message);
    process.exit(1);
  }
  const count = String(result.value);
  output(dryRun ? 'Would delete ' + count + ' sessions.' : 'Deleted ' + count + ' sessions.');
}

/** Main session command entry point. */
export async function sessionCommand(
  subcommand: 'list' | 'show' | 'export' | 'delete' | 'prune',
  args: string[],
  logger?: ILogger
): Promise<void> {
  const log = logger ?? createLogger({ component: 'SessionCommand' });
  const handlers = {
    list: handleList,
    show: handleShow,
    export: handleExport,
    delete: handleDelete,
    prune: handlePrune,
  };
  await handlers[subcommand](args, log);
}
