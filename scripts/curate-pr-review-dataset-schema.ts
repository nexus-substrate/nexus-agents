/**
 * curate-pr-review-dataset-schema.ts — rubric schema + a self-contained
 * validator for the pr_review eval dataset (#3846 rubric, #3847 pipeline).
 *
 * `zod` lives in the nexus-agents package, not at the repo root, so a root-run
 * tsx/vitest cannot resolve it from scripts/ (the same reason build-model-
 * registry can't run standalone here). The rubric shape is small and stable, so
 * a hand-rolled validator keeps the curation pipeline dependency-free.
 *
 * @module scripts/curate-pr-review-dataset-schema
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export const CLASSES = ['buggy', 'clean', 'borderline'] as const;
export const PROVENANCE_SOURCES = [
  'historical',
  'historical-clean',
  'synthetic',
  'outcome-mined',
] as const;

export type Severity = (typeof SEVERITIES)[number];
export type CaseClass = (typeof CLASSES)[number];
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

/** Severities at or above the rubric's `medium` floor (Rule 1). */
export const SEVERITY_FLOOR: Severity = 'medium';
const FLOOR_AND_ABOVE: ReadonlySet<Severity> = new Set<Severity>(['critical', 'high', 'medium']);

export interface KnownBug {
  readonly summary: string;
  readonly severity: Severity;
  readonly location: string;
  readonly locationTolerance: 'line' | 'structural';
  readonly fixReference: string;
}

export interface BorderlineConcern {
  readonly summary: string;
  readonly raisedBy: string;
}

export interface Provenance {
  readonly source: ProvenanceSource;
  readonly fixReference: string | null;
  readonly discoveredBy: string | null;
}

export interface Adjudication {
  readonly adjudicatedAt: string;
  readonly adjudicatedUnder: string;
  readonly rationale: string;
}

export interface PrReviewCase {
  readonly number: string | number;
  readonly rubricVersion: string;
  readonly class: CaseClass;
  readonly title: string;
  readonly customDescription?: string;
  readonly customDiff?: string;
  readonly provenance: Provenance;
  readonly knownBugs: readonly KnownBug[];
  readonly borderlineConcerns: readonly BorderlineConcern[];
  readonly adjudication: Adjudication;
  readonly notes?: string;
}

export interface PrReviewDataset {
  readonly rubricVersion: string;
  readonly curatedAt: string;
  readonly reAdjudicatedAt?: string;
  readonly methodology: string;
  readonly rubricRef?: string;
  readonly prs: readonly PrReviewCase[];
}

export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly errors: readonly string[] };

// --- low-level guards -------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}

const CASE_KEYS = new Set<string>([
  'number',
  'rubricVersion',
  'class',
  'title',
  'customDescription',
  'customDiff',
  'provenance',
  'knownBugs',
  'borderlineConcerns',
  'adjudication',
  'notes',
]);

function requireStr(v: unknown, minLen: number, label: string, errs: string[]): void {
  if (typeof v !== 'string' || v.length < minLen) {
    errs.push(`${label} must be a string >=${String(minLen)} chars`);
  }
}

function validateLocationTolerance(
  v: Record<string, unknown>,
  where: string,
  errs: string[]
): void {
  if (!isNonEmptyString(v.location) || typeof v.locationTolerance !== 'string') return;
  const hasLine = /:\d+$/.test(v.location);
  if (v.locationTolerance === 'line' && !hasLine) {
    errs.push(`Rule 2: ${where} locationTolerance "line" needs a path:line location`);
  }
  if (v.locationTolerance === 'structural' && hasLine) {
    errs.push(`Rule 2: ${where} locationTolerance "structural" needs a path with no line`);
  }
}

function validateKnownBug(v: unknown, where: string, errs: string[]): void {
  if (!isRecord(v)) {
    errs.push(`${where}: not an object`);
    return;
  }
  requireStr(v.summary, 10, `${where}.summary`, errs);
  if (!oneOf(v.severity, SEVERITIES)) errs.push(`${where}.severity invalid`);
  if (!isNonEmptyString(v.location)) errs.push(`${where}.location required`);
  if (!oneOf(v.locationTolerance, ['line', 'structural'] as const)) {
    errs.push(`${where}.locationTolerance must be line|structural`);
  }
  if (!isNonEmptyString(v.fixReference)) errs.push(`${where}.fixReference required`);
  validateLocationTolerance(v, where, errs);
}

function validateConcern(v: unknown, where: string, errs: string[]): void {
  if (!isRecord(v)) {
    errs.push(`${where}: not an object`);
    return;
  }
  requireStr(v.summary, 10, `${where}.summary`, errs);
  if (!isNonEmptyString(v.raisedBy)) errs.push(`${where}.raisedBy required`);
}

function validateProvenance(v: unknown, at: string, errs: string[]): void {
  if (!isRecord(v)) {
    errs.push(`${at}.provenance must be an object`);
    return;
  }
  if (!oneOf(v.source, PROVENANCE_SOURCES)) errs.push(`${at}.provenance.source invalid`);
  if (!(v.fixReference === null || isNonEmptyString(v.fixReference))) {
    errs.push(`${at}.provenance.fixReference must be string|null`);
  }
  if (!(v.discoveredBy === null || isNonEmptyString(v.discoveredBy))) {
    errs.push(`${at}.provenance.discoveredBy must be string|null`);
  }
}

function validateAdjudication(v: unknown, at: string, errs: string[]): void {
  if (!isRecord(v)) {
    errs.push(`${at}.adjudication must be an object`);
    return;
  }
  if (typeof v.adjudicatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.adjudicatedAt)) {
    errs.push(`${at}.adjudication.adjudicatedAt must be YYYY-MM-DD`);
  }
  if (!isNonEmptyString(v.adjudicatedUnder)) {
    errs.push(`${at}.adjudication.adjudicatedUnder required`);
  }
  requireStr(v.rationale, 20, `${at}.adjudication.rationale`, errs);
}

function hasFloorBug(bugs: readonly unknown[]): boolean {
  return bugs.some(
    (b) => isRecord(b) && oneOf(b.severity, SEVERITIES) && FLOOR_AND_ABOVE.has(b.severity)
  );
}

/** Rule 1 — a buggy case needs a medium+ bug; non-buggy cases must not have one. */
function checkSeverityFloor(
  cls: CaseClass,
  bugs: readonly unknown[],
  at: string,
  errs: string[]
): void {
  const floor = hasFloorBug(bugs);
  if (cls === 'buggy' && !floor) {
    errs.push(`Rule 1: ${at} class "buggy" needs >=1 known bug at severity medium+`);
  }
  if (cls !== 'buggy' && floor) {
    errs.push(`Rule 1: ${at} class "${cls}" must have no medium+ known bug`);
  }
}

/** Rule 4 — borderline exclusivity. */
function checkBorderline(
  cls: CaseClass,
  bugCount: number,
  concernCount: number,
  at: string,
  errs: string[]
): void {
  if (cls === 'borderline' && bugCount > 0) {
    errs.push(`Rule 4: ${at} a borderline case must have knownBugs: []`);
  }
  if (concernCount > 0 && cls !== 'borderline') {
    errs.push(`Rule 4: ${at} borderlineConcerns are only valid on class "borderline"`);
  }
}

function validateRubricRules(v: Record<string, unknown>, at: string, errs: string[]): void {
  if (!oneOf(v.class, CLASSES)) return;
  const bugs = Array.isArray(v.knownBugs) ? v.knownBugs : [];
  const concerns = Array.isArray(v.borderlineConcerns) ? v.borderlineConcerns : [];
  checkSeverityFloor(v.class, bugs, at, errs);
  checkBorderline(v.class, bugs.length, concerns.length, at, errs);
}

function validateScalars(v: Record<string, unknown>, at: string, errs: string[]): void {
  for (const k of Object.keys(v)) {
    if (!CASE_KEYS.has(k)) errs.push(`${at}: unknown key "${k}"`);
  }
  if (!(isNonEmptyString(v.number) || (typeof v.number === 'number' && v.number > 0))) {
    errs.push(`${at}.number must be a non-empty string or positive number`);
  }
  if (!isNonEmptyString(v.rubricVersion)) errs.push(`${at}.rubricVersion required`);
  if (!oneOf(v.class, CLASSES)) errs.push(`${at}.class invalid`);
  if (!isNonEmptyString(v.title)) errs.push(`${at}.title required`);
}

function validateCase(v: unknown, idx: number, errs: string[]): void {
  const at = `prs[${String(idx)}]`;
  if (!isRecord(v)) {
    errs.push(`${at}: not an object`);
    return;
  }
  validateScalars(v, at, errs);
  validateProvenance(v.provenance, at, errs);
  validateAdjudication(v.adjudication, at, errs);
  if (!Array.isArray(v.knownBugs)) {
    errs.push(`${at}.knownBugs must be an array`);
  } else {
    v.knownBugs.forEach((b, i) => {
      validateKnownBug(b, `${at}.knownBugs[${String(i)}]`, errs);
    });
  }
  if (!Array.isArray(v.borderlineConcerns)) {
    errs.push(`${at}.borderlineConcerns must be an array`);
  } else {
    v.borderlineConcerns.forEach((c, i) => {
      validateConcern(c, `${at}.borderlineConcerns[${String(i)}]`, errs);
    });
  }
  validateRubricRules(v, at, errs);
}

/** Validate a parsed value as a dataset. Returns a typed result, never throws. */
export function parseDataset(raw: unknown): ParseResult<PrReviewDataset> {
  const errs: string[] = [];
  if (!isRecord(raw)) {
    return { success: false, errors: ['dataset: not an object'] };
  }
  if (!isNonEmptyString(raw.rubricVersion)) errs.push('dataset.rubricVersion required');
  if (!isNonEmptyString(raw.curatedAt)) errs.push('dataset.curatedAt required');
  if (!isNonEmptyString(raw.methodology)) errs.push('dataset.methodology required');
  const prs = Array.isArray(raw.prs) ? raw.prs : null;
  if (prs === null || prs.length === 0) {
    errs.push('dataset.prs must be a non-empty array');
  } else {
    prs.forEach((c, i) => {
      validateCase(c, i, errs);
    });
    if (isNonEmptyString(raw.rubricVersion)) {
      prs.forEach((c, i) => {
        if (isRecord(c) && c.rubricVersion !== raw.rubricVersion) {
          errs.push(`prs[${String(i)}].rubricVersion != dataset.rubricVersion`);
        }
      });
    }
  }
  if (errs.length > 0) return { success: false, errors: errs };
  return { success: true, data: raw as unknown as PrReviewDataset };
}
