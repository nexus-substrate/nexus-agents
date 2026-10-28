/** Bounded stdin/stdout CLI for Dependabot inventory capture. */

import {
  MAX_INPUT_BYTES,
  assessDependabotInventory,
  assessment,
  parseContext,
  type DependabotEvidenceContext,
} from './check-dependabot-inventory.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface CliArguments extends DependabotEvidenceContext {
  readonly repository?: string;
  readonly headSha?: string;
  readonly capturedAt?: string;
  readonly query?: string;
  readonly requestedState?: string;
}

function parseArguments(args: readonly string[]): CliArguments {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key?.startsWith('--') !== true) continue;
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) continue;
    values[key] = value;
    index += 1;
  }
  return {
    ...(values['--repository'] === undefined ? {} : { repository: values['--repository'] }),
    ...(values['--head-sha'] === undefined ? {} : { headSha: values['--head-sha'] }),
    ...(values['--captured-at'] === undefined ? {} : { capturedAt: values['--captured-at'] }),
    ...(values['--requested-state'] === undefined
      ? {}
      : { requestedState: values['--requested-state'] }),
  };
}

async function readBoundedStdin(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_INPUT_BYTES) throw new RangeError('input_limit_exceeded');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function unpackEvidenceEnvelope(value: unknown): {
  readonly pages: unknown;
  readonly query?: string;
  readonly queryOwner?: string;
  readonly queryName?: string;
} {
  if (isRecord(value) && Array.isArray(value.pages)) {
    return {
      pages: value.pages,
      ...(typeof value.query === 'string' ? { query: value.query } : {}),
      ...(typeof value.owner === 'string' ? { queryOwner: value.owner } : {}),
      ...(typeof value.name === 'string' ? { queryName: value.name } : {}),
    };
  }
  return { pages: value };
}

async function readCliEvidence(
  stdin: NodeJS.ReadableStream,
  fallbackQuery: string | undefined
): Promise<{
  readonly pages: unknown;
  readonly query: string | undefined;
  readonly queryOwner: string | undefined;
  readonly queryName: string | undefined;
  readonly finding: string | null;
}> {
  try {
    const envelope = unpackEvidenceEnvelope(JSON.parse(await readBoundedStdin(stdin)) as unknown);
    return {
      pages: envelope.pages,
      query: envelope.query ?? fallbackQuery,
      queryOwner: envelope.queryOwner,
      queryName: envelope.queryName,
      finding: null,
    };
  } catch (error: unknown) {
    return {
      pages: undefined,
      query: fallbackQuery,
      queryOwner: undefined,
      queryName: undefined,
      finding: error instanceof RangeError ? 'input_limit_exceeded' : 'invalid_json_input',
    };
  }
}

/** Run the bounded stdin/stdout CLI. Exported for focused CLI tests. */
export async function main(
  args: readonly string[] = process.argv.slice(2),
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout
): Promise<number> {
  const cli = parseArguments(args);
  const evidence = await readCliEvidence(stdin, cli.query);
  const context = {
    ...cli,
    ...(evidence.query === undefined ? {} : { query: evidence.query }),
    ...(evidence.queryOwner === undefined ? {} : { queryOwner: evidence.queryOwner }),
    ...(evidence.queryName === undefined ? {} : { queryName: evidence.queryName }),
  };
  const result =
    evidence.finding === null
      ? assessDependabotInventory(evidence.pages, context)
      : assessment('unmeasured', parseContext(context), {}, [evidence.finding]);
  stdout.write(`${JSON.stringify(result)}\n`);

  if (result.status === 'clean') return 0;
  if (result.status === 'open_count') return 2;
  return 1;
}
