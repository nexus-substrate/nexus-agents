/** Host-owned known-resource facts. No scheduler, launcher, kill operation or global retention. */
import type { ChildProcess } from 'node:child_process';
import { createLogger } from '../core/logger.js';
import { readProcIdentity, type ProcIdentityObservation } from './proc-start-time.js';
import { collectProcessTreeObservation, type ProcessTreeEnumeration } from './process-tree-kill.js';

export interface ResourceProcessOps {
  readonly platform: 'linux' | 'unsupported';
  readonly readIdentity: (pid: number) => ProcIdentityObservation;
  readonly enumerate: (root: number) => ProcessTreeEnumeration;
}
type ResourceState = 'pending' | 'settled' | 'unmeasured';
type AcquisitionState = 'none' | ResourceState;
interface KnownResource {
  readonly pid: number;
  readonly startTime: string | undefined;
  readonly state: 'running' | 'ended' | 'unknown';
}
export interface NativeResourceSnapshot {
  readonly launch: 'unattempted' | 'refused' | 'attempted' | 'failed';
  readonly completionChild: 'not-started' | 'running' | 'closed' | 'unknown';
  readonly streamsClosed: boolean;
  readonly knownTree: ResourceState;
  readonly acquisitionChildren: AcquisitionState;
  readonly coverage: ProcessTreeEnumeration['coverage'] | 'unmeasured';
  readonly scope: 'sampled-known-identities-only';
  readonly knownProcesses: readonly KnownResource[];
  readonly reasons: readonly string[];
  readonly safe: boolean;
}
const logger = createLogger({ component: 'NativeResourceObserver' });
const MAX_RESOURCES = 1_000;
const MAX_LISTENERS = 64;
const defaultProcesses: ResourceProcessOps = {
  platform: process.platform === 'linux' ? 'linux' : 'unsupported',
  readIdentity: readProcIdentity,
  enumerate: collectProcessTreeObservation,
};

/**
 * The owning lease (#7535) must call refreshKnownResources; without a driver no
 * descendant progress is claimed. Results, signals and cleanup never settle it.
 * Ordinary acquisition is unmeasured. 'none' requires an explicit host scope
 * declaration, not an empty array. Sampling excludes already-detached processes.
 * Disposal detaches this observer's listeners once and permanently freezes it
 * unsafe; it does not erase facts or establish physical settlement.
 */
export class NativeResourceObserver {
  private launch: NativeResourceSnapshot['launch'] = 'unattempted';
  private direct: NativeResourceSnapshot['completionChild'] = 'not-started';
  private streamsClosed = false;
  private coverage: NativeResourceSnapshot['coverage'] = 'unmeasured';
  private readonly known = new Map<string, KnownResource>();
  private readonly reasons = new Set<string>();
  private readonly changes = new Set<(snapshot: NativeResourceSnapshot) => void>();
  private readonly safeListeners = new Set<(snapshot: NativeResourceSnapshot) => void>();
  private readonly owned = new Map<string, () => void>();
  private readonly processes: ResourceProcessOps;
  private readonly acquisition: AcquisitionState;
  private child: ChildProcess | undefined;
  private rootStart: string | undefined;
  private disposed = false;
  private safeNotified = false;

  constructor(options?: {
    readonly processes?: ResourceProcessOps;
    readonly acquisition?: Exclude<AcquisitionState, 'settled'>;
  }) {
    this.processes = options?.processes ?? defaultProcesses;
    this.acquisition = options?.acquisition ?? 'unmeasured';
    if (this.acquisition === 'unmeasured') this.reasons.add('acquisition-unmeasured');
  }

  snapshot(): NativeResourceSnapshot {
    const knownProcesses = Object.freeze(
      [...this.known.values()].map((p) => Object.freeze({ ...p }))
    );
    const knownTree = this.treeState(knownProcesses);
    const ended = this.launch === 'refused' || (this.direct === 'closed' && this.streamsClosed);
    return Object.freeze({
      launch: this.launch,
      completionChild: this.direct,
      streamsClosed: this.streamsClosed,
      knownTree,
      acquisitionChildren: this.acquisition,
      coverage: this.coverage,
      scope: 'sampled-known-identities-only',
      knownProcesses,
      reasons: Object.freeze([...this.reasons]),
      safe:
        !this.disposed &&
        ended &&
        knownTree === 'settled' &&
        (this.acquisition === 'none' || this.acquisition === 'settled'),
    });
  }

  recordRefusal(): void {
    if (this.launch !== 'unattempted' || this.disposed) return;
    this.launch = 'refused';
    this.coverage = 'complete';
    this.publish();
  }

  recordLaunchAttempt(): void {
    if (this.launch !== 'unattempted' || this.disposed) return;
    this.launch = 'attempted';
    this.direct = 'unknown';
    this.publish();
  }

  recordLaunchFailure(): void {
    if (this.child !== undefined || this.disposed) return;
    this.launch = 'failed';
    this.direct = 'unknown';
    this.reasons.add('spawn-failed-without-handle');
    this.publish();
  }

  /** Attach immediately after spawn returns, ahead of business-result handlers. */
  attachChild(child: ChildProcess): void {
    if (this.child !== undefined || this.disposed) {
      this.reasons.add('observation-rejected');
      this.publish();
      return;
    }
    this.child = child;
    this.direct = 'running';
    this.listen('exit', () => {
      this.direct = 'closed';
      this.detach('exit');
      this.publish();
    });
    this.listen('close', () => {
      this.direct = 'closed';
      this.streamsClosed = true;
      this.detachAll();
      this.publish();
    });
    this.listen('error', () => {
      if (child.pid === undefined) this.launch = 'failed';
      this.direct = 'unknown';
      this.reasons.add('child-error');
      this.publish();
    });
    if (child.exitCode !== null || child.signalCode !== null) this.direct = 'closed';
    if (child.pid !== undefined) {
      const identity = this.read(child.pid);
      if (identity.state === 'present') this.rootStart = identity.startTime;
    }
    this.refreshKnownResources();
  }

  /** Explicit host sampling; never walk an exited or reused root PID. */
  refreshKnownResources(): void {
    if (this.disposed) return;
    if (this.processes.platform !== 'linux') {
      this.reasons.add('unsupported-identity');
      this.coverage = 'unavailable';
    } else if (this.child !== undefined && this.direct === 'running') {
      this.sampleRoot();
    }
    for (const [key, entry] of this.known) this.known.set(key, this.refreshIdentity(entry));
    this.publish();
  }

  onChange(listener: (snapshot: NativeResourceSnapshot) => void): () => void {
    return this.subscribe(this.changes, listener);
  }
  onSafeSettlement(listener: (snapshot: NativeResourceSnapshot) => void): () => void {
    const snapshot = this.snapshot();
    if (snapshot.safe) {
      this.notify(listener, snapshot);
      return () => {};
    }
    return this.subscribe(this.safeListeners, listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reasons.add('observation-disposed');
    this.detachAll();
    this.publish();
    this.changes.clear();
    this.safeListeners.clear();
  }

  private treeState(entries: readonly KnownResource[]): ResourceState {
    if (this.disposed || this.launch === 'failed') return 'unmeasured';
    if (this.launch === 'refused') return 'settled';
    if (this.coverage !== 'complete' || entries.some((p) => p.state === 'unknown'))
      return 'unmeasured';
    // Explicit complete enumeration names the empty case; no inferred health.
    if (entries.length === 0) return 'settled';
    return entries.some((p) => p.state === 'running') ? 'pending' : 'settled';
  }

  private read(pid: number): ProcIdentityObservation {
    try {
      return this.processes.readIdentity(pid);
    } catch {
      return { state: 'unknown', reason: 'unreadable-stat' };
    }
  }

  private sampleRoot(): void {
    const pid = this.child?.pid;
    if (pid === undefined || this.rootStart === undefined) {
      this.reasons.add('root-identity-unmeasured');
      this.coverage = 'unavailable';
      return;
    }
    if (!this.rootIsRunning(pid)) {
      this.reasons.add('root-identity-changed-or-unreadable');
      this.coverage = 'unavailable';
      return;
    }
    const sample = this.enumerate(pid);
    if (this.coverage === 'unmeasured' || this.coverage === 'complete')
      this.coverage = sample.coverage;
    if (sample.coverage !== 'complete') this.reasons.add('enumeration-incomplete');
    for (const childPid of sample.pids) this.remember(childPid);
    if (!this.sameRoot(pid)) {
      this.coverage = 'unavailable';
      this.reasons.add('root-changed-during-enumeration');
    }
  }

  private enumerate(pid: number): ProcessTreeEnumeration {
    try {
      return this.processes.enumerate(pid);
    } catch {
      return { coverage: 'unavailable', pids: [] };
    }
  }

  private sameRoot(pid: number): boolean {
    const identity = this.read(pid);
    return identity.state === 'present' && identity.startTime === this.rootStart;
  }

  private rootIsRunning(pid: number): boolean {
    const identity = this.read(pid);
    return (
      identity.state === 'present' &&
      identity.startTime === this.rootStart &&
      identity.processState !== 'Z'
    );
  }

  private remember(pid: number): void {
    const identity = this.read(pid);
    if (identity.state === 'absent') return;
    const startTime = identity.state === 'present' ? identity.startTime : undefined;
    const key = `${String(pid)}:${startTime ?? 'unknown'}`;
    if (this.known.has(key)) return;
    if (this.known.size >= MAX_RESOURCES) {
      this.coverage = 'partial';
      this.reasons.add('known-resource-limit');
      return;
    }
    this.known.set(key, {
      pid,
      startTime,
      state:
        identity.state === 'unknown'
          ? 'unknown'
          : identity.processState === 'Z'
            ? 'ended'
            : 'running',
    });
  }

  private refreshIdentity(entry: KnownResource): KnownResource {
    if (entry.state === 'ended') return entry;
    const identity = this.read(entry.pid);
    const state =
      identity.state === 'absent'
        ? 'ended'
        : identity.state === 'unknown' || entry.startTime === undefined
          ? 'unknown'
          : identity.startTime !== entry.startTime || identity.processState === 'Z'
            ? 'ended'
            : 'running';
    return { ...entry, state };
  }

  private listen(event: string, listener: () => void): void {
    this.owned.set(event, listener);
    this.child?.on(event, listener);
  }
  private detach(event: string): void {
    const listener = this.owned.get(event);
    if (listener === undefined) return;
    this.owned.delete(event);
    this.child?.removeListener(event, listener);
  }
  private detachAll(): void {
    for (const event of [...this.owned.keys()]) this.detach(event);
  }

  private subscribe(
    set: Set<(snapshot: NativeResourceSnapshot) => void>,
    listener: (snapshot: NativeResourceSnapshot) => void
  ): () => void {
    if (this.disposed) return () => {};
    if (set.size >= MAX_LISTENERS) {
      logger.warn('Native resource subscription limit reached');
      return () => {};
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }
  private notify(
    listener: (snapshot: NativeResourceSnapshot) => void,
    snapshot: NativeResourceSnapshot
  ): void {
    try {
      listener(snapshot);
    } catch {
      logger.warn('Native resource listener failed');
    }
  }
  private publish(): void {
    const snapshot = this.snapshot();
    for (const listener of this.changes) this.notify(listener, snapshot);
    if (!snapshot.safe || this.safeNotified) return;
    this.safeNotified = true;
    const listeners = [...this.safeListeners];
    this.safeListeners.clear();
    for (const listener of listeners) this.notify(listener, snapshot);
  }
}
