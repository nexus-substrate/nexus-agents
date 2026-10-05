/** Mark superseded, unpublished changelog versions against npm (#4863). */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { compare, gt, lt, valid } from 'semver';
import { publishEnv } from './publish-env.js';

// npm staging has hidden a preceding version for >60 minutes (#6500/#6514).
// Require a higher version to have been public for six hours before marking.
const PUBLICATION_GRACE_MS = 6 * 60 * 60 * 1000;

class UnmeasuredRegistryError extends Error {}

const MARKER = '> **Not published to npm.**';
const HEADING = /^## ((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))[ \t]*(?:\r?\n|$)/;

function fetchRegistryTimes(packageName: string): string {
  return execFileSync('npm', ['view', packageName, 'time', '--json'], {
    env: publishEnv(process.env),
    encoding: 'utf-8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function publicationTimestamp(key: string, value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`npm returned an invalid ISO timestamp for ${key}`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`npm returned an invalid timestamp for ${key}`);
  }
  return timestamp;
}

function registryTimeDocument(raw: string): object {
  const parsed: unknown = JSON.parse(raw);
  // npm 12 wraps even a single object result; older npm returns it directly.
  const document: unknown = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('npm returned an invalid time document');
  }
  return document;
}

function publishedVersions(raw: string): ReadonlyMap<string, number> {
  const versions = new Map<string, number>();
  for (const [key, value] of Object.entries(registryTimeDocument(raw))) {
    if (key !== 'created' && key !== 'modified' && valid(key) !== key) {
      throw new Error(`npm returned an invalid version: ${key}`);
    }
    const timestamp = publicationTimestamp(key, value);
    if (key !== 'created' && key !== 'modified') versions.set(key, timestamp);
  }
  if (versions.size === 0) throw new Error('npm returned an empty version time document');
  return versions;
}

function nextFence(line: string, fence: string | undefined): string | undefined {
  const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);
  const marker = delimiter?.[1];
  if (marker === undefined) return fence;
  if (fence === undefined) return marker;
  return marker[0] === fence[0] && marker.length >= fence.length && delimiter?.[2]?.trim() === ''
    ? undefined
    : fence;
}

/** Changeset prose can contain version-shaped headings inside code samples. */
function changelogSections(changelog: string): readonly string[] {
  const sections: string[] = [];
  let section = '';
  let fence: string | undefined;
  // An empty changelog is an unchanged section, not a registry measurement.
  for (const line of changelog.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    if (fence === undefined && line.startsWith('## ')) {
      sections.push(section);
      section = '';
    }
    fence = nextFence(line, fence);
    section += line;
  }
  sections.push(section);
  return sections;
}

/** Lookup and validation complete before any write; returns newly marked versions. */
export function markUnpublishedChangelog(
  changelogPath: string,
  packageName: string,
  lookup: (packageName: string) => string = fetchRegistryTimes,
  now: () => number = Date.now
): readonly string[] {
  let published: ReadonlyMap<string, number>;
  try {
    published = publishedVersions(lookup(packageName));
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UnmeasuredRegistryError(`unmeasured for ${packageName}: ${reason}`, { cause: error });
  }
  const measuredAt = now();
  const versions = [...published.keys()].sort(compare);
  const highest = versions
    .filter(
      (version) => measuredAt - (published.get(version) ?? measuredAt) >= PUBLICATION_GRACE_MS
    )
    .at(-1);
  // A valid measurement containing only recent publications cannot supersede anything yet.
  if (highest === undefined) return [];
  const onNpm = new Set(versions);
  const changelog = readFileSync(changelogPath, 'utf-8');
  const newline = changelog.includes('\r\n') ? '\r\n' : '\n';
  const marked: string[] = [];
  const updated = changelogSections(changelog)
    .map((section) => {
      const heading = HEADING.exec(section);
      const version = heading?.[1];
      if (
        heading === null ||
        version === undefined ||
        onNpm.has(version) ||
        !lt(version, highest) ||
        section.includes(MARKER)
      )
        return section;
      const next = versions.find((published) => gt(published, version));
      const shipped = next === undefined ? '' : `; its changes shipped in ${next}`;
      const line = `${MARKER} This version was superseded before release${shipped}.`;
      marked.push(version);
      const header = heading[0].endsWith('\n') ? heading[0] : `${heading[0]}${newline}`;
      return `${header}${line}${newline}${section.slice(heading[0].length)}`;
    })
    .join('');
  if (marked.length > 0) writeFileSync(changelogPath, updated, 'utf-8');
  return marked;
}

if (process.argv[1]?.endsWith('mark-unpublished-changelog.ts') === true) {
  const [packageName, changelogPath, ...extra] = process.argv.slice(2);
  if (packageName === undefined || changelogPath === undefined || extra.length > 0) {
    process.stderr.write('usage: mark-unpublished-changelog.ts <package-name> <changelog-path>\n');
    process.exitCode = 1;
  } else {
    try {
      const marked = markUnpublishedChangelog(changelogPath, packageName);
      process.stdout.write(
        `mark-unpublished-changelog: ${packageName}: marked ${String(marked.length)} version(s)` +
          ` (${marked.length === 0 ? 'none' : marked.join(', ')})\n`
      );
    } catch (error: unknown) {
      if (error instanceof UnmeasuredRegistryError) {
        const reason = error.cause instanceof Error ? error.cause.message : String(error.cause);
        // npm stderr may contain newlines; keep the workflow annotation on one line.
        const annotationReason = reason.replace(/[\r\n]+/g, ' ');
        process.stderr.write(
          `::warning::mark-unpublished-changelog: ${packageName} unmeasured (${annotationReason}); ` +
            'CHANGELOG left unchanged, the next version-PR regeneration retries\n'
        );
      } else {
        process.stderr.write(`mark-unpublished-changelog failed: ${String(error)}\n`);
        process.exitCode = 1;
      }
    }
  }
}
