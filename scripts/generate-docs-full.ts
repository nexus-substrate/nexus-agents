/**
 * Generate llms-full.txt content
 * Split from generate-docs.ts to meet file size limits
 */

interface TopicEntry {
  summary: string;
  tier2_file: string;
  tier3_files: string[];
  keywords: string[];
}

interface BudgetEntry {
  tokens: number;
  description: string;
  load: string[];
}

interface IndexYaml {
  schema_version: string;
  last_updated: string;
  navigation: Record<string, string>;
  topics: Record<string, TopicEntry>;
  context_budgets: Record<string, BudgetEntry>;
  quick_reference: Record<string, Record<string, string>>;
}

function buildTier2Rows(topics: Record<string, TopicEntry>): string {
  return Object.values(topics)
    .map((topic) => {
      const summary = topic.summary.split('.')[0] ?? topic.summary;
      return `| ${topic.tier2_file} | ${summary} | ~400 |`;
    })
    .join('\n');
}

function buildTier3Rows(topics: Record<string, TopicEntry>): string {
  return Object.values(topics)
    .flatMap((topic) => topic.tier3_files.map((f) => `| ${f} | Component detail | TBD |`))
    .slice(0, 10)
    .join('\n');
}

function getProjectOverview(): string {
  return `## Project Overview

nexus-agents is a multi-agent orchestration system that coordinates AI models to handle complex software development tasks. It implements research-backed consensus protocols, intelligent routing, and sophisticated memory management.

### Core Philosophy
- Research-first: 25/27 techniques implemented from academic papers
- Zero-credential: OAuth for CLI adapters, no stored secrets
- Type-safe: Result<T,E> pattern, Zod validation at boundaries
- Observable: Swarm metrics, routing audits, event bus

### Key Metrics
- 96% technique coverage from research registry
- 87% context reduction via tiered documentation
- 11 consensus protocols implemented
- 8 memory system types`;
}

function getArchitectureSection(): string {
  return `## Architecture Deep Dive

### Agent System
\`\`\`
IAgent Interface
├── id: string
├── role: AgentRole
├── state: AgentState (idle → thinking → acting → waiting → error)
├── capabilities: AgentCapability[]
├── execute(task): Promise<Result<TaskResult, AgentError>>
└── handleMessage(msg): Promise<Result<AgentResponse, AgentError>>

Agent Types:
- TechLead: Orchestrates expert pool, delegates tasks
- Expert: Specialized domain knowledge (Code, Security, Architecture, etc.)
- Subagent: Spawned for parallel work within main context
\`\`\`

### Memory System (8 Types)
\`\`\`
ITypedMemory (MIRIX-inspired, arXiv:2507.07957)
├── Core: Agent identity, constraints
├── Episodic: Task experiences (Reflexion, arXiv:2303.11366)
├── Semantic: Domain knowledge
├── Procedural: Skills, workflows (Voyager, arXiv:2305.16291)
├── Resource: External references
├── Vault: Cross-session persistence
├── Graph: Entity relationships (Mem0, arXiv:2504.19413)
└── Adaptive: Priority-based retrieval
\`\`\`

### Routing System
\`\`\`
CompositeRouter Pipeline (Epic #164)
Task → TaskAnalyzer → BudgetRouter → TopsisRouter → LinUCBBandit → Decision
       (profile)      (filter)        (rank)         (learn)

Components:
- BudgetRouter: Token/cost/latency constraints (PILOT, arXiv:2508.21141)
- TopsisRouter: Multi-criteria ranking (MoMA, arXiv:2509.07571)
- LinUCBBandit: Contextual learning from outcomes
- PreferenceRouter: Preference-trained selection (RouteLLM, arXiv:2406.18665)
- QualityRouter: Quality-constrained (IPR, arXiv:2509.06274)
\`\`\``;
}

function getConsensusSection(): string {
  return `### Consensus Protocols (11 Implemented)
\`\`\`
Protocol Selection by Task Type:
├── Simple Majority: Quick decisions (>50%)
├── Supermajority: Important decisions (≥67%)
├── Unanimous: Critical/irreversible (100%)
├── Aegean: Byzantine tolerance (arXiv:2512.20184)
├── CP-WBFT: Weighted Byzantine (arXiv:2511.10400)
├── Reflexion: Multi-agent critique (arXiv:2512.20845)
├── Multi-Round: Comprehensive evaluation
├── Free-MAD: Anti-conformity (arXiv:2509.11035)
├── Self-Refine: Iterative improvement (arXiv:2303.17651)
├── Self-Debug: Error detection/repair (arXiv:2304.05128)
└── Proof-of-Learning: Performance-weighted
\`\`\`

### Security Architecture
\`\`\`
Threat Mitigations:
├── Prompt Injection: Input/output tagging, structured output
├── SSRF: URL allowlist, private IP blocking
├── Path Traversal: Normalization, directory jail
├── ReDoS: Static patterns only (CVE-2026-0621 mitigation)
├── Secrets: SecretsVault, sanitization
├── Byzantine: Weighted voting, pattern detection

Sandbox Modes:
├── none: Development only
├── policy: Command allowlist (default)
└── container: Full Docker isolation (production)
\`\`\``;
}

function getCliReference(): string {
  return `## CLI Reference

### Core Commands
\`\`\`bash
nexus-agents                    # Start MCP server
nexus-agents doctor             # Health check
nexus-agents config init        # Generate config
nexus-agents orchestrate <task> # Run orchestration
nexus-agents review <url>       # Review GitHub PR
\`\`\`

### Expert Commands
\`\`\`bash
nexus-agents expert list        # List expert types
nexus-agents expert create      # Create expert
\`\`\`

### Workflow Commands
\`\`\`bash
nexus-agents workflow list      # List templates
nexus-agents workflow run       # Execute template
\`\`\`

### Debug Commands
\`\`\`bash
nexus-agents routing-audit <task>  # Debug routing decisions
nexus-agents --verbose             # Verbose output
\`\`\``;
}

function getMcpToolsReference(): string {
  return `## MCP Tools Reference

### orchestrate
Analyze task, select experts, coordinate execution.
\`\`\`typescript
{
  task: string,           // Task description
  context?: object,       // Additional context
  maxIterations?: number  // Max refinement rounds
}
\`\`\`

### create_expert
Spawn specialized agent for specific domain.
\`\`\`typescript
{
  type: 'code' | 'security' | 'architecture' | ...,
  config?: ExpertConfig
}
\`\`\`

### run_workflow
Execute YAML workflow template.
\`\`\`typescript
{
  template: string,       // Template name
  inputs: object,         // Template inputs
  dryRun?: boolean        // Preview only
}
\`\`\``;
}

function getResearchSection(): string {
  return `## Research Techniques Registry

### Implemented (25/27)
- Aegean Consensus (arXiv:2512.20184)
- CP-WBFT Byzantine (arXiv:2511.10400)
- Multi-Agent Reflexion (arXiv:2512.20845)
- TRINITY Coordinator (arXiv:2512.04695)
- Self-Refine Loop (arXiv:2303.17651)
- Reflexion Verbal RL (arXiv:2303.11366)
- PILOT Budget Routing (arXiv:2508.21141)
- TOPSIS Routing (arXiv:2509.07571)
- IPR Quality Routing (arXiv:2509.06274)
- MIRIX Memory (arXiv:2507.07957)
- Mem0 Architecture (arXiv:2504.19413)
- A-MEM Agentic Memory (arXiv:2502.12110)
- Voyager Skill Library (arXiv:2305.16291)
- Constitutional AI (arXiv:2212.08073)
- Self-Debug (arXiv:2304.05128)
- LATTS Adaptive Compute (arXiv:2509.20368)
- And 9 more...

### Not Started (1)
- RL-Trained Orchestrator (arXiv:2505.19591) - P4, requires RL infrastructure`;
}

function getConfigSection(): string {
  return `## Configuration

### nexus-agents.yaml
\`\`\`yaml
models:
  default: claude-sonnet-4
  tiers:
    fast: [claude-haiku-3, gpt-4o-mini]
    balanced: [claude-sonnet-4, gpt-4o]
    powerful: [claude-opus-4, o1-pro]

routing:
  enableBudgetFilter: true
  enableTopsisRanking: true
  enableLinUCBSelection: true
  budget:
    tokenBudget: 1000000
    costBudgetUsd: 10.0

security:
  sandbox:
    mode: policy
    fallbackMode: none
\`\`\`

### Environment Variables
| Variable | Required For | Default |
|----------|--------------|---------|
| ANTHROPIC_API_KEY | Claude adapter | None |
| OPENAI_API_KEY | OpenAI adapter | None |
| GOOGLE_AI_API_KEY | Gemini adapter | None |
| NEXUS_LOG_LEVEL | Logging | info |`;
}

function getSourceMapSection(): string {
  return `## Source Code Map

\`\`\`
packages/nexus-agents/src/
├── core/              # Foundation layer
│   ├── types/         # IAgent, IModelAdapter, Result<T,E>
│   ├── errors/        # NexusError, AgentError
│   └── logger/        # Structured logging
├── config/            # Zod schemas, loading
├── adapters/          # Claude, OpenAI, Gemini, Ollama
├── agents/            # Agent framework
│   ├── tech-lead/     # Orchestration
│   ├── experts/       # Domain experts
│   ├── collaboration/ # Consensus protocols
│   ├── skills/        # Voyager skill library
│   └── self-improving/ # SICA implementation
├── cli-adapters/      # External CLI integration
│   ├── claude-adapter.ts
│   ├── gemini-adapter.ts
│   ├── codex-adapter.ts
│   ├── composite-router.ts
│   ├── budget-router.ts
│   ├── topsis-router.ts
│   └── linucb-bandit.ts
├── context/           # Memory management
│   ├── typed-memory.ts
│   ├── graph-memory.ts
│   ├── adaptive-memory.ts
│   ├── agentic-memory.ts
│   └── session-memory.ts
├── consensus/         # Voting protocols
│   ├── voting-protocol.ts
│   └── weighted-voting.ts
├── mcp/               # MCP server
│   └── tools/         # Tool definitions
├── workflows/         # Template engine
│   ├── parser.ts
│   ├── executor.ts
│   └── latts.ts       # Adaptive compute
├── learning/          # Feedback loop
│   └── feedback-integration.ts
└── observability/     # Metrics, tracing
    ├── swarm-observer.ts
    └── routing-metrics.ts
\`\`\``;
}

function getFooter(): string {
  return `## Contributing

1. Read: CONTRIBUTING.md
2. Standards: CODING_STANDARDS.md
3. Research: docs/research/CONTRIBUTING.md
4. Tests: \`pnpm test\`
5. Lint: \`pnpm lint\`

## Links

- Repository: github.com/williamzujkowski/nexus-agents
- MCP Protocol: modelcontextprotocol.io
- Research Index: docs/research/RESEARCH_INDEX.md`;
}

export function generateLlmsFullTxt(index: IndexYaml): string {
  const now = new Date().toISOString().split('T')[0] ?? 'unknown';
  const tier2Rows = buildTier2Rows(index.topics);
  const tier3Rows = buildTier3Rows(index.topics);

  const docMapSection = `## Complete Documentation Map

### Tier 1: Navigation
| File | Purpose | Tokens |
|------|---------|--------|
| docs/INDEX.yaml | Machine-parseable index | ~200 |
| docs/llms.txt | LLM navigation (concise) | ~400 |
| docs/llms-full.txt | This file (comprehensive) | ~1200 |
| docs/TROUBLESHOOTING.md | Common issues | ~300 |

### Tier 2: Actionable Reference
| File | Purpose | Lines |
|------|---------|-------|
${tier2Rows}

### Tier 3: Deep Detail
| File | Purpose | Lines |
|------|---------|-------|
| ARCHITECTURE.md | Full system architecture | ~1200 |
| CODING_STANDARDS.md | Code style, patterns | ~600 |
${tier3Rows}`;

  return `# nexus-agents - Comprehensive Documentation

> Multi-agent orchestration MCP server for AI-powered software development
> Use this file for deep research, architecture decisions, and system reviews

${getProjectOverview()}

${docMapSection}

${getArchitectureSection()}

${getConsensusSection()}

${getCliReference()}

${getMcpToolsReference()}

${getResearchSection()}

${getConfigSection()}

${getSourceMapSection()}

${getFooter()}

<!-- Generated: ${now} from docs/INDEX.yaml -->
`;
}
