/**
 * nexus-agents/audit - File-based Audit Storage
 *
 * JSON-L file storage with rotation for audit events.
 * SIEM-compatible output format.
 *
 * (Source: Issue #193 - Phase 3 structured audit logging)
 *
 * @module audit/audit-storage
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { Result } from '../core/index.js';
import { SecurityError } from '../core/index.js';
import type {
  IAuditStorage,
  AuditEvent,
  AuditLogConfig,
  AuditQueryCriteria,
} from './audit-types.js';
import { AuditError, AuditEventSchema } from './audit-types.js';

// ============================================================================
// Path Validation
// ============================================================================

/**
 * Configuration for FileAuditStorage with optional security boundary.
 */
export interface FileAuditStorageConfig extends AuditLogConfig {
  /** Optional root directory that logDir must be within. */
  allowedRoot?: string;
}

/**
 * Validates that a directory path is within the allowed root directory.
 * Prevents path traversal attacks (e.g., ../../../etc).
 *
 * @param logDir - The log directory path to validate
 * @param allowedRoot - The root directory that logDir must be within
 * @returns Result with validated absolute path or SecurityError
 */
function validateLogDir(logDir: string, allowedRoot: string): Result<string, SecurityError> {
  const resolvedRoot = path.resolve(allowedRoot);
  const resolvedLogDir = path.resolve(allowedRoot, logDir);

  // Check if the resolved path is within or equal to the allowed root
  if (!resolvedLogDir.startsWith(resolvedRoot + path.sep) && resolvedLogDir !== resolvedRoot) {
    return {
      ok: false,
      error: new SecurityError('Path traversal detected: logDir escapes allowed root directory', {
        context: { logDir, allowedRoot: resolvedRoot },
      }),
    };
  }

  return { ok: true, value: resolvedLogDir };
}

/**
 * Validates that a directory path does not contain path traversal sequences.
 * Used when no allowedRoot is specified but we still want basic protection.
 *
 * @param logDir - The log directory path to validate
 * @returns Result with validated absolute path or SecurityError
 */
function validateLogDirBasic(logDir: string): Result<string, SecurityError> {
  // Check for obvious path traversal patterns in the original input
  const traversalPatterns = ['..', '%2e%2e', '%252e%252e'];
  const normalizedInput = logDir.toLowerCase();

  for (const pattern of traversalPatterns) {
    if (normalizedInput.includes(pattern)) {
      return {
        ok: false,
        error: new SecurityError('Path traversal detected: logDir contains traversal sequences', {
          context: { logDir },
        }),
      };
    }
  }

  // Resolve to absolute path
  const resolved = path.resolve(logDir);

  // Additional check: resolved path should not be a system directory
  const systemDirs = ['/etc', '/var', '/usr', '/bin', '/sbin', '/root', '/proc', '/sys'];
  for (const sysDir of systemDirs) {
    if (resolved === sysDir || resolved.startsWith(sysDir + path.sep)) {
      return {
        ok: false,
        error: new SecurityError('logDir cannot be a system directory', {
          context: { logDir, resolved },
        }),
      };
    }
  }

  return { ok: true, value: resolved };
}

// ============================================================================
// File Audit Storage Implementation
// ============================================================================

export class FileAuditStorage implements IAuditStorage {
  private readonly logDir: string;
  private readonly filePrefix: string;
  private readonly maxFileSizeBytes: number;
  private readonly maxFiles: number;
  private readonly logger: ILogger;
  private currentFile: string | null = null;
  private writeStream: fs.WriteStream | null = null;
  private currentFileSize = 0;
  private writeBuffer: string[] = [];

  /**
   * Creates a FileAuditStorage instance with path validation.
   * Use this factory method for safe instantiation with proper error handling.
   *
   * @param config - Audit log configuration with optional allowedRoot
   * @param logger - Optional logger instance
   * @returns Result with FileAuditStorage or SecurityError
   */
  static create(
    config: FileAuditStorageConfig,
    logger?: ILogger
  ): Result<FileAuditStorage, SecurityError> {
    // Validate the log directory path
    const validation =
      config.allowedRoot !== undefined
        ? validateLogDir(config.logDir, config.allowedRoot)
        : validateLogDirBasic(config.logDir);

    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    // Create instance with validated path
    const validatedConfig: AuditLogConfig = {
      ...config,
      logDir: validation.value,
    };

    return { ok: true, value: new FileAuditStorage(validatedConfig, logger, true) };
  }

  /**
   * Constructor for FileAuditStorage.
   *
   * SECURITY NOTE: Prefer using FileAuditStorage.create() for safe instantiation
   * with proper path validation and error handling.
   *
   * @param config - Audit log configuration
   * @param logger - Optional logger instance
   * @param skipValidation - Internal flag, set by create() after validation
   * @throws SecurityError if path validation fails and skipValidation is false
   */
  constructor(config: AuditLogConfig, logger?: ILogger, skipValidation = false) {
    this.logger = logger ?? createLogger({ component: 'FileAuditStorage' });

    // Validate logDir unless already validated by create()
    if (!skipValidation) {
      const validation = validateLogDirBasic(config.logDir);
      if (!validation.ok) {
        throw validation.error;
      }
      this.logDir = validation.value;
    } else {
      this.logDir = config.logDir;
    }

    this.filePrefix = config.filePrefix;
    this.maxFileSizeBytes = config.maxFileSizeBytes;
    this.maxFiles = config.maxFiles;

    this.ensureLogDirectory();
    this.initCurrentFile();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      this.logger.info('Created audit log directory', { logDir: this.logDir });
    }
  }

  private generateFileName(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0] ?? 'unknown'; // YYYY-MM-DD
    const timePart = now.toISOString().split('T')[1];
    const timeStr =
      timePart !== undefined ? (timePart.split('.')[0]?.replace(/:/g, '-') ?? '000000') : '000000';
    return this.filePrefix + '-' + dateStr + '-' + timeStr + '.jsonl';
  }

  private getExistingLogFiles(): string[] {
    const files = fs.readdirSync(this.logDir);
    return files
      .filter((f) => f.startsWith(this.filePrefix) && f.endsWith('.jsonl'))
      .sort()
      .reverse();
  }

  private initCurrentFile(): void {
    const existingFiles = this.getExistingLogFiles();
    const latestFileName = existingFiles[0];
    if (existingFiles.length > 0 && latestFileName !== undefined) {
      const latestFile = path.join(this.logDir, latestFileName);
      const stats = fs.statSync(latestFile);
      if (stats.size < this.maxFileSizeBytes) {
        this.currentFile = latestFile;
        this.currentFileSize = stats.size;
        this.openWriteStream();
        return;
      }
    }
    this.rotateFile();
  }

  private openWriteStream(): void {
    if (this.currentFile === null) return;
    this.writeStream = fs.createWriteStream(this.currentFile, { flags: 'a' });
    this.writeStream.on('error', (err) => {
      this.logger.error('Audit write stream error', err);
    });
  }

  private rotateFile(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }

    this.currentFile = path.join(this.logDir, this.generateFileName());
    this.currentFileSize = 0;
    this.openWriteStream();
    this.logger.debug('Rotated audit log file', { file: this.currentFile });

    this.pruneOldFiles();
  }

  private pruneOldFiles(): void {
    const files = this.getExistingLogFiles();
    if (files.length > this.maxFiles) {
      const filesToDelete = files.slice(this.maxFiles);
      for (const file of filesToDelete) {
        const filePath = path.join(this.logDir, file);
        fs.unlinkSync(filePath);
        this.logger.info('Pruned old audit log', { file });
      }
    }
  }

  write(event: AuditEvent): Promise<void> {
    const line = JSON.stringify(event) + '\n';
    const lineSize = Buffer.byteLength(line);

    if (this.currentFileSize + lineSize > this.maxFileSizeBytes) {
      this.rotateFile();
    }

    this.writeBuffer.push(line);
    this.currentFileSize += lineSize;
    return Promise.resolve();
  }

  flush(): Promise<void> {
    if (this.writeBuffer.length === 0) return Promise.resolve();
    if (this.writeStream === null) return Promise.resolve();

    const data = this.writeBuffer.join('');
    this.writeBuffer = [];
    const stream = this.writeStream;

    return new Promise((resolve, reject) => {
      stream.write(data, (err) => {
        if (err !== undefined && err !== null) {
          reject(new AuditError('Failed to flush audit log', { cause: err }));
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    await this.flush();
    return new Promise((resolve) => {
      if (this.writeStream === null) {
        resolve();
        return;
      }
      this.writeStream.end(() => {
        this.writeStream = null;
        this.logger.info('Audit storage closed');
        resolve();
      });
    });
  }

  async query(criteria: AuditQueryCriteria): Promise<AuditEvent[]> {
    const results: AuditEvent[] = [];
    const files = this.getExistingLogFiles();
    const limit = criteria.limit;
    const offset = criteria.offset;
    let skipped = 0;

    for (const file of files) {
      if (results.length >= limit) break;

      const filePath = path.join(this.logDir, file);
      const events = await this.readFile(filePath, criteria);

      for (const event of events) {
        if (skipped < offset) {
          skipped++;
          continue;
        }
        if (results.length >= limit) break;
        results.push(event);
      }
    }

    return results;
  }

  private async readFile(filePath: string, criteria: AuditQueryCriteria): Promise<AuditEvent[]> {
    const events: AuditEvent[] = [];
    const stream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (line.trim().length === 0) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        const validated = AuditEventSchema.safeParse(parsed);
        if (validated.success && matchesCriteria(validated.data, criteria)) {
          events.push(validated.data);
        }
      } catch {
        // Skip malformed lines
        this.logger.debug('Skipped malformed audit line', { file: filePath });
      }
    }

    return events;
  }
}

// ============================================================================
// Criteria Matching Helpers (extracted for complexity)
// ============================================================================

function matchesTimeRange(event: AuditEvent, criteria: AuditQueryCriteria): boolean {
  if (criteria.startTime !== undefined && new Date(event.timestamp) < criteria.startTime)
    return false;
  if (criteria.endTime !== undefined && new Date(event.timestamp) > criteria.endTime) return false;
  return true;
}

function matchesClassification(event: AuditEvent, criteria: AuditQueryCriteria): boolean {
  if (criteria.categories !== undefined && !criteria.categories.includes(event.category))
    return false;
  if (criteria.severities !== undefined && !criteria.severities.includes(event.severity))
    return false;
  if (criteria.outcomes !== undefined && !criteria.outcomes.includes(event.outcome)) return false;
  return true;
}

function matchesIdentifiers(event: AuditEvent, criteria: AuditQueryCriteria): boolean {
  if (criteria.actorId !== undefined && event.actor.id !== criteria.actorId) return false;
  if (criteria.resourceId !== undefined && event.resource?.id !== criteria.resourceId) return false;
  if (criteria.requestId !== undefined && event.requestId !== criteria.requestId) return false;
  if (criteria.traceId !== undefined && event.traceId !== criteria.traceId) return false;
  return true;
}

function matchesCriteria(event: AuditEvent, criteria: AuditQueryCriteria): boolean {
  return (
    matchesTimeRange(event, criteria) &&
    matchesClassification(event, criteria) &&
    matchesIdentifiers(event, criteria)
  );
}

// ============================================================================
// In-Memory Audit Storage (for testing)
// ============================================================================

export class InMemoryAuditStorage implements IAuditStorage {
  private readonly events: AuditEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents = 10000) {
    this.maxEvents = maxEvents;
  }

  write(event: AuditEvent): Promise<void> {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  query(criteria: AuditQueryCriteria): Promise<AuditEvent[]> {
    const limit = criteria.limit;
    const offset = criteria.offset;

    const filtered = this.events.filter((event) => matchesCriteria(event, criteria));

    return Promise.resolve(filtered.slice(offset, offset + limit));
  }

  /** Get all events (for testing) */
  getAll(): AuditEvent[] {
    return [...this.events];
  }

  /** Clear all events (for testing) */
  clear(): void {
    this.events.length = 0;
  }
}
