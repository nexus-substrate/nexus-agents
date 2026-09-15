/** Governor formatting must not execute configuration in the target checkout (#6369). */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as prettier from 'prettier';
import { formatWithPrettier } from './inject-governance.js';

let targetDir: string;
beforeEach(() => {
  targetDir = mkdtempSync(join(tmpdir(), 'governor-format-target-'));
  vi.stubEnv('NEXUS_GOVERNOR_GATE', '1');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await prettier.clearConfigCache();
  rmSync(targetDir, { recursive: true, force: true });
});

it.each(['config', 'plugin'] as const)(
  'does not execute target %s; standalone formatting still does',
  async (kind) => {
    const marker = join(targetDir, 'executed-marker');
    const maliciousModule = join(targetDir, kind === 'config' ? '.prettierrc.cjs' : 'plugin.cjs');
    writeFileSync(
      maliciousModule,
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\n` +
        'module.exports = {};\n'
    );
    if (kind === 'plugin') {
      writeFileSync(join(targetDir, '.prettierrc'), JSON.stringify({ plugins: [maliciousModule] }));
    }
    expect(await formatWithPrettier(join(targetDir, 'AGENTS.md'), '# Hello target\n')).toBe(
      '# Hello target\n'
    );
    expect(existsSync(marker)).toBe(false);
    // Positive control: this exact fixture executes in standalone mode, so the
    // absent marker above measures the gate's trust boundary rather than inert code.
    vi.stubEnv('NEXUS_GOVERNOR_GATE', '');
    await prettier.clearConfigCache();
    await formatWithPrettier(join(targetDir, 'AGENTS.md'), '# Hello target\n');
    expect(existsSync(marker)).toBe(true);
  }
);
