import assert from 'node:assert/strict';
import axeCore from 'axe-core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditSite, collectSitemapUrls, startStaticServer } from './a11y-check.mjs';
import { THEME_STORAGE_KEY } from '../src/lib/theme.ts';

const accessiblePage = '<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><p>Readable content</p></main></body></html>';

async function fixture(t, { empty = false, missing = false, inaccessible = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'nexus-a11y-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'index.html'), accessiblePage);
  await writeFile(join(root, '404.html'), accessiblePage);
  await writeFile(join(root, 'docs', 'index.html'), inaccessible
    ? accessiblePage.replace('</main>', '<input type="text"></main>') : accessiblePage);
  await writeFile(join(root, 'sitemap-index.xml'), '<sitemapindex><sitemap><loc>https://example.test/nexus-agents/nested.xml</loc></sitemap></sitemapindex>');
  await writeFile(join(root, 'nested.xml'), '<sitemapindex><sitemap><loc>https://example.test/nexus-agents/sitemap-0.xml</loc></sitemap></sitemapindex>');
  await writeFile(join(root, 'sitemap-0.xml'), `<urlset>${empty ? '' : `<url><loc>https://example.test/nexus-agents/</loc></url><url><loc>https://example.test/nexus-agents/${missing ? 'missing/' : 'docs/'}</loc></url>`}</urlset>`);
  return root;
}

test('static server enforces the base path and root, and returns actual missing-file errors', async (t) => {
  const root = await fixture(t);
  const server = await startStaticServer(root);
  t.after(() => server.close());
  assert.equal((await fetch(`${server.origin}/nexus-agents/docs/`)).status, 200);
  assert.equal((await fetch(`${server.origin}/docs/`)).status, 404);
  assert.equal((await fetch(`${server.origin}/nexus-agents/missing.js`)).status, 404);
  assert.equal((await fetch(`${server.origin}/nexus-agents/%2e%2e%2fpackage.json`)).status, 403);
});

test('sitemap discovery follows nested indexes and names the empty case', async (t) => {
  const root = await fixture(t);
  const server = await startStaticServer(root);
  t.after(() => server.close());
  const urls = await collectSitemapUrls(server.origin);
  assert.deepEqual(urls, [`${server.origin}/nexus-agents/`, `${server.origin}/nexus-agents/docs/`]);
  await writeFile(join(root, 'sitemap-0.xml'), '<urlset></urlset>');
  await assert.rejects(collectSitemapUrls(server.origin), /zero URLs/i);
  await writeFile(join(root, 'sitemap-0.xml'), '<urlset><url><loc>https://example.test/outside/</loc></url></urlset>');
  await assert.rejects(collectSitemapUrls(server.origin), /outside.*base/i);
});

test('real axe audits every URL and 404 in both themes, failing on unlabeled controls', async (t) => {
  const root = await fixture(t, { inaccessible: true });
  const report = await auditSite(root);
  assert.equal(report.sitemapUrls, 2);
  assert.equal(report.pagesAudited, 6);
  assert.equal(report.expectedPages, 6);
  assert.deepEqual(report.themes, ['light', 'dark']);
  assert.equal(report.ruleCounts.label, 2);
  assert.equal(report.themeCounts.light.label, 1);
  assert.equal(report.themeCounts.dark.label, 1);
  assert.equal(report.passed, false);
  assert.deepEqual(report.errors, []);
  await writeFile(join(root, 'docs', 'index.html'), accessiblePage);
  const fixed = await auditSite(root);
  assert.equal(fixed.passed, true);
  assert.deepEqual(fixed.ruleCounts, {});
});

test('missing sitemap pages fail coverage even when the error page is accessible', async (t) => {
  const root = await fixture(t, { missing: true });
  const report = await auditSite(root);
  assert.equal(report.passed, false);
  assert.equal(report.pagesAudited, 4);
  assert.equal(report.expectedPages, 6);
  assert.equal(report.errors.length, 2);
  assert.match(report.errors[0].message, /HTTP 404/);
});


test('dark-only defects prove the effective theme, stored choice, and OS preference are exercised', async (t) => {
  const root = await fixture(t);
  const themed = accessiblePage.replace('</head>', '<style>input { display: none; } html[data-theme="dark"] input { display: block; }</style></head>')
    .replace('</main>', `<input type="text"><script>
      const osTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (localStorage.getItem('${THEME_STORAGE_KEY}') !== osTheme) {
        const button = document.createElement('button'); document.querySelector('main').append(button);
      }
    </script></main>`);
  await writeFile(join(root, 'docs', 'index.html'), themed);
  const report = await auditSite(root);
  assert.equal(report.ruleCounts.label, 1);
  assert.equal(report.themeCounts.dark.label, 1);
  assert.deepEqual(report.themeCounts.light, {});
  assert.equal(report.ruleCounts['button-name'], undefined);
});

test('local asset failures cannot be laundered as successful axe coverage', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'docs', 'index.html'), accessiblePage.replace('</head>', '<link rel="stylesheet" href="/nexus-agents/missing.css"></head>'));
  const report = await auditSite(root);
  assert.equal(report.passed, false);
  assert.equal(report.pagesAudited, 4);
  assert.equal(report.errors.length, 2);
  assert.match(report.errors[0].message, /HTTP 404: \/nexus-agents\/missing.css/);
});


test('CLI exits nonzero on an empty sitemap rather than reporting a pass', async (t) => {
  const root = await fixture(t, { empty: true });
  await assert.rejects(
    promisify(execFile)(process.execPath, [new URL('./a11y-check.mjs', import.meta.url).pathname, '--dist', root]),
    (error) => error.code === 1 && /zero URLs/i.test(error.stderr),
  );
});

test('per-page deadlines report unmeasured coverage and emit progress for every attempted page', async (t) => {
  const root = await fixture(t);
  const progress = [];
  const report = await auditSite(root, { timeoutMs: 1, onProgress: (event) => progress.push(event) });
  assert.equal(report.passed, false);
  assert.equal(report.pagesAudited, 0);
  assert.equal(report.errors.length, report.expectedPages);
  for (const error of report.errors) assert.match(error.message, /Unmeasured.*timed out/i);
  assert.equal(progress.filter((event) => event.phase === 'error').length, report.expectedPages);
  assert.equal(new Set(progress.map((event) => `${event.path} ${event.theme}`)).size, report.expectedPages);
});

test('selected stable engine audits label-content-name mismatches in both themes', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'docs', 'index.html'), accessiblePage.replace('</main>', '<button aria-label="Delete">Save</button></main>'));
  const report = await auditSite(root);
  assert.deepEqual(report.engine, { name: 'axe-core', version: axeCore.version });
  assert.equal(report.engine.version, '4.14.0');
  assert.equal(report.ruleCounts['label-content-name-mismatch'], 2);
  assert.equal(report.themeCounts.light['label-content-name-mismatch'], 1);
  assert.equal(report.themeCounts.dark['label-content-name-mismatch'], 1);
  assert.equal(report.passed, false);
});
