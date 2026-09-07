/**
 * Tests for index-command CLI
 *
 * (Source: Issue #249 - CLI test coverage)
 */

/* eslint-disable @typescript-eslint/no-unsafe-call */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { indexCommand, formatIndexResult } from './index-command.js';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
}));

// Mock yaml
vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

// Mock core module
vi.mock('../core/index.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

// Mock link validator (prevents real fs traversal in vitest 4)
vi.mock('./index-command-link-validator.js', () => ({
  validateLinks: vi.fn().mockResolvedValue({
    files: [],
    summary: { totalFiles: 0, totalLinks: 0, brokenLinks: 0, validLinks: 0, skippedLinks: 0 },
    brokenLinks: [],
  }),
  formatLinkValidationTable: vi.fn().mockReturnValue('Link validation table'),
  formatLinkValidationJson: vi.fn().mockReturnValue('{}'),
  validateInternalLink: vi.fn(),
  validateExternalLink: vi.fn(),
  validateAnchorLink: vi.fn(),
  validateLink: vi.fn(),
}));

// Mock indexer module
vi.mock('../indexer/index.js', () => ({
  extractProject: vi.fn(),
  buildIndex: vi.fn(),
  indexToYaml: vi.fn(),
  indexToJson: vi.fn(),
  generateDiagramMarkdown: vi.fn(),
  validateIndex: vi.fn(),
  CodebaseIndexSchema: { parse: vi.fn() },
  extractEntrypoints: vi.fn(),
  manifestToYaml: vi.fn(),
  manifestToJson: vi.fn(),
  analyzeFreshness: vi.fn(),
  formatFreshnessTable: vi.fn(),
  formatFreshnessJson: vi.fn(),
}));

import * as fs from 'node:fs/promises';
import * as yaml from 'yaml';
import {
  extractProject,
  buildIndex,
  indexToYaml,
  indexToJson,
  generateDiagramMarkdown,
  validateIndex,
  CodebaseIndexSchema,
  extractEntrypoints,
  manifestToYaml,
  analyzeFreshness,
  formatFreshnessTable,
  formatFreshnessJson,
} from '../indexer/index.js';
import { validateLinks } from './index-command-link-validator.js';

const mockValidateLinks = vi.mocked(validateLinks);
const mockFs = vi.mocked(fs);
const mockYaml = vi.mocked(yaml);
const mockExtractProject = vi.mocked(extractProject);
const mockBuildIndex = vi.mocked(buildIndex);
const mockIndexToYaml = vi.mocked(indexToYaml);
const mockIndexToJson = vi.mocked(indexToJson);
const mockGenerateDiagram = vi.mocked(generateDiagramMarkdown);
const mockValidateIndex = vi.mocked(validateIndex);
const mockCodebaseIndexSchema = vi.mocked(CodebaseIndexSchema);
const mockExtractEntrypoints = vi.mocked(extractEntrypoints);
const mockManifestToYaml = vi.mocked(manifestToYaml);
const mockAnalyzeFreshness = vi.mocked(analyzeFreshness);
const mockFormatFreshnessTable = vi.mocked(formatFreshnessTable);
const mockFormatFreshnessJson = vi.mocked(formatFreshnessJson);

describe('index-command', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutWriteSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  describe('generate subcommand', () => {
    it('should generate index with yaml format by default', async () => {
      mockExtractProject.mockReturnValue({
        files: [
          {
            path: 'src/index.ts',
            lines: 100,
            category: 'implementation',
            exports: [],
            dependencies: [],
          },
        ],
        errors: [],
        durationMs: 50,
      });
      mockBuildIndex.mockReturnValue({
        stats: { totalFiles: 1, moduleCount: 1 },
        modules: {},
      } as never);
      mockIndexToYaml.mockReturnValue('yaml content');

      const result = await indexCommand({
        subcommand: 'generate',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 files');
      expect(result.data?.filesIndexed).toBe(1);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('codebase-index.yaml'),
        'yaml content',
        'utf-8'
      );
    });

    it('should generate index with json format', async () => {
      mockExtractProject.mockReturnValue({
        files: [],
        errors: [],
        durationMs: 10,
      });
      mockBuildIndex.mockReturnValue({
        stats: { totalFiles: 0, moduleCount: 0 },
        modules: {},
      } as never);
      mockIndexToJson.mockReturnValue('{}');

      const result = await indexCommand({
        subcommand: 'generate',
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        '{}',
        'utf-8'
      );
    });

    it('should log extraction warnings', async () => {
      mockExtractProject.mockReturnValue({
        files: [],
        errors: ['Warning 1', 'Warning 2'],
        durationMs: 10,
      });
      mockBuildIndex.mockReturnValue({
        stats: { totalFiles: 0, moduleCount: 0 },
        modules: {},
      } as never);
      mockIndexToYaml.mockReturnValue('');

      const result = await indexCommand({ subcommand: 'generate' });

      expect(result.success).toBe(true);
    });

    it('should use custom output path', async () => {
      mockExtractProject.mockReturnValue({
        files: [],
        errors: [],
        durationMs: 10,
      });
      mockBuildIndex.mockReturnValue({
        stats: { totalFiles: 0, moduleCount: 0 },
        modules: {},
      } as never);
      mockIndexToYaml.mockReturnValue('');

      await indexCommand({
        subcommand: 'generate',
        output: '/custom/path.yaml',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith('/custom/path.yaml', '', 'utf-8');
    });
  });

  describe('check subcommand', () => {
    it('should return error if index file not found', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await indexCommand({ subcommand: 'check' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return success if index is up to date', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('yaml content');
      mockYaml.parse.mockReturnValue({ modules: {} });
      mockCodebaseIndexSchema.parse.mockReturnValue({} as never);
      mockExtractProject.mockReturnValue({
        files: [
          {
            path: 'src/index.ts',
            lines: 100,
            category: 'implementation',
            exports: [],
            dependencies: [],
          },
        ],
        errors: [],
        durationMs: 10,
      });
      mockValidateIndex.mockReturnValue({
        valid: true,
        missingFiles: [],
        extraFiles: [],
        modifiedFiles: [],
      });

      const result = await indexCommand({ subcommand: 'check' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('up to date');
    });

    it('should return error if index is out of date', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('yaml content');
      mockYaml.parse.mockReturnValue({ modules: {} });
      mockCodebaseIndexSchema.parse.mockReturnValue({} as never);
      mockExtractProject.mockReturnValue({
        files: [],
        errors: [],
        durationMs: 10,
      });
      mockValidateIndex.mockReturnValue({
        valid: false,
        missingFiles: ['new-file.ts'],
        extraFiles: [],
        modifiedFiles: [],
      });

      const result = await indexCommand({ subcommand: 'check' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('out of date');
      expect(result.data?.validationResult?.missingFiles).toContain('new-file.ts');
    });

    it('should handle parse errors', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('invalid yaml');
      mockYaml.parse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = await indexCommand({ subcommand: 'check' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to parse');
    });
  });

  describe('diagram subcommand', () => {
    it('should generate diagram from existing index', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('yaml');
      mockYaml.parse.mockReturnValue({ modules: {} });
      mockCodebaseIndexSchema.parse.mockReturnValue({} as never);
      mockGenerateDiagram.mockReturnValue('```mermaid\ngraph TD\n```');

      const result = await indexCommand({ subcommand: 'diagram' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('dependency diagram');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('dependency-graph.md'),
        expect.stringContaining('mermaid'),
        'utf-8'
      );
    });

    it('should generate index first if not found', async () => {
      // First call to access fails (no index), then succeeds
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValue(undefined);
      mockExtractProject.mockReturnValue({
        files: [],
        errors: [],
        durationMs: 10,
      });
      mockBuildIndex.mockReturnValue({
        stats: { totalFiles: 0, moduleCount: 0 },
        modules: {},
      } as never);
      mockIndexToYaml.mockReturnValue('yaml');
      mockFs.readFile.mockResolvedValue('yaml');
      mockYaml.parse.mockReturnValue({ modules: {} });
      mockCodebaseIndexSchema.parse.mockReturnValue({} as never);
      mockGenerateDiagram.mockReturnValue('```mermaid```');

      const result = await indexCommand({ subcommand: 'diagram' });

      expect(result.success).toBe(true);
    });

    // #4799: `--output` set where the diagram READ FROM, not where it wrote to,
    // and the destination was hardcoded. That is why this repo's canonical
    // docs/architecture/dependency-graph.md still says `Generated: 2026-01-12` —
    // there was no way to aim the generator at it.
    it('writes the diagram to --output when given', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('yaml');
      mockYaml.parse.mockReturnValue({ modules: {} });
      mockCodebaseIndexSchema.parse.mockReturnValue({} as never);
      mockGenerateDiagram.mockReturnValue('```mermaid\ngraph TD\n```');

      const result = await indexCommand({
        subcommand: 'diagram',
        output: 'docs/architecture/dependency-graph.md',
      });

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'docs/architecture/dependency-graph.md',
        expect.stringContaining('mermaid'),
        'utf-8'
      );
    });

    it('still reads the index from its default location when --output is given', async () => {
      // The half that would break if `--output` simply moved from one path to
      // the other: the index it reads must NOT follow the diagram destination.
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('yaml');
      mockYaml.parse.mockReturnValue({ modules: {} });
      mockCodebaseIndexSchema.parse.mockReturnValue({} as never);
      mockGenerateDiagram.mockReturnValue('```mermaid```');

      await indexCommand({ subcommand: 'diagram', output: 'somewhere/else.md' });

      expect(mockFs.readFile).toHaveBeenCalledWith('docs/codebase-index.yaml', 'utf-8');
    });

    it('does not write the regenerated INDEX over the --output diagram', async () => {
      // Found by running the real CLI, not by a mock: the self-heal forwarded
      // `output` to generateIndex, which reads it as the index destination, so
      // a missing index caused a 3.4MB YAML to be written over the caller's
      // requested diagram path. It clobbered a real committed doc.
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValue(undefined);
      mockExtractProject.mockReturnValue({ files: [], errors: [], durationMs: 10 });
      mockBuildIndex.mockReturnValue({
        stats: { totalFiles: 0, moduleCount: 0 },
        modules: {},
      } as never);
      mockIndexToYaml.mockReturnValue('yaml-index-content');
      mockFs.readFile.mockResolvedValue('yaml');
      mockYaml.parse.mockReturnValue({ modules: {} });
      mockCodebaseIndexSchema.parse.mockReturnValue({} as never);
      mockGenerateDiagram.mockReturnValue('```mermaid```');

      await indexCommand({ subcommand: 'diagram', output: 'docs/architecture/graph.md' });

      // The index goes to the index path...
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'docs/codebase-index.yaml',
        'yaml-index-content',
        'utf-8'
      );
      // ...and the requested path receives the DIAGRAM, not the index.
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'docs/architecture/graph.md',
        expect.stringContaining('mermaid'),
        'utf-8'
      );
    });

    it('keeps the cwd-relative default so other repos are unaffected', async () => {
      // This CLI ships to other projects. The default must stay relative to the
      // user's tree, never this repository's layout.
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('yaml');
      mockYaml.parse.mockReturnValue({ modules: {} });
      mockCodebaseIndexSchema.parse.mockReturnValue({} as never);
      mockGenerateDiagram.mockReturnValue('```mermaid```');

      await indexCommand({ subcommand: 'diagram' });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'docs/dependency-graph.md',
        expect.anything(),
        'utf-8'
      );
    });
  });

  describe('validate subcommand', () => {
    it('should return error if ARCHITECTURE.md not found', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await indexCommand({ subcommand: 'validate' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return error if no module structure found', async () => {
      mockFs.readFile.mockResolvedValue('# ARCHITECTURE\n\nNo module structure here.');
      mockFs.access.mockResolvedValue(undefined);

      const result = await indexCommand({ subcommand: 'validate' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No module structure found');
    });

    it('should detect modules missing from documentation', async () => {
      const archContent = `## Module Structure
\`\`\`
src/
├── core/       # Core module
└── agents/     # Agents module
\`\`\``;
      mockFs.readFile.mockResolvedValue(archContent);
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockFs.readdir as any).mockResolvedValue([
        { name: 'core', isDirectory: () => true },
        { name: 'agents', isDirectory: () => true },
        { name: 'workflows', isDirectory: () => true }, // Not in docs
      ]);

      const result = await indexCommand({ subcommand: 'validate' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('workflows');
      expect(result.message).toContain('not in ARCHITECTURE.md');
    });

    it('should succeed when docs match codebase', async () => {
      const archContent = `## Module Structure
\`\`\`
src/
├── core/       # Core module
└── agents/     # Agents module
\`\`\``;
      mockFs.readFile.mockResolvedValue(archContent);
      mockFs.access.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockFs.readdir as any).mockResolvedValue([
        { name: 'core', isDirectory: () => true },
        { name: 'agents', isDirectory: () => true },
      ]);

      const result = await indexCommand({ subcommand: 'validate' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('in sync');
    });
  });

  describe('entrypoints subcommand', () => {
    it('should extract entrypoints successfully', async () => {
      mockExtractEntrypoints.mockReturnValue({
        success: true,
        manifest: {
          schema_version: '1.0',
          generated_at: '2026-01-14',
          cli_commands: [
            { name: 'test', description: 'Test cmd', source_file: 'cli.ts', source_line: 1 },
          ],
          mcp_tools: [],
        },
        warnings: [],
        errors: [],
      });
      mockManifestToYaml.mockReturnValue('manifest yaml');

      const result = await indexCommand({ subcommand: 'entrypoints' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Extracted');
      expect(result.message).toContain('1 CLI');
    });

    it('should return error on extraction failure', async () => {
      mockExtractEntrypoints.mockReturnValue({
        success: false,
        manifest: null as never,
        warnings: [],
        errors: ['Extraction failed'],
      });

      const result = await indexCommand({ subcommand: 'entrypoints' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });
  });

  describe('freshness subcommand', () => {
    it('should analyze freshness and print table', async () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [],
        summary: { fresh: 5, warning: 0, stale: 0, total: 5, unknown: 0 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });
      mockFormatFreshnessTable.mockReturnValue('Freshness table output');

      const result = await indexCommand({ subcommand: 'freshness' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('5 documents are fresh');
      expect(stdoutWriteSpy).toHaveBeenCalled();
    });

    it('should report issues when stale documents found', async () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [],
        summary: { fresh: 3, warning: 1, stale: 2, total: 6, unknown: 0 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });
      mockFormatFreshnessTable.mockReturnValue('Table');

      const result = await indexCommand({ subcommand: 'freshness' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('2 stale');
      expect(result.message).toContain('1 warnings');
    });

    it('should output JSON format', async () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [],
        summary: { fresh: 5, warning: 0, stale: 0, total: 5, unknown: 0 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });
      mockFormatFreshnessJson.mockReturnValue('{"summary": {}}');

      await indexCommand({
        subcommand: 'freshness',
        format: 'json',
      });

      expect(mockFormatFreshnessJson).toHaveBeenCalled();
    });

    it('should write to file when output specified', async () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [],
        summary: { fresh: 1, warning: 0, stale: 0, total: 1, unknown: 0 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });
      mockFormatFreshnessTable.mockReturnValue('output');

      await indexCommand({
        subcommand: 'freshness',
        output: '/tmp/freshness.txt',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/freshness.txt', 'output', 'utf-8');
    });

    // #2720 brainstorm #5: pre-fix all-unknown returned `success: true` with
    // message "0 documents are fresh" — typically because the user ran the
    // command outside the nexus-agents source repo. Same surface-vs-state
    // shape as #2716.
    it('reports wrong-CWD with actionable hint when all tracked docs unknown', async () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [],
        summary: { fresh: 0, warning: 0, stale: 0, total: 7, unknown: 7 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });
      mockFormatFreshnessTable.mockReturnValue('table');

      const result = await indexCommand({ subcommand: 'freshness' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No tracked documents found at the current CWD');
      expect(result.message).toContain('run it from the repo root');
    });

    it('counts unknown as an issue (no silent success on partial unknown)', async () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [],
        summary: { fresh: 3, warning: 0, stale: 0, total: 5, unknown: 2 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });
      mockFormatFreshnessTable.mockReturnValue('table');

      const result = await indexCommand({ subcommand: 'freshness' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('2 unknown');
    });
  });

  describe('links subcommand', () => {
    /** Shape the validator's answer for one test. */
    function mockScan(totalFiles: number, totalLinks: number, brokenLinks: number): void {
      mockValidateLinks.mockResolvedValue({
        files: [],
        summary: { totalFiles, totalLinks, brokenLinks, validLinks: totalLinks - brokenLinks },
        brokenLinks: [],
      } as unknown as Awaited<ReturnType<typeof validateLinks>>);
    }

    it('should validate documentation links', async () => {
      mockScan(4, 12, 0);

      const result = await indexCommand({ subcommand: 'links' });

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/12 links validated, all OK/);
      expect(result.data?.totalFiles).toBe(4);
    });

    // #5849: `brokenLinks > 0` was the whole verdict, and
    // `findMarkdownFiles` swallows ENOENT. Run outside the source repo,
    // `baseDir: 'docs'` matched nothing and the command exited 0 saying
    // "0 links validated, all OK".
    it('fails when no markdown files were found at all', async () => {
      mockScan(0, 0, 0);

      const result = await indexCommand({ subcommand: 'links' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('no markdown files found');
      expect(result.message).toContain('run it from the repo root');
      expect(result.message).not.toContain('all OK');
    });

    it('still fails on broken links in a real scan', async () => {
      // Pair test: the new guard must not swallow the original verdict.
      mockScan(4, 12, 3);

      const result = await indexCommand({ subcommand: 'links' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('3 broken links found');
    });

    it('passes on a scan that read files and found nothing broken', async () => {
      // Pair test: the guard keys on files read, not on links found. A docs
      // tree of prose with no links at all is a clean pass, not a wrong CWD.
      mockScan(2, 0, 0);

      const result = await indexCommand({ subcommand: 'links' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('all OK');
    });
  });

  describe('formatIndexResult', () => {
    it('should format success result', () => {
      const result = formatIndexResult({
        success: true,
        message: 'Operation successful',
        data: {
          filesIndexed: 10,
          modulesFound: 3,
          outputPath: '/path/to/output.yaml',
        },
      });

      expect(result).toContain('SUCCESS');
      expect(result).toContain('Operation successful');
      expect(result).toContain('Files indexed:');
      expect(result).toContain('10');
      expect(result).toContain('Modules found:');
      expect(result).toContain('3');
    });

    it('should format failed result', () => {
      const result = formatIndexResult({
        success: false,
        message: 'Operation failed',
      });

      expect(result).toContain('FAILED');
      expect(result).toContain('Operation failed');
    });

    it('should format validation details', () => {
      const result = formatIndexResult({
        success: false,
        message: 'Index out of date',
        data: {
          validationResult: {
            valid: false,
            missingFiles: ['new-file.ts', 'another.ts'],
            extraFiles: ['removed.ts'],
            modifiedFiles: ['changed.ts'],
          },
        },
      });

      expect(result).toContain('Missing files');
      expect(result).toContain('new-file.ts');
      expect(result).toContain('Extra files');
      expect(result).toContain('Modified files');
    });

    it('should truncate long file lists', () => {
      const manyFiles = Array.from({ length: 15 }, (_, i) => `file${String(i)}.ts`);
      const result = formatIndexResult({
        success: false,
        message: 'Validation failed',
        data: {
          validationResult: {
            valid: false,
            missingFiles: manyFiles,
            extraFiles: [],
            modifiedFiles: [],
          },
        },
      });

      expect(result).toContain('... and 5 more');
    });
  });
});
