/**
 * Tests for the MCP description-drift gate (#3528).
 *
 * The live gate (`buildDriftReport` over the real manifest) is the CI assertion:
 * every tool's runtime registerTool description must parse AND agree with its
 * TOOL_DESCRIPTIONS entry. The unit tests below pin the parser/metric behavior,
 * including a #3527 regression fixture (the list_workflows drift this gate
 * exists to catch).
 */

import { describe, it, expect } from 'vitest';
import {
  parseConcatenatedString,
  extractRuntimeDescription,
  similarity,
  buildDriftReport,
  SIMILARITY_THRESHOLD,
} from './check-mcp-description-drift.js';
import { TOOL_MANIFEST } from '../packages/nexus-agents/src/mcp/tools/tool-manifest.js';
import { TOOL_DESCRIPTIONS } from './tool-descriptions-data.js';

describe('parseConcatenatedString', () => {
  it('joins +-concatenated single-quoted strings', () => {
    expect(parseConcatenatedString("'foo ' +\n  'bar'")).toBe('foo bar');
  });
  it('reads a template literal, blanking ${...} interpolations', () => {
    expect(parseConcatenatedString('`templates (${ids.join("/")}) auto-detect`')).toBe(
      'templates ( ) auto-detect'
    );
  });
  it('does NOT treat a markdown code-span inside a quoted string as a template', () => {
    // Regression: SURVEY_DESCRIPTION embeds `research_add_source` in a quoted string.
    expect(parseConcatenatedString("'use `research_add_source` for that'")).toBe(
      'use `research_add_source` for that'
    );
  });
  it('returns null for an expression with no string literal', () => {
    expect(parseConcatenatedString('computeDescription(x)')).toBeNull();
  });
});

describe('extractRuntimeDescription', () => {
  it('resolves a `description,` shorthand to its const (registerTool)', () => {
    const src = `const description = 'Alpha tool.' + ' Does X.';
server.registerTool('alpha', { description, inputSchema: S.shape });`;
    expect(extractRuntimeDescription(src, 'alpha')).toBe('Alpha tool. Does X.');
  });
  it('resolves a named const via registerToolTask (MCP Tasks form)', () => {
    const src = `const description = 'Beta tool.';
server.experimental.tasks.registerToolTask('beta', { description, inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'beta')).toBe('Beta tool.');
  });
  it('does not grab a later schema-field description outside the config', () => {
    const src = `server.registerTool('gamma', { description: GAMMA_DESC, inputSchema: z.object({ x: z.string().describe('a field') }) });
const GAMMA_DESC = 'Gamma tool real description.';`;
    expect(extractRuntimeDescription(src, 'gamma')).toBe('Gamma tool real description.');
  });
});

describe('similarity (overlap coefficient)', () => {
  it('scores a consistent shorter-vs-longer pair HIGH', () => {
    const short = 'Inventory of expert roles available to create_expert.';
    const long =
      'Inventory of expert ROLES available to create_expert (architect, security, devex). ' +
      'Use this BEFORE create_expert to pick a role; returns role name and capabilities.';
    expect(similarity(short, long)).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });
  it('flags the #3527 list_workflows drift (different facts → LOW)', () => {
    // The original disagreement: the two sources listed different return fields.
    const a = 'returns template name, version, description, and category';
    const b = 'lists workflow templates with name and required inputs';
    expect(similarity(a, b)).toBeLessThan(SIMILARITY_THRESHOLD);
  });
});

describe('live gate: runtime vs doc-table descriptions agree (#3528)', () => {
  // TOOL_MANIFEST entries are `{ name, annotations, sideEffects }` objects;
  // buildDriftReport (and the CLI gate, check-mcp-description-drift.ts main())
  // take the tool *names*. Passing the raw objects made every lookup miss —
  // a bug masked while these tests were uncollected by CI (#3952).
  const report = buildDriftReport(
    TOOL_MANIFEST.map((t) => t.name),
    TOOL_DESCRIPTIONS
  );

  it('every manifest tool has a TOOL_DESCRIPTIONS entry', () => {
    expect(report.missingDocEntry).toEqual([]);
  });

  it('every tool runtime description is statically parseable (fail-loud)', () => {
    // A tool here means the extractor cannot read its registerTool description —
    // expose it as a parseable `const DESCRIPTION` rather than silently skipping.
    expect(report.unparseable).toEqual([]);
  });

  it('no tool runtime description drifts from its doc-table entry', () => {
    const summary = report.drifts.map((d) => `${d.tool} (sim=${d.similarity.toFixed(2)})`);
    expect(summary).toEqual([]);
  });
});
