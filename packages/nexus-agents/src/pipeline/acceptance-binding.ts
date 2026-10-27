/** Host-owned builtin lineage and measured request observations; never custom acknowledgments. */
import { isCapturedAcceptanceContext, acceptanceIdentity } from './acceptance-context.js';
import type { AcceptanceContext, AcceptanceIdentity } from './acceptance-context.js';
import type { VoteResearchSuffix } from './plan-vote-proposal.js';

export type AcceptanceStage = 'plan' | 'vote' | 'decompose' | 'implement' | 'qa';
interface StageObservation {
  constructed: number | 'unmeasured';
  bridgeInvoked: number | 'unmeasured';
  voteInvoked: number | 'unmeasured';
  routerDispatch: 'unmeasured';
  providerAttention: 'unmeasured';
  request?: AcceptanceIdentity;
}
export interface AcceptanceMetadata {
  readonly source: AcceptanceContext['source'];
  readonly projection: AcceptanceIdentity;
  readonly provenance: AcceptanceContext['provenance'];
}
export function getAcceptanceMetadata(context: AcceptanceContext): AcceptanceMetadata {
  return Object.freeze({
    source: context.source,
    projection: context.projection.identity,
    provenance: context.provenance,
  });
}
export interface AcceptanceSummary {
  readonly binding: 'host-owned' | 'unmeasured';
  readonly source?: AcceptanceContext['source'];
  readonly projection?: AcceptanceIdentity;
  readonly provenance?: AcceptanceContext['provenance'];
  readonly stages: Readonly<Record<AcceptanceStage, Readonly<StageObservation>>>;
}
export interface BuiltinVoteEvidence {
  readonly format: 'bound-plan-vote-v1';
  readonly voteRecordId: string;
  readonly recordHash: string;
  readonly proposalHash: string;
  readonly planIdentity: AcceptanceIdentity;
  readonly acceptance: AcceptanceMetadata;
  readonly suffix: VoteResearchSuffix;
}
/** Opaque run-owned token. Only this module stores the associated mutable state. */
export interface AcceptanceRun {
  readonly context: AcceptanceContext;
}
export interface AcceptanceRequest {
  readonly prompt: string;
}
interface RunState {
  readonly stages: Record<AcceptanceStage, StageObservation>;
}
const runs = new WeakMap<AcceptanceRun, RunState>();
interface BuiltinRegistration {
  readonly run: AcceptanceRun | undefined;
  readonly methods: readonly (readonly [string, unknown])[];
  readonly parent?: object;
}
const builtins = new WeakMap<object, BuiltinRegistration>();
const STAGE_METHODS = [
  'research',
  'plan',
  'vote',
  'decompose',
  'implement',
  'qaReview',
  'qualityGate',
  'securityScan',
  'withWorkspace',
  'withAcceptance',
] as const;
function stageMethods(stages: object): BuiltinRegistration['methods'] {
  return STAGE_METHODS.map(
    (key) => [key, Object.getOwnPropertyDescriptor(stages, key)?.value as unknown] as const
  );
}
function matchesStageMethod(stages: object, key: string, expected: unknown): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(stages, key);
  if (descriptor === undefined) return expected === undefined;
  return !('get' in descriptor) && !('set' in descriptor) && descriptor.value === expected;
}
function validRegistration(
  stages: object,
  seen = new Set<object>()
): BuiltinRegistration | undefined {
  if (seen.has(stages)) return undefined;
  seen.add(stages);
  const entry = builtins.get(stages);
  if (entry === undefined || entry.methods.length === 0) return undefined;
  for (const [key, expected] of entry.methods) {
    if (!matchesStageMethod(stages, key, expected)) return undefined;
  }
  if (entry.parent !== undefined && validRegistration(entry.parent, seen) === undefined)
    return undefined;
  return entry;
}
const requests = new WeakMap<AcceptanceRequest, { run: AcceptanceRun; stage: AcceptanceStage }>();
const votes = new WeakMap<object, { run: AcceptanceRun; evidence: BuiltinVoteEvidence }>();

function emptyStages(): RunState['stages'] {
  const empty = (): StageObservation => ({
    constructed: 'unmeasured',
    bridgeInvoked: 'unmeasured',
    voteInvoked: 'unmeasured',
    routerDispatch: 'unmeasured',
    providerAttention: 'unmeasured',
  });
  return { plan: empty(), vote: empty(), decompose: empty(), implement: empty(), qa: empty() };
}
export function createAcceptanceRun(context: AcceptanceContext): AcceptanceRun {
  if (!isCapturedAcceptanceContext(context))
    throw new Error('Acceptance must be captured by the canonical snapshot factory');
  const run = Object.freeze({ context });
  runs.set(run, { stages: emptyStages() });
  return run;
}
/** Internal factory hook, deliberately absent from public export barrels. */
export function registerBuiltinStages<T extends object>(stages: T, run?: AcceptanceRun): T {
  builtins.set(stages, { run, methods: stageMethods(stages) });
  return stages;
}
export function forwardBuiltinStages<T extends object>(source: object, target: T): T {
  const entry = validRegistration(source);
  if (entry !== undefined)
    builtins.set(target, { run: entry.run, methods: stageMethods(target), parent: source });
  return target;
}
export function isBuiltinStageSet(stages: object): boolean {
  return validRegistration(stages) !== undefined;
}
export function getBuiltinAcceptance(stages: object): AcceptanceContext | undefined {
  return validRegistration(stages)?.run?.context;
}

function increment(value: number | 'unmeasured'): number {
  return value === 'unmeasured' ? 1 : value + 1;
}

/** Capture the exact host-built prompt; no claim that a model received or read it. */
export function captureAcceptanceRequest(
  run: AcceptanceRun | undefined,
  stage: AcceptanceStage,
  prompt: string,
  alreadyComposed = false
): AcceptanceRequest {
  const text =
    run === undefined || alreadyComposed
      ? prompt
      : `${prompt}\n\nAcceptance requirements (host-resolved input; retain every requirement):\n${run.context.projection.text}`;
  const request = Object.freeze({ prompt: text });
  const state = run === undefined ? undefined : runs.get(run);
  if (run !== undefined && state !== undefined) {
    const observation = state.stages[stage];
    observation.constructed = increment(observation.constructed);
    observation.request = acceptanceIdentity(text);
    requests.set(request, { run, stage });
  }
  return request;
}
/** Only call after abort/budget guards at the actual host invocation boundary. */
export function recordAcceptanceInvocation(
  request: AcceptanceRequest | undefined,
  kind: 'bridgeInvoked' | 'voteInvoked'
): void {
  const owned = request === undefined ? undefined : requests.get(request);
  if (owned === undefined) return;
  const observation = runs.get(owned.run)?.stages[owned.stage];
  if (observation !== undefined) observation[kind] = increment(observation[kind]);
}
export function getAcceptanceSummary(stages: object): AcceptanceSummary {
  const run = validRegistration(stages)?.run;
  const state = run === undefined ? undefined : runs.get(run);
  const observed = state?.stages ?? emptyStages();
  const stagesCopy = Object.fromEntries(
    Object.entries(observed).map(([key, value]) => [key, Object.freeze({ ...value })])
  ) as AcceptanceSummary['stages'];
  return Object.freeze({
    binding: run === undefined ? 'unmeasured' : 'host-owned',
    ...(run === undefined
      ? {}
      : {
          source: run.context.source,
          projection: run.context.projection.identity,
          provenance: run.context.provenance,
        }),
    stages: Object.freeze(stagesCopy),
  });
}
/** Evidence travels privately with the actual vote object, never JSON/spread outputs. */
export function retainBuiltinVoteEvidence(
  run: AcceptanceRun,
  vote: object,
  evidence: BuiltinVoteEvidence
): void {
  if (runs.has(run)) votes.set(vote, { run, evidence: Object.freeze(evidence) });
}
export function getBuiltinVoteEvidence(
  stages: object,
  vote: object
): BuiltinVoteEvidence | undefined {
  const owned = votes.get(vote);
  return owned !== undefined && validRegistration(stages)?.run === owned.run
    ? owned.evidence
    : undefined;
}

/** Stable positional encoding binds all measured metadata, independent of object key order. */
export function serializeAcceptanceIdentity(context: AcceptanceMetadata): string {
  const source = context.source;
  const components =
    source.kind === 'specFile+task'
      ? [source.components.specFile, source.components.task].map((component) => [
          component.sourceIdentity.sha256,
          component.sourceIdentity.bytes,
          component.projectionIdentity.sha256,
          component.projectionIdentity.bytes,
          provenanceTuple(component.provenance),
        ])
      : null;
  return JSON.stringify([
    'acceptance-binding-v1',
    source.kind,
    source.rawPreMiddleware,
    source.identity.sha256,
    source.identity.bytes,
    context.projection.sha256,
    context.projection.bytes,
    provenanceTuple(context.provenance),
    components,
  ]);
}
function provenanceTuple(provenance: AcceptanceContext['provenance']): readonly unknown[] {
  const observation = (
    value: AcceptanceContext['provenance']['argumentSanitization']
  ): readonly unknown[] =>
    value.status === 'modified'
      ? [
          value.status,
          value.counts.tagsRemoved,
          value.counts.commentsRemoved,
          value.counts.fieldsModified,
        ]
      : [value.status];
  return [
    provenance.callerTrustTier,
    provenance.sourceTrustTier,
    observation(provenance.argumentSanitization),
    observation(provenance.projectionSanitization),
  ];
}
