/**
 * Tests for the MCP description-drift gate (#3528).
 *
 * The live gate (`buildDriftReport` over the real manifest) is the CI assertion:
 * every tool's runtime registerTool description must parse AND agree with its
 * TOOL_DESCRIPTIONS entry. The unit tests below pin the parser/metric behavior,
 * including a #3527 regression fixture (the list_workflows drift this gate
 * exists to catch).
 */

import { execFileSync } from 'node:child_process';
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
    expect(parseConcatenatedString("'foo ' +\n  'bar'")).toEqual({
      text: 'foo bar',
      elidedSubstitutions: 0,
    });
  });
  it('keeps every static span with one elided template substitution', () => {
    expect(parseConcatenatedString('`prefix ${x} suffix`')).toEqual({
      text: 'prefix <dynamic> suffix',
      elidedSubstitutions: 1,
    });
    expect(parseConcatenatedString('`templates (${ids.join("/")}) auto-detect`')).toEqual({
      text: 'templates (<dynamic>) auto-detect',
      elidedSubstitutions: 1,
    });
  });
  it('counts substitutions across templates and concatenations with decoded static spans', () => {
    expect(parseConcatenatedString('`a; ${x}\\n${getText()} z` + (`${items}` + " end")')).toEqual({
      text: 'a; <dynamic>\n<dynamic> z<dynamic> end',
      elidedSubstitutions: 3,
    });
  });
  it('does not execute template substitutions', () => {
    expect(parseConcatenatedString('`${(() => { throw new Error("never"); })()}`')).toEqual({
      text: '<dynamic>',
      elidedSubstitutions: 1,
    });
  });
  it('reads static templates and parenthesised concatenations with decoded escapes', () => {
    expect(parseConcatenatedString('("a; " + (`b` + "\\n\\u0063"))')).toEqual({
      text: 'a; b\nc',
      elidedSubstitutions: 0,
    });
  });
  it('accepts an empty string as a complete literal', () => {
    expect(parseConcatenatedString('""')).toEqual({ text: '', elidedSubstitutions: 0 });
  });
  it.each([
    '"prefix" + suffix',
    'prefix + "suffix"',
    'describe("fragment")',
    '"prefix" + describe("fragment")',
    '`prefix ${x}` + suffix',
    '`prefix ${x}` + describe("fragment")',
    '`prefix ${x} suffix',
    'true ? "yes" : "no"',
    '"text"; "extra"',
    '"unterminated',
    '"text" +',
    '',
  ])('rejects the whole unsupported or incomplete expression: %s', (expr) => {
    expect(parseConcatenatedString(expr)).toBeNull();
  });
  it('does NOT treat a markdown code-span inside a quoted string as a template', () => {
    // Regression: SURVEY_DESCRIPTION embeds `research_add_source` in a quoted string.
    expect(parseConcatenatedString("'use `research_add_source` for that'")).toEqual({
      text: 'use `research_add_source` for that',
      elidedSubstitutions: 0,
    });
  });
  it('returns null for an expression with no string literal', () => {
    expect(parseConcatenatedString('computeDescription(x)')).toBeNull();
  });
});

describe('extractRuntimeDescription', () => {
  it('resolves template const and inline descriptions with an elision count', () => {
    const expr = '`start; ${items.join("/")} end`';
    const src = `const D = ${expr};
server.registerTool('alpha', { description: D });
server.registerTool('beta', { description: ${expr} });`;
    const expected = { text: 'start; <dynamic> end', elidedSubstitutions: 1 };
    expect(extractRuntimeDescription(src, 'alpha')).toEqual(expected);
    expect(extractRuntimeDescription(src, 'beta')).toEqual(expected);
  });
  it('does not resolve a const assigned from a bare identifier', () => {
    const src = `const OTHER = 'static';
const D = OTHER;
server.registerTool('alpha', { description: D });`;
    expect(extractRuntimeDescription(src, 'alpha')).toBeNull();
  });
  it('resolves semicolons inside an untyped const without truncation', () => {
    const src = `const D = "a; b";
server.registerTool('alpha', { description: D, inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'alpha')).toEqual({
      text: 'a; b',
      elidedSubstitutions: 0,
    });
  });
  it('keeps every concatenated part around a middle semicolon', () => {
    const src = `const D = "start " + "middle; part " + "end";
server.registerTool('alpha', { description: D, inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'alpha')).toEqual({
      text: 'start middle; part end',
      elidedSubstitutions: 0,
    });
  });
  it.each([
    ['"a; b"', 'a; b'],
    ['"start " + "middle; part " + "end"', 'start middle; part end'],
    ['"x; y \'async\' z"', "x; y 'async' z"],
    ['(`static; template` + (" end"))', 'static; template end'],
  ])('resolves the full const initializer: %s', (expr, expected) => {
    const src = `const D: string = ${expr};
server.registerTool('alpha', { description: D, inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'alpha')).toEqual({
      text: expected,
      elidedSubstitutions: 0,
    });
  });
  it('does not turn the historical quoted fragment into async', () => {
    const src = `const D = "x; y 'async' z";
server.registerTool('alpha', { description: D, inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'alpha')).toEqual({
      text: "x; y 'async' z",
      elidedSubstitutions: 0,
    });
  });
  it.each([
    'otherDescription',
    '"prefix" + suffix',
    'describe("fragment")',
    '"prefix" + describe("fragment")',
  ])('rejects unsupported const and inline initializers: %s', (expr) => {
    const src = `const D = ${expr};
server.registerTool('alpha', { description: D, inputSchema: S });
server.registerTool('beta', { description: ${expr}, inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'alpha')).toBeNull();
    expect(extractRuntimeDescription(src, 'beta')).toBeNull();
  });
  it('reads a full inline expression regardless of inputSchema text or length', () => {
    const expected = `inputSchema; ${'detail '.repeat(400)}tail`;
    const src = `server.registerTool('alpha', {
      description: (${JSON.stringify(expected)} + \` end\`), inputSchema: S
    });`;
    expect(extractRuntimeDescription(src, 'alpha')).toEqual({
      text: `${expected} end`,
      elidedSubstitutions: 0,
    });
  });
  it('ignores registerTool text in comments and strings', () => {
    const src = `// server.registerTool('alpha', { description: 'fake' });
const example = "registerTool('alpha', { description: 'fake' })";
server.registerTool('alpha', { description: 'real', inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'alpha')).toEqual({
      text: 'real',
      elidedSubstitutions: 0,
    });
  });
  it('returns null when the tool is absent or the description is missing', () => {
    const src = `server.registerTool('alpha', { inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'alpha')).toBeNull();
    expect(extractRuntimeDescription(src, 'missing')).toBeNull();
  });
  it('does not resolve a mutable declaration as a const', () => {
    const src = `let D = 'mutable';
server.registerTool('alpha', { description: D, inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'alpha')).toBeNull();
  });
  it('resolves a `description,` shorthand to its const (registerTool)', () => {
    const src = `const description = 'Alpha tool.' + ' Does X.';
server.registerTool('alpha', { description, inputSchema: S.shape });`;
    expect(extractRuntimeDescription(src, 'alpha')).toEqual({
      text: 'Alpha tool. Does X.',
      elidedSubstitutions: 0,
    });
  });
  it('resolves a named const via registerToolTask (MCP Tasks form)', () => {
    const src = `const description = 'Beta tool.';
server.experimental.tasks.registerToolTask('beta', { description, inputSchema: S });`;
    expect(extractRuntimeDescription(src, 'beta')).toEqual({
      text: 'Beta tool.',
      elidedSubstitutions: 0,
    });
  });
  it('does not grab a later schema-field description outside the config', () => {
    const src = `server.registerTool('gamma', { description: GAMMA_DESC, inputSchema: z.object({ x: z.string().describe('a field') }) });
const GAMMA_DESC = 'Gamma tool real description.';`;
    expect(extractRuntimeDescription(src, 'gamma')).toEqual({
      text: 'Gamma tool real description.',
      elidedSubstitutions: 0,
    });
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

  it('compares all 47 tools, including the three descriptions with substitutions', () => {
    expect(report.compared).toHaveLength(47);
    expect(report.compared).toEqual(
      expect.arrayContaining([
        { tool: 'extract_symbols', elidedSubstitutions: 2 },
        { tool: 'search_usages', elidedSubstitutions: 2 },
        { tool: 'run_pipeline', elidedSubstitutions: 1 },
      ])
    );
  });

  it('reports elisions per tool in the live verbose output', () => {
    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/check-mcp-description-drift.ts', '--verbose'],
      { encoding: 'utf-8' }
    );
    expect(output).toContain('47 tools compared');
    expect(output).toContain('extract_symbols compared with 2 elided substitutions');
    expect(output).toContain('search_usages compared with 2 elided substitutions');
    expect(output).toContain('run_pipeline compared with 1 elided substitutions');
  });

  it('no tool runtime description drifts from its doc-table entry', () => {
    const summary = report.drifts.map((d) => `${d.tool} (sim=${d.similarity.toFixed(2)})`);
    expect(summary).toEqual([]);
  });
});
