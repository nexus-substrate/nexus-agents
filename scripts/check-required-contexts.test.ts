import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

let subject: typeof import('./check-required-contexts.js');
let workflowDirectory: string;
const EXPECTED = ['CI Success', 'Governor-path ratification gate'];
const REAL_WORKFLOWS = fileURLToPath(new URL('../.github/workflows/', import.meta.url));

beforeEach(async () => {
  subject = await import('./check-required-contexts.js');
  workflowDirectory = mkdtempSync(join(tmpdir(), 'required-contexts-'));
  vi.mocked(execFileSync).mockReset();
});

afterEach(() => {
  if (workflowDirectory !== undefined) rmSync(workflowDirectory, { recursive: true, force: true });
});

describe('checkRequiredContexts', () => {
  it('accepts required contexts with matching producers', () => {
    expect(subject.EXPECTED_REQUIRED_CONTEXTS).toEqual(EXPECTED);
    expect(
      subject.checkRequiredContexts({ requiredContexts: EXPECTED, workflowJobNames: EXPECTED })
    ).toEqual({ verdict: 'ok', missing: [], unproduced: [], expected: EXPECTED });
  });

  it('reports an expected context missing from branch protection', () => {
    expect(
      subject.checkRequiredContexts({
        requiredContexts: ['CI Success'],
        workflowJobNames: EXPECTED,
      })
    ).toEqual({
      verdict: 'drift',
      missing: ['Governor-path ratification gate'],
      unproduced: [],
      expected: EXPECTED,
    });
  });

  it('reports a renamed workflow job as an unproduced context', () => {
    expect(
      subject.checkRequiredContexts({
        requiredContexts: EXPECTED,
        workflowJobNames: ['CI Success', 'Renamed gate'],
      })
    ).toEqual({
      verdict: 'drift',
      missing: [],
      unproduced: ['Governor-path ratification gate'],
      expected: EXPECTED,
    });
  });

  it('reports an extra required context without a producer', () => {
    expect(
      subject.checkRequiredContexts({
        requiredContexts: [...EXPECTED, 'Obsolete check'],
        workflowJobNames: EXPECTED,
      })
    ).toEqual({
      verdict: 'drift',
      missing: [],
      unproduced: ['Obsolete check'],
      expected: EXPECTED,
    });
  });

  it('accepts extra required contexts when they have producers', () => {
    expect(
      subject.checkRequiredContexts({
        requiredContexts: [...EXPECTED, 'Extra check'],
        workflowJobNames: [...EXPECTED, 'Extra check'],
      }).verdict
    ).toBe('ok');
  });

  it('reports an empty job list as drift', () => {
    expect(
      subject.checkRequiredContexts({ requiredContexts: EXPECTED, workflowJobNames: [] })
    ).toEqual({ verdict: 'drift', missing: [], unproduced: EXPECTED, expected: EXPECTED });
  });

  it('reports empty branch protection as drift', () => {
    expect(
      subject.checkRequiredContexts({ requiredContexts: [], workflowJobNames: EXPECTED })
    ).toEqual({ verdict: 'drift', missing: EXPECTED, unproduced: [], expected: EXPECTED });
  });

  it('reports both empty collections as drift', () => {
    expect(
      subject.checkRequiredContexts({ requiredContexts: [], workflowJobNames: [] }).verdict
    ).toBe('drift');
  });

  it.each([{ workflowJobNames: EXPECTED }, { workflowJobNames: [] }])(
    'keeps unavailable protection unmeasured with jobs $workflowJobNames',
    ({ workflowJobNames }) => {
      expect(
        subject.checkRequiredContexts({ requiredContexts: 'unmeasured', workflowJobNames })
      ).toEqual({ verdict: 'unmeasured', missing: [], unproduced: [], expected: EXPECTED });
    }
  );
});

describe('loadWorkflowJobNames', () => {
  it('reads names from every workflow and falls back to unnamed job IDs', () => {
    writeFileSync(
      join(workflowDirectory, 'first.yml'),
      'jobs:\n  gate:\n    name: CI Success\n  unnamed:\n    runs-on: ubuntu-latest\n'
    );
    writeFileSync(
      join(workflowDirectory, 'second.yml'),
      'jobs:\n  governor:\n    name: Governor-path ratification gate\n'
    );
    writeFileSync(join(workflowDirectory, 'ignored.txt'), 'not yaml');
    expect(subject.loadWorkflowJobNames(workflowDirectory).sort()).toEqual(
      [...EXPECTED, 'unnamed'].sort()
    );
  });

  it('returns no producers for an empty directory', () => {
    expect(subject.loadWorkflowJobNames(workflowDirectory)).toEqual([]);
  });

  it('rejects a malformed workflow instead of claiming complete coverage', () => {
    writeFileSync(join(workflowDirectory, 'broken.yml'), 'jobs: [');
    expect(() => subject.loadWorkflowJobNames(workflowDirectory)).toThrow();
  });

  it('rejects invalid job names', () => {
    writeFileSync(join(workflowDirectory, 'broken.yml'), 'jobs:\n  gate:\n    name: 42\n');
    expect(() => subject.loadWorkflowJobNames(workflowDirectory)).toThrow();
  });

  it('finds both expected producers in the REAL repository workflows without an API call', () => {
    const names = subject.loadWorkflowJobNames(REAL_WORKFLOWS);
    expect(names).toEqual(expect.arrayContaining(EXPECTED));
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe('loadRequiredContexts', () => {
  it('reads contexts through gh with separate arguments', () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ contexts: EXPECTED }));
    expect(subject.loadRequiredContexts()).toEqual(EXPECTED);
    expect(execFileSync).toHaveBeenCalledWith(
      'gh',
      ['api', 'repos/nexus-substrate/nexus-agents/branches/main/protection/required_status_checks'],
      expect.objectContaining({ encoding: 'utf-8', timeout: expect.any(Number) })
    );
  });

  it('preserves a measured empty contexts array', () => {
    vi.mocked(execFileSync).mockReturnValue('{"contexts":[]}');
    expect(subject.loadRequiredContexts()).toEqual([]);
  });

  it('reports failed API access as unmeasured', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('HTTP 403');
    });
    expect(subject.loadRequiredContexts()).toBe('unmeasured');
  });

  it.each(['not json', '{}', '{"contexts":null}', '{"contexts":[42]}'])(
    'reports invalid API data %s as unmeasured',
    (response) => {
      vi.mocked(execFileSync).mockReturnValue(response);
      expect(subject.loadRequiredContexts()).toBe('unmeasured');
    }
  );
});

describe('runRequiredContextsCheck', () => {
  it('prints ok and returns exit code 0 for live matching contexts', () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ contexts: EXPECTED }));
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(subject.runRequiredContextsCheck(REAL_WORKFLOWS)).toBe(0);
    expect(output).toHaveBeenCalledWith('Required contexts: ok');
  });

  it('prints drift and returns exit code 1 when no jobs produce the contexts', () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ contexts: EXPECTED }));
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(subject.runRequiredContextsCheck(workflowDirectory)).toBe(1);
    expect(output).toHaveBeenCalledWith('Required contexts: drift');
    expect(output).toHaveBeenCalledWith(expect.stringContaining('CI Success'));
  });

  it('prints what was not measured and returns exit code 2 after an API failure', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('HTTP 403');
    });
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(subject.runRequiredContextsCheck(REAL_WORKFLOWS)).toBe(2);
    expect(output).toHaveBeenCalledWith('Required contexts: unmeasured');
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('Branch protection required status checks were not measured')
    );
  });

  it('reports workflow loading failures as unmeasured', () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ contexts: EXPECTED }));
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(subject.runRequiredContextsCheck(join(workflowDirectory, 'missing'))).toBe(2);
    expect(output).toHaveBeenCalledWith('Required contexts: unmeasured');
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('Workflow job names were not measured')
    );
  });
});
