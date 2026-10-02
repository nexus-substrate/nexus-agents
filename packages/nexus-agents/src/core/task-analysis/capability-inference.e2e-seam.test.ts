/** Analyzer → detector → durable ledger regression coverage (#6930). */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPPORTED_EXTENSIONS } from '../../indexer/symbol-extractor.js';
import { TOOL_MANIFEST } from '../../mcp/tools/tool-manifest.js';
import issueTitles from './fixtures/issue-titles-6930.json' with { type: 'json' };
import extractionPhrasings from './fixtures/extraction-phrasings-6930.json' with { type: 'json' };
import { detectCapabilityGaps } from './capability-gap-detector.js';
import { createPersistentCapabilityGapLedger } from './capability-gap-ledger-persistence.js';
import { recordRoutingGaps } from './capability-gap-ledger.js';
import { inferRequiredCapabilities } from './task-analysis-advocate.js';
import { createSharedTaskAnalyzer, type TaskTypeCategory } from './shared-task-analyzer.js';
import { recordToolRefusal, toolRefusalGapName } from './tool-refusal-gap.js';

const analyzer = createSharedTaskAnalyzer();
const missingExtensions = ['.py', '.go', '.rs'];
const taskTypes: readonly TaskTypeCategory[] = [
  'architecture',
  'code_implementation',
  'code_review',
  'security_review',
  'test_generation',
  'documentation',
  'large_codebase',
  'bulk_operations',
  'general',
];

describe('requirement inference across the analyzer → detector seam', () => {
  it('reports one inferred Python symbol-extraction gap', () => {
    const analysis = analyzer.analyze('Extract class and function symbols from src/parser.py');
    const report = detectCapabilityGaps(analysis.requiredCapabilities);
    expect(report.gaps).toHaveLength(1);
    expect(report.allSatisfied).toBe(false);
    expect(report.gaps[0]).toMatchObject({
      type: 'tool',
      name: toolRefusalGapName('extract_symbols', '.py'),
      origin: 'inferred',
    });
  });

  it.each([
    ['Extract Python symbols', '.py'],
    ['Extract Go function symbols', '.go'],
    ['Extract Rust class symbols', '.rs'],
    ['extract_symbols src/parser.PY', '.py'],
    ['Extract symbols from .py files', '.py'],
    ['Perform symbol extraction from src/parser.py', '.py'],
  ])('infers a canonical key for %s', (goal, extension) => {
    const report = detectCapabilityGaps(analyzer.analyze(goal).requiredCapabilities);
    expect(report.gaps.map((gap) => gap.name)).toEqual([
      toolRefusalGapName('extract_symbols', extension),
    ]);
  });

  it('deduplicates a language alias and repeated file extensions', () => {
    const report = detectCapabilityGaps(
      analyzer.analyze('Extract Python symbols from a.py and b.PY').requiredCapabilities
    );
    expect(report.gaps).toHaveLength(1);
  });

  it.each([
    'Fix typo in README.md',
    'refactor src/a.ts',
    'update setup.py version',
    'Extract symbols',
    'Extract release notes from setup.py',
    'Discuss symbol extraction support for Python',
    'Fix extract_symbols docs in README.md',
    'Document extract_symbols for Python',
    'Do not extract symbols from src/parser.py',
    "Don't extract symbols from src/parser.py",
    'Never extract symbols from src/parser.py',
    'Explain how to use extract_symbols for Python',
  ])('does not infer a gap for %s', (goal) => {
    const report = detectCapabilityGaps(analyzer.analyze(goal).requiredCapabilities);
    expect(report.gaps).toEqual([]);
    expect(report.allSatisfied).toBe(true);
  });

  it.each(SUPPORTED_EXTENSIONS)('accepts symbol extraction for supported %s', (extension) => {
    const name = toolRefusalGapName('extract_symbols', extension);
    const report = detectCapabilityGaps(
      analyzer.analyze(`Extract symbols from src/parser${extension}`).requiredCapabilities
    );
    expect(report.available.tools).toContain(name);
    expect(report.gaps).toEqual([]);
    expect(report.allSatisfied).toBe(true);
  });

  it.each([
    'src/python.ts',
    'src/golang.ts',
    'src/types.d.ts',
    'src/parser.ts and update README.md',
    'src/parser.ts then go update docs',
  ])('does not invent a language gap from filename %s', (file) => {
    const report = detectCapabilityGaps(
      analyzer.analyze(`Extract symbols from ${file}`).requiredCapabilities
    );
    expect(report.available.tools).toContain('extract_symbols:.ts');
    expect(report.gaps).toEqual([]);
  });

  it('requires both tool registration and qualifier support', () => {
    expect(
      detectCapabilityGaps({ tools: ['missing_tool:.ts', 'orchestrate:.ts'], experts: [] }).gaps
    ).toHaveLength(2);
  });

  it('guards every expected missing extension against registry drift', () => {
    expect(missingExtensions).not.toHaveLength(0);
    expect(TOOL_MANIFEST.map((tool) => tool.name)).toContain('extract_symbols');
    for (const extension of missingExtensions) {
      expect(SUPPORTED_EXTENSIONS, `capability shipped: ${extension}`).not.toContain(extension);
      const report = detectCapabilityGaps({
        tools: [toolRefusalGapName('extract_symbols', extension)],
        experts: [],
      });
      expect(report.allSatisfied).toBe(false);
    }
  });

  it('keeps all 288 task-type / capability-flag combinations satisfied', () => {
    let measured = 0;
    for (const taskType of taskTypes) {
      for (let flags = 0; flags < 32; flags += 1) {
        const required = inferRequiredCapabilities(
          taskType,
          {
            parallelizable: (flags & 1) !== 0,
            multimodal: (flags & 2) !== 0,
            codeGeneration: (flags & 4) !== 0,
            budgetSensitive: (flags & 8) !== 0,
            highContext: (flags & 16) !== 0,
          },
          []
        );
        expect(detectCapabilityGaps(required).gaps).toEqual([]);
        measured += 1;
      }
    }
    expect(measured).toBe(288);
  });

  it('measures exactly 40 labelled extraction phrasings with positive and negative controls', () => {
    expect(extractionPhrasings).toHaveLength(40);
    expect(extractionPhrasings.filter(({ expectedGaps }) => expectedGaps.length > 0)).toHaveLength(
      16
    );
    expect(
      extractionPhrasings.filter(({ expectedGaps }) => expectedGaps.length === 0)
    ).toHaveLength(24);
  });

  it.each(extractionPhrasings)(
    'infers the exact labelled gap set for $task',
    ({ task, expectedGaps }) => {
      const gaps = detectCapabilityGaps(analyzer.analyze(task).requiredCapabilities).gaps;
      expect(gaps.map((gap) => gap.name).sort()).toEqual([...expectedGaps].sort());
    }
  );

  it('finds zero inferred gaps in 300 real issue titles without unsupported extraction requests', () => {
    expect(issueTitles).toHaveLength(300);
    const hits = issueTitles.flatMap(({ title }) => {
      const gaps = detectCapabilityGaps(analyzer.analyze(title).requiredCapabilities).gaps;
      return gaps.length === 0 ? [] : [{ title, gaps }];
    });
    expect(hits).toEqual([]);
  });

  it.each([
    ['src/a.ts (see docs at example.rs)', []],
    ['src/a.ts — see docs at example.rs', []],
    ['src/a.ts using https://example.rs', []],
    ['src/a.ts (see www.example.rs)', []],
    ['src/next.py', ['extract_symbols:.py']],
    ['src/then.py', ['extract_symbols:.py']],
    ['src/skip/parser.py', ['extract_symbols:.py']],
    ['not-parser.py', ['extract_symbols:.py']],
    ['python.ts', []],
  ])('distinguishes source paths from prose and links in %s', (target, expectedGaps) => {
    const report = detectCapabilityGaps(
      analyzer.analyze(`Extract symbols from ${target}`).requiredCapabilities
    );
    expect(report.gaps.map((gap) => gap.name)).toEqual(expectedGaps);
  });
});

describe('inferred gap shadow mode at the durable ledger seam', () => {
  let dir: string;
  beforeEach(() => {
    const root = join(process.cwd(), '.nexus-agents');
    mkdirSync(root, { recursive: true });
    dir = mkdtempSync(join(root, 'inferred-gap-'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([undefined, '0', 'true', '1'])(
    'records inferred gaps only with an exact opt-in (%s)',
    (flag) => {
      vi.stubEnv('NEXUS_CAPABILITY_GAP_INFERRED', flag);
      const filePath = join(dir, 'capability-gaps.jsonl');
      const ledger = createPersistentCapabilityGapLedger({ filePath });
      // A supplied report isolates the recording guard from requirement inference.
      const report = {
        available: { tools: [], experts: [] },
        allSatisfied: false,
        gaps: [
          {
            type: 'tool' as const,
            name: 'extract_symbols:.py',
            suggestion: 's',
            origin: 'inferred' as const,
          },
        ],
      };
      recordRoutingGaps({ capabilityGaps: report }, { goal: 'extract Python symbols' }, ledger);
      expect(ledger.size()).toBe(flag === '1' ? 1 : 0);
      expect(existsSync(filePath)).toBe(flag === '1');
      expect(report.gaps).toHaveLength(1);
      expect(report.allSatisfied).toBe(false);
      if (flag === '1') {
        const row: unknown = JSON.parse(readFileSync(filePath, 'utf8').trim());
        expect(row).toMatchObject({ name: 'extract_symbols:.py', origin: 'inferred' });
      }
    }
  );

  it('retains distinct inferred and observed evidence with the flag enabled across reload', () => {
    vi.stubEnv('NEXUS_CAPABILITY_GAP_INFERRED', '1');
    const filePath = join(dir, 'capability-gaps.jsonl');
    const ledger = createPersistentCapabilityGapLedger({ filePath });
    const report = detectCapabilityGaps(
      analyzer.analyze('Extract symbols from src/parser.py').requiredCapabilities
    );
    recordRoutingGaps({ capabilityGaps: report }, {}, ledger);
    recordToolRefusal({ tool: 'extract_symbols', capability: '.py', suggestion: 's' }, {}, ledger);
    const rows: unknown[] = readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line));
    expect(rows).toEqual([
      expect.objectContaining({ name: 'extract_symbols:.py', origin: 'inferred' }),
      expect.objectContaining({ name: 'extract_symbols:.py', origin: 'observed' }),
    ]);
    const reloaded = createPersistentCapabilityGapLedger({ filePath });
    expect(reloaded.loadReport()).toMatchObject({ loaded: 2, malformedLines: 0 });
    expect(reloaded.size()).toBe(2);
  });

  it('preserves observed refusals and legacy gaps while dropping inferred gaps', () => {
    vi.stubEnv('NEXUS_CAPABILITY_GAP_INFERRED', undefined);
    const ledger = createPersistentCapabilityGapLedger({
      filePath: join(dir, 'capability-gaps.jsonl'),
    });
    recordRoutingGaps(
      {
        capabilityGaps: {
          available: { tools: [], experts: [] },
          allSatisfied: false,
          gaps: [
            { type: 'tool', name: 'extract_symbols:.py', suggestion: 's', origin: 'inferred' },
            {
              type: 'tool_refusal',
              name: 'extract_symbols:.go',
              suggestion: 's',
              origin: 'observed',
            },
            { type: 'expert', name: 'legacy_expert', suggestion: 's' },
          ],
        },
      },
      {},
      ledger
    );
    recordToolRefusal({ tool: 'extract_symbols', capability: '.rs', suggestion: 's' }, {}, ledger);
    expect(ledger.summarize().map((gap) => gap.name)).toEqual([
      'extract_symbols:.go',
      'extract_symbols:.rs',
      'legacy_expert',
    ]);
  });
});
