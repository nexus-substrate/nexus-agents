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
import type {
  IAuditStorage,
  AuditEvent,
  AuditLogConfig,
  AuditQueryCriteria,
} from './audit-types.js';
import { AuditError, AuditEventSchema } from './audit-types.js';

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

  constructor(config: AuditLogConfig, logger?: ILogger) {
    this.logDir = config.logDir;
    this.filePrefix = config.filePrefix;
    this.maxFileSizeBytes = config.maxFileSizeBytes;
    this.maxFiles = config.maxFiles;
    this.logger = logger ?? createLogger({ component: 'FileAuditStorage' });

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
