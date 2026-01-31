# Nexus Agents - Claude Code Instructions

**Project:** Multi-agent orchestration MCP server
**Repository:** github.com/williamzujkowski/nexus-agents
**Owner:** @williamzujkowski

---

## Quick Reference

```bash
# Development
pnpm install              # Install dependencies
pnpm dev                  # Start dev server
pnpm build                # Build all packages
pnpm test                 # Run tests
pnpm lint                 # Lint code
pnpm typecheck            # Type check

# GitHub CLI
gh issue create           # Create issue
gh pr create              # Create PR
gh pr merge               # Merge PR

# Nexus-Agents CLI
nexus-agents              # Start MCP server (default)
nexus-agents hello        # Welcome message (no API keys)
nexus-agents demo         # API-free exploration mode
nexus-agents verify       # Quick installation check
nexus-agents doctor       # Check CLI health
nexus-agents setup        # Configure Claude CLI integration
nexus-agents config init  # Generate starter config
nexus-agents expert list  # List available experts
nexus-agents workflow list # List workflow templates
nexus-agents workflow run # Execute workflow template
nexus-agents routing-audit # Debug model routing
nexus-agents orchestrate  # Standalone task execution
nexus-agents vote         # Consensus voting (5 agents)
nexus-agents review <url> # Review GitHub PR
nexus-agents fitness-audit # CLI fitness score audit
nexus-agents --help       # Full command list
```

**Full Reference:** [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) - Complete CLI, MCP, REST, and API documentation.

---

## Prerequisites

Before installing, verify your environment:

```bash
node --version   # Must be v22.x (LTS)
pnpm --version   # Must be v9.x (recommended) or npm v10.x
```

**Required:**

- Node.js 22.x LTS
- pnpm 9.x or npm 10.x

**Optional:**

- Docker (for container sandbox mode)
- Claude CLI (for MCP server mode)

---

## Environment Variables

| Variable             | Required For       | Default               |
| -------------------- | ------------------ | --------------------- |
| `ANTHROPIC_API_KEY`  | Claude adapter     | None                  |
| `OPENAI_API_KEY`     | OpenAI adapter     | None                  |
| `GOOGLE_AI_API_KEY`  | Gemini adapter     | None                  |
| `NEXUS_LOG_LEVEL`    | Logging verbosity  | `info`                |
| `NEXUS_CONFIG_PATH`  | Custom config path | `./nexus-agents.yaml` |
| `NEXUS_AUTH_ENABLED` | MCP authentication | `false` (disabled)    |

**Security Note:** Authentication is disabled by default for local development convenience. Set `NEXUS_AUTH_ENABLED=true` for production or network-exposed deployments.

---

## Getting Started (5 Minutes)

### For Claude Code Users

1. **Install:** `npm install -g nexus-agents`
2. **Setup:** `nexus-agents setup` (auto-configures MCP server)
3. **Verify:** `nexus-agents doctor`
4. **Test:** Ask Claude "orchestrate: What files are in this project?"

**Manual MCP Configuration (if setup fails):**

```bash
claude mcp add-json nexus-agents '{"command":"nexus-agents","args":["--mode=server"]}'
```

### For Standalone CLI

```bash
npm install -g nexus-agents
nexus-agents doctor                    # Verify installation
nexus-agents orchestrate "Explain closures in JavaScript"
```

### Verify Installation (Hello World)

After installation, verify everything works:

```bash
# Check system health
nexus-agents doctor

# Expected output:
# ✓ Node.js version: 22.x
# ✓ Configuration loaded
# ✓ API keys configured: 1 of 3
# Status: Ready

# Test orchestration (requires ANTHROPIC_API_KEY)
nexus-agents orchestrate "Hello World: summarize this test" --verbose
```

### Mode Selection

| Mode         | Flag                  | Use Case                             |
| ------------ | --------------------- | ------------------------------------ |
| Server       | `--mode=server`       | Claude Desktop/MCP clients (default) |
| Orchestrator | `--mode=orchestrator` | Standalone CLI, CI/CD pipelines      |
| Mesh         | `--mode=mesh`         | Advanced hybrid deployments          |

Auto-detection works in most cases. Run `nexus-agents --verbose` to see mode selection reasoning.

---

## Context Budget Guidance

Allocate context tokens based on task complexity. Reference: `docs/INDEX.yaml`

### Token Budgets by Task Type

| Task Type          | Budget | Use For                                |
| ------------------ | ------ | -------------------------------------- |
| Minimal (quick)    | ~800   | Simple questions, file lookups         |
| Standard (feature) | ~2,500 | Feature implementation, code review    |
| Research           | ~1,500 | Documentation gathering, analysis      |
| Full (system)      | ~6,000 | System reviews, architecture decisions |

### Context Allocation Strategy

| Allocation             | Percentage | Purpose                       |
| ---------------------- | ---------- | ----------------------------- |
| System instructions    | 15%        | CLAUDE.md, project context    |
| Task description       | 20%        | Current task requirements     |
| Active working content | 50%        | Code, research, file contents |
| Response generation    | 15%        | Reserved for output           |

### Preservation Techniques

- **Use subagents** for exploratory work (keeps main context clean)
- **Summarize large outputs** before adding to context
- **Reference by path** rather than inlining large file contents
- **Use `/clear`** when switching to unrelated tasks

---

## Core Operating Principles

### 1. Time Authority

**All operations use America/New_York (ET) timezone.**

Before any time-sensitive operation:

```bash
date '+%Y-%m-%d %H:%M:%S %Z'  # Verify current ET time
TZ='America/New_York' date    # Force ET if needed
```

Use verified ET time for:

- Timestamps in commits and issues
- Version date checks
- "Last updated" fields
- Scheduling and deadlines

### 2. Version Currency Enforcement

**Never use deprecated software. Always verify current stable versions.**

Before adding or updating any dependency:

```bash
# Check latest stable version and deprecation status
npm view <package> version
npm view <package> deprecated
npm view <package> time.modified

# Check Node.js LTS
node --version  # Should be 22.x LTS

# Check TypeScript
npx tsc --version  # Should be 5.8+
```

**If a dependency is deprecated or outdated:**

1. Find the recommended replacement
2. Document the migration path
3. Create a GitHub issue to track

### 3. Documentation Style: Polite Linus Torvalds

**All documentation and text must follow this style:**

Write like a technically precise, experienced engineer who respects the reader's intelligence. Be direct, honest, and clear. No marketing fluff, no exaggeration, no hand-waving.

**Do:**

- State what something does, precisely
- Admit limitations and incomplete features honestly
- Use technical terms correctly
- Be concise - say it once, say it right
- Provide working examples that actually work
- Tell the reader what they need to know, not what sounds impressive

**Do Not:**

- Exaggerate capabilities ("revolutionary", "cutting-edge", "seamless")
- Claim features exist when they don't
- Use vague marketing language ("leverage", "empower", "unlock")
- Hide limitations in fine print
- Promise what the code can't deliver
- Pad documentation with filler

**The test:** If a developer reads your documentation and tries to use the feature, will it work exactly as described? If not, fix the documentation or fix the code.

### 4. Research-First Approach

Before implementing any feature or making architectural decisions:

1. **Research Phase**
   - Search official documentation
   - Check current best practices
   - Verify version compatibility
   - Look for security advisories

2. **Document Findings**
   - Create GitHub issue with research summary
   - Link to primary sources
   - Note any `Verify:` items

### 5. Research Tracking System

**Always check existing research before starting new research.**

The project maintains a structured research tracking system in `docs/research/`:

```
docs/research/
├── RESEARCH_INDEX.md        # Master index (start here)
├── CONTRIBUTING.md          # How to add research
├── registry/
│   ├── papers.yaml          # All papers with metadata
│   ├── techniques.yaml      # Implementation techniques
│   ├── sources.yaml         # Product docs & other sources
│   └── alignments.yaml      # Technique overlap tracking
└── topics/
    ├── consensus/           # Multi-agent consensus
    ├── routing/             # Model routing
    ├── memory/              # Context & memory
    ├── code-generation/     # Self-improvement
    ├── cli-tools/           # CLI integration
    └── orchestration/       # Agent coordination
```

#### Before Researching

**Always check first to avoid duplicate research:**

```bash
# Check if paper exists by arXiv ID
grep -i "arxiv_id.*2501.06322" docs/research/registry/papers.yaml

# Check if technique exists
grep -i "technique-name" docs/research/registry/techniques.yaml

# Search topic files
grep -ri "keyword" docs/research/topics/

# Check for implementation overlap in source code
grep -ri "technique-keyword" packages/nexus-agents/src/
```

#### Overlap Checking Protocol

Before implementing a new technique, verify overlap with existing implementations:

1. **Check problem overlap** - Does an existing technique solve the same problem?
2. **Check enhancement potential** - Can the new technique enhance an existing one?
3. **Check conflicts** - Are there conflicting approaches that need reconciliation?
4. **Document findings** - Record overlap analysis in `docs/research/registry/alignments.yaml`

#### Adding New Research

1. **Add paper to registry** - `docs/research/registry/papers.yaml`
2. **Update topic README** - Add to appropriate topic in `docs/research/topics/`
3. **Extract techniques** - If applicable, add to `techniques.yaml`
4. **Create implementation issue** - For P1/P2 techniques

See `docs/research/CONTRIBUTING.md` for detailed guidelines.

#### Priority Definitions

| Priority | Definition                               |
| -------- | ---------------------------------------- |
| **P1**   | High impact, fits current architecture   |
| **P2**   | Medium impact, moderate changes needed   |
| **P3**   | Lower impact, significant changes needed |
| **P4**   | Infrastructure-level, long-term          |

### 6. Prime Directive

**Priority order for all implementation decisions:**

```
correctness > simplicity > performance > cleverness
```

- **Correctness**: Does it work? Handles edge cases? Tested?
- **Simplicity**: Can someone understand it in 5 minutes?
- **Performance**: Does it meet requirements? (not theoretical optimality)
- **Cleverness**: Never. Clever code is maintenance debt.

**The goal:** Produce boring, readable, maintainable software that survives production.

---

## Governance Framework

This section defines **executable governance** - rules that must be enforced through CI, reviews, and automation.

### Canonical Paths (Anti-Sprawl Policy)

**There must be ONE canonical implementation path** for each system concern. Multiple paths create maintenance burden and architectural drift.

#### Canonical Implementations

| Concern              | Canonical Path        | Location                                         | Non-Canonical (Deprecated)                           |
| -------------------- | --------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| **Task Analysis**    | `SharedTaskAnalyzer`  | `src/core/task-analysis/shared-task-analyzer.ts` | `src/agents/experts/task-analyzer.ts` (v3.0 removal) |
| **Task Routing**     | `CompositeRouter`     | `src/cli-adapters/composite-router.ts`           | Direct stage router usage                            |
| **Consensus Voting** | `ConsensusEngine`     | `src/consensus/engine.ts`                        | -                                                    |
| **CLI Adapters**     | `createAllAdapters()` | `src/cli-adapters/factory.ts`                    | Direct adapter instantiation                         |
| **MCP Tools**        | `registerTools()`     | `src/mcp/tools/index.ts`                         | Manual tool registration                             |

#### CompositeRouter Pipeline (5 Stages)

All task routing MUST go through the CompositeRouter pipeline:

```
Task → BudgetRouter → ZeroRouter → PreferenceRouter → TopsisRouter → LinUCB → Selected Model
```

**Do NOT** directly instantiate stage routers. Use `CompositeRouter.route(task)`.

#### File Modification Rules

**Always prefer:**

- Modifying existing files over creating new ones
- Extending existing modules over creating parallel implementations
- Refactoring in-place over creating `_v2`, `_new`, or `_enhanced` variants

**Never create:**

- `enhanced_*`, `new_*`, `v2_*`, `refactor_*` files
- Duplicate modules with slightly different interfaces
- Parallel implementations "for testing"

**If existing code is poorly structured:** Refactor it - do not fork it.

### Refactor Threshold Guidance

Refactoring must improve **clarity, structure, or maintainability**, not chase arbitrary metrics.

#### Decision Gate (≥3 "yes" required to refactor)

Before refactoring, answer:

1. Does this improve clarity?
2. Does this improve testability?
3. Does this improve separation of concerns?
4. Does this reduce coupling?
5. Does this reduce cognitive load?

**If fewer than 3 "yes" → Do NOT refactor.**

#### What to Preserve

| Situation                       | Action      |
| ------------------------------- | ----------- |
| File 400-600 lines but cohesive | Keep intact |
| Function 50-90 lines but clear  | Keep intact |
| Clear linear workflow           | Keep intact |
| High cognitive complexity       | Refactor    |
| Mixed responsibilities          | Refactor    |

**Rule:** Optimize for **clarity and intent**, not mechanical line counts.

### Consensus Voting Protocol

**When to require consensus voting:**

| Trigger                   | Threshold     | Agents    |
| ------------------------- | ------------- | --------- |
| Architecture changes      | supermajority | 5         |
| Breaking API changes      | unanimous     | 5         |
| Security-related changes  | supermajority | 5         |
| Sprint planning decisions | majority      | 3 (quick) |
| Feature prioritization    | majority      | 5         |

#### Voting Strategies

| Strategy            | Threshold                     | Use When                                      |
| ------------------- | ----------------------------- | --------------------------------------------- |
| `majority`          | >50%                          | General decisions, feature flags              |
| `supermajority`     | ≥67%                          | Architecture, security, breaking changes      |
| `unanimous`         | 100%                          | Critical infrastructure, irreversible changes |
| `proof-of-learning` | Weighted by agent performance | AI-generated code approval                    |
| `higher-order`      | Correlation-aware             | Detecting sycophancy patterns                 |

#### CLI Usage

```bash
# Standard 5-agent vote
nexus-agents vote --proposal "Add feature X" --threshold supermajority

# Quick 3-agent vote
nexus-agents vote --proposal "Minor change" --threshold majority --quick

# Dry-run (simulation)
nexus-agents vote --proposal "Test decision" --dry-run --verbose
```

#### MCP Tool Usage

```typescript
// Via MCP tool
await callTool('consensus_vote', {
  proposal: { title: 'Add feature', description: '...' },
  algorithm: 'supermajority',
  timeout: 300000,
});
```

### Fitness Audit Requirements

The fitness audit measures CLI orchestration architectural quality across 8 dimensions.

#### Target Score: 90+/100

**Current Score:** 92/100

#### Fitness Dimensions

| Dimension               | Max Points | Description                        |
| ----------------------- | ---------- | ---------------------------------- |
| `canonicalPaths`        | 20         | Penalizes duplicate workflow paths |
| `explicitBehavior`      | 15         | Penalizes hidden/magic behavior    |
| `determinism`           | 15         | Rewards predictable execution      |
| `observability`         | 15         | Rewards telemetry coverage         |
| `configSimplicity`      | 10         | Penalizes config surface area      |
| `layerSeparation`       | 10         | Penalizes cross-layer coupling     |
| `operatorErgonomics`    | 10         | Rewards CLI usability              |
| `governanceIntegration` | 5          | Rewards policy enforcement         |

#### Running the Audit

```bash
# Run fitness audit
nexus-agents fitness-audit

# JSON output for CI
nexus-agents fitness-audit --format=json

# Filter by severity
nexus-agents fitness-audit --min-severity=warning
```

#### CI Integration

**Releases MUST have fitness score ≥ 90.**

```yaml
# In CI workflow
- run: nexus-agents fitness-audit --format=json
- run: |
    SCORE=$(nexus-agents fitness-audit --format=json | jq '.score')
    if [ "$SCORE" -lt 90 ]; then exit 1; fi
```

### Governance Version Tracking

CLAUDE.md includes governance version markers:

```markdown
<!-- GOVERNANCE:VERSION:START -->

_Governance Version: YYYY-MM-DD_

<!-- GOVERNANCE:VERSION:END -->
```

**Update the version when:**

- Adding new governance rules
- Modifying canonical paths
- Changing voting thresholds
- Updating fitness requirements

---

## Orchestration Model

### Agent Delegation Strategy

I operate as the **lead orchestrator** and delegate work to specialized subagents:

| Subagent Type     | Use When                                    | Tools                   |
| ----------------- | ------------------------------------------- | ----------------------- |
| `Explore`         | Quick codebase searches, read-only analysis | Read, Glob, Grep        |
| `general-purpose` | Complex multi-step tasks                    | All tools               |
| `researcher`      | Deep research, documentation gathering      | Web, Read               |
| `coder`           | Implementation tasks                        | Read, Edit, Write, Bash |
| `reviewer`        | Code review, security audit                 | Read, Grep              |
| `tester`          | Test writing, coverage analysis             | Read, Edit, Bash        |

**Delegation Rules:**

- Spawn subagents for tasks taking >5 tool calls
- Use `Explore` for any codebase navigation
- Use parallel subagents for independent tasks
- Synthesize subagent results before presenting to user

### Context Load Balancing (Claude/Codex/Gemini)

When delegating work across CLI tools, follow these routing guidelines to optimize context usage, cost, and response quality.

#### Quick Routing Reference

| Task Type                        | Route To         | Reason                          |
| -------------------------------- | ---------------- | ------------------------------- |
| Complex reasoning, architecture  | **Claude**       | Best multi-step reasoning       |
| Code implementation, refactoring | **Codex**        | Specialized for code generation |
| Large codebase (>100K tokens)    | **Gemini**       | 1M context window               |
| Images, audio, video             | **Gemini**       | Native multimodal support       |
| Speed-critical, simple tasks     | **Gemini Flash** | Lowest latency                  |
| Budget-sensitive operations      | **Gemini**       | Lowest cost per token           |
| Security/compliance review       | **Claude**       | Requires careful reasoning      |
| Test generation                  | **Codex**        | Code-focused task               |

#### Context Preservation Rules

1. **Monitor Claude context** - Delegate when usage > 60%
2. **Use Gemini for exploration** - Codebase searches, bulk file analysis
3. **Use Codex for implementation** - Writing code, tests, refactoring
4. **Reserve Claude for synthesis** - Architecture decisions, complex reasoning

#### Delegation Decision Flow

```
1. Is it multimodal (image/audio/video)? → Gemini
2. Is context > 100K tokens? → Gemini
3. Is Claude context > 60%? → Delegate (Codex for code, Gemini for other)
4. Reasoning complexity > 7? → Claude
5. Code implementation task? → Codex
6. Budget-sensitive? → Gemini
7. Default → Use TOPSIS multi-criteria ranking
```

#### Fallback Order

| Primary Failed     | Fallback Chain                              |
| ------------------ | ------------------------------------------- |
| Claude unavailable | Codex (code) → Gemini (other)               |
| Gemini unavailable | Claude (may chunk large context)            |
| Codex unavailable  | Claude                                      |
| All rate limited   | Queue task, notify user, retry with backoff |

#### Cost Model ($/1K tokens)

| CLI    | Input    | Output | Avg Latency |
| ------ | -------- | ------ | ----------- |
| Claude | $0.015   | $0.075 | 2000ms      |
| Gemini | $0.00125 | $0.005 | 1500ms      |
| Codex  | $0.003   | $0.015 | 1000ms      |

**Full documentation:** [CONTEXT_LOAD_BALANCING.md](./docs/architecture/CONTEXT_LOAD_BALANCING.md)

### Multimodal Capability Routing

Route tasks based on media type. Gemini has native multimodal support; Claude requires base64 encoding.

#### Task Routing by Media Type

| Media Type           | Route To                                     | Reason                          |
| -------------------- | -------------------------------------------- | ------------------------------- |
| Image analysis       | **Gemini**                                   | Native support, 1M context      |
| Image generation     | **Gemini** (Imagen)                          | Built-in generation models      |
| Audio processing     | **Gemini**                                   | Native audio input support      |
| Video analysis       | **Gemini**                                   | Native video frame extraction   |
| UI screenshot review | **Claude** (reasoning) or **Gemini** (speed) | Choose based on task complexity |

#### File Type Detection

| Extensions                               | Processing Type   | Preferred CLI |
| ---------------------------------------- | ----------------- | ------------- |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Image             | Gemini        |
| `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`  | Audio             | Gemini        |
| `.mp4`, `.mov`, `.webm`, `.avi`          | Video             | Gemini        |
| `.pdf` (with images)                     | Document + Vision | Gemini        |

#### Multimodal CLI Commands

```bash
# Image analysis with Gemini
gemini "Describe this UI mockup" --image ./screenshot.png

# Audio transcription
gemini "Transcribe this meeting" --audio ./recording.m4a

# Video analysis
gemini "Summarize key points" --video ./demo.mp4

# Image with Claude (base64 encoded)
claude "Review this error screenshot" --image ./error.png

# Batch image processing
gemini "Extract text from receipts" --images ./receipts/*.jpg
```

#### Routing Decision

```
1. Has image/audio/video attachment? → Gemini (native multimodal)
2. UI review needing deep reasoning? → Claude
3. Bulk media processing? → Gemini (cost + speed)
4. Text-only task? → Follow standard routing above
```

---

## Architecture & Development Documentation

For detailed technical documentation, see:

### Architecture (Tier 2 → Tier 3)

| Topic           | Hub                                                          | Details                                                                    |
| --------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| System Overview | [docs/architecture/README.md](./docs/architecture/README.md) | Module structure, data flow, interfaces                                    |
| Agent System    | -                                                            | [AGENT_SYSTEM.md](./docs/architecture/AGENT_SYSTEM.md)                     |
| Memory System   | -                                                            | [MEMORY_SYSTEM.md](./docs/architecture/MEMORY_SYSTEM.md)                   |
| Routing System  | -                                                            | [ROUTING_SYSTEM.md](./docs/architecture/ROUTING_SYSTEM.md)                 |
| Load Balancing  | -                                                            | [CONTEXT_LOAD_BALANCING.md](./docs/architecture/CONTEXT_LOAD_BALANCING.md) |
| Consensus       | -                                                            | [CONSENSUS_PROTOCOLS.md](./docs/architecture/CONSENSUS_PROTOCOLS.md)       |
| Security        | -                                                            | [SECURITY.md](./docs/architecture/SECURITY.md)                             |
| MCP Protocol    | -                                                            | [MCP_PROTOCOL.md](./docs/architecture/MCP_PROTOCOL.md)                     |

### Development (Tier 2 → Tier 3)

| Topic              | Hub                                                        | Details                                                           |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Contributing       | [docs/development/README.md](./docs/development/README.md) | Workflow, PR process, quality gates                               |
| Agent Development  | -                                                          | [AGENT_DEVELOPMENT.md](./docs/development/AGENT_DEVELOPMENT.md)   |
| Tool Development   | -                                                          | [TOOL_DEVELOPMENT.md](./docs/development/TOOL_DEVELOPMENT.md)     |
| Memory Development | -                                                          | [MEMORY_DEVELOPMENT.md](./docs/development/MEMORY_DEVELOPMENT.md) |
| Coding Standards   | [CODING_STANDARDS.md](./CODING_STANDARDS.md)               | TypeScript, security, testing standards                           |

### Quick Access

- **Context Load Balancing:** Claude/Codex/Gemini delegation strategy → [CONTEXT_LOAD_BALANCING.md](./docs/architecture/CONTEXT_LOAD_BALANCING.md)
- **Consensus Protocols:** 11 protocols with selection matrix → [CONSENSUS_PROTOCOLS.md](./docs/architecture/CONSENSUS_PROTOCOLS.md)
- **CLI Agent Integration:** Claude/Gemini/Codex routing → [ROUTING_SYSTEM.md](./docs/architecture/ROUTING_SYSTEM.md)
- **A2A Protocol:** Event bus, agent messaging → [AGENT_SYSTEM.md](./docs/architecture/AGENT_SYSTEM.md#event-bus)
- **Security & Sandboxing:** Threat model, sandbox modes → [SECURITY.md](./docs/architecture/SECURITY.md)
- **MCP Tool Patterns:** Zod validation, error handling → [TOOL_DEVELOPMENT.md](./docs/development/TOOL_DEVELOPMENT.md)

---

## Workflow Templates

### Feature Implementation

1. Create GitHub issue with requirements
2. Research and document approach
3. Define interfaces (if new module)
4. Implement with TDD (test first)
5. Run quality gates
6. Create PR with issue reference
7. Address review feedback
8. Merge and close issue
9. **Update research tracking** (if research-related):
   - Update `docs/research/registry/techniques.yaml` status → `implemented`
   - Add `decision_history` entry with commit reference
   - Update `docs/research/registry/papers.yaml` implementation_status
   - Update `docs/research/RESEARCH_INDEX.md` Quick Stats if counts changed
10. **Update documentation** (if significant):
    - README.md for user-facing changes
    - ARCHITECTURE.md for architectural changes
    - CHANGELOG.md entry for release notes
11. **Run Implementation Complete Checklist** (see below)

### Bug Fix

1. Create GitHub issue with reproduction steps
2. Write failing test that demonstrates bug
3. Implement fix
4. Verify test passes
5. Check for similar bugs elsewhere
6. Create PR
7. Merge and close issue

### Refactoring

1. Document current state and target state
2. Ensure test coverage exists
3. Make incremental changes
4. Run tests after each change
5. Update documentation
6. Create PR with rationale

### Release

1. Ensure all CI gates pass
2. Update CHANGELOG.md with version and date
3. Version bump in package.json (semantic versioning)
4. Create and push tag:
   ```bash
   git tag -a v2.3.0 -m "Release v2.3.0"
   git push origin v2.3.0
   ```
5. Publish to npm: `pnpm publish`
6. Create GitHub Release: `gh release create v2.3.0 --generate-notes`
7. Update ALIGNMENT_ROADMAP.md phase status

**Rollback (if needed):**

```bash
npm unpublish nexus-agents@2.3.0  # Within 72 hours
git tag -d v2.3.0 && git push --delete origin v2.3.0
```

### Hotfix

**Trigger:** Critical bug or security vulnerability in production.

1. Create branch from latest release tag:
   ```bash
   git checkout -b hotfix/123-critical-fix v2.3.0
   ```
2. Implement fix with minimal changes
3. Security label + P1 = single-reviewer approval sufficient
4. Merge to main AND cherry-pick to release branch
5. Immediate release with patch version bump (e.g., v2.3.1)

---

## Implementation Complete Checklist

Before marking ANY technique or feature as "implemented", verify ALL of the following:

### Code Requirements

- [ ] Code exists in specified `integration_files`
- [ ] All functions have explicit return types
- [ ] No `any` types (use `unknown` instead)

### Quality Gates

- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (relevant tests)

### Documentation Updates (if research-related)

- [ ] `docs/research/registry/techniques.yaml`: `status: implemented`, `decision_history` entry
- [ ] `docs/research/registry/papers.yaml`: `implementation_status` updated
- [ ] `docs/research/RESEARCH_INDEX.md`: Quick Stats updated if counts changed
- [ ] Topic README updated: `docs/research/topics/[topic]/README.md`

### GitHub Tracking

- [ ] Implementation issue closed with summary comment
- [ ] PR merged (if applicable)

**Do NOT mark as implemented if:**

- Code exists but tests fail
- Implementation is partial
- Feature is behind a feature flag

---

## System Review Protocol

### Trigger Conditions

Run a System Review when ANY of these occur:

- Open GitHub issues drop below 5
- An EPIC issue is closed (label: `epic`)
- 7 days since last review (time-based fallback)
- Manual request via `/system-review` or team decision

### Review Checklist

**Phase 1: Registry Reconciliation**

```bash
# Count techniques by status
grep -c "status: implemented" docs/research/registry/techniques.yaml
grep -c "status: planned" docs/research/registry/techniques.yaml

# Verify RESEARCH_INDEX.md matches actual counts
# Check integration_files exist for implemented techniques
```

**Phase 2: Documentation Sync**

- [ ] ARCHITECTURE.md reflects current phase status
- [ ] README.md lists current capabilities accurately
- [ ] CHANGELOG.md has entries for shipped features
- [ ] ALIGNMENT_ROADMAP.md phase status is current

**Phase 3: Issue Health**

- [ ] No orphaned issues (referenced but not in GitHub)
- [ ] No stale issues (no activity > 30 days without `wontfix` label)
- [ ] Labels are accurate and consistent

**Phase 4: Generate Report**

Create GitHub issue titled "System Review: YYYY-MM-DD" with findings and action items.

---

## Discovered Issue Protocol

When finding issues during work, create a GitHub issue **IMMEDIATELY** to prevent lost work items.

### When to Create Issues

- Bug found in existing code
- Technical debt identified
- Missing test coverage discovered
- Documentation inaccuracy found
- Performance concern noted
- Security consideration identified
- Research opportunity spotted

### Issue Creation Format

**Title Pattern:** `{type}: {brief description}`

| Type         | Label         | Use When                            |
| ------------ | ------------- | ----------------------------------- |
| `bug:`       | bug           | Defect in existing functionality    |
| `tech-debt:` | tech-debt     | Code quality improvement needed     |
| `docs:`      | documentation | Documentation update needed         |
| `test:`      | testing       | Test coverage gap                   |
| `perf:`      | performance   | Performance improvement opportunity |
| `security:`  | security      | Security consideration              |
| `research:`  | research      | New research topic to explore       |

**Quick Commands:**

```bash
# Bug discovered
gh issue create --title "bug: [description]" --label "bug,discovered"

# Tech debt found
gh issue create --title "tech-debt: [description]" --label "tech-debt,discovered"

# Documentation issue
gh issue create --title "docs: [description]" --label "documentation,discovered"
```

**Priority Labels:** Add `P1`, `P2`, `P3`, or `P4` label based on urgency.

### Rate Limiting

- Maximum 5 auto-created issues per hour to prevent spam
- Check for duplicates before creating (search last 7 days)

---

## Error Handling

### Q Protocol

Before uncertain actions:

```
DOING: [action]
EXPECT: [outcome]
IF YES: [next step]
IF NO: [fallback]
```

After execution:

```
RESULT: [what happened]
MATCHES: yes/no
THEREFORE: [conclusion]
```

### Failure Response

When anything fails:

1. State what failed with raw error
2. State theory of cause
3. Propose ONE next action
4. State expected outcome
5. Wait for confirmation

**Never:**

- Silent retries
- Best-effort guessing
- Continuing without addressing failure

---

## Implementation Task Output Format

For non-trivial implementation tasks, structure output in these sections:

### 1. Assumptions

State what you're taking as true:

```
ASSUMPTIONS:
- Node.js 22.x runtime
- TypeScript strict mode enabled
- Input validated by caller
```

### 2. Plan

Outline approach before writing code:

```
PLAN:
1. Add interface to core/types
2. Implement service
3. Add tests
4. Update exports

FILES: [list files to create/modify]
TESTS: [list test cases]
```

### 3. Implementation

The code, followed by summary.

### 4. Verification

How to confirm it works:

```
VERIFICATION:
pnpm test -- service.test.ts
pnpm typecheck
```

### 5. Tradeoffs

What you chose not to do and why:

```
TRADEOFFS:
- Did NOT add caching: Scale doesn't justify complexity
- DEFERRED: Metrics - create issue for Phase 2
```

---

## Self-Check Quality Gate

Before completing ANY implementation task:

- [ ] Names reflect intent (no abbreviations except standard: id, url)
- [ ] Functions do ONE thing (if "and" in description, split)
- [ ] Errors handled with timeout/retry where applicable
- [ ] Tests cover happy path + edge cases + error cases
- [ ] No magic constants without explanation
- [ ] No unnecessary abstraction

---

## Ask vs Assume Rule

**Always clarify (never assume) for:**

| Topic             | Example Question                   |
| ----------------- | ---------------------------------- |
| Deployment env    | "Lambda, ECS, or bare EC2?"        |
| Expected scale    | "What's the QPS? Data volume?"     |
| Consistency needs | "Eventual consistency acceptable?" |
| Security          | "Does this handle PII?"            |
| Breaking changes  | "Can we break existing API?"       |

**Safe to assume:** TypeScript strict mode, UTF-8, JSON serialization, async/await, dependency injection.

---

## File References

### Primary Documentation

- [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) - CLI, MCP, REST, API reference
- [docs/architecture/README.md](./docs/architecture/README.md) - Architecture hub
- [docs/development/README.md](./docs/development/README.md) - Development hub
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Detailed coding standards

### Research & Planning

- [docs/ALIGNMENT_ROADMAP.md](./docs/ALIGNMENT_ROADMAP.md) - Current implementation status
- [docs/research/RESEARCH_INDEX.md](./docs/research/RESEARCH_INDEX.md) - Research tracking overview
- [docs/research/CONTRIBUTING.md](./docs/research/CONTRIBUTING.md) - Research contribution guidelines
- [docs/research/registry/techniques.yaml](./docs/research/registry/techniques.yaml) - Technique status

### Source Code

- `packages/nexus-agents/src/core/types/index.ts` - Core type definitions
- `packages/nexus-agents/src/mcp/` - MCP server and tool implementations
- `packages/nexus-agents/src/agents/` - Agent framework

---

## Quick Commands

```bash
# Development
pnpm dev                    # Start development
pnpm build                  # Build all
pnpm test                   # Run tests
pnpm test:coverage          # With coverage

# Quality
pnpm lint                   # Lint all
pnpm lint:fix               # Auto-fix
pnpm typecheck              # Type check

# Git
git status                  # Check status
git log --oneline -10       # Recent commits

# GitHub CLI
gh issue list               # List issues
gh issue view <num>         # View issue
gh pr list                  # List PRs
gh pr view <num>            # View PR
gh pr checks <num>          # Check CI status
```

<!-- GOVERNANCE:TOOL_INDEX:START -->

## MCP Tools Reference

| Tool                | Description                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `orchestrate`       | Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents      |
| `create_expert`     | Create a specialized expert agent for code, architecture, security, documentation, testing, or devops tasks  |
| `execute_expert`    | Execute a task using a previously created expert agent.                                                      |
| `run_workflow`      | run_workflow tool                                                                                            |
| `consensus_vote`    | Execute multi-model consensus voting on a proposal.                                                          |
| `delegate_to_model` | Route a task to the optimal model based on capability matching. Returns model recommendation with reasoning. |
| `list_experts`      | List available expert types that can be created with create_expert.                                          |
| `list_workflows`    | List available workflow templates that can be executed with run_workflow.                                    |

_Auto-generated from source. 8 tools registered._

<!-- GOVERNANCE:TOOL_INDEX:END -->

<!-- GOVERNANCE:VERSION:START -->

_Governance Version: 2026-01-31_

<!-- GOVERNANCE:VERSION:END -->

_Last updated: 2026-01-31 (ET)_
_MCP Protocol: 2025-11-25_
_Node.js: 22.x LTS_
_TypeScript: 5.8+_
