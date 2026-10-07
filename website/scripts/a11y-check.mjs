#!/usr/bin/env node
/** Audit built pages with real Chromium and axe; absence of coverage fails closed. */
import { createServer } from 'node:http';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import axeCore from 'axe-core';
import { chromium } from 'playwright';
import { THEME_STORAGE_KEY } from '../src/lib/theme.ts';

const BASE = '/nexus-agents';
const THEMES = ['light', 'dark'];
// axe has no wcag22a rules/tag; the WCAG 2.2 additions it supports are AA.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

function insideRoot(root, path) {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Serve only the built output under the deployed base, including real 404s. */
export async function startStaticServer(dist) {
  const root = await realpath(dist);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) {
        response.writeHead(404).end('Outside site base');
        return;
      }
      let file = resolve(root, `.${pathname.slice(BASE.length) || '/'}`);
      if (!insideRoot(root, file)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      file = await realpath(file);
      if (!insideRoot(root, file)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch (error) {
      const status = error instanceof URIError ? 400 : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500;
      response.writeHead(status).end(status === 404 ? 'Not found' : 'Cannot serve file');
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    close: () => new Promise((accept, reject) => {
      server.close((error) => error ? reject(error) : accept());
      server.closeIdleConnections();
    }),
  };
}

function sitemapLocation(loc, origin) {
  const url = new URL(loc.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) {
    throw new Error(`Sitemap URL outside site base: ${url.pathname}`);
  }
  return `${origin}${url.pathname}${url.search}`;
}

/** Recursively follow sitemap indexes, rejecting zero measured page URLs. */
export async function collectSitemapUrls(origin) {
  const pending = [`${origin}${BASE}/sitemap-index.xml`];
  const visited = new Set();
  const pages = new Set();
  while (pending.length > 0) {
    const url = pending.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Sitemap HTTP ${response.status}: ${url}`);
    const xml = await response.text();
    const index = /<sitemapindex(?:\s[^>]*)?>/.test(xml);
    if (!index && !/<urlset(?:\s[^>]*)?>/.test(xml)) throw new Error(`Invalid sitemap: ${url}`);
    const entries = [...xml.matchAll(index ? /<sitemap(?:\s[^>]*)?>([\s\S]*?)<\/sitemap>/g : /<url(?:\s[^>]*)?>([\s\S]*?)<\/url>/g)];
    for (const [, entry] of entries) {
      const loc = entry.match(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/)?.[1]?.trim();
      if (!loc) throw new Error(`Sitemap entry missing loc: ${url}`);
      const local = sitemapLocation(loc, origin);
      if (index) pending.push(local);
      else pages.add(local);
    }
  }
  if (pages.size === 0) throw new Error('Unmeasured: sitemap contains zero URLs');
  return [...pages].sort();
}

/** Audit every sitemap URL plus the deployed 404 artifact, in both themes. */
export async function auditSite(dist, { onProgress = () => {}, timeoutMs = 900_000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Page timeout must be positive and finite');
  const server = await startStaticServer(dist);
  let browser;
  try {
    const sitemap = await collectSitemapUrls(server.origin);
    const urls = [...new Set([...sitemap, `${server.origin}${BASE}/404.html`])];
    const tasks = urls.flatMap((url) => THEMES.map((theme) => ({ theme, url })));
    const report = {
      passed: false, sitemapUrls: sitemap.length, expectedPages: tasks.length,
      pagesAudited: 0, themes: THEMES, wcagTags: WCAG_TAGS, pageTimeoutMs: timeoutMs,
      engine: null, expectedEngineVersion: axeCore.version,
      ruleCounts: {}, themeCounts: { light: {}, dark: {} }, pages: [], errors: [],
    };
    browser = await chromium.launch();
    // Four pages bound resource usage while avoiding a serial crawl of the docs corpus.
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
      while (tasks.length > 0) {
        const { theme, url } = tasks.shift();
        const context = await browser.newContext({ colorScheme: theme });
        const path = new URL(url).pathname;
        const failures = [];
        const startedAt = Date.now();
        const progress = (phase, message) => onProgress({ path, theme, phase, elapsedMs: Date.now() - startedAt, ...(message ? { message } : {}) });
        let timedOut = false;
        let deadline;
        try {
          progress('navigation');
          await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_STORAGE_KEY, value: theme });
          const page = await context.newPage();
          // Start after creation: closing a context during newPage can deadlock.
          // This deadline covers navigation, fonts, and CPU-bound axe evaluation.
          deadline = setTimeout(() => {
            timedOut = true;
            void context.close().catch(() => {});
          }, timeoutMs);
          page.on('response', (response) => {
            if (response.url().startsWith(`${server.origin}/`) && response.status() >= 400) {
              failures.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
            }
          });
          page.on('requestfailed', (request) => {
            if (request.url().startsWith(`${server.origin}/`)) failures.push(`Request failed: ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
          });
          const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
          if (!response?.ok()) throw new Error(`Navigation HTTP ${response?.status() ?? 'no response'}`);
          await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
          await page.evaluate(() => document.fonts.ready);
          progress('axe');
          // Limit only result serialization; every tagged rule still runs.
          // The wrapper release can lag core, so supply the pinned stable engine.
          const results = await new AxeBuilder({ page, axeSource: axeCore.source }).withTags(WCAG_TAGS)
            .options({ resultTypes: ['violations', 'incomplete'] }).analyze();
          if (timedOut) throw new Error(`Unmeasured: page timed out after ${timeoutMs}ms`);
          if (results.testEngine.name !== 'axe-core' || results.testEngine.version !== axeCore.version) {
            throw new Error(`Unmeasured: unexpected engine ${results.testEngine.name}@${results.testEngine.version}; expected axe-core@${axeCore.version}`);
          }
          // Record the actual measured runtime, rather than only the package pin.
          report.engine ??= results.testEngine;
          if (failures.length > 0) throw new Error(failures.join('; '));
          const violations = results.violations.filter((violation) => BLOCKING_IMPACTS.has(violation.impact));
          for (const violation of violations) {
            const count = violation.nodes.length;
            report.ruleCounts[violation.id] = (report.ruleCounts[violation.id] ?? 0) + count;
            report.themeCounts[theme][violation.id] = (report.themeCounts[theme][violation.id] ?? 0) + count;
          }
          report.pagesAudited += 1;
          report.pages.push({ path, theme, elapsedMs: Date.now() - startedAt, violations: violations.map(({ id, impact, help, helpUrl, nodes }) => ({
            id, impact, help, helpUrl,
            nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })),
          })) });
          progress('complete');
        } catch (error) {
          const message = timedOut ? `Unmeasured: page timed out after ${timeoutMs}ms` : error instanceof Error ? error.message : String(error);
          report.errors.push({ path, theme, message });
          progress('error', message);
        } finally {
          clearTimeout(deadline);
          await context.close();
        }
      }
    }));
    report.pages.sort((a, b) => a.path.localeCompare(b.path) || a.theme.localeCompare(b.theme));
    report.passed = report.pagesAudited === report.expectedPages && report.errors.length === 0 && Object.keys(report.ruleCounts).length === 0;
    return report;
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function main() {
  const options = { dist: resolve(dirname(fileURLToPath(import.meta.url)), '../dist') };
  for (let i = 2; i < process.argv.length; i += 2) {
    const flag = process.argv[i];
    const value = process.argv[i + 1];
    if (!value || !['--dist', '--report'].includes(flag)) throw new Error('Usage: a11y-check.mjs [--dist directory] [--report file]');
    options[flag.slice(2)] = resolve(value);
  }
  const report = await auditSite(options.dist, {
    onProgress: ({ path, theme, phase, elapsedMs, message }) => {
      console.log(`${phase}: ${path} [${theme}] ${elapsedMs}ms${message ? `: ${message}` : ''}`);
    },
  });
  if (options.report) await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Axe: ${report.pagesAudited}/${report.expectedPages} pages audited (${report.sitemapUrls} sitemap URLs + 404, both themes)`);
  console.log(`Serious/critical nodes per rule: ${JSON.stringify(report.ruleCounts)}`);
  console.log(`Per theme: ${JSON.stringify(report.themeCounts)}`);
  for (const error of report.errors) console.error(`${error.path} [${error.theme}]: ${error.message}`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
