import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { ROOT } from './script-paths.js';

it('links across flat and nested pages to authoritative anchors for same-name members', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'nexus-typedoc-anchors-'));
  const pkg = join(ROOT, 'packages/nexus-agents');
  try {
    writeFileSync(
      join(scratch, 'agents.ts'),
      `export interface ExpertConfig { name: string; }
export class Expert { expertConfig?: ExpertConfig; }
export class ExpertFactory { expertConfig?: ExpertConfig; }
export function fromAgents(config: ExpertConfig): ExpertConfig { return config; }
`
    );
    const consumer = `import type { ExpertConfig } from './agents.js';
export function fromConfig(config: ExpertConfig): ExpertConfig { return config; }
`;
    writeFileSync(join(scratch, 'workflows.ts'), consumer);
    writeFileSync(join(scratch, 'pipeline.ts'), '/** @module exports/pipeline */\n' + consumer);
    writeFileSync(
      join(scratch, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true }, include: ['*.ts'] })
    );
    const config = JSON.parse(readFileSync(join(pkg, 'typedoc.markdown.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    writeFileSync(
      join(scratch, 'typedoc.json'),
      JSON.stringify({
        ...config,
        entryPoints: ['agents', 'workflows', 'pipeline'].map((name) => join(scratch, `${name}.ts`)),
        tsconfig: join(scratch, 'tsconfig.json'),
        out: join(scratch, 'out'),
        plugin: [
          'typedoc-plugin-markdown',
          'typedoc-plugin-frontmatter',
          join(pkg, 'scripts/typedoc-astro-title.mjs'),
        ],
      })
    );
    execFileSync(
      process.execPath,
      [join(pkg, 'node_modules/typedoc/bin/typedoc'), '--options', join(scratch, 'typedoc.json')],
      { cwd: pkg, timeout: 30000, stdio: 'pipe' }
    );

    const agents = readFileSync(join(scratch, 'out/agents.md'), 'utf8');
    const interfaceAnchor = agents.match(/<a id="([^"]+)"><\/a>\s*### ExpertConfig\n/)?.[1];
    if (interfaceAnchor === undefined) throw new Error('Missing ExpertConfig interface anchor');
    expect(interfaceAnchor).toMatch(/^api-expertconfig(?:-\d+)?$/);
    const sameNameAnchors = [...agents.matchAll(/<a id="(api-expertconfig(?:-\d+)?)"><\/a>/g)].map(
      (match) => match[1]
    );
    expect(sameNameAnchors).toHaveLength(3);
    expect(new Set(sameNameAnchors).size).toBe(3);
    expect(agents).toContain(`](#${interfaceAnchor})`);
    for (const [file, target] of [
      ['workflows.md', 'agents.md'],
      ['exports/pipeline.md', '../agents.md'],
    ] as const) {
      const consumerPage = readFileSync(join(scratch, 'out', file), 'utf8');
      expect(consumerPage).toContain(`](${target}#${interfaceAnchor})`);
      expect(consumerPage).not.toMatch(/\]\((?:\.\.\/)?agents\.md#expertconfig/);
      expect(consumerPage).toMatch(/^---\ntitle: /);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
