/**
 * nexus-agents/audit - Audit Storage Query Operations
 *
 * Query criteria matching and file reading operations for audit storage.
 * Extracted from audit-storage.ts to comply with 400-line limit.
 *
 * (Source: Issue #193 - Phase 3 structured audit logging)
 *
 * @module audit/audit-storage-queries
 */

import * as fs from 'node:fs';
import * as readline from 'node:readline';
import type { AuditEvent, AuditQueryCriteria } from './audit-types.js';
import { AuditEventSchema } from './audit-types.js';

// ============================================================================
// Criteria Matching Helpers
// ============================================================================

/**
 * Checks if an event falls within the specified time range.
 *
 * @param event - The audit event to check
 * @param criteria - Query criteria containing optional startTime and endTime
 * @returns True if event timestamp is within range (or no range specified)
 */
export function matchesTimeRange(event: AuditEvent, criteria: AuditQueryCriteria): boolean {
  if (criteria.startTime !== undefined && new Date(event.timestamp) < criteria.startTime)
    return false;
  if (criteria.endTime !== undefined && new Date(event.timestamp) > criteria.endTime) return false;
  return true;
}

/**
 * Checks if an event matches the classification filters (category, severity, outcome).
 *
 * @param event - The audit event to check
 * @param criteria - Query criteria containing optional classification filters
 * @returns True if event matches all specified classification filters
 */
export function matchesClassification(event: AuditEvent, criteria: AuditQueryCriteria): boolean {
  if (criteria.categories !== undefined && !criteria.categories.includes(event.category))
    return false;
  if (criteria.severities !== undefined && !criteria.severities.includes(event.severity))
    return false;
  if (criteria.outcomes !== undefined && !criteria.outcomes.includes(event.outcome)) return false;
  return true;
}

/**
 * Checks if an event matches the identifier filters (actorId, resourceId, etc).
 *
 * @param event - The audit event to check
 * @param criteria - Query criteria containing optional identifier filters
 * @returns True if event matches all specified identifier filters
 */
export function matchesIdentifiers(event: AuditEvent, criteria: AuditQueryCriteria): boolean {
  if (criteria.actorId !== undefined && event.actor.id !== criteria.actorId) return false;
  if (criteria.resourceId !== undefined && event.resource?.id !== criteria.resourceId) return false;
  if (criteria.requestId !== undefined && event.requestId !== criteria.requestId) return false;
  if (criteria.traceId !== undefined && event.traceId !== criteria.traceId) return false;
  return true;
}

/**
 * Checks if an audit event matches all specified query criteria.
 *
 * @param event - The audit event to check
 * @param criteria - Query criteria to match against
 * @returns True if event matches all criteria
 */
export function matchesCriteria(event: AuditEvent, criteria: AuditQueryCriteria): boolean {
  return (
    matchesTimeRange(event, criteria) &&
    matchesClassification(event, criteria) &&
    matchesIdentifiers(event, criteria)
  );
}

// ============================================================================
// File Reading Operations
// ============================================================================

/**
 * Options for reading audit events from a file.
 */
export interface ReadFileOptions {
  /** Path to the JSON-L audit log file */
  filePath: string;
  /** Query criteria to filter events */
  criteria: AuditQueryCriteria;
  /** Optional callback for logging malformed lines */
  onMalformedLine?: (filePath: string) => void;
}

/**
 * Reads and filters audit events from a JSON-L file.
 *
 * @param options - File reading options
 * @returns Promise resolving to array of matching audit events
 */
export async function readAuditFile(options: ReadFileOptions): Promise<AuditEvent[]> {
  const { filePath, criteria, onMalformedLine } = options;
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
      onMalformedLine?.(filePath);
    }
  }

  return events;
}

// ============================================================================
// In-Memory Audit Storage (for testing)
// ============================================================================

import type { IAuditStorage } from './audit-types.js';

/**
 * In-memory audit storage implementation for testing.
 * Events are stored in memory with configurable maximum capacity.
 */
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
