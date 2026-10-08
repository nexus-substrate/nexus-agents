#!/usr/bin/env node
/**
 * Behaviour check for the narrow-screen Menu drawer (#7308), against the
 * built site in real Chromium. Every assertion is recorded; any failure, or
 * a run that checked nothing, exits non-zero.
 *
 *   node scripts/menu-check.mjs [--dist dir] [--shots dir] [--measure-only]
 *
 * --measure-only records header height, fold position and horizontal scroll
 * without asserting drawer behaviour, so it can measure a build from before
 * the drawer existed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import axeCore from 'axe-core';
import { chromium } from 'playwright';
import { THEME_STORAGE_KEY } from '../src/lib/theme.ts';
import { startStaticServer } from './a11y-check.mjs';

const BASE = '/nexus-agents';
const DOC_PAGE = `${BASE}/docs/getting-started/installation/`;
const PHONE = { width: 390, height: 844 };
const THEMES = ['light', 'dark'];
const TOUCH_TARGET_PX = 48;
const PRIMARY_LINK_COUNT = 5;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(flag('--dist') ?? resolve(here, '../dist'));
const shots = flag('--shots') ? resolve(flag('--shots')) : undefined;
const measureOnly = args.includes('--measure-only');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function newPage(browser, theme, viewport, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport, colorScheme: theme, javaScriptEnabled, reducedMotion: 'reduce' });
  if (javaScriptEnabled) {
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_STORAGE_KEY, value: theme });
  }
  return { context, page: await context.newPage() };
}

/** Header height, where the first paragraph of the page body sits, and horizontal overflow. */
async function measure(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.docs-masthead')?.getBoundingClientRect();
    const para = document.querySelector('.docs-body > p')?.getBoundingClientRect();
    const root = document.documentElement;
    return {
      headerHeight: header ? Math.round(header.height) : null,
      firstTextTop: para ? Math.round(para.top) : null,
      firstTextBottom: para ? Math.round(para.bottom) : null,
      horizontalOverflow: root.scrollWidth - root.clientWidth,
    };
  });
}

const activeInfo = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return {
    inDialog: Boolean(el && el.closest('#site-menu')),
    isMenuButton: Boolean(el && el.matches('[data-menu-open]')),
    isClose: Boolean(el && el.matches('[data-menu-close]')),
    tag: el ? el.tagName : null,
  };
});

async function drawerChecks(page, theme, origin) {
  const tag = `[${theme} 390]`;
  const button = page.locator('[data-menu-open]');
  check(`${tag} Menu button visible, with visible text`, await button.isVisible() && (await button.innerText()).trim() === 'Menu');
  check(`${tag} aria-controls names the dialog`, (await button.getAttribute('aria-controls')) === 'site-menu' && (await page.locator('dialog#site-menu').count()) === 1);
  check(`${tag} aria-expanded false when closed`, (await button.getAttribute('aria-expanded')) === 'false');
  check(`${tag} section strip hidden`, !(await page.locator('.docs-masthead-inner > .docs-primary-nav').isVisible()));
  check(`${tag} Section navigation disclosure hidden`, !(await page.locator('.docs-page > .docs-rail').isVisible()));
  check(`${tag} On this page disclosure still in page`, await page.locator('.docs-toc summary').isVisible());
  const header = await page.evaluate(() => {
    // The search control sits in a display:contents island, so measure the controls themselves.
    const tools = [...document.querySelectorAll('.docs-wordmark, .docs-masthead-tools button')]
      .filter((el) => el.checkVisibility()).map((el) => el.getBoundingClientRect());
    const tops = tools.map((r) => Math.round(r.top + r.height / 2));
    return { count: tools.length, spread: Math.max(...tops) - Math.min(...tops) };
  });
  check(`${tag} header is one row`, header.count >= 4 && header.spread <= 4, `${header.count} items, centre spread ${header.spread}px`);

  // Open by click.
  await button.click();
  const dialog = page.locator('dialog#site-menu');
  check(`${tag} click opens the drawer`, await dialog.evaluate((d) => d.open && d.matches(':modal')));
  check(`${tag} aria-expanded true when open`, (await button.getAttribute('aria-expanded')) === 'true');
  check(`${tag} focus moves to Close`, (await activeInfo(page)).isClose);
  const contents = await dialog.evaluate((d) => ({
    primary: d.querySelectorAll('.docs-primary-nav a').length,
    rail: d.querySelectorAll('.docs-rail a').length,
    navsInDom: document.querySelectorAll('.docs-rail').length + document.querySelectorAll('.docs-primary-nav').length,
    current: d.querySelector('.docs-rail a[aria-current="page"]')?.textContent?.trim() ?? null,
    currentVisible: (() => {
      const a = d.querySelector('.docs-rail a[aria-current="page"]');
      return Boolean(a && a.checkVisibility() && a.closest('details.docs-rail-group')?.open);
    })(),
  }));
  check(`${tag} drawer holds the ${PRIMARY_LINK_COUNT} primary links`, contents.primary === PRIMARY_LINK_COUNT, `${contents.primary}`);
  check(`${tag} drawer holds the section nav`, contents.rail > 0, `${contents.rail} links`);
  check(`${tag} one nav of each in the DOM (moved, not copied)`, contents.navsInDom === 2);
  check(`${tag} current page aria-current, group open`, contents.current !== null && contents.currentVisible, String(contents.current));
  const small = await dialog.evaluate((d, min) => [...d.querySelectorAll('a[href], button, summary')]
    .filter((el) => el.checkVisibility())
    .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 30), h: el.getBoundingClientRect().height }))
    .filter((t) => t.h < min - 0.5), TOUCH_TARGET_PX);
  check(`${tag} every drawer target ≥${TOUCH_TARGET_PX}px high`, small.length === 0, small.slice(0, 3).map((t) => `${t.text}:${t.h}`).join(', '));
  const inert = await page.evaluate(() => {
    const link = document.querySelector('.docs-main a[href]');
    if (!link) return null;
    link.focus();
    return document.activeElement !== link;
  });
  check(`${tag} background is inert`, inert === true);
  check(`${tag} page scroll locked`, (await page.evaluate(() => getComputedStyle(document.documentElement).overflow)) === 'hidden');
  if (shots) await page.screenshot({ path: `${shots}/menu-390-${theme}-open.png` });
  await dialog.evaluate((d) => { d.scrollTop = 0; });
  if (shots) await page.screenshot({ path: `${shots}/menu-390-${theme}-open-top.png` });
  const axe = await new AxeBuilder({ page, axeSource: axeCore.source })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const blocking = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(`${tag} axe on the open drawer: 0 serious/critical`, blocking.length === 0, blocking.map((v) => v.id).join(', '));

  // Tab containment, both directions, past both ends.
  await dialog.evaluate((d) => d.querySelector('[data-menu-close]').focus());
  const stops = await dialog.evaluate((d) => [...d.querySelectorAll('a[href], button, summary')].filter((el) => el.checkVisibility()).length);
  let escaped = 0;
  for (let i = 0; i < stops + 2; i += 1) {
    await page.keyboard.press('Tab');
    if (!(await activeInfo(page)).inDialog) escaped += 1;
  }
  check(`${tag} Tab stays in the drawer past the last item`, escaped === 0, `${stops + 2} presses over ${stops} stops`);
  await dialog.evaluate((d) => d.querySelector('[data-menu-close]').focus());
  await page.keyboard.press('Shift+Tab');
  const back = await activeInfo(page);
  check(`${tag} Shift+Tab from Close wraps to the last item`, back.inDialog && !back.isClose);

  // Escape closes and returns focus.
  await page.keyboard.press('Escape');
  check(`${tag} Escape closes`, !(await dialog.evaluate((d) => d.open)));
  check(`${tag} aria-expanded false after Escape`, (await button.getAttribute('aria-expanded')) === 'false');
  check(`${tag} focus returns to Menu after Escape`, (await activeInfo(page)).isMenuButton);
  check(`${tag} navs returned to the page`, await page.evaluate(() =>
    document.querySelector('.docs-rail')?.parentElement?.classList.contains('docs-page') &&
    document.querySelector('.docs-primary-nav')?.parentElement?.classList.contains('docs-masthead-inner') &&
    document.querySelector('.docs-rail > details')?.open === false));
  check(`${tag} scroll unlocked after close`, (await page.evaluate(() => getComputedStyle(document.documentElement).overflow)) !== 'hidden');

  // Enter on the focused button opens; the Close button closes.
  await page.keyboard.press('Enter');
  check(`${tag} Enter opens`, await dialog.evaluate((d) => d.open) && (await button.getAttribute('aria-expanded')) === 'true');
  await page.keyboard.press('Enter'); // focus is on Close
  check(`${tag} Close button closes, focus returns`, !(await dialog.evaluate((d) => d.open)) && (await activeInfo(page)).isMenuButton);

  // Backdrop click closes.
  await button.click();
  await page.mouse.click(10, PHONE.height / 2);
  check(`${tag} backdrop click closes`, !(await dialog.evaluate((d) => d.open)));

  // Landing page: the drawer has the primary links only.
  await page.goto(`${origin}${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('[data-menu-open]').click();
  const landing = await page.locator('dialog#site-menu').evaluate((d) => ({ open: d.open, primary: d.querySelectorAll('.docs-primary-nav a').length }));
  check(`${tag} landing page drawer opens with primary links`, landing.open && landing.primary === PRIMARY_LINK_COUNT);
}

async function main() {
  const server = await startStaticServer(dist);
  const browser = await chromium.launch();
  const report = { dist, measureOnly, measurements: {}, results };
  try {
    if (shots) await mkdir(shots, { recursive: true });
    for (const theme of THEMES) {
      const { context, page } = await newPage(browser, theme, PHONE);
      await page.goto(`${server.origin}${DOC_PAGE}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const m = await measure(page);
      report.measurements[`390-${theme}`] = m;
      console.log(`measure [${theme} 390]: ${JSON.stringify(m)}`);
      check(`[${theme} 390] no horizontal scroll`, m.horizontalOverflow <= 0, `${m.horizontalOverflow}px`);
      if (!measureOnly) {
        check(`[${theme} 390] first body text above the fold`, m.firstTextBottom !== null && m.firstTextBottom <= PHONE.height, `bottom ${m.firstTextBottom}px of ${PHONE.height}`);
      }
      if (shots) await page.screenshot({ path: `${shots}/${measureOnly ? 'before-' : ''}menu-390-${theme}-closed.png` });
      if (!measureOnly) await drawerChecks(page, theme, server.origin);
      await context.close();

      for (const width of [1024, 1440]) {
        const wide = await newPage(browser, theme, { width, height: 900 });
        await wide.page.goto(`${server.origin}${DOC_PAGE}`, { waitUntil: 'networkidle' });
        await wide.page.evaluate(() => document.fonts.ready);
        const layout = await wide.page.evaluate(() => {
          const box = (sel) => {
            const r = document.querySelector(sel)?.getBoundingClientRect();
            return r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',') : null;
          };
          return {
            masthead: box('.docs-masthead'), primary: box('.docs-primary-nav'), tools: box('.docs-masthead-tools'),
            rail: box('.docs-rail'), main: box('.docs-main'),
            menuVisible: Boolean(document.querySelector('[data-menu-open]')?.checkVisibility()),
          };
        });
        report.measurements[`${width}-${theme}`] = layout;
        console.log(`layout [${theme} ${width}]: ${JSON.stringify(layout)}`);
        if (!measureOnly) check(`[${theme} ${width}] Menu button hidden`, !layout.menuVisible);
        if (shots) await wide.page.screenshot({ path: `${shots}/${measureOnly ? 'before-' : ''}menu-${width}-${theme}.png` });
        await wide.context.close();
      }
    }

    // No JavaScript: navigation stays reachable in the page.
    const nojs = await newPage(browser, 'light', PHONE, false);
    await nojs.page.goto(`${server.origin}${DOC_PAGE}`);
    const fallback = await nojs.page.evaluate(() => ({
      menuVisible: Boolean(document.querySelector('[data-menu-open]')?.checkVisibility()),
      primaryVisible: [...document.querySelectorAll('.docs-primary-nav a')].filter((a) => a.checkVisibility()).length,
      railSummary: Boolean(document.querySelector('.docs-rail > details > summary')?.checkVisibility()),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    report.measurements['390-nojs'] = fallback;
    console.log(`no-js [light 390]: ${JSON.stringify(fallback)}`);
    if (!measureOnly) {
      check('[no-js 390] Menu button not shown', !fallback.menuVisible);
      check(`[no-js 390] all ${PRIMARY_LINK_COUNT} primary links visible`, fallback.primaryVisible === PRIMARY_LINK_COUNT, `${fallback.primaryVisible}`);
      check('[no-js 390] Section navigation disclosure reachable', fallback.railSummary);
      check('[no-js 390] no horizontal scroll', fallback.overflow <= 0, `${fallback.overflow}px`);
    }
    if (shots) await nojs.page.screenshot({ path: `${shots}/${measureOnly ? 'before-' : ''}menu-390-nojs.png` });
    await nojs.context.close();
  } finally {
    await browser.close();
    await server.close();
  }
  if (shots) await writeFile(`${shots}/${measureOnly ? 'before-' : ''}menu-check.json`, `${JSON.stringify(report, null, 2)}\n`);
  const failed = results.filter((r) => !r.pass);
  console.log(`menu-check: ${results.length - failed.length}/${results.length} passed`);
  if (results.length === 0 || failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
