# 05 — Plugin System Specification

---

## Principles

1. Plugins are the ONLY way stage logic runs. No direct imports between stage implementations.
2. Plugins declare capabilities via manifests. No implicit discovery.
3. Plugins communicate ONLY via ArtifactStore and EventBus. No shared mutable state.
4. Experimental plugins are default OFF. Enabling requires explicit config.
5. Plugin isolation is structural, not behavioral — unloaded plugins cannot be called.

## Plugin Manifest

Every plugin declares itself via a typed manifest:

```typescript
interface PluginManifest {
  /** Unique identifier (e.g., 'nexus:task-analyzer') */
  readonly id: string;
  /** Semantic version */
  readonly version: string;
  /** Human-readable description */
  readonly description: string;
  /** Stage types this plugin can handle */
  readonly stages: readonly StageType[];
  /** Capabilities this plugin requires to function */
  readonly requiredCapabilities: readonly string[];
  /** Trust level — determines policy gate strictness */
  readonly trustLevel: PluginTrustLevel;
  /** Whether this plugin is experimental (default off) */
  readonly experimental: boolean;
  /** Configuration schema (Zod) */
  readonly configSchema?: ZodSchema;
}

type PluginTrustLevel =
  | 'core' // Built-in, fully trusted (e.g., task-analyzer)
  | 'standard' // Vetted plugin (e.g., code-reviewer)
  | 'experimental' // Research/prototype (e.g., forest-of-thought)
  | 'external'; // Third-party (future)
```

## Plugin Interface

```typescript
interface PipelinePlugin {
  /** Manifest declaring this plugin's identity and capabilities */
  readonly manifest: PluginManifest;

  /**
   * Execute a pipeline stage.
   * @param stage - The stage specification from the PlanContract
   * @param context - Runtime context with artifact store, event bus, and abort signal
   * @returns Stage result with output artifacts
   */
  execute(stage: StageSpec, context: StageContext): Promise<StageResult>;

  /**
   * Validate plugin configuration at registration time.
   * Called once when the plugin is registered, not per-execution.
   */
  validateConfig(config: unknown): Result<void, ValidationError>;

  /**
   * Optional lifecycle hook — called when plugin is loaded.
   */
  onLoad?(): Promise<void>;

  /**
   * Optional lifecycle hook — called when plugin is unloaded.
   */
  onUnload?(): Promise<void>;
}

interface StageContext {
  /** Read/write artifact store */
  readonly artifacts: IArtifactStore;
  /** Event bus for observability */
  readonly events: IEventBus;
  /** Abort signal for cancellation */
  readonly signal: AbortSignal;
  /** Logger scoped to this stage */
  readonly logger: ILogger;
  /** CLI adapter access (for plugins that call models) */
  readonly adapters: IAdapterAccess;
  /** Task contract for reference (read-only) */
  readonly task: Readonly<TaskContract>;
}

interface StageResult {
  readonly success: boolean;
  readonly outputArtifacts: readonly ArtifactRef[];
  readonly metadata: Record<string, unknown>;
  readonly error?: string;
}
```

## Plugin Registry

```typescript
interface IPluginRegistry {
  /**
   * Register a plugin. Validates manifest and config.
   * Returns error if plugin ID conflicts or capabilities are missing.
   */
  register(plugin: PipelinePlugin): Result<void, RegistrationError>;

  /**
   * Resolve a plugin by ID. Returns undefined if not registered or disabled.
   */
  resolve(pluginId: string): PipelinePlugin | undefined;

  /**
   * List all enabled plugins with their manifests.
   */
  listEnabled(): readonly PluginManifest[];

  /**
   * Check if a plugin is enabled (registered + not disabled by config/policy).
   */
  isEnabled(pluginId: string): boolean;
}
```

## V1 Features → V2 Plugins

### Core Plugins (trustLevel: 'core', experimental: false)

| Plugin ID                | Stages              | V1 Source                     | Purpose                                     |
| ------------------------ | ------------------- | ----------------------------- | ------------------------------------------- |
| `nexus:task-analyzer`    | analyze             | SharedTaskAnalyzer            | Task classification + ambiguity scoring     |
| `nexus:model-router`     | route               | CompositeRouter               | 5-stage model routing pipeline              |
| `nexus:cli-executor`     | execute             | CLI adapters                  | Execute prompts via Claude/Gemini/Codex     |
| `nexus:consensus-voter`  | validate, aggregate | ConsensusEngine               | Multi-model voting                          |
| `nexus:graph-runner`     | execute             | GraphBuilder                  | DAG workflow execution                      |
| `nexus:spec-parser`      | analyze             | parseSpec + decomposeSpec     | Natural language → structured spec          |
| `nexus:security-checker` | validate            | security pipeline             | Trust classification + policy gate          |
| `nexus:plan-compiler`    | analyze             | WorkflowRouter + GraphBuilder | TaskContract → PlanContract → CompiledGraph |

### Standard Plugins (trustLevel: 'standard', experimental: false)

| Plugin ID                    | Stages            | V1 Source                    | Purpose                  |
| ---------------------------- | ----------------- | ---------------------------- | ------------------------ |
| `nexus:code-expert`          | execute           | agents/experts/code          | Code generation + review |
| `nexus:security-expert`      | execute, validate | agents/experts/security      | Security analysis        |
| `nexus:architecture-expert`  | execute, validate | agents/experts/architecture  | Architecture review      |
| `nexus:testing-expert`       | execute, validate | agents/experts/testing       | Test generation          |
| `nexus:documentation-expert` | execute           | agents/experts/documentation | Doc generation           |
| `nexus:pm-expert`            | analyze           | agents/experts/pm            | Requirements analysis    |
| `nexus:ux-expert`            | analyze           | agents/experts/ux            | UX review                |
| `nexus:research-engine`      | analyze           | research tools               | Paper/repo discovery     |

### Experimental Plugins (trustLevel: 'experimental', experimental: true, DEFAULT OFF)

| Plugin ID                 | Stages  | V1 Source                      | Purpose                            |
| ------------------------- | ------- | ------------------------------ | ---------------------------------- |
| `nexus:forest-of-thought` | execute | agents/reasoning/              | Tree-based reasoning               |
| `nexus:sica`              | execute | agents/self-improving/         | Self-improving code analysis       |
| `nexus:ictm`              | execute | agents/ictm/                   | Dynamic sub-agent creation         |
| `nexus:puppeteer`         | execute | agents/orchestration/          | Emergent multi-agent orchestration |
| `nexus:scaling-predictor` | analyze | agents/coordination/           | Workload prediction                |
| `nexus:aegean`            | execute | agents/collaboration/aegean    | Adaptive expert groups             |
| `nexus:trinity`           | execute | agents/collaboration/trinity   | Trinity coordination               |
| `nexus:freemad`           | execute | agents/collaboration/freemad   | Free-form debate                   |
| `nexus:reflexion`         | execute | agents/collaboration/reflexion | Self-reflection loops              |
| `nexus:aflow`             | execute | agents/collaboration/aflow     | MCTS exploration                   |

## Plugin Isolation Rules

### Structural Enforcement

1. **No cross-plugin imports.** ESLint rule `no-restricted-imports` prevents plugins from importing each other. Plugin source directories are isolated boundaries.

2. **Communication via artifacts only.** A plugin's `execute()` receives `StageContext` with an `IArtifactStore`. It reads input artifacts, produces output artifacts. That's it.

3. **No shared mutable state.** Plugins receive read-only `TaskContract` and write to artifact store. No global singletons, no shared caches between plugin instances.

4. **Capability validation at registration.** If a plugin declares `requiredCapabilities: ['claude-cli']` but no Claude adapter is available, registration fails cleanly.

### Experimental Plugin Config

> **As shipped, only core plugins load.** No production code path constructs the
> registry with `experimentalEnabled` / `experimentalAllow` (both `@deprecated`,
> #5097), every core manifest is `experimental: false`, and the registry is frozen
> right after core registration. The config below is the design target, not
> current behaviour.

```yaml
# nexus-agents.yaml
plugins:
  experimental:
    enabled: false # Global kill switch
    allow:
      - 'nexus:forest-of-thought' # Explicitly allow specific plugins
      - 'nexus:sica'
    deny: [] # Explicit deny overrides allow

  trust:
    maxTrustLevel: 'standard' # 'core' | 'standard' | 'experimental' | 'external'
```

### Plugin Loading Lifecycle

```
1. Server startup
2. Core plugins auto-registered (always loaded)
3. Standard plugins registered if capabilities available
4. Experimental plugins checked against config:
   - plugins.experimental.enabled === false → skip all
   - plugins.experimental.allow list → load only listed
   - Plugin.validateConfig() called → fail fast on bad config
5. Plugin.onLoad() called for each registered plugin
6. Plugin registry frozen (no runtime registration changes)
```
