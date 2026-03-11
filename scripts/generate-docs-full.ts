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

/** Known descriptions for tier3 files. Falls back to topic-derived description. */
const TIER3_DESCRIPTIONS: Record<string, string> = {
  'CODING_STANDARDS.md': 'Code style, patterns, and TypeScript rules',
  'docs/ENTRYPOINTS.md': 'CLI commands, MCP tools, and REST API reference',
  'ARCHITECTURE.md': 'Full system architecture overview',
  'CONTRIBUTING.md': 'How to contribute to the project',
  'docs/architecture/AGENT_SYSTEM.md': 'Agent types, lifecycle, and delegation',
  'docs/architecture/MEMORY_SYSTEM.md': '8-type memory architecture (MIRIX)',
  'docs/architecture/ROUTING_SYSTEM.md': 'CompositeRouter pipeline and model selection',
  'docs/architecture/CONSENSUS_PROTOCOLS.md': '11 consensus protocols and voting strategies',
  'docs/architecture/SECURITY.md': 'Security pipeline, threat model, sandboxing',
  'docs/architecture/MCP_PROTOCOL.md': 'MCP server, tool registration, SDK integration',
  'docs/architecture/CONTEXT_LOAD_BALANCING.md': 'Multi-CLI context distribution',
  'docs/architecture/SWARM_OBSERVER_DESIGN.md': 'Swarm metrics and observability',
  'docs/architecture/UNTRUSTED_INPUT_HARDENING.md': 'Input sanitization and trust tiers',
  'docs/architecture/PIPELINE_ARCHITECTURE.md': 'V2 pipeline: TaskContract, EventBus, PolicyEngine',
  'docs/development/AGENT_DEVELOPMENT.md': 'Creating new agents and experts',
  'docs/development/TOOL_DEVELOPMENT.md': 'Adding MCP tools',
  'docs/development/MEMORY_DEVELOPMENT.md': 'Extending memory backends',
  'docs/development/CONTRIBUTION_GUIDE.md': 'Git workflow, branch naming, PR process',
  'docs/guides/DEBUGGING_OBSERVABILITY.md': 'Debugging, logging, and tracing guide',
  'docs/guides/MCP_INTEGRATION.md': 'MCP server setup and tool usage',
  'docs/research/CONTRIBUTING.md': 'Research tracking and paper registry',
  'docs/research/registry/papers.yaml': 'Tracked research papers (arXiv)',
  'docs/research/registry/techniques.yaml': 'Technique implementation status',
  'docs/research/registry/sources.yaml': 'External research sources',
  'docs/reference/capabilities.md': 'Auto-generated CLI/MCP/workflow index',
};

function buildTier3Rows(topics: Record<string, TopicEntry>): string {
  const seen = new Set<string>();
  return Object.entries(topics)
    .flatMap(([topicName, topic]) =>
      topic.tier3_files
        .filter((f) => {
          if (seen.has(f)) return false;
          seen.add(f);
          return true;
        })
        .map((f) => {
          const desc = TIER3_DESCRIPTIONS[f] ?? `${topicName.replace(/_/g, ' ')} detail`;
          return `| ${f} | ${desc} | ~400 |`;
        })
    )
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

### Task Orchestration
- **orchestrate** — Analyze task, decompose into subtasks, coordinate experts
- **create_expert** — Spawn specialized agent (10 roles: code, architecture, security, docs, testing, devops, research, pm, ux, infrastructure)
- **execute_expert** — Run task on a created expert, returns analysis + confidence
- **delegate_to_model** — Route task to optimal model based on capability matching

### Discovery
- **list_experts** — List available expert roles and capabilities
- **list_workflows** — List available workflow templates

### Workflows & Graphs
- **run_workflow** — Execute YAML workflow template (11 templates)
- **run_graph_workflow** — Execute graph-based workflow with checkpointing
- **execute_spec** — Execute markdown specification through full pipeline

### Consensus
- **consensus_vote** — Multi-model voting (6 agent roles, 5 strategies including higher_order)

### Research
- **research_query** — Query research registry (status, overlap, stats, search)
- **research_add** — Add arXiv paper to registry
- **research_discover** — Discover papers from arXiv, GitHub, and other sources
- **research_analyze** — Analyze registry for gaps, trends, priorities
- **research_catalog_review** — Review auto-cataloged references

### Memory
- **memory_query** — Unified search across all memory backends
- **memory_write** — Write to session, belief, or agentic memory
- **memory_stats** — Memory system statistics dashboard

### Observability
- **weather_report** — Multi-CLI performance metrics and adaptive routing
- **query_trace** — Query execution traces by run ID

### Security & DevOps
- **issue_triage** — GitHub issue triage with trust classification
- **repo_analyze** — Analyze repository structure and tooling
- **repo_security_plan** — Generate security scanning pipeline
- **registry_import** — Add AI model to capability registry`;
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
| -------- | ------------ | ------- |
| ANTHROPIC_API_KEY | Claude adapter | None |
| OPENAI_API_KEY | OpenAI adapter | None |
| GOOGLE_AI_API_KEY | Gemini adapter | None |
| NEXUS_LOG_LEVEL | Logging | info |`;
}

function getSourceMapSection(): string {
  return `## Source Code Map

\`\`\`
packages/nexus-agents/src/
├── core/              # Foundation: types, Result<T,E>, errors, logger
├── config/            # Model registry, Zod schemas, timeouts, task specialization
├── adapters/          # UnifiedAdapterRegistry, ResilientAdapter, provider adapters
├── agents/            # Agent framework, experts, collaboration, skills
├── cli-adapters/      # CLI integration: CompositeRouter, Budget/TOPSIS/LinUCB
├── context/           # Memory: typed, graph, adaptive, agentic, session, belief
├── consensus/         # 11 voting protocols, engine, voter-agents
├── mcp/               # MCP server, tools, middleware, SDK integration
├── pipeline/          # V2: TaskContract, PipelineRunner, EventBus, PolicyEngine
├── orchestration/     # AOrchestra, graph workflows (7 templates), scenarios
├── security/          # Sanitizer, trust classifier, policy gate, reputation
├── workflows/         # YAML template engine, 11 templates, LATTS compute
├── learning/          # Feedback loop, strategy distiller, outcome tracking
├── observability/     # Swarm observer, routing metrics, tracing
├── swe-bench/         # SWE-Bench evaluation harness
├── testing/           # E2E test framework, schemas, evaluation
└── indexer/           # Codebase indexing and category detection
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
| ---- | ------- | ------ |
| docs/INDEX.yaml | Machine-parseable index | ~200 |
| docs/llms.txt | LLM navigation (concise) | ~400 |
| docs/llms-full.txt | This file (comprehensive) | ~1200 |
| docs/TROUBLESHOOTING.md | Common issues | ~300 |

### Tier 2: Actionable Reference
| File | Purpose | Lines |
| ---- | ------- | ----- |
${tier2Rows}

### Tier 3: Deep Detail
| File | Purpose | Lines |
| ---- | ------- | ----- |
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
