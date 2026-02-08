# API Contracts: V2 Core Types

_Complete TypeScript interfaces for the V2 Pipeline OS primitives._

---

## TaskContract

```typescript
import type {
  TaskAnalysisResult,
  TaskConstraints,
  RequiredCapabilities,
} from '../core/task-analysis';
import type { CapabilityGapReport } from '../core/task-analysis/capability-gap-detector';

type TaskStatus =
  | 'intake'
  | 'clarifying'
  | 'planning'
  | 'approved'
  | 'executing'
  | 'validating'
  | 'done'
  | 'failed';

interface TaskContract {
  readonly id: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly analysis: TaskAnalysisResult;
  readonly constraints: TaskConstraints;
  readonly requiredCapabilities: RequiredCapabilities;
  readonly capabilityGaps: CapabilityGapReport;
  readonly parentId?: string;
  readonly artifacts: readonly ArtifactRef[];
  readonly metadata: Record<string, unknown>;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completedAt?: number;
  readonly error?: string;
}
```

## PlanContract

```typescript
interface PlanContract {
  readonly taskId: string;
  readonly stages: readonly StageSpec[];
  readonly policyGates: readonly PolicyGateSpec[];
  readonly estimatedCost: CostEstimate;
  readonly approvalRequired: boolean;
  readonly maxIterations: number;
  readonly timeoutMs: number;
}

interface StageSpec {
  readonly id: string;
  readonly type: StageType;
  readonly pluginId: string;
  readonly inputArtifacts: readonly string[];
  readonly outputArtifacts: readonly string[];
  readonly dependencies: readonly string[];
  readonly config: Record<string, unknown>;
  readonly preferredCli?: CliNameLiteral;
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
}

type StageType = 'analyze' | 'route' | 'execute' | 'validate' | 'aggregate' | 'gate';

interface PolicyGateSpec {
  readonly id: string;
  readonly afterStage: string;
  readonly beforeStage: string;
  readonly rules: readonly string[];
  readonly onFail: 'block' | 'warn' | 'escalate';
}

interface CostEstimate {
  readonly totalTokensIn: number;
  readonly totalTokensOut: number;
  readonly estimatedCostUsd: number;
  readonly modelCalls: number;
}
```

## ArtifactStore

```typescript
interface IArtifactStore {
  put(artifact: Artifact): ArtifactRef;
  get(ref: ArtifactRef): Artifact | undefined;
  query(filter: ArtifactFilter): readonly ArtifactRef[];
  provenance(ref: ArtifactRef): readonly ProvenanceEntry[];
}

interface Artifact {
  readonly id: string;
  readonly type: ArtifactType;
  readonly content: unknown;
  readonly metadata: ArtifactMetadata;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly inputRefs: readonly ArtifactRef[];
}

type ArtifactType = 'code' | 'review' | 'plan' | 'test' | 'report' | 'vote' | 'spec' | 'analysis';

interface ArtifactRef {
  readonly id: string;
  readonly type: ArtifactType;
}

interface ArtifactMetadata {
  readonly trustTier?: number;
  readonly model?: string;
  readonly cli?: string;
  readonly [key: string]: unknown;
}

interface ArtifactFilter {
  readonly type?: ArtifactType;
  readonly createdBy?: string;
  readonly since?: number;
}

interface ProvenanceEntry {
  readonly artifactId: string;
  readonly stage: string;
  readonly plugin: string;
  readonly timestamp: number;
  readonly inputArtifacts: readonly string[];
}
```

## EventBus

```typescript
interface IEventBus {
  emit(event: PipelineEvent): void;
  subscribe(filter: EventFilter, handler: EventHandler): Unsubscribe;
  query(filter: EventFilter, limit?: number): readonly PipelineEvent[];
}

type EventHandler = (event: PipelineEvent) => void;
type Unsubscribe = () => void;

interface EventFilter {
  readonly type?: string | readonly string[];
  readonly taskId?: string;
  readonly stageId?: string;
  readonly since?: number;
}

// See 08-observability-eventing.md for full PipelineEvent union
```

## Plugin API

```typescript
interface PipelinePlugin {
  readonly manifest: PluginManifest;
  execute(stage: StageSpec, context: StageContext): Promise<StageResult>;
  validateConfig(config: unknown): Result<void, ValidationError>;
  onLoad?(): Promise<void>;
  onUnload?(): Promise<void>;
}

interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly stages: readonly StageType[];
  readonly requiredCapabilities: readonly string[];
  readonly trustLevel: PluginTrustLevel;
  readonly experimental: boolean;
  readonly configSchema?: ZodSchema;
}

type PluginTrustLevel = 'core' | 'standard' | 'experimental' | 'external';

interface StageContext {
  readonly artifacts: IArtifactStore;
  readonly events: IEventBus;
  readonly signal: AbortSignal;
  readonly logger: ILogger;
  readonly adapters: IAdapterAccess;
  readonly task: Readonly<TaskContract>;
}

interface StageResult {
  readonly success: boolean;
  readonly outputArtifacts: readonly ArtifactRef[];
  readonly metadata: Record<string, unknown>;
  readonly error?: string;
}

interface IPluginRegistry {
  register(plugin: PipelinePlugin): Result<void, RegistrationError>;
  resolve(pluginId: string): PipelinePlugin | undefined;
  listEnabled(): readonly PluginManifest[];
  isEnabled(pluginId: string): boolean;
}
```

## Pipeline Runner

```typescript
interface IPipelineRunner {
  compile(plan: PlanContract): Result<CompiledPipeline, CompileError>;
  execute(pipeline: CompiledPipeline, context: PipelineContext): Promise<PipelineResult>;
  resume(checkpointId: string): Promise<PipelineResult>;
}

interface PipelineContext {
  readonly task: TaskContract;
  readonly plugins: IPluginRegistry;
  readonly artifacts: IArtifactStore;
  readonly events: IEventBus;
  readonly policy: IPolicyEngine;
  readonly adapters: IAdapterAccess;
}

interface PipelineResult {
  readonly success: boolean;
  readonly taskContract: TaskContract;
  readonly artifacts: readonly ArtifactRef[];
  readonly events: readonly PipelineEvent[];
  readonly durationMs: number;
  readonly error?: string;
}
```

## Policy Engine

```typescript
interface IPolicyEngine {
  evaluate(gate: PolicyGateSpec, context: PolicyContext): PolicyDecision;
  registerRule(rule: PolicyRule): void;
  listRules(): readonly PolicyRule[];
}

interface PolicyRule {
  readonly id: string;
  readonly priority: number;
  readonly description?: string;
  evaluate(context: PolicyContext): PolicyDecision;
}

type PolicyDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason: string; readonly escalateTo?: string };

interface PolicyContext {
  readonly task: Readonly<TaskContract>;
  readonly stage: StageSpec;
  readonly stageResult: StageResult;
  readonly artifacts: readonly ArtifactRef[];
  readonly pipelineState: Readonly<Record<string, unknown>>;
}
```
