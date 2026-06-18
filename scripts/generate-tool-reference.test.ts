/**
 * Tests for the MCP tool-reference generator (#3687, enriched #3688).
 *
 * Asserts the generated per-tool pages are DERIVED from the live Zod input
 * schemas via Zod v4's native `z.toJSONSchema`, that the enriched constraint
 * detail (enum members, min/max, defaults) surfaces, and that the committed
 * docs/reference/tools/*.md are in sync (the drift-gate contract).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectToolDocs, renderToolPage } from './generate-tool-reference.js';
import { TOOL_MANIFEST } from '../packages/nexus-agents/src/mcp/tools/tool-manifest.js';

const ROOT = join(import.meta.dirname, '..');
const TOOLS_DOC_DIR = join(ROOT, 'docs', 'reference', 'tools');

describe('generate-tool-reference', () => {
  it('produces one doc per registered manifest tool', async () => {
    const docs = await collectToolDocs();
    expect(docs).toHaveLength(TOOL_MANIFEST.length);
    const names = new Set(docs.map((d) => d.name));
    for (const { name } of TOOL_MANIFEST) {
      expect(names.has(name)).toBe(true);
    }
  });

  it('extracts full enum members from a referenced-schema field', async () => {
    const docs = await collectToolDocs();
    const consensus = docs.find((d) => d.name === 'consensus_vote');
    expect(consensus).toBeDefined();
    const strategy = consensus?.params.find((p) => p.name === 'strategy');
    expect(strategy?.type).toBe('enum');
    // The static parser previously surfaced only "VotingStrategySchema"; the
    // Zod-native conversion now resolves the concrete members.
    expect(strategy?.constraints).toContain('simple_majority');
    expect(strategy?.constraints).toContain('higher_order');
  });

  it('captures string length bounds and required-ness', async () => {
    const docs = await collectToolDocs();
    const consensus = docs.find((d) => d.name === 'consensus_vote');
    const proposal = consensus?.params.find((p) => p.name === 'proposal');
    expect(proposal?.required).toBe(true);
    expect(proposal?.type).toBe('string');
    expect(proposal?.constraints).toContain('minLength 1');
    expect(proposal?.constraints).toContain('maxLength 4000');
  });

  it('captures numeric bounds and defaults as optional params', async () => {
    const docs = await collectToolDocs();
    const dev = docs.find((d) => d.name === 'run_dev_pipeline');
    expect(dev).toBeDefined();
    const maxVote = dev?.params.find((p) => p.name === 'maxVoteIterations');
    // A `.default()` field is optional and surfaces its default + range.
    expect(maxVote?.required).toBe(false);
    expect(maxVote?.constraints).toContain('default');
    expect(maxVote?.constraints).toMatch(/min 1|max 5/);
  });

  it('renders a parameter table with the Constraints column', async () => {
    const docs = await collectToolDocs();
    const consensus = docs.find((d) => d.name === 'consensus_vote');
    expect(consensus).toBeDefined();
    const md = renderToolPage(consensus!);
    expect(md).toContain('| Parameter | Type | Required | Constraints | Description |');
    // The escaped enum separator must appear in the rendered cell.
    expect(md).toContain('simple_majority \\| supermajority');
  });

  it('keeps the committed pages in sync with a fresh generation (drift gate)', async () => {
    const docs = await collectToolDocs();
    for (const doc of docs) {
      const path = join(TOOLS_DOC_DIR, `${doc.name}.md`);
      expect(existsSync(path), `missing committed page for ${doc.name}`).toBe(true);
      const committed = readFileSync(path, 'utf-8');
      expect(committed, `${doc.name}.md is out of date — run pnpm docs:tools`).toBe(
        renderToolPage(doc)
      );
    }
  });
});
