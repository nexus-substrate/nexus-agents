/**
 * CODEOWNERS-parses-under-GitHub gate (#6174).
 *
 * Both governor gates parse `/CODEOWNERS` with OUR parser
 * (`scripts/governor-section.ts` and the matcher behind `isGovernorPath`).
 * Their tests prove our parser; nothing proved GitHub reads the same file the
 * same way. A pattern GitHub rejects is a governor entry that exists for our
 * gates and not for GitHub's review requests — a silent gap in the review bar.
 *
 * GitHub exposes its own verdict: `GET /repos/{owner}/{repo}/codeowners/errors`
 * returns every line its parser could not accept, with `line`, `column`,
 * `kind`, `source` and `suggestion`. This gate calls it for the PR head (or the
 * pushed main sha) and fails on a non-empty `errors` array, printing each entry.
 *
 * ## The empty case is named
 *
 * `{ errors: [] }` is the ONLY pass. A payload with no `errors` field, an
 * `errors` that is not an array, a non-JSON body, a non-2xx status or a thrown
 * fetch all FAIL with a message that says the shape was unexpected. A 404 body
 * (`{ message: "Not Found" }`) has no `errors` field; a gate that read that as
 * "no errors" could not fail, and a check that cannot fail is not a check.
 *
 * ## Shadow locations
 *
 * GitHub also reads `.github/CODEOWNERS` (which takes precedence over the root
 * file) and `docs/CODEOWNERS` (which the root file takes precedence over). The
 * gate fails closed if either exists in the checkout — see
 * {@link SHADOW_CODEOWNERS_PATHS}. This lives here rather than in
 * `governor-section.ts` because the question is "what does GitHub read", which
 * is this gate's question; the two ratification gates keep parsing the root
 * file, and any PR that creates a shadow file reaches this job because the
 * shadow paths are governor paths: the workflow's `governor_touched` detector
 * (`governor-paths-touched.ts`, the `paths:` filter's replacement since #4802)
 * reports `true` for them.
 *
 * ## What it does NOT verify
 *
 * Match semantics. GitHub could parse a pattern and still match a different
 * file set than `isGovernorPath` does. The issue records why that half is not
 * measurable here: the owner authors most PRs, so the platform never requests
 * the author's own review.
 *
 * Usage (CI supplies GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_API_URL):
 *   pnpm exec tsx scripts/check-codeowners-errors.ts --ref <sha>
 *
 * @module scripts/check-codeowners-errors
 * (Source: Issue #6174)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { MUST_NOT_EXIST_GOVERNOR_PATHS } from './governor-section.js';
import { ROOT } from './script-paths.js';

/**
 * Locations GitHub reads CODEOWNERS from OTHER than the repo root, in the order
 * GitHub consults them: `.github/CODEOWNERS` wins over the root file, which
 * wins over `docs/CODEOWNERS`. Derived from the governor-section constant (the
 * CODEOWNERS-pattern spelling, root-anchored) so the gate, the #6034 exemption
 * and the CODEOWNERS entries cannot drift apart.
 */
export const SHADOW_CODEOWNERS_PATHS: readonly string[] = MUST_NOT_EXIST_GOVERNOR_PATHS.map((p) =>
  p.replace(/^\//, '')
);

/** Which shadow CODEOWNERS files exist under `root` (repo-relative paths, in precedence order). */
export function findShadowCodeowners(root: string = ROOT): readonly string[] {
  return SHADOW_CODEOWNERS_PATHS.filter((p) => existsSync(join(root, p)));
}

/**
 * Judge the shadow-file finding. Empty means "no shadow file exists", which is
 * the pass — it is a measured absence (each candidate path was probed), not a
 * default.
 */
export function summarizeShadowCodeowners(found: readonly string[]): CodeownersVerdict {
  if (found.length === 0) {
    return {
      ok: true,
      lines: [
        `CODEOWNERS check: no shadow file at ${SHADOW_CODEOWNERS_PATHS.join(' or ')}; GitHub reads the root file the governor gates parse.`,
      ],
    };
  }
  return {
    ok: false,
    lines: [
      `CODEOWNERS check: shadow CODEOWNERS present — ${found.join(', ')}. ` +
        'GitHub reads .github/CODEOWNERS over the root file, and the root file over docs/CODEOWNERS; ' +
        'the governor gates parse only the root file, so a shadow file changes what GitHub enforces ' +
        'without changing what the gates measure. Delete it, or move its content into /CODEOWNERS.',
    ],
  };
}

/** One entry of GitHub's `errors` array, every field optional because it is untrusted input. */
interface CodeownersErrorEntry {
  readonly line?: unknown;
  readonly column?: unknown;
  readonly kind?: unknown;
  readonly source?: unknown;
  readonly suggestion?: unknown;
  readonly path?: unknown;
}

export interface CodeownersVerdict {
  /** True ONLY for a parsed payload whose `errors` is an empty array. */
  readonly ok: boolean;
  /** Human-readable report; one `CODEOWNERS:<line>:<column>` row per error. */
  readonly lines: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Render one untrusted field as text; a missing or non-scalar field reads as `?`. */
function field(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '?';
}

/** Render one error entry as `<path>:<line>:<column> <kind> — <suggestion> (source: ...)`. */
function renderEntry(entry: unknown): string {
  const e: CodeownersErrorEntry = isRecord(entry) ? entry : {};
  const path = typeof e.path === 'string' && e.path !== '' ? e.path : 'CODEOWNERS';
  const head = `${path}:${field(e.line)}:${field(e.column)} ${field(e.kind)}`;
  const suggestion =
    typeof e.suggestion === 'string' && e.suggestion !== '' ? ` — ${e.suggestion}` : '';
  const source = typeof e.source === 'string' && e.source !== '' ? ` (source: ${e.source})` : '';
  return `${head}${suggestion}${source}`;
}

/** Bounded, never-throwing rendering of an unexpected payload for the failure message. */
function describePayload(payload: unknown): string {
  // `JSON.stringify(undefined)` is `undefined` at runtime despite the `string` type.
  const text: string | undefined = JSON.stringify(payload);
  return typeof text === 'string' ? text.slice(0, 500) : String(payload);
}

/**
 * Judge a parsed endpoint payload.
 *
 * Pure so the tests can drive it with fixtures. The pass condition is exactly
 * one shape — `errors` present, an array, and empty. Everything else fails.
 */
export function summarizeCodeownersErrors(payload: unknown): CodeownersVerdict {
  if (!isRecord(payload) || !Array.isArray(payload['errors'])) {
    return {
      ok: false,
      lines: [
        'CODEOWNERS check: unexpected payload shape — no `errors` array in the response. ' +
          'That is not evidence the file parses; it is an unmeasured result, and unmeasured fails. ' +
          `Payload: ${describePayload(payload)}`,
      ],
    };
  }

  const errors: readonly unknown[] = payload['errors'];
  if (errors.length === 0) {
    return { ok: true, lines: ['CODEOWNERS check: GitHub parsed the file with 0 errors.'] };
  }

  return {
    ok: false,
    lines: [
      `CODEOWNERS check: GitHub's parser reported ${String(errors.length)} error(s):`,
      ...errors.map(renderEntry),
    ],
  };
}

export interface RawResponse {
  readonly status: number;
  readonly body: string;
}

/**
 * Judge a raw HTTP response before the payload summarizer sees it.
 *
 * A non-2xx status fails even if the body happens to parse, and a 2xx body
 * that is not JSON fails as well — neither is a measurement of the file.
 */
export function summarizeCodeownersResponse(res: RawResponse): CodeownersVerdict {
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      lines: [
        `CODEOWNERS check: endpoint returned HTTP ${String(res.status)}; the file was not measured. ` +
          `Body: ${res.body.slice(0, 500)}`,
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return {
      ok: false,
      lines: [
        `CODEOWNERS check: endpoint body was not JSON (HTTP ${String(res.status)}); the file was not measured. ` +
          `Body: ${res.body.slice(0, 500)}`,
      ],
    };
  }
  return summarizeCodeownersErrors(parsed);
}

export interface CheckInput {
  /** `owner/repo`, as GitHub Actions supplies in `GITHUB_REPOSITORY`. */
  readonly repository: string;
  /** Commit sha (or branch) to ask GitHub to parse CODEOWNERS at. */
  readonly ref: string;
  /** Bearer token; `contents: read` is sufficient. */
  readonly token: string;
  /** API origin; Actions supplies `GITHUB_API_URL`, and a local run can point it at a stub. */
  readonly apiUrl: string;
}

/** The subset of `fetch` this gate needs — injectable so the tests never touch the network. */
export type FetchLike = (
  url: string,
  init: { readonly method: 'GET'; readonly headers: Record<string, string> }
) => Promise<Response>;

/** Call the endpoint for `ref` and judge the response. A thrown fetch is a failure, not a pass. */
export async function checkCodeownersErrors(
  input: CheckInput,
  fetchImpl: FetchLike = (url, init) => fetch(url, init)
): Promise<CodeownersVerdict> {
  const origin = input.apiUrl.replace(/\/+$/, '');
  const url = `${origin}/repos/${input.repository}/codeowners/errors?ref=${encodeURIComponent(input.ref)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${input.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      lines: [`CODEOWNERS check: request to ${url} failed (${msg}); the file was not measured.`],
    };
  }
  return summarizeCodeownersResponse({ status: res.status, body: await res.text() });
}

/** Read `--ref <sha>` or `--ref=<sha>`; undefined when absent or empty. */
export function parseRefArg(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ref') {
      const next = argv[i + 1];
      return next !== undefined && next !== '' ? next : undefined;
    }
    if (arg?.startsWith('--ref=') === true) {
      const value = arg.slice('--ref='.length);
      return value !== '' ? value : undefined;
    }
  }
  return undefined;
}

/** A non-empty env value, or undefined — empty is treated as unset. */
function envValue(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : undefined;
}

/**
 * Assemble the check input from argv and the runner environment, or name what
 * is missing. Every missing piece is reported, not just the first.
 */
export function readCheckInput(
  argv: readonly string[]
):
  | { readonly ok: true; readonly input: CheckInput }
  | { readonly ok: false; readonly missing: readonly string[] } {
  const ref = parseRefArg(argv);
  const token = envValue('GITHUB_TOKEN');
  const repository = envValue('GITHUB_REPOSITORY');
  const apiUrl = envValue('GITHUB_API_URL') ?? 'https://api.github.com';

  const missing: string[] = [];
  if (ref === undefined) missing.push('--ref <sha>');
  if (token === undefined) missing.push('GITHUB_TOKEN');
  if (repository === undefined) missing.push('GITHUB_REPOSITORY');
  if (ref === undefined || token === undefined || repository === undefined) {
    return { ok: false, missing };
  }
  return { ok: true, input: { repository, ref, token, apiUrl } };
}

/* eslint-disable no-console */
async function main(): Promise<void> {
  const read = readCheckInput(process.argv.slice(2));
  if (!read.ok) {
    console.log(`::error::CODEOWNERS check: missing ${read.missing.join(', ')}; cannot measure.`);
    process.exitCode = 1;
    return;
  }

  // Both checks run so the log shows every defect; either failing fails the job.
  const shadow = summarizeShadowCodeowners(findShadowCodeowners());
  const endpoint = await checkCodeownersErrors(read.input);
  for (const verdict of [shadow, endpoint]) {
    for (const line of verdict.lines) console.log(line);
    if (!verdict.ok) {
      console.log(`::error::${verdict.lines[0] ?? 'CODEOWNERS check failed'}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1]?.endsWith('check-codeowners-errors.ts') === true) {
  void main();
}
