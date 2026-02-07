/**
 * Unit tests for research-helpers-arxiv.ts
 *
 * Tests arXiv API parsing, paper metadata extraction, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchArxivMetadataResult,
  fetchArxivMetadata,
  paperExists,
  addResearchPaper,
} from './research-helpers-arxiv.js';

// Mock dependencies
vi.mock('./research-helpers-io.js', () => ({
  loadPapersRegistry: vi.fn(),
}));

vi.mock('./research-helpers-registry.js', () => ({
  addPaperToRegistry: vi.fn(),
}));

// Import mocked modules
import { loadPapersRegistry } from './research-helpers-io.js';
import { addPaperToRegistry } from './research-helpers-registry.js';

describe('research-helpers-arxiv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchArxivMetadataResult', () => {
    const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Test Paper Title</title>
    <summary>This is a test paper about AI agents and orchestration.</summary>
    <published>2024-01-15T12:00:00Z</published>
  </entry>
</feed>`;

    it('should fetch and parse valid arXiv metadata', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(validXml),
      } as Response);

      const result = await fetchArxivMetadataResult('2401.12345');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('2401.12345');
        expect(result.value.title).toBe('Test Paper Title');
        expect(result.value.summary).toBe(
          'This is a test paper about AI agents and orchestration.'
        );
        expect(result.value.published).toBe('2024-01-15T12:00:00Z');
        expect(result.value.pdfUrl).toBe('https://arxiv.org/pdf/2401.12345.pdf');
      }
    });

    it('should normalize whitespace in title and summary', async () => {
      const xmlWithWhitespace = `<?xml version="1.0" encoding="UTF-8"?>
<feed>
  <entry>
    <title>Test   Paper
    Title   With   Whitespace</title>
    <summary>Summary   with
    multiple   spaces</summary>
    <published>2024-01-15T12:00:00Z</published>
  </entry>
</feed>`;

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xmlWithWhitespace),
      } as Response);

      const result = await fetchArxivMetadataResult('2401.12345');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.title).toBe('Test Paper Title With Whitespace');
        expect(result.value.summary).toBe('Summary with multiple spaces');
      }
    });

    it('should return PARSE_ERROR for empty title', async () => {
      const xmlEmptyTitle = `<?xml version="1.0" encoding="UTF-8"?>
<feed><entry><title></title></entry></feed>`;

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xmlEmptyTitle),
      } as Response);

      const result = await fetchArxivMetadataResult('2401.12345');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
        expect(result.error.arxivId).toBe('2401.12345');
        expect(result.error.message).toBe('Failed to parse arXiv XML response');
      }
    });

    it('should return PARSE_ERROR for missing title tag', async () => {
      const xmlNoTitle = `<?xml version="1.0" encoding="UTF-8"?>
<feed><entry><summary>No title</summary></entry></feed>`;

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xmlNoTitle),
      } as Response);

      const result = await fetchArxivMetadataResult('2401.12345');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed><entry><title>Minimal Paper</title></entry></feed>`;

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(minimalXml),
      } as Response);

      const result = await fetchArxivMetadataResult('2401.12345');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.title).toBe('Minimal Paper');
        expect(result.value.summary).toBe('');
        expect(result.value.published).toBe('');
        expect(result.value.authors).toEqual([]);
        expect(result.value.categories).toEqual([]);
      }
    });

    it('should return HTTP_ERROR for non-200 status', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const result = await fetchArxivMetadataResult('2401.99999');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('HTTP_ERROR');
        expect(result.error.arxivId).toBe('2401.99999');
        expect(result.error.message).toContain('404');
        expect(result.error.message).toContain('Not Found');
      }
    });

    it('should return TIMEOUT error when timeout occurs', async () => {
      const timeoutError = new Error('Timeout');
      timeoutError.name = 'TimeoutError';

      vi.mocked(global.fetch).mockRejectedValue(timeoutError);

      const result = await fetchArxivMetadataResult('2401.12345');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.arxivId).toBe('2401.12345');
        expect(result.error.message).toContain('timed out');
        expect(result.error.message).toContain('30 seconds');
        expect(result.error.cause).toBe(timeoutError);
      }
    });

    it('should return NETWORK error for generic network failures', async () => {
      const networkError = new Error('Network failed');

      vi.mocked(global.fetch).mockRejectedValue(networkError);

      const result = await fetchArxivMetadataResult('2401.12345');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NETWORK');
        expect(result.error.arxivId).toBe('2401.12345');
        expect(result.error.message).toContain('Network error');
        expect(result.error.cause).toBe(networkError);
      }
    });

    it('should call arXiv API with correct URL', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(validXml),
      } as Response);

      await fetchArxivMetadataResult('2401.12345');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://export.arxiv.org/api/query?id_list=2401.12345',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  /* eslint-disable @typescript-eslint/no-deprecated */
  describe('fetchArxivMetadata (deprecated)', () => {
    it('should return metadata on success', async () => {
      const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed><entry><title>Test Title</title><published>2024-01-01T00:00:00Z</published></entry></feed>`;

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(validXml),
      } as Response);

      const metadata = await fetchArxivMetadata('2401.12345');

      expect(metadata).not.toBeNull();
      expect(metadata?.title).toBe('Test Title');
    });

    it('should return null on any error', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const metadata = await fetchArxivMetadata('2401.12345');

      expect(metadata).toBeNull();
    });

    it('should return null for HTTP errors', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const metadata = await fetchArxivMetadata('2401.12345');

      expect(metadata).toBeNull();
    });
  });
  /* eslint-enable @typescript-eslint/no-deprecated */

  describe('paperExists', () => {
    it('should return true when paper exists in registry', async () => {
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: true,
        value: {
          schema_version: '1.0',
          papers: {
            'arxiv-2401.12345': {
              title: 'Existing Paper',
              authors: [],
              source: 'arxiv',
              arxiv_id: '2401.12345',
              url: 'https://arxiv.org/abs/2401.12345',
              publication_date: '2024-01-01',
              venue: null,
              topics: ['ai'],
              tags: [],
            },
          },
        } as unknown as import('./research-types.js').PapersRegistry,
      });

      const exists = await paperExists('2401.12345');

      expect(exists).toBe(true);
      expect(loadPapersRegistry).toHaveBeenCalled();
    });

    it('should return false when paper does not exist in registry', async () => {
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: true,
        value: {
          schema_version: '1.0',
          papers: {},
        },
      });

      const exists = await paperExists('2401.99999');

      expect(exists).toBe(false);
    });

    it('should return false when registry cannot be loaded', async () => {
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: false,
        error: new Error(
          'Registry not found'
        ) as unknown as import('../core/types/workflow.js').ParseError,
      });

      const exists = await paperExists('2401.12345');

      expect(exists).toBe(false);
    });
  });

  describe('addResearchPaper', () => {
    it('should successfully add paper to registry', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<feed><entry><title>Test Paper</title><summary>Test summary</summary><published>2024-01-15T12:00:00Z</published></entry></feed>'
          ),
      } as Response);

      vi.mocked(addPaperToRegistry).mockResolvedValue({
        ok: true,
        value: {
          success: true,
          paperId: 'arxiv-2401.12345',
          message: 'Added successfully',
          dryRun: false,
        },
      });

      const result = await addResearchPaper({ arxivId: '2401.12345', dryRun: false });

      expect(result.success).toBe(true);
      expect(result.paperId).toBe('arxiv-2401.12345');
      expect(result.title).toBe('Test Paper');
      expect(addPaperToRegistry).toHaveBeenCalledWith({
        metadata: expect.objectContaining({ id: '2401.12345' }),
        dryRun: false,
      });
    });

    it('should handle dryRun option', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<feed><entry><title>Test</title><published>2024-01-01T00:00:00Z</published></entry></feed>'
          ),
      } as Response);

      vi.mocked(addPaperToRegistry).mockResolvedValue({
        ok: true,
        value: {
          success: true,
          paperId: 'arxiv-2401.12345',
          message: 'Dry run',
          dryRun: true,
        },
      });

      const result = await addResearchPaper({
        arxivId: '2401.12345',
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(addPaperToRegistry).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    });

    it('should pass topic option to registry', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<feed><entry><title>Test</title><published>2024-01-01T00:00:00Z</published></entry></feed>'
          ),
      } as Response);

      vi.mocked(addPaperToRegistry).mockResolvedValue({
        ok: true,
        value: {
          success: true,
          paperId: 'arxiv-2401.12345',
          message: 'Added',
          dryRun: false,
        },
      });

      await addResearchPaper({
        arxivId: '2401.12345',
        dryRun: false,
        topic: 'multi-agent',
      });

      expect(addPaperToRegistry).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'multi-agent' })
      );
    });

    it('should return failure when metadata fetch fails', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const result = await addResearchPaper({ arxivId: '2401.12345', dryRun: false });

      expect(result.success).toBe(false);
      expect(result.paperId).toBe('arxiv-2401.12345');
      expect(result.title).toBe('');
      expect(result.message).toContain('Could not fetch metadata');
      expect(result.message).toContain('Network error');
    });

    it('should return failure when registry add fails', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<feed><entry><title>Test</title><published>2024-01-01T00:00:00Z</published></entry></feed>'
          ),
      } as Response);

      vi.mocked(addPaperToRegistry).mockResolvedValue({
        ok: false,
        error: { message: 'Registry write failed', code: 'SAVE_ERROR' as const },
      });

      const result = await addResearchPaper({ arxivId: '2401.12345', dryRun: false });

      expect(result.success).toBe(false);
      expect(result.title).toBe('Test');
      expect(result.message).toBe('Registry write failed');
    });

    it('should preserve title in result even on registry failure', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<feed><entry><title>Important Paper Title</title><published>2024-01-01T00:00:00Z</published></entry></feed>'
          ),
      } as Response);

      vi.mocked(addPaperToRegistry).mockResolvedValue({
        ok: false,
        error: { message: 'Duplicate entry', code: 'DUPLICATE' },
      });

      const result = await addResearchPaper({ arxivId: '2401.12345', dryRun: false });

      expect(result.success).toBe(false);
      expect(result.title).toBe('Important Paper Title');
      expect(result.message).toBe('Duplicate entry');
    });
  });
});
