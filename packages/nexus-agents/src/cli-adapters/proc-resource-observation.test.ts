import { describe, expect, it, vi } from 'vitest';
import { parseProcStatStartTime, readProcIdentity } from './proc-start-time.js';
import { collectProcessTreeObservation } from './process-tree-kill.js';
const { read, directories } = vi.hoisted(() => ({ read: vi.fn(), directories: vi.fn() }));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  readFileSync: read,
  readdirSync: directories,
}));
function stat(state = 'S'): string {
  return `11 (fixture (nested) name) ${[state, ...Array<string>(18).fill('0'), '123'].join(' ')}`;
}
describe('lossless process observations preserve kill-helper semantics', () => {
  it('distinguishes running, zombie and malformed identities through the proc reader', () => {
    read.mockReturnValueOnce(stat());
    expect(readProcIdentity(11)).toEqual({
      state: 'present',
      processState: 'S',
      startTime: '123',
    });
    read.mockReturnValueOnce(stat('Z'));
    expect(readProcIdentity(11)).toEqual({
      state: 'present',
      processState: 'Z',
      startTime: '123',
    });
    expect(parseProcStatStartTime(stat('Z'))).toBeUndefined();
    read.mockReturnValueOnce('malformed');
    expect(readProcIdentity(11)).toEqual({
      state: 'unknown',
      reason: 'malformed-stat',
    });
    read.mockReturnValueOnce(stat().replace('11 (', 'invalid-prefix ('));
    expect(readProcIdentity(11)).toEqual({
      state: 'unknown',
      reason: 'malformed-stat',
    });
  });
  it.each(['ENOENT', 'ESRCH'])('only %s proves absence', (code) => {
    read.mockImplementation(() => {
      throw Object.assign(new Error('fixture'), { code });
    });
    expect(readProcIdentity(11)).toEqual({ state: 'absent' });
  });
  it('does not turn denied or malformed stat reads into absence', () => {
    read.mockImplementation(() => {
      throw Object.assign(new Error('fixture'), { code: 'EACCES' });
    });
    expect(readProcIdentity(11)).toEqual({ state: 'unknown', reason: 'unreadable-stat' });
    read.mockReturnValue('bad');
    expect(readProcIdentity(11)).toEqual({ state: 'unknown', reason: 'malformed-stat' });
  });
  it('names complete empty, unavailable and partially traversed enumeration', () => {
    expect(collectProcessTreeObservation(11, () => ({ coverage: 'complete', pids: [] }))).toEqual({
      coverage: 'complete',
      pids: [],
    });
    expect(
      collectProcessTreeObservation(11, () => ({ coverage: 'unavailable', pids: [] }))
    ).toEqual({ coverage: 'unavailable', pids: [] });
    expect(
      collectProcessTreeObservation(11, (pid) =>
        pid === 11 ? { coverage: 'complete', pids: [22] } : { coverage: 'unavailable', pids: [] }
      )
    ).toEqual({ coverage: 'partial', pids: [22] });
  });
  it.runIf(process.platform === 'linux')(
    'distinguishes an empty thread directory from complete empty children',
    () => {
      directories.mockReturnValue(['11']);
      read.mockReturnValue('');
      expect(collectProcessTreeObservation(11)).toEqual({ coverage: 'complete', pids: [] });
      directories.mockReturnValue([]);
      expect(collectProcessTreeObservation(11)).toEqual({ coverage: 'unavailable', pids: [] });
    }
  );
  it.runIf(process.platform === 'linux')(
    'retains readable children when another thread read is denied',
    () => {
      directories.mockImplementation((path: string) =>
        path === '/proc/11/task' ? ['11', '12'] : ['22']
      );
      read.mockImplementation((path: string) => {
        if (path === '/proc/11/task/12/children')
          throw Object.assign(new Error('offline denied'), { code: 'EACCES' });
        return path === '/proc/11/task/11/children' ? '22' : '';
      });
      expect(collectProcessTreeObservation(11)).toEqual({ coverage: 'partial', pids: [22] });
    }
  );
  it.runIf(process.platform === 'linux')(
    'retains malformed enumeration as partial rather than complete-empty',
    () => {
      directories.mockReturnValue(['11']);
      read.mockReturnValue('invalid-child-token');
      expect(collectProcessTreeObservation(11)).toEqual({ coverage: 'partial', pids: [] });
    }
  );
  it('bounds wide walks and reports truncation without discarding known PIDs', () => {
    const result = collectProcessTreeObservation(11, (pid) => ({
      coverage: 'complete',
      pids: pid === 11 ? Array.from({ length: 1001 }, (_, n) => n + 100) : [],
    }));
    expect(result.coverage).toBe('partial');
    expect(result.pids).toHaveLength(1000);
  });
});
