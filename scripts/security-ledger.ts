/** Operator-only reporting and append-only closure of the local security ledger. */
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  ResolutionSchema,
  openFindings,
  findingIdentity,
  readLedger,
  type Finding,
  type Resolution,
} from '../packages/nexus-agents/src/security/discovery-ledger.js';

const DEFAULT_LEDGER = fileURLToPath(new URL('../.security-discoveries.jsonl', import.meta.url));
type Ledger = ReturnType<typeof readLedger>;

function readBytes(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return Buffer.alloc(0);
    throw new Error('Unable to read security ledger');
  }
}

function reportInvalid(ledger: Ledger): boolean {
  // No invalid lines is a valid empty report, not evidence of reviewed findings.
  if (ledger.invalidLines.length === 0) return false;
  console.error(`Invalid ledger lines: ${ledger.invalidLines.join(', ')}`);
  return true;
}

function findingLabel(finding: Finding): string {
  const summary =
    [finding['summary'], finding['title'], finding['description'], finding['detail']].find(
      (value) => typeof value === 'string'
    ) ?? '-';
  const location = finding['file'] ?? finding['component'] ?? finding['area'] ?? '-';
  const locationText = typeof location === 'string' ? location : JSON.stringify(location);
  return `${finding.severity} ${findingIdentity(finding) ?? '-'} ${locationText} ${summary.slice(0, 80)}`;
}

function report(path: string, countsOnly: boolean): number {
  const ledger = readLedger(readBytes(path).toString('utf8'));
  const classified = openFindings(ledger.findings, ledger.resolutions);
  console.log(`open: ${String(classified.open.length)}`);
  console.log(`resolved: ${String(classified.resolved.length)}`);
  console.log(`status-unmeasured: ${String(classified.statusUnmeasured.length)}`);
  console.log(`shape-unmeasured: ${String(ledger.shapeUnmeasured.length)}`);
  console.log(`invalid lines: ${String(ledger.invalidLines.length)}`);
  if (countsOnly) return reportInvalid(ledger) ? 1 : 0;
  console.log('\nOpen findings:');
  for (const finding of classified.open) console.log(findingLabel(finding));
  console.log('\nStatus-unmeasured findings:');
  for (const finding of classified.statusUnmeasured) {
    console.log(`${findingLabel(finding)} status=${JSON.stringify(finding['status'])}`);
  }
  console.log('\nShape-unmeasured records:');
  for (const record of ledger.shapeUnmeasured) {
    console.log(`line ${String(record.line)}: ${record.keys.join(',') || '(no keys)'}`);
  }
  return reportInvalid(ledger) ? 1 : 0;
}

function validateTarget(ledger: Ledger, target: string): void {
  if (reportInvalid(ledger)) throw new Error('Cannot resolve a ledger containing invalid lines');
  const matches = ledger.findings.filter((finding) => findingIdentity(finding) === target);
  if (matches.length === 0) throw new Error('Unknown target');
  if (matches.length > 1) throw new Error('Ambiguous target; use a unique finding id');
  if (openFindings(matches, ledger.resolutions).resolved.length > 0) {
    throw new Error('Target is already resolved');
  }
}

function appendResolution(path: string, resolution: Resolution): void {
  const lockPath = `${path}.lock`;
  let lock: number;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch {
    throw new Error('Cannot acquire ledger lock; another writer may be active');
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const original = readBytes(path);
    validateTarget(readLedger(original.toString('utf8')), resolution.target);
    const separator = original.length === 0 || original.at(-1) === 0x0a ? '' : '\n';
    const appended = Buffer.from(`${separator}${JSON.stringify(resolution)}\n`);
    writeFileSync(temporary, Buffer.concat([original, appended]), {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      ledger: { type: 'string', default: DEFAULT_LEDGER },
      'counts-only': { type: 'boolean', default: false },
      target: { type: 'string' },
      status: { type: 'string' },
      'fixed-in': { type: 'string' },
      by: { type: 'string' },
      note: { type: 'string' },
    },
  });
  const path = resolve(values.ledger);
  if (positionals.length !== 1) throw new Error('Expected open or resolve');
  if (positionals[0] === 'open') return report(path, values['counts-only']);
  if (positionals[0] !== 'resolve') throw new Error('Expected open or resolve');
  const parsed = ResolutionSchema.safeParse({
    kind: 'resolution',
    target: values.target,
    status: values.status,
    fixedIn: values['fixed-in'],
    at: new Date().toISOString(),
    by: values.by,
    note: values.note,
  });
  if (!parsed.success)
    throw new Error('Invalid resolution arguments: require target, canonical status and by');
  appendResolution(path, parsed.data);
  console.log('Resolution appended');
  return 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = main();
  } catch (error: unknown) {
    // Do not print Zod input, raw ledger records, or filesystem error paths.
    console.error(error instanceof Error ? error.message : 'Security ledger operation failed');
    process.exitCode = 1;
  }
}
