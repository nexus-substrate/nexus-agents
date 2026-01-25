/**
 * nexus-agents/cli/hooks/handlers - Session Start Handler
 *
 * Handles SessionStart hook events by initializing session tracking
 * in SQLiteSessionStorage.
 *
 * @module cli/hooks/handlers/session-start
 * (Source: Issue #413 - Hook handlers for session lifecycle)
 */

import type { SessionStartInput, HookResult } from '../hook-types.js';
import { exitSuccess, sessionStartContext } from '../hook-output.js';
import { SQLiteSessionStorage } from '../../session-storage.js';
import type { SessionMetadata, StoredSession } from '../../session-storage-types.js';
import { createLogger } from '../../../core/logger.js';
import { getDefaultDbPath } from './handler-utils.js';

const logger = createLogger({ component: 'SessionStartHandler' });

/**
 * Configuration for session start handler.
 */
export interface SessionStartHandlerConfig {
  /** Path to SQLite database for session storage */
  dbPath?: string | undefined;
  /** Whether to provide additional context to Claude */
  provideContext?: boolean | undefined;
  /** Custom session metadata to include */
  customMetadata?: Record<string, unknown> | undefined;
}

/**
 * Handles SessionStart hook event.
 */
export function handleSessionStart(
  input: SessionStartInput,
  config?: SessionStartHandlerConfig
): Promise<HookResult> {
  return initializeSession(input, config);
}

/** Initializes a session in storage. */
async function initializeSession(
  input: SessionStartInput,
  config?: SessionStartHandlerConfig
): Promise<HookResult> {
  const dbPath = config?.dbPath ?? getDefaultDbPath();

  try {
    const storage = new SQLiteSessionStorage({ dbPath });
    const initResult = await storage.initialize();

    if (!initResult.ok) {
      logger.error('Failed to initialize session storage', initResult.error);
      return exitSuccess(`Session ${input.session_id} acknowledged (storage unavailable)`);
    }

    const session = await createSessionRecord(storage, input, config?.customMetadata);
    storage.close();

    if (session === null) {
      return exitSuccess(`Session ${input.session_id} acknowledged (creation failed)`);
    }

    logger.info('Session started', {
      sessionId: input.session_id,
      storageId: session.id,
      source: input.source,
    });

    if (config?.provideContext === true) {
      return sessionStartContext(buildSessionContext(input, session.id));
    }

    return exitSuccess(`Session ${input.session_id} started (storage: ${session.id})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Session start handler error', new Error(message));
    return exitSuccess(`Session ${input.session_id} acknowledged (error: ${message})`);
  }
}

/** Creates a session record in storage. */
async function createSessionRecord(
  storage: SQLiteSessionStorage,
  input: SessionStartInput,
  customMetadata?: Record<string, unknown>
): Promise<StoredSession | null> {
  const metadata: SessionMetadata = {
    custom: {
      source: input.source,
      model: input.model,
      agentType: input.agent_type,
      transcriptPath: input.transcript_path,
      cwd: input.cwd,
      permissionMode: input.permission_mode,
      ...customMetadata,
    },
  };

  const sessionResult = await storage.createSession(metadata);
  if (!sessionResult.ok) {
    logger.error('Failed to create session', sessionResult.error);
    return null;
  }

  return sessionResult.value;
}

/** Builds context string to provide to Claude at session start. */
function buildSessionContext(input: SessionStartInput, storageId: string): string {
  const lines = [
    `[nexus-agents] Session initialized`,
    `- Storage ID: ${storageId}`,
    `- Source: ${input.source}`,
  ];

  if (input.model !== undefined) {
    lines.push(`- Model: ${input.model}`);
  }

  if (input.agent_type !== undefined) {
    lines.push(`- Agent Type: ${input.agent_type}`);
  }

  return lines.join('\n');
}

export default handleSessionStart;
