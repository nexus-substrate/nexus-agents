/**
 * Topological wave assignment for agent plans (#2034).
 *
 * Agent plans optionally carry `dependsOn: string[]` (role-keyed) edges.
 * This module produces a wave assignment such that an entry runs only
 * after every role it depends on has completed. Waves are promoted
 * greedily so independent work still parallelizes.
 *
 * Pure function — no I/O, no side effects. Returns a `Result` so callers
 * can surface cycle errors without an exception.
 *
 * Keeps the existing priority-based `wave` field behavior intact when
 * `dependsOn` is absent.
 *
 * @module orchestration/aorchestra/topological-wave
 */

import { ok, err, type Result } from '../../core/index.js';

/** Minimal shape this module operates on. Real `AgentPlanEntry` satisfies this. */
export interface WaveEntry {
  readonly role: string;
  readonly priority: number;
  readonly wave: number;
  readonly dependsOn?: readonly string[] | undefined;
}

/** Error surfaced when the dependency graph contains a cycle. */
export class CycleError extends Error {
  override readonly name = 'CycleError';
  constructor(
    message: string,
    readonly cycleRoles: readonly string[]
  ) {
    super(message);
  }
}

/** Error surfaced when `dependsOn` references a role not in the plan. */
export class MissingDependencyError extends Error {
  override readonly name = 'MissingDependencyError';
  constructor(
    message: string,
    readonly sourceRole: string,
    readonly missingRole: string
  ) {
    super(message);
  }
}

/**
 * Assign waves by topological sort over the dependency graph.
 *
 * Each entry's new `wave` = max(wave of every role it depends on) + 1,
 * or 1 if it has no dependencies. Entries with only priority (no
 * `dependsOn`) keep their original `wave`.
 *
 * Returns a new array in the same order; does not mutate inputs.
 */
export function topologicalWaveAssign<T extends WaveEntry>(
  entries: readonly T[]
): Result<readonly T[], CycleError | MissingDependencyError> {
  if (entries.length === 0) return ok([]);

  const byRole = buildRoleIndex(entries);
  const missing = findMissingDependency(entries, byRole);
  if (missing !== null) return err(missing);

  const cycle = detectCycle(entries, byRole);
  if (cycle !== null) return err(cycle);

  const waveByRole = computeWaves(entries, byRole);
  return ok(entries.map((e) => ({ ...e, wave: waveByRole.get(e.role) ?? e.wave })));
}

/**
 * Group topologically-waved entries into wave buckets. Returned waves
 * are sorted ascending; each wave contains the entries that may run in
 * parallel once earlier waves complete.
 *
 * Named `groupByTopologicalWave` rather than `groupByWave` to avoid a
 * collision with `worker-dispatcher.groupByWave`, which operates on the
 * richer `AgentPlanEntry` union and is the canonical public export.
 */
export function groupByTopologicalWave<T extends WaveEntry>(entries: readonly T[]): readonly T[][] {
  const buckets = new Map<number, T[]>();
  for (const e of entries) {
    const bucket = buckets.get(e.wave);
    if (bucket === undefined) {
      buckets.set(e.wave, [e]);
    } else {
      bucket.push(e);
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v);
}

function buildRoleIndex<T extends WaveEntry>(entries: readonly T[]): Map<string, T> {
  const byRole = new Map<string, T>();
  for (const e of entries) byRole.set(e.role, e);
  return byRole;
}

function findMissingDependency<T extends WaveEntry>(
  entries: readonly T[],
  byRole: Map<string, T>
): MissingDependencyError | null {
  for (const e of entries) {
    if (e.dependsOn === undefined) continue;
    for (const dep of e.dependsOn) {
      if (!byRole.has(dep)) {
        return new MissingDependencyError(
          `Entry for role "${e.role}" depends on unknown role "${dep}"`,
          e.role,
          dep
        );
      }
    }
  }
  return null;
}

/** DFS-based cycle detection. Returns the first cycle found, or null. */
function detectCycle<T extends WaveEntry>(
  entries: readonly T[],
  byRole: Map<string, T>
): CycleError | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const e of entries) color.set(e.role, WHITE);

  function visit(role: string, stack: string[]): string[] | null {
    const c = color.get(role);
    if (c === BLACK) return null;
    if (c === GRAY) {
      const cycleStart = stack.indexOf(role);
      return cycleStart >= 0 ? stack.slice(cycleStart).concat(role) : [role];
    }
    color.set(role, GRAY);
    stack.push(role);
    const entry = byRole.get(role);
    if (entry?.dependsOn !== undefined) {
      for (const dep of entry.dependsOn) {
        const found = visit(dep, stack);
        if (found !== null) return found;
      }
    }
    stack.pop();
    color.set(role, BLACK);
    return null;
  }

  for (const e of entries) {
    const found = visit(e.role, []);
    if (found !== null) {
      return new CycleError(`Dependency cycle detected: ${found.join(' → ')}`, found);
    }
  }
  return null;
}

/**
 * Compute each role's wave as max(wave of deps) + 1. Roles without
 * `dependsOn` keep their original wave so the priority-based assignment
 * from `planAgentTeam` is preserved.
 */
function computeWaves<T extends WaveEntry>(
  entries: readonly T[],
  byRole: Map<string, T>
): Map<string, number> {
  const computed = new Map<string, number>();

  function waveOf(role: string): number {
    const cached = computed.get(role);
    if (cached !== undefined) return cached;
    const entry = byRole.get(role);
    if (entry === undefined) return 1;
    if (entry.dependsOn === undefined || entry.dependsOn.length === 0) {
      computed.set(role, entry.wave);
      return entry.wave;
    }
    let maxDepWave = 0;
    for (const dep of entry.dependsOn) {
      maxDepWave = Math.max(maxDepWave, waveOf(dep));
    }
    const newWave = maxDepWave + 1;
    computed.set(role, newWave);
    return newWave;
  }

  for (const e of entries) waveOf(e.role);
  return computed;
}
