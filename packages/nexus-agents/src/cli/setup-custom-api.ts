/**
 * Interactive setup for a custom OpenAI-compatible gateway (#2124).
 *
 * Closes the last child of epic #2119. The runtime adapter (#2125) is
 * already live — this module is the ergonomics layer: a single command
 * that validates the URL, probes connectivity, and tells the user
 * exactly what env vars to set for their shell.
 *
 * Writes nothing by default (dry-run is the safe behavior for a CLI
 * that touches shell state). Prints the shell fragment; user copies
 * it into ~/.bashrc / ~/.zshrc / ~/.config/fish/config.fish. Rationale:
 * harness-neutral — we don't know which shell the user runs or where
 * their nexus-agents.yaml lives.
 *
 * @module cli/setup-custom-api
 */

import { createInterface } from 'node:readline';
import { validateCustomApiBaseUrl } from '../adapters/sdk/custom-api-validation.js';
import { CUSTOM_API_BASE_URL_ENV, CUSTOM_API_ALLOW_PRIVATE_ENV } from '../adapters/sdk/types.js';
import { ok, err, type Result } from '../core/index.js';

/** Inputs to `configureCustomApi`. */
export interface CustomApiSetupInput {
  /** Gateway base URL (required). SSRF guard from adapters/sdk is applied. */
  readonly baseUrl: string;
  /** API key. If absent, `configureCustomApi` will prompt (or fail non-interactively). */
  readonly apiKey?: string;
  /** Model id to default to. Omitted → documented fallback "gpt-4o". */
  readonly model?: string;
  /** Skip the TTY prompt for the API key — useful for CI and scripting. */
  readonly nonInteractive?: boolean;
  /** Omit HTTP probe — useful for dry-run / offline verify. */
  readonly skipProbe?: boolean;
  /** Allow private / loopback base URLs (overrides the SSRF guard). */
  readonly allowPrivate?: boolean;
  /** Stream for prompts/output. Defaults to process.stdout / stdin. */
  readonly stream?: { readonly output: NodeJS.WritableStream };
  /**
   * Pluggable HTTP fetcher for tests. Defaults to global fetch.
   * Called as `fetch(url, { headers })`; should return `{ status, body }`.
   */
  readonly fetcher?: HttpFetcher;
}

/** Minimal HTTP fetcher shape — lets tests inject a mock without network. */
export type HttpFetcher = (
  url: string,
  init: { readonly headers: Readonly<Record<string, string>> }
) => Promise<{ readonly status: number; readonly body: string }>;

/** Outcome of `configureCustomApi`. */
export interface CustomApiSetupResult {
  /** Validated base URL (may differ trivially from input — e.g. canonical form). */
  readonly baseUrl: string;
  /** Resolved model id. */
  readonly model: string;
  /** Whether the /v1/models probe succeeded (always true unless skipped). */
  readonly probeSucceeded: boolean;
  /**
   * Shell fragment the user should add to their shell rc so nexus-agents
   * picks up the gateway on subsequent invocations. Already-set env
   * equivalents of these lines are all that's needed at runtime.
   */
  readonly shellFragment: string;
}

const DEFAULT_MODEL = 'gpt-4o';

/**
 * Configures a custom OpenAI-compatible gateway.
 *
 * Steps:
 * 1. Validate base URL via the SSRF guard (same as the runtime adapter).
 * 2. Resolve the API key (from input, env, or TTY prompt).
 * 3. Probe `GET {baseUrl}/models` with Bearer auth to confirm connectivity.
 * 4. Emit the shell-fragment the user adds to their shell rc.
 *
 * Returns an `ok` Result on success, or a `ConfigError`-bearing `err`
 * Result on any failure (invalid URL, missing API key in non-interactive,
 * probe failure). Never throws.
 */
export async function configureCustomApi(
  input: CustomApiSetupInput
): Promise<Result<CustomApiSetupResult, Error>> {
  const urlValidation = validateCustomApiBaseUrl(input.baseUrl, {
    ...(input.allowPrivate === true ? { allowPrivate: true } : {}),
  });
  if (!urlValidation.ok) return err(urlValidation.error);
  const baseUrl = urlValidation.value.toString();

  const apiKeyResult = await resolveApiKey(input);
  if (!apiKeyResult.ok) return err(apiKeyResult.error);
  const apiKey = apiKeyResult.value;

  const probeSucceeded = input.skipProbe === true ? false : await runProbe(baseUrl, apiKey, input);
  if (input.skipProbe !== true && !probeSucceeded) {
    return err(
      new Error(
        `Gateway probe failed: GET ${stripTrailingSlash(baseUrl)}/models did not return 2xx. ` +
          `Check that the URL is the chat-completions base (typically ends with /v1) and the API key has /models read scope.`
      )
    );
  }

  const model = input.model ?? DEFAULT_MODEL;
  return ok({
    baseUrl,
    model,
    probeSucceeded,
    shellFragment: buildShellFragment({ baseUrl, apiKey, model, allowPrivate: input.allowPrivate }),
  });
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

/**
 * Performs the /v1/models probe. Returns true on any 2xx response.
 * Swallows errors into `false` — the caller reports the failure.
 */
async function runProbe(
  baseUrl: string,
  apiKey: string,
  input: CustomApiSetupInput
): Promise<boolean> {
  const url = `${stripTrailingSlash(baseUrl)}/models`;
  const fetcher = input.fetcher ?? defaultFetcher;
  try {
    const res = await fetcher(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

const defaultFetcher: HttpFetcher = async (url, init) => {
  const res = await fetch(url, { headers: init.headers });
  const body = await res.text();
  return { status: res.status, body };
};

/**
 * Resolves the API key in priority order: input → env var → TTY prompt
 * (unless non-interactive, in which case the absence is a fail).
 */
async function resolveApiKey(input: CustomApiSetupInput): Promise<Result<string, Error>> {
  if (input.apiKey !== undefined && input.apiKey !== '') return ok(input.apiKey);
  const envKey = process.env['NEXUS_CUSTOM_API_KEY'];
  if (envKey !== undefined && envKey !== '') return ok(envKey);
  if (input.nonInteractive === true) {
    return err(
      new Error(
        'Custom API key required but not provided. Pass --custom-api-key or set NEXUS_CUSTOM_API_KEY.'
      )
    );
  }
  const prompted = await promptForApiKey(input.stream?.output ?? process.stdout);
  if (prompted === '') {
    return err(new Error('No API key entered; aborting.'));
  }
  return ok(prompted);
}

async function promptForApiKey(out: NodeJS.WritableStream): Promise<string> {
  out.write('Enter the API key for your custom gateway: ');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    return await new Promise<string>((resolve) => {
      rl.question('', (answer) => {
        resolve(answer.trim());
      });
    });
  } finally {
    rl.close();
  }
}

/**
 * Formats the shell fragment the user should paste into their shell rc.
 * Designed to be POSIX-portable; fish users can adapt `export` to `set -gx`.
 */
function buildShellFragment(params: {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly allowPrivate: boolean | undefined;
}): string {
  const { baseUrl, apiKey, model, allowPrivate } = params;
  const lines: string[] = [
    '# nexus-agents custom-openai gateway (nexus-agents setup --custom-api)',
    `export ${CUSTOM_API_BASE_URL_ENV}="${baseUrl}"`,
    `export NEXUS_CUSTOM_API_KEY="${apiKey}"`,
    `export NEXUS_CUSTOM_MODEL="${model}"`,
  ];
  if (allowPrivate === true) {
    lines.push(`export ${CUSTOM_API_ALLOW_PRIVATE_ENV}=1   # SSRF-guard bypass`);
  }
  return lines.join('\n') + '\n';
}
