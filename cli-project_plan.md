# CLI Integration Project Plan

**Version:** 2.1.0
**Created:** 2026-01-04 (ET)
**Updated:** 2026-01-04 (ET)
**Status:** Approved via Agent Consensus (Enhanced with CLI Testing)

---

## Executive Summary

Integrate Claude CLI, Gemini CLI, and Codex CLI into nexus-agents for capability-matched task routing with intelligent context management and automatic work balancing. All three CLIs support OAuth authentication, eliminating the need for nexus-agents to manage API keys.

**Key Enhancements (v2.0.0):**

- Context-aware task routing based on remaining capacity
- Token tracking with usage optimization suggestions
- Automatic work balancing across available models
- Consensus mechanisms inspired by claude-flow
- Hybrid memory backend (SQLite + Markdown)

### Architecture Decision

**Approved: Phased Hybrid Approach**

After agent voting (2-1-2 split, no supermajority), consensus was reached on a phased implementation:

| Phase   | Mode               | Focus                                        |
| ------- | ------------------ | -------------------------------------------- |
| Phase 1 | MCP Server         | nexus-agents as MCP tool for Claude CLI      |
| Phase 2 | CLI Adapters       | Subprocess integration for Gemini/Codex      |
| Phase 3 | Hybrid Mesh        | Full bidirectional orchestration             |
| Phase 4 | Context Management | Token tracking, capacity planning, balancing |

---

## Research Summary

### Claude CLI (Claude Code)

| Aspect              | Details                                                     |
| ------------------- | ----------------------------------------------------------- |
| **Models**          | Opus 4.5, Sonnet 4.5, Haiku 4.5, extended context (1M beta) |
| **Context Windows** | 200K tokens (1M beta for Sonnet)                            |
| **Rate Limits**     | 5-hour rolling window, varies by subscription tier          |
| **Auth**            | OAuth 2.0 with PKCE, API key helper, Bedrock/Vertex support |
| **MCP**             | Full MCP client, stdio/HTTP/SSE transports                  |
| **Token Counting**  | Free API: `/v1/messages/count_tokens`                       |
| **Usage Tracking**  | Headers: `anthropic-ratelimit-tokens-remaining`             |
| **Strengths**       | Complex reasoning (72.5% SWE-bench), architecture decisions |

### Gemini CLI

| Aspect              | Details                                              |
| ------------------- | ---------------------------------------------------- |
| **Models**          | Gemini 2.5/3 Pro, Flash variants                     |
| **Context Windows** | 1,048,576 tokens (1M)                                |
| **Rate Limits**     | Free: 5 RPM Pro, 15 RPM Flash; Paid: Higher          |
| **Auth**            | OAuth, ADC, service accounts, auto-detection in GCP  |
| **MCP**             | Full MCP support, stdio/SSE/HTTP                     |
| **Token Counting**  | Free API: `countTokens` (3000 RPM)                   |
| **Usage Tracking**  | Via Google Cloud Console quotas                      |
| **Strengths**       | Large codebase analysis, multimodal, bulk operations |

### Codex CLI (OpenAI)

| Aspect              | Details                                                      |
| ------------------- | ------------------------------------------------------------ |
| **Models**          | GPT-5.x-codex family (gpt-5.2-codex, gpt-5.1-codex-max/mini) |
| **Context Windows** | 400,000 tokens                                               |
| **Rate Limits**     | Tiered: 3-10K RPM, 40K-10M TPM based on tier                 |
| **Auth**            | ChatGPT OAuth, API key via stdin, env var                    |
| **MCP**             | Full MCP support, CAN RUN AS MCP SERVER                      |
| **Token Counting**  | tiktoken library (local, no API call)                        |
| **Usage Tracking**  | Headers: `x-ratelimit-remaining-tokens`                      |
| **Strengths**       | Focused implementation, test generation, parallel tasks      |

---

## Context Window Comparison

| Provider  | Model          | Context Window | Max Output | Cost/1M Input |
| --------- | -------------- | -------------- | ---------- | ------------- |
| Anthropic | Opus 4.5       | 200K           | 64K        | $15.00        |
| Anthropic | Sonnet 4.5     | 200K (1M beta) | 64K        | $3.00         |
| Anthropic | Haiku 4.5      | 200K           | 64K        | $1.00         |
| Google    | Gemini 2.5 Pro | 1M             | Varies     | Usage-based   |
| Google    | Gemini Flash   | 1M             | Varies     | Free tier     |
| OpenAI    | GPT-5.2-Codex  | 400K           | 128K       | $1.75         |
| OpenAI    | GPT-5.1-Codex  | 400K           | 128K       | $1.25         |

---

## Agent Voting Record

### Vote Summary

```
Architect:  C (Hybrid)    - "Maximum flexibility with phased approach"
Security:   A (MCP Server) - "Zero credential handling, minimal attack surface"
DevEx:      A (MCP Server) - "Simplicity, <5min onboarding"
AI/ML:      C (Hybrid)    - "Optimal capability routing"
PM:         B (CLI Orch)  - "Market breadth, vendor agnostic"

Result: 2-1-2 split (no supermajority)
Consensus: Phased approach starting with Option A
```

### Key Amendments Incorporated

1. **Mode Declaration** (Architect): Add `--mode` flag for explicit mode selection
2. **Tool Allowlisting** (Security): Strict validation and rate limiting
3. **Doctor Command** (DevEx): `nexus-agents doctor` for setup validation
4. **Capability Matrix** (AI/ML): Quantitative routing scores
5. **Phase Approach** (PM): Ship MCP first, add orchestration later
6. **Context Management** (NEW): Token tracking and capacity planning
7. **Work Balancing** (NEW): Automatic load distribution based on capacity

---

## Implementation Phases

### Phase 1: MCP Server Mode (v2.2.0)

**Goal:** nexus-agents as enhanced MCP server callable by Claude CLI

**Scope:**

- [x] Existing MCP tools (orchestrate, create_expert, run_workflow)
- [x] Add `delegate_to_model` tool for capability-matched routing
- [ ] Add model capability metadata to tool responses
- [ ] Document Claude CLI integration in README

**New MCP Tool:**

```typescript
// delegate_to_model - Route task to optimal model
server.tool(
  'delegate_to_model',
  {
    task: z.string().describe('Task to execute'),
    preferred_capability: z.enum(['reasoning', 'context', 'speed', 'code']).optional(),
    model_hint: z.string().optional(),
    estimate_tokens: z.boolean().optional().describe('Return token estimate only'),
  },
  async (args) => {
    // Route based on capability matching
    // Returns result + model used + reasoning + token usage
  }
);
```

**Success Criteria:**

- [ ] Claude CLI can call nexus-agents via MCP
- [ ] Task routing based on capability matching works
- [ ] Zero credential handling in nexus-agents
- [ ] <5 minute onboarding for Claude CLI users

---

### Phase 2: CLI Adapters (v2.3.0)

**Goal:** Add CLI adapters with evergreen architecture for Gemini and Codex

**Research Findings (2026-01-04):**

| CLI    | Version | Transport      | Rationale                                      |
| ------ | ------- | -------------- | ---------------------------------------------- |
| Claude | 2.0.76  | MCP Server     | nexus-agents IS the MCP server Claude calls    |
| Codex  | 0.77.0  | **MCP Client** | Codex supports `mcp-server` mode - most stable |
| Gemini | 0.22.5  | Subprocess     | No MCP server mode, uses JSON output           |

See: [CLI Integration Architecture Research](./docs/research/cli-integration-architecture.md)

**Scope:**

- [x] `ICliAdapter` interface with transport abstraction
- [ ] Codex MCP adapter (`codex mcp-server` - **preferred**) → See #90
- [x] Gemini subprocess adapter (`gemini <query> -o json`)
- [x] Claude subprocess adapter (for outbound orchestration)
- [x] Defensive response parsers with version awareness
- [x] Capability-based routing logic (basic)
- [ ] Fallback chains for availability

**Interface:**

```typescript
interface ICliAdapter {
  readonly name: 'claude' | 'gemini' | 'codex';
  readonly transport: 'mcp' | 'subprocess';
  readonly capabilities: CapabilityProfile;

  execute(task: Task): Promise<Result<CliResponse, CliError>>;
  healthCheck(): Promise<HealthStatus>;
  getModelInfo(): ModelInfo;
  getCapacity(): Promise<CapacityStatus>;
  getVersion(): Promise<string>; // NEW: For compatibility checking
}

// NEW: Health status with version info
interface HealthStatus {
  healthy: boolean;
  version: string;
  versionStatus: 'supported' | 'outdated' | 'breaking' | 'unsupported';
  message?: string;
}

interface CapabilityProfile {
  reasoning: number; // 0-10: Complex reasoning ability
  contextWindow: number; // Max tokens
  codeGeneration: number; // 0-10: Code quality
  speed: number; // 0-10: Response latency
  cost: number; // 0-10: Cost efficiency (10 = cheapest)
}

// NEW: Capacity tracking
interface CapacityStatus {
  remainingTokens: number;
  remainingRequests: number;
  resetTime: Date;
  utilizationPercent: number;
}
```

**Routing Logic:**

```typescript
function selectAdapter(task: Task): ICliAdapter {
  const profile = analyzeTask(task);
  const capacities = await getAllCapacities();

  // Filter adapters with sufficient capacity
  const available = adapters.filter(
    (a) => capacities[a.name].remainingTokens >= profile.estimatedTokens
  );

  if (available.length === 0) {
    throw new CapacityExhaustedError('No models available with sufficient capacity');
  }

  // Route based on task requirements AND available capacity
  if (profile.contextRequired > 200_000) return findBest(available, 'gemini');
  if (profile.reasoningComplexity > 7) return findBest(available, 'claude');
  if (profile.parallelizable) return findBest(available, 'codex');

  return findBest(available, 'claude'); // Default
}
```

**Transport Strategies:**

```typescript
// Codex: Use MCP transport (most stable)
class CodexMcpAdapter implements ICliAdapter {
  private client: Client;
  private process: ChildProcess;

  async connect(): Promise<void> {
    // Spawn Codex as MCP server
    this.process = spawn('codex', ['mcp-server']);
    const transport = new StdioClientTransport(this.process.stdin, this.process.stdout);
    this.client = new Client({ name: 'nexus-agents' });
    await this.client.connect(transport);
  }

  async execute(task: Task): Promise<Result<CliResponse, CliError>> {
    // Use MCP protocol - stable across CLI versions
    const result = await this.client.callTool({
      name: 'execute',
      arguments: { prompt: task.content },
    });
    return this.parseResponse(result);
  }
}

// Gemini: Use subprocess with defensive parsing
class GeminiSubprocessAdapter implements ICliAdapter {
  async execute(task: Task): Promise<Result<CliResponse, CliError>> {
    const result = await exec('gemini', [task.content, '-o', 'json']);
    return this.parser.parse(result.stdout);
  }
}

// Claude: Use subprocess when nexus-agents orchestrates
class ClaudeSubprocessAdapter implements ICliAdapter {
  async execute(task: Task): Promise<Result<CliResponse, CliError>> {
    const result = await exec('claude', ['-p', '--output-format', 'json', task.content]);
    return this.parser.parse(result.stdout);
  }
}
```

**Defensive Parsing (Evergreen):**

```typescript
// Parse only essential fields, ignore unknown fields
interface CliResponseParser<T> {
  parse(raw: string): Result<T, ParseError>;
  extractResponse(raw: string): string | null; // Most stable
  extractUsage(raw: string): TokenUsage | null; // May not exist
}

// Example: Graceful degradation
function parseAnyCliResponse(raw: string): CliResponse {
  // Try each parser in order, fall back to text
  for (const parser of [claudeParser, geminiParser, codexParser]) {
    const result = parser.extractResponse(raw);
    if (result) return { text: result, source: parser.name };
  }
  // Ultimate fallback: return raw text
  return { text: raw, source: 'unknown', warning: 'Unparsed response' };
}
```

**Success Criteria:**

- [x] All three CLIs can be invoked programmatically
- [ ] Codex uses MCP transport for stability → See #90
- [x] Routing selects optimal model for task type
- [ ] Fallback works when primary model unavailable
- [x] OAuth/ADC authentication works without API keys
- [x] Parsers degrade gracefully on format changes

**Tests:** 108 unit tests for CLI adapters (commit 7cbe873)

---

### Phase 3: Hybrid Mesh (v3.0.0)

**Goal:** Full bidirectional orchestration with MCP mesh

**Scope:**

- [ ] nexus-agents can run as MCP server (Phase 1)
- [ ] nexus-agents can spawn Codex as MCP server
- [ ] Claude CLI can orchestrate nexus-agents
- [ ] nexus-agents can orchestrate all three CLIs
- [ ] Mode auto-detection based on invocation

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    Hybrid Mesh                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Claude CLI ◄──MCP──► nexus-agents ◄──MCP──► Codex CLI │
│      │                     │                     │      │
│      │                     │                     │      │
│      └─────────────────────┼─────────────────────┘      │
│                            │                            │
│                     ┌──────▼──────┐                     │
│                     │ Gemini CLI  │                     │
│                     │ (subprocess)│                     │
│                     └─────────────┘                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Mode Selection:**

```bash
nexus-agents                    # Auto-detect (MCP if stdio, CLI otherwise)
nexus-agents --mode=server      # MCP server for Claude CLI
nexus-agents --mode=orchestrator # CLI orchestrator mode
nexus-agents --mode=mesh        # Full hybrid mesh
```

**Success Criteria:**

- [ ] All three modes work correctly
- [ ] Auto-detection is reliable
- [ ] No circular dependencies in mesh
- [ ] Performance overhead <100ms for mode switching

---

### Phase 4: Context Management (v3.1.0) - NEW

**Goal:** Intelligent context tracking, capacity planning, and automatic work balancing

**Scope:**

- [x] Universal token counter (all providers) - `src/context/token-counter.ts`
- [x] Capacity monitoring and alerting - `src/adapters/capacity-monitor.ts`
- [x] Context pruning strategies - `src/agents/context-pruner.ts`
- [x] Automatic work balancing - `src/context/work-balancer.ts`
- [ ] Usage optimization suggestions
- [x] Hybrid memory backend - `src/context/memory-backend.ts`

#### 4.1 Token Counting System

```typescript
interface ITokenCounter {
  // Provider-specific accurate counting
  countAnthropic(messages: Message[], model: string): Promise<number>;
  countGemini(content: string, model: string): Promise<number>;
  countOpenAI(text: string): number; // Local tiktoken

  // Quick estimate (works offline)
  estimate(text: string): number;
}

class UniversalTokenCounter implements ITokenCounter {
  private anthropicClient: Anthropic;
  private geminiClient: GoogleGenAI;
  private tiktokenEncoder: Tiktoken;

  async countAnthropic(messages: Message[], model: string): Promise<number> {
    const response = await this.anthropicClient.messages.countTokens({
      model,
      messages,
    });
    return response.input_tokens;
  }

  async countGemini(content: string, model: string): Promise<number> {
    const response = await this.geminiClient.models.countTokens({
      model,
      contents: content,
    });
    return response.totalTokens;
  }

  countOpenAI(text: string): number {
    return this.tiktokenEncoder.encode(text).length;
  }
}
```

#### 4.2 Capacity Monitor

```typescript
interface ICapacityMonitor {
  updateFromHeaders(provider: string, headers: Headers): void;
  getCapacity(provider: string): CapacityStatus;
  getAllCapacities(): Record<string, CapacityStatus>;
  onLowCapacity(callback: (provider: string, status: CapacityStatus) => void): void;
}

class CapacityMonitor implements ICapacityMonitor {
  private capacities: Map<string, CapacityStatus> = new Map();
  private lowCapacityCallbacks: Array<(p: string, s: CapacityStatus) => void> = [];

  updateFromHeaders(provider: string, headers: Headers): void {
    if (provider === 'anthropic') {
      this.capacities.set(provider, {
        remainingTokens: parseInt(headers.get('anthropic-ratelimit-tokens-remaining') || '0'),
        remainingRequests: parseInt(headers.get('anthropic-ratelimit-requests-remaining') || '0'),
        resetTime: new Date(headers.get('anthropic-ratelimit-tokens-reset') || ''),
        utilizationPercent: this.calculateUtilization(provider),
      });
    }
    // Similar for openai and gemini...

    this.checkLowCapacity(provider);
  }

  private checkLowCapacity(provider: string): void {
    const status = this.capacities.get(provider);
    if (status && status.utilizationPercent > 80) {
      this.lowCapacityCallbacks.forEach((cb) => cb(provider, status));
    }
  }
}
```

#### 4.3 Context Pruning Strategies

```typescript
type PruningStrategy = 'sliding_window' | 'hierarchical' | 'semantic';

interface IContextPruner {
  prune(messages: Message[], maxTokens: number, strategy: PruningStrategy): Promise<Message[]>;
}

class ContextPruner implements IContextPruner {
  async prune(
    messages: Message[],
    maxTokens: number,
    strategy: PruningStrategy
  ): Promise<Message[]> {
    switch (strategy) {
      case 'sliding_window':
        return this.slidingWindowPrune(messages, maxTokens);
      case 'hierarchical':
        return this.hierarchicalPrune(messages, maxTokens);
      case 'semantic':
        return this.semanticPrune(messages, maxTokens);
    }
  }

  // Keep recent messages, summarize older ones
  private async slidingWindowPrune(messages: Message[], maxTokens: number): Promise<Message[]> {
    const KEEP_RECENT = 5;
    const recent = messages.slice(-KEEP_RECENT);
    const older = messages.slice(0, -KEEP_RECENT);

    if (older.length === 0) return recent;

    const summary = await this.summarize(older);
    return [{ role: 'system', content: `Previous context: ${summary}` }, ...recent];
  }
}
```

#### 4.4 Automatic Work Balancer

```typescript
interface IWorkBalancer {
  assignTask(task: Task): Promise<AssignmentResult>;
  rebalance(): Promise<void>;
  getUtilization(): Record<string, number>;
}

class WorkBalancer implements IWorkBalancer {
  private capacityMonitor: ICapacityMonitor;
  private tokenCounter: ITokenCounter;
  private adapters: ICliAdapter[];

  async assignTask(task: Task): Promise<AssignmentResult> {
    const estimatedTokens = await this.tokenCounter.estimate(task.content);
    const taskProfile = this.analyzeTask(task);
    const capacities = this.capacityMonitor.getAllCapacities();

    // Score each adapter based on capability match AND available capacity
    const scores = this.adapters.map((adapter) => ({
      adapter,
      capabilityScore: this.scoreCapability(adapter, taskProfile),
      capacityScore: this.scoreCapacity(adapter, capacities[adapter.name], estimatedTokens),
      totalScore: 0,
    }));

    // Weight: 60% capability, 40% capacity
    scores.forEach((s) => {
      s.totalScore = s.capabilityScore * 0.6 + s.capacityScore * 0.4;
    });

    // Sort by total score and pick best
    scores.sort((a, b) => b.totalScore - a.totalScore);

    const best = scores[0];
    if (best.capacityScore === 0) {
      // All adapters at capacity - queue or reject
      throw new CapacityExhaustedError('All models at capacity');
    }

    return {
      adapter: best.adapter,
      estimatedTokens,
      reasoning: `Selected ${best.adapter.name} (capability: ${best.capabilityScore}, capacity: ${best.capacityScore})`,
    };
  }

  private scoreCapacity(
    adapter: ICliAdapter,
    capacity: CapacityStatus,
    requiredTokens: number
  ): number {
    if (capacity.remainingTokens < requiredTokens) return 0;
    return Math.min(10, (capacity.remainingTokens / requiredTokens) * 2);
  }
}
```

#### 4.5 Hybrid Memory Backend (Inspired by claude-flow)

```typescript
interface IMemoryBackend {
  store(key: string, value: unknown, metadata: MemoryMetadata): Promise<void>;
  retrieve(key: string): Promise<unknown | null>;
  search(query: string, limit: number): Promise<MemoryEntry[]>;
  prune(olderThan: Date): Promise<number>;
}

// SQLite for speed, Markdown for human readability
class HybridMemoryBackend implements IMemoryBackend {
  private sqlite: Database;
  private markdownDir: string;

  async store(key: string, value: unknown, metadata: MemoryMetadata): Promise<void> {
    // Store in SQLite for fast retrieval
    await this.sqlite.run(
      'INSERT OR REPLACE INTO memories (key, value, metadata, created_at) VALUES (?, ?, ?, ?)',
      [key, JSON.stringify(value), JSON.stringify(metadata), Date.now()]
    );

    // Also write to Markdown for human inspection
    if (metadata.importance === 'high') {
      await this.writeMarkdown(key, value, metadata);
    }
  }

  private async writeMarkdown(
    key: string,
    value: unknown,
    metadata: MemoryMetadata
  ): Promise<void> {
    const content = `# ${key}

**Created:** ${new Date().toISOString()}
**Importance:** ${metadata.importance}
**Tags:** ${metadata.tags?.join(', ') || 'none'}

## Content

\`\`\`json
${JSON.stringify(value, null, 2)}
\`\`\`
`;
    await fs.writeFile(path.join(this.markdownDir, `${key}.md`), content);
  }
}
```

**Success Criteria:**

- [ ] Token counting works for all three providers
- [ ] Capacity monitoring updates in real-time
- [ ] Low capacity warnings at 80% utilization
- [ ] Work balancing considers both capability and capacity
- [ ] Context pruning maintains conversation quality
- [ ] Memory persists across sessions

---

## Consensus Mechanisms (Inspired by claude-flow)

### Voting Strategies

For multi-agent decisions, support multiple consensus algorithms:

```typescript
type ConsensusAlgorithm = 'simple_majority' | 'supermajority' | 'unanimous' | 'proof_of_learning';

interface IConsensusEngine {
  propose(proposal: Proposal): Promise<ProposalId>;
  vote(proposalId: ProposalId, agentId: string, vote: Vote): Promise<void>;
  getResult(proposalId: ProposalId): Promise<ConsensusResult>;
}

interface Vote {
  decision: 'approve' | 'reject' | 'abstain';
  reasoning: string;
  confidence: number; // 0-1
}

class ConsensusEngine implements IConsensusEngine {
  // Proof-of-Learning: Agents with better track records have more voting power
  private calculateVoteWeight(agentId: string): number {
    const performance = this.agentPerformance.get(agentId);
    if (!performance) return 1.0;

    // Weight based on historical accuracy
    return 0.5 + performance.successRate * 0.5;
  }
}
```

### Agent Templates (Inspired by claude-flow)

Pre-defined agent configurations for easy spawning:

```typescript
const AGENT_TEMPLATES: Record<string, AgentTemplate> = {
  researcher: {
    role: 'research',
    capabilities: ['web_search', 'document_analysis', 'summarization'],
    defaultModel: 'gemini-pro', // Best for large context
    systemPrompt: 'You are a research specialist...',
  },
  coder: {
    role: 'implementation',
    capabilities: ['code_generation', 'refactoring', 'debugging'],
    defaultModel: 'claude-sonnet', // Best for code
    systemPrompt: 'You are a senior software engineer...',
  },
  reviewer: {
    role: 'review',
    capabilities: ['code_review', 'security_audit', 'performance_analysis'],
    defaultModel: 'claude-opus', // Best for reasoning
    systemPrompt: 'You are a code review specialist...',
  },
  optimizer: {
    role: 'optimization',
    capabilities: ['performance_tuning', 'cost_optimization', 'resource_management'],
    defaultModel: 'codex', // Fast iterations
    systemPrompt: 'You are a performance optimization specialist...',
  },
};
```

---

## Capability Matching Matrix

| Task Type               | Primary            | Secondary     | Tertiary     | Context Budget |
| ----------------------- | ------------------ | ------------- | ------------ | -------------- |
| Architecture decisions  | Claude Opus        | Claude Sonnet | Gemini Pro   | 100K           |
| Complex reasoning       | Claude Opus        | Codex 5.2     | Gemini Pro   | 80K            |
| Large codebase analysis | Gemini Pro (1M)    | Claude Sonnet | Codex        | 500K           |
| Code implementation     | Claude Sonnet      | Codex         | Gemini Flash | 60K            |
| Test generation         | Codex              | Claude Haiku  | Gemini Flash | 40K            |
| Code review             | Claude Sonnet      | Codex         | Gemini Pro   | 80K            |
| Bulk operations         | Gemini Flash       | Codex Mini    | Claude Haiku | 200K           |
| Multimodal (images)     | Gemini Pro         | Claude Sonnet | -            | 100K           |
| Cost-sensitive          | Gemini (free tier) | Codex Mini    | Claude Haiku | 20K            |
| Quick iterations        | Claude Haiku       | Gemini Flash  | Codex Mini   | 10K            |

---

## Security Considerations

### Credential Handling

**Principle:** nexus-agents handles ZERO credentials

| CLI        | Auth Method                   | nexus-agents Role  |
| ---------- | ----------------------------- | ------------------ |
| Claude CLI | OAuth 2.0 / API key helper    | None - CLI manages |
| Gemini CLI | OAuth / ADC / Service account | None - CLI manages |
| Codex CLI  | ChatGPT OAuth / stdin         | None - CLI manages |

### Security Controls

- [ ] Tool allowlisting with version pinning
- [ ] Input validation with Zod at all boundaries
- [ ] Output sanitization before returning
- [ ] Rate limiting per connection (token bucket)
- [ ] Audit logging with rotation
- [ ] Timeout enforcement on all CLI calls
- [ ] Circuit breaker for failing CLIs
- [ ] Subprocess sandboxing for CLI execution
- [ ] Memory sanitization (no secrets in memory backend)

---

## Files to Create/Modify

### New Files

| File                                 | Purpose                          | Phase |
| ------------------------------------ | -------------------------------- | ----- |
| `src/cli-adapters/index.ts`          | CLI adapter exports              | 2     |
| `src/cli-adapters/types.ts`          | ICliAdapter interface            | 2     |
| `src/cli-adapters/claude-adapter.ts` | Claude CLI adapter               | 2     |
| `src/cli-adapters/gemini-adapter.ts` | Gemini CLI adapter               | 2     |
| `src/cli-adapters/codex-adapter.ts`  | Codex CLI adapter                | 2     |
| `src/cli-adapters/router.ts`         | Capability-based routing         | 2     |
| `src/mcp/tools/delegate.ts`          | delegate_to_model MCP tool       | 1     |
| `src/context/token-counter.ts`       | Universal token counting         | 4     |
| `src/context/capacity-monitor.ts`    | Capacity tracking                | 4     |
| `src/context/pruner.ts`              | Context pruning strategies       | 4     |
| `src/context/work-balancer.ts`       | Automatic work distribution      | 4     |
| `src/context/memory-backend.ts`      | Hybrid SQLite + Markdown storage | 4     |
| `src/consensus/engine.ts`            | Voting and consensus             | 4     |
| `src/consensus/strategies.ts`        | Consensus algorithms             | 4     |

### Modified Files

| File                | Changes                            |
| ------------------- | ---------------------------------- |
| `CLAUDE.md`         | Add CLI integration section        |
| `README.md`         | Add hybrid swarm documentation     |
| `src/cli.ts`        | Add --mode flag and mode detection |
| `src/mcp/server.ts` | Register new delegate tool         |
| `package.json`      | Add tiktoken, better-sqlite3 deps  |

---

## GitHub Issues

### Epic

- **#70** `Epic: v2.2.0-v3.0.0 - CLI Integration and Hybrid Swarm`

### Phase 1 Issues

- **#71** `feat(mcp): add delegate_to_model tool for capability routing`
- **#72** `docs: add Claude CLI integration guide`
- **#73** `feat(cli): add --mode flag for mode selection`

### Phase 2 Issues (To Create)

- `feat(adapters): add ICliAdapter interface`
- `feat(adapters): implement Claude CLI adapter`
- `feat(adapters): implement Gemini CLI adapter`
- `feat(adapters): implement Codex CLI adapter`
- `feat(routing): add capability-based task router`

### Phase 3 Issues (To Create)

- `feat(mesh): add MCP client capability for Codex`
- `feat(mesh): implement mode auto-detection`
- `feat(mesh): add circuit breaker for CLI failures`

### Phase 4 Issues (To Create)

- `feat(context): add universal token counter`
- `feat(context): add capacity monitor with real-time tracking`
- `feat(context): implement context pruning strategies`
- `feat(context): add automatic work balancer`
- `feat(context): implement hybrid memory backend`
- `feat(consensus): add consensus engine with voting strategies`
- `research: analyze claude-flow patterns for adoption`

---

## Success Metrics

| Metric                          | Target                       |
| ------------------------------- | ---------------------------- |
| Onboarding time (Phase 1)       | <5 minutes                   |
| Task routing accuracy           | >85% optimal model selection |
| CLI invocation latency          | <500ms overhead              |
| Availability                    | 99.9% with fallback chains   |
| Zero credential exposure        | 100% (audit verified)        |
| Capacity utilization efficiency | >90% before exhaustion       |
| Token waste                     | <5% over-estimation          |
| Context quality after pruning   | >95% information retention   |

---

## Open Questions (Resolved)

| Question                           | Resolution                                        |
| ---------------------------------- | ------------------------------------------------- |
| Model pricing integration?         | YES - Include in routing score (cost field)       |
| Telemetry for routing improvement? | YES - Opt-in with local-only SQLite storage       |
| Custom capability profiles?        | YES - Via config file override                    |
| CLI version pinning?               | YES - Health check validates CLI versions         |
| Memory persistence format?         | Hybrid: SQLite (fast) + Markdown (human-readable) |
| Consensus mechanism?               | Multiple strategies: majority, supermajority, PoL |

---

## References

- [claude-flow Analysis](./docs/research/claude-flow-analysis.md) - Orchestration patterns
- [Claude Code Research](./docs/research/claude-code-research.md) - Claude CLI details
- [Gemini CLI Research](./docs/research/gemini-cli-research.md) - Gemini CLI details
- [Codex CLI Research](./docs/research/openai-codex-cli-research.md) - Codex CLI details
- [Anthropic Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

---

## Changelog

| Version | Date       | Changes                                                                                  |
| ------- | ---------- | ---------------------------------------------------------------------------------------- |
| 1.0.0   | 2026-01-04 | Initial approved plan                                                                    |
| 2.0.0   | 2026-01-04 | Added Phase 4 (Context Management), claude-flow patterns, token tracking, work balancing |
| 2.1.0   | 2026-01-04 | CLI testing research: Codex MCP server support, transport strategies, defensive parsing  |
| 2.2.0   | 2026-01-04 | Phase 2 implementation complete: CLI adapters, parsers, factory, 108 unit tests          |

---

_Approved via agent consensus voting per CLAUDE.md protocol_
_Enhanced with research from claude-flow, provider documentation, and live CLI testing_
