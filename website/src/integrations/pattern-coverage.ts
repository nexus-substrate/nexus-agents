/**
 * pattern-coverage.ts — build-time gate for the page patterns (#7285, #7288).
 *
 * The how-to summary box renders from optional `prerequisites:` frontmatter
 * (src/plugins/hast-summary-box.ts). A pattern that renders from an optional
 * field can silently render nowhere — it did, until #7288 moved the guides'
 * prerequisites into frontmatter. After every build this scans dist/ and fails
 * the build when no page carries the box. An empty build is `unmeasured`, a
 * failure too: zero pages scanned measured nothing.
 *
 * @module website/src/integrations/pattern-coverage
 */

import { glob, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

export interface BuiltPage {
  /** Path relative to the build root. */
  path: string;
  html: string;
}

export interface PatternCoverage {
  scanned: number;
  /** Pages that render the "Before you start" summary box. */
  summaryBox: string[];
}

// The element the plugin emits, not the bare class name: a stylesheet or a
// sentence that mentions `summary-box` is not a rendered box.
const SUMMARY_BOX = /<section\b[^>]*\bclass="summary-box"/;

export function patternCoverage(pages: readonly BuiltPage[]): PatternCoverage {
  return {
    scanned: pages.length,
    summaryBox: pages.filter((p) => SUMMARY_BOX.test(p.html)).map((p) => p.path),
  };
}

/** Reads every built HTML page under `root`; throws unless the box renders somewhere. */
export async function assertPatternCoverage(root: string): Promise<PatternCoverage> {
  const pages: BuiltPage[] = [];
  for await (const path of glob('**/*.html', { cwd: root })) {
    pages.push({ path, html: await readFile(`${root}/${path}`, 'utf8') });
  }
  const report = patternCoverage(pages);
  if (report.scanned === 0) {
    throw new Error(`pattern coverage unmeasured: no built HTML pages under ${root}`);
  }
  if (report.summaryBox.length === 0) {
    throw new Error(
      `no built page renders the how-to summary box (${String(report.scanned)} pages scanned): ` +
        'a how-to needs `prerequisites:` frontmatter (#7288)'
    );
  }
  return report;
}

export default function patternCoverageIntegration(): AstroIntegration {
  return {
    name: 'nexus-pattern-coverage',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const report = await assertPatternCoverage(fileURLToPath(dir).replace(/\/$/, ''));
        logger.info(
          `summary box renders on ${String(report.summaryBox.length)} of ${String(report.scanned)} pages`
        );
      },
    },
  };
}
