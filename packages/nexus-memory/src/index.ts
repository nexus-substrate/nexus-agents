/**
 * nexus-memory — unified memory subsystem for nexus-agents.
 *
 * Phase 3 scaffold of epic #2766. Exposes:
 * - {@link IMemoryBackend} — every concept-space implements this contract
 * - {@link MemoryRegistry} — singleton registry; `getMemoryRegistry()` is the entry point
 * - {@link SqliteBackend}, {@link InMemoryBackend} — the two backends
 * - Telemetry: `recordMemoryEvent`, `getMemoryEventCounters`, `subscribeToMemoryEvents`
 * - Importer: `registerImporter`, `runImporters` — the one-shot migration hook
 * - Test helpers: `createInMemoryMemoryRegistry`, `setMemoryRegistry`, `closeMemoryRegistry`
 *
 * @module nexus-memory
 */

// Types
export type {
  BackendStats,
  CliName,
  ColdArchiveSchema,
  IMemoryBackend,
  MemoryEvent,
  MemoryEventCounters,
  MemoryEventListener,
  QueryFilter,
  WriteMeta,
} from './types.js';

// Backends
export { InMemoryBackend, MemoryValidationError } from './backends/memory.js';
export type { InMemoryBackendOptions } from './backends/memory.js';
export { SqliteBackend } from './backends/sqlite.js';
export type { SqliteBackendOptions } from './backends/sqlite.js';

// Registry
export {
  MemoryRegistry,
  getMemoryRegistry,
  setMemoryRegistry,
  hasMemoryRegistry,
  closeMemoryRegistry,
} from './registry.js';
export type { MemoryRegistryOptions, RegisterBackendOptions } from './registry.js';

// Factory (test helpers)
export { createInMemoryMemoryRegistry, createSqliteMemoryRegistry } from './factory.js';

// Telemetry
export {
  recordMemoryEvent,
  getMemoryEventCounters,
  subscribeToMemoryEvents,
  resetMemoryTelemetry,
} from './telemetry.js';

// Importer
export {
  registerImporter,
  resetImporters,
  listImporters,
  runImporters,
  backupSourceFile,
} from './importer.js';
export type { Importer, ImporterRun, RunImportersOptions } from './importer.js';
