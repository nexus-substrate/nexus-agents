/**
 * Drift gate — `TOOL_DESCRIPTIONS.run_pipeline` must name every
 * `PIPELINE_TEMPLATES` entry. Closes #2728's acceptance criterion.
 *
 * Pre-fix: `PIPELINE_TEMPLATES` registered 5 templates but three static
 * description sites (`pipeline-tool.ts:46` JSDoc, `pipeline-tool.ts:163`
 * MCP description, `scripts/tool-descriptions-data.ts:84` CLAUDE.md render)
 * named only the pre-`general` 4. An LLM caller reading the MCP description
 * would never pass `template: 'general'` because the surface said it
 * didn't exist. The three strings were fixed in earlier commits; this
 * test fails the next time someone adds a template without updating the
 * description.
 *
 * Lives in `scripts/` (not the package) because the assertion crosses
 * the workspace boundary — `TOOL_DESCRIPTIONS` is in `scripts/`, and the
 * package's `rootDir: 'src'` forbids importing from outside the package.
 */

import { describe, it, expect } from 'vitest';
import { TOOL_DESCRIPTIONS } from './tool-descriptions-data.js';
import { listTemplateIds } from '../packages/nexus-agents/src/pipeline/templates.js';

describe('TOOL_DESCRIPTIONS drift gate', () => {
  it('run_pipeline names every PIPELINE_TEMPLATES entry', () => {
    const description = TOOL_DESCRIPTIONS.run_pipeline;
    expect(description, 'run_pipeline must have a TOOL_DESCRIPTIONS entry').toBeDefined();

    const missing = listTemplateIds().filter((id) => !description!.includes(id));
    expect(missing, `template id(s) missing from description: ${missing.join(', ')}`).toEqual([]);
  });
});
