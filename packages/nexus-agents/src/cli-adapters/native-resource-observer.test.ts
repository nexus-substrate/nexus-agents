/** Explicit refresh only; observer operations cannot signal any PID. */
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { NativeResourceObserver, type ResourceProcessOps } from './native-resource-observer.js';
import type { ProcIdentityObservation } from './proc-start-time.js';
type Fixture = {
  identities: Map<number, ProcIdentityObservation>;
  processes: ResourceProcessOps;
  child: EventEmitter & {
    pid: number;
    exitCode: number | null;
    signalCode: null;
    kill: ReturnType<typeof vi.fn>;
  };
  observer: NativeResourceObserver;
  close: () => void;
};
function fixture(acquisition: 'none' | 'pending' | 'unmeasured' = 'none'): Fixture {
  const identities = new Map<number, ProcIdentityObservation>([
    [11, { state: 'present', startTime: '100', processState: 'S' }],
    [22, { state: 'present', startTime: '200', processState: 'R' }],
  ]);
  const processes: ResourceProcessOps = {
    platform: 'linux',
    readIdentity: vi.fn<ResourceProcessOps['readIdentity']>(
      (pid) => identities.get(pid) ?? { state: 'absent' }
    ),
    enumerate: vi.fn<ResourceProcessOps['enumerate']>(() => ({ coverage: 'complete', pids: [22] })),
  };
  const child = Object.assign(new EventEmitter(), {
    pid: 11,
    exitCode: null as number | null,
    signalCode: null,
    kill: vi.fn(),
  });
  const observer = new NativeResourceObserver({ processes, acquisition });
  const close = (): void => {
    child.exitCode = 0;
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
  };
  return { observer, processes, identities, child, close };
}
function launch(f: Fixture): void {
  f.observer.recordLaunchAttempt();
  f.observer.attachChild(f.child as unknown as ChildProcess);
}
describe('resource lifetime separate from result (#7534)', () => {
  it('names empty and explicit no-launch scopes', () => {
    expect(new NativeResourceObserver().snapshot()).toMatchObject({
      launch: 'unattempted',
      knownTree: 'unmeasured',
      acquisitionChildren: 'unmeasured',
      safe: false,
    });
    const f = fixture();
    const safe = vi.fn();
    f.observer.onSafeSettlement(safe);
    f.observer.recordRefusal();
    expect(f.observer.snapshot()).toMatchObject({
      launch: 'refused',
      completionChild: 'not-started',
      knownTree: 'settled',
      safe: true,
    });
    expect(safe).toHaveBeenCalledTimes(1);
  });
  it('retains reparented identities after close until explicit host refresh', () => {
    const f = fixture();
    launch(f);
    const safe = vi.fn();
    f.observer.onSafeSettlement(safe);
    f.close();
    expect(f.observer.snapshot()).toMatchObject({
      completionChild: 'closed',
      knownTree: 'pending',
      safe: false,
    });
    const count = vi.mocked(f.processes.enumerate).mock.calls.length;
    f.observer.refreshKnownResources();
    expect(vi.mocked(f.processes.enumerate).mock.calls.length).toBe(count);
    expect(safe).not.toHaveBeenCalled();
    f.identities.set(22, { state: 'absent' });
    expect(f.observer.snapshot().knownTree).toBe('pending');
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'settled', safe: true });
    expect(safe).toHaveBeenCalledTimes(1);
    f.observer.refreshKnownResources();
    f.child.emit('close', 0, null);
    expect(safe).toHaveBeenCalledTimes(1);
  });
  it('does not certify real ordinary acquisition after completion child/tree exit', () => {
    const f = fixture('unmeasured');
    launch(f);
    f.identities.set(22, { state: 'absent' });
    const safe = vi.fn();
    f.observer.onSafeSettlement(safe);
    f.close();
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({
      completionChild: 'closed',
      knownTree: 'settled',
      acquisitionChildren: 'unmeasured',
      safe: false,
    });
    expect(f.observer.snapshot().reasons).toContain('acquisition-unmeasured');
    expect(safe).not.toHaveBeenCalled();
  });
  it('keeps pending acquisition and failed handle-less spawn unsafe', () => {
    const pending = fixture('pending');
    pending.observer.recordRefusal();
    expect(pending.observer.snapshot().safe).toBe(false);
    const f = fixture();
    f.observer.recordLaunchAttempt();
    f.observer.recordLaunchFailure();
    expect(f.observer.snapshot()).toMatchObject({
      launch: 'failed',
      completionChild: 'unknown',
      knownTree: 'unmeasured',
      safe: false,
    });
  });
  it('ends only the old PID identity without adopting/signalling its replacement', () => {
    const f = fixture();
    launch(f);
    f.close();
    f.identities.set(22, { state: 'present', startTime: '999', processState: 'R' });
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'settled', safe: true });
    expect(f.observer.snapshot().knownProcesses).toEqual([
      { pid: 22, startTime: '200', state: 'ended' },
    ]);
    expect(f.child.kill).not.toHaveBeenCalled();
  });
  it('keeps unreadable identities unknown and retains zombie physical presence', () => {
    const f = fixture();
    launch(f);
    f.close();
    const safe = vi.fn();
    f.observer.onSafeSettlement(safe);
    f.identities.set(22, { state: 'unknown', reason: 'unreadable-stat' });
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'unmeasured', safe: false });
    f.identities.set(22, { state: 'present', startTime: '200', processState: 'Z' });
    f.observer.refreshKnownResources();
    // A zombie stopped executing but the same physical identity awaits reaping.
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'pending', safe: false });
    expect(f.observer.snapshot().knownProcesses).toEqual([
      { pid: 22, startTime: '200', state: 'reap-pending' },
    ]);
    expect(safe).not.toHaveBeenCalled();
    f.identities.set(22, { state: 'absent' });
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'settled', safe: true });
    expect(safe).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['initially-zombie', 'absent'],
    ['initially-zombie', 'replacement'],
    ['running-to-zombie', 'absent'],
    ['running-to-zombie', 'replacement'],
  ] as const)('retains %s until physical identity is %s', (initial, resolution) => {
    const f = fixture();
    if (initial === 'initially-zombie')
      f.identities.set(22, { state: 'present', startTime: '200', processState: 'Z' });
    launch(f);
    const safe = vi.fn();
    f.observer.onSafeSettlement(safe);
    f.identities.set(22, { state: 'present', startTime: '200', processState: 'Z' });
    f.close();
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({
      completionChild: 'closed',
      streamsClosed: true,
      knownTree: 'pending',
      safe: false,
    });
    expect(f.observer.snapshot().knownProcesses).toEqual([
      { pid: 22, startTime: '200', state: 'reap-pending' },
    ]);
    expect(safe).not.toHaveBeenCalled();
    f.identities.set(
      22,
      resolution === 'absent'
        ? { state: 'absent' }
        : { state: 'present', startTime: '999', processState: 'R' }
    );
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'settled', safe: true });
    expect(f.observer.snapshot().knownProcesses).toEqual([
      { pid: 22, startTime: '200', state: 'ended' },
    ]);
    f.observer.refreshKnownResources();
    expect(safe).toHaveBeenCalledTimes(1);
    expect(f.child.kill).not.toHaveBeenCalled();
  });
  it('does not turn zombie absence into ordinary acquisition proof', () => {
    const f = fixture('unmeasured');
    f.identities.set(22, { state: 'present', startTime: '200', processState: 'Z' });
    launch(f);
    const safe = vi.fn();
    f.observer.onSafeSettlement(safe);
    f.close();
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'pending', safe: false });
    f.identities.set(22, { state: 'absent' });
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({
      knownTree: 'settled',
      acquisitionChildren: 'unmeasured',
      safe: false,
    });
    expect(f.observer.snapshot().reasons).toContain('acquisition-unmeasured');
    expect(safe).not.toHaveBeenCalled();
  });
  it.each(['partial', 'unavailable'] as const)(
    'preserves %s enumeration uncertainty',
    (coverage) => {
      const f = fixture();
      vi.mocked(f.processes.enumerate).mockReturnValue({ coverage, pids: [22] });
      launch(f);
      f.close();
      f.identities.set(22, { state: 'absent' });
      f.observer.refreshKnownResources();
      expect(f.observer.snapshot()).toMatchObject({ knownTree: 'unmeasured', safe: false });
      expect(f.observer.snapshot().coverage).toBe(coverage);
    }
  );
  it('requires complete-empty receipt and refuses unsupported-platform health', () => {
    const f = fixture();
    vi.mocked(f.processes.enumerate).mockReturnValue({ coverage: 'complete', pids: [] });
    launch(f);
    f.close();
    expect(f.observer.snapshot().safe).toBe(true);
    const g = fixture();
    const observer = new NativeResourceObserver({
      acquisition: 'none',
      processes: { ...g.processes, platform: 'unsupported' },
    });
    observer.recordLaunchAttempt();
    observer.attachChild(g.child as unknown as ChildProcess);
    g.close();
    observer.refreshKnownResources();
    expect(observer.snapshot()).toMatchObject({ knownTree: 'unmeasured', safe: false });
  });
  it('never walks a reused root and never timer-promotes stopped refresh', () => {
    const f = fixture();
    launch(f);
    const calls = vi.mocked(f.processes.enumerate).mock.calls.length;
    f.identities.set(11, { state: 'present', startTime: '999', processState: 'R' });
    f.observer.refreshKnownResources();
    expect(vi.mocked(f.processes.enumerate).mock.calls.length).toBe(calls);
    expect(f.observer.snapshot().safe).toBe(false);
    const g = fixture();
    launch(g);
    g.close();
    g.identities.set(22, { state: 'absent' });
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(86_400_000);
      expect(g.observer.snapshot()).toMatchObject({ knownTree: 'pending', safe: false });
    } finally {
      vi.useRealTimers();
    }
  });
  it('records unreadable observation operations as unknown', () => {
    const f = fixture();
    vi.mocked(f.processes.readIdentity).mockImplementation(() => {
      throw new Error('offline observation denied');
    });
    launch(f);
    f.close();
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'unmeasured', safe: false });
  });
  it('notifies explicit disposal once without making physical resources safe', () => {
    const f = fixture();
    launch(f);
    const changed = vi.fn();
    f.observer.onChange(changed);
    f.observer.dispose();
    f.observer.dispose();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0]?.[0]).toMatchObject({
      safe: false,
      reasons: expect.arrayContaining(['observation-disposed']),
    });
  });
  it('freezes facts, preserves business listeners and detaches owned listeners once', () => {
    const f = fixture();
    launch(f);
    const before = f.observer.snapshot();
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.knownProcesses)).toBe(true);
    expect(Object.isFrozen(before.knownProcesses[0])).toBe(true);
    const business = vi.fn();
    f.child.on('close', business);
    const changed = vi.fn();
    const unsubscribe = f.observer.onChange(changed);
    unsubscribe();
    unsubscribe();
    const safe = vi.fn();
    f.observer.onSafeSettlement(safe);
    f.observer.dispose();
    f.observer.dispose();
    f.identities.set(22, { state: 'absent' });
    f.close();
    f.observer.refreshKnownResources();
    expect(f.observer.snapshot()).toMatchObject({ knownTree: 'unmeasured', safe: false });
    expect(before.knownTree).toBe('pending');
    expect(f.child.listenerCount('exit')).toBe(0);
    expect(f.child.listenerCount('error')).toBe(0);
    expect(business).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(safe).not.toHaveBeenCalled();
  });
});
