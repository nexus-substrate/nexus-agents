import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv, REPOSITORY_LOCAL_GIT_ENV_VARS } from './hermetic-git-env.js';

describe('hermeticGitEnv', () => {
  it('tracks the test host git repository-local variable list so additions fail closed', () => {
    const host = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
      .trim()
      .split('\n');
    expect(host.length).toBeGreaterThan(0);
    // Git versions differ on this internal variable. Keep stripping it even
    // when the host omits it. Indexed config entries are a dynamic family.
    const normalize = (name: string): string =>
      name.replace(/^(GIT_CONFIG_(?:KEY|VALUE))_\d+$/, '$1_');
    const expected = new Set([...host.map(normalize), 'GIT_INTERNAL_SUPER_PREFIX']);
    const declared = REPOSITORY_LOCAL_GIT_ENV_VARS.filter(
      (name) => !/^GIT_CONFIG_(?:KEY|VALUE)_$/.test(name)
    );
    const concreteHost = [...expected].filter((name) => !/^GIT_CONFIG_(?:KEY|VALUE)_$/.test(name));
    expect([...declared].sort()).toEqual(concreteHost.sort());
    for (const name of host) expect(hermeticGitEnv({ [name]: 'fixture' })).not.toHaveProperty(name);
  });

  it('removes every declared local variable and indexed config family without changing its input', () => {
    const base: NodeJS.ProcessEnv = {
      PATH: '/fixture/bin',
      HOME: '/fixture/home',
      GIT_SSH_COMMAND: 'fixture ssh',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/fixture/hooks',
      GIT_CONFIG_KEY_999: 'core.worktree',
      GIT_CONFIG_VALUE_999: '/fixture/source',
    };
    for (const name of REPOSITORY_LOCAL_GIT_ENV_VARS) base[name] = 'fixture';
    const before = { ...base };
    expect(hermeticGitEnv(base)).toEqual({
      PATH: '/fixture/bin',
      HOME: '/fixture/home',
      GIT_SSH_COMMAND: 'fixture ssh',
    });
    expect(base).toEqual(before);
  });

  it('names the empty environment case', () => {
    expect(hermeticGitEnv({})).toEqual({});
  });
});
