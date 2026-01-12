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
nexus-agents doctor       # Check CLI health
nexus-agents config init  # Generate starter config
nexus-agents expert list  # List available experts
nexus-agents workflow list # List workflow templates
nexus-agents workflow run # Execute workflow template
nexus-agents routing-audit # Debug model routing
nexus-agents orchestrate  # Standalone task execution
nexus-agents review <url> # Review GitHub PR
nexus-agents --help       # Full command list
```

**Full Reference:** [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) - Complete CLI, MCP, REST, and API documentation.

---

## Getting Started (5 Minutes)

### For Claude Desktop Users

1. **Install:** `npm install -g nexus-agents`
2. **Verify:** `nexus-agents doctor`
3. **Configure Claude Desktop:** Add to `~/.claude/mcp.json`:
   ```json
   {
     "mcpServers": {
       "nexus-agents": {
         "command": "nexus-agents",
         "args": ["--mode=server"]
       }
     }
   }
   ```
4. **Test:** Ask Claude "orchestrate: What files are in this project?"

### For Standalone CLI

```bash
npm install -g nexus-agents
nexus-agents doctor                    # Verify installation
nexus-agents orchestrate "Explain closures in JavaScript"
```

### Mode Selection

| Mode         | Flag                  | Use Case                             |
| ------------ | --------------------- | ------------------------------------ |
| Server       | `--mode=server`       | Claude Desktop/MCP clients (default) |
| Orchestrator | `--mode=orchestrator` | Standalone CLI, CI/CD pipelines      |
| Mesh         | `--mode=mesh`         | Advanced hybrid deployments          |

Auto-detection works in most cases. Run `nexus-agents --verbose` to see mode selection reasoning.

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

**Examples:**

```markdown
# Bad (marketing speak)

"Nexus Agents revolutionizes AI orchestration with its cutting-edge
multi-agent framework that seamlessly integrates with your workflow."

# Good (honest and direct)

"Nexus Agents coordinates multiple AI models to handle complex tasks.
It runs as an MCP server. The CLI is not yet implemented."

# Bad (vague)

"Easily configure your experts with our intuitive YAML format."

# Good (specific)

"Experts are configured in YAML. See the example below.
The `tier` field accepts: fast, balanced, or powerful."
```

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

```bash
# Example: Check if routing techniques overlap
grep -ri "routing" docs/research/registry/techniques.yaml
grep -ri "router\|routing" packages/nexus-agents/src/

# Compare technique approaches
grep -A 30 "technique_id: cascade-routing" docs/research/registry/techniques.yaml
grep -A 30 "technique_id: quality-routing" docs/research/registry/techniques.yaml
```

**Alignment Categories:**

| Category        | Description                     |
| --------------- | ------------------------------- |
| `complementary` | Techniques work well together   |
| `overlapping`   | Solve same problem differently  |
| `conflicting`   | Contradictory approaches        |
| `enhances`      | New technique improves existing |
| `supersedes`    | New technique replaces existing |

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

#### Querying Research

```bash
# Find P1 techniques
grep -A 20 "priority: P1" docs/research/registry/techniques.yaml

# Find papers by topic
grep -B 5 -A 10 "topics:" docs/research/registry/papers.yaml | grep -A 10 "consensus"

# Find implemented techniques
grep -B 10 "status: implemented" docs/research/registry/techniques.yaml
```

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

### Context Management

**Preserve context aggressively:**

- Use subagents for exploratory work (keeps main context clean)
- Summarize large outputs before adding to context
- Reference files by path rather than inlining large contents
- Use `/clear` when switching to unrelated tasks

**Context budget allocation:**

- 15% - System instructions and project context
- 20% - Current task description and requirements
- 50% - Active working content (code, research)
- 15% - Reserved for response generation

---

## Consensus Voting Protocol

### When to Use Voting

Major decisions requiring multi-agent consensus:

- Architecture changes
- New dependencies
- API design decisions
- Security-critical implementations
- Breaking changes

### Voting Process

1. **Draft Proposal**
   - Create detailed proposal document
   - Include alternatives considered
   - Document trade-offs

2. **Spawn Voting Agents**

   ```
   Agents: Architect, Security, DevEx, AI/ML, PM
   Each agent reviews and votes: APPROVE / DISSENT / ABSTAIN
   ```

3. **Consensus Thresholds**
   | Decision Type | Threshold |
   |---------------|-----------|
   | Reversible changes | Simple majority (>50%) |
   | Architecture decisions | Supermajority (≥4/5) |
   | Security-critical | Unanimous |
   | Breaking changes | Supermajority + user approval |

4. **Handle Dissent**
   - Document dissenting opinions
   - Address specific concerns
   - Re-vote if proposal amended

---

## CLI Agent Integration (v2.2.0+)

### Supported CLIs

nexus-agents integrates with three external CLI tools. All use OAuth authentication - nexus-agents handles zero credentials.

| CLI            | Models                          | Auth             | Strengths                       |
| -------------- | ------------------------------- | ---------------- | ------------------------------- |
| **Claude CLI** | Opus 4.5, Sonnet 4.5, Haiku 4.5 | OAuth 2.0 / PKCE | Complex reasoning, architecture |
| **Gemini CLI** | Gemini 2.5/3 Pro, Flash         | OAuth / ADC      | 1M context, multimodal          |
| **Codex CLI**  | GPT-5.x-codex family            | ChatGPT OAuth    | Fast implementation, tests      |

### Capability Matching

Route tasks to the optimal model based on requirements:

| Task Type               | Primary         | Secondary     | Tertiary     |
| ----------------------- | --------------- | ------------- | ------------ |
| Architecture decisions  | Claude Opus     | Claude Sonnet | Gemini Pro   |
| Complex reasoning       | Claude Opus     | Codex 5.2     | Gemini Pro   |
| Large codebase analysis | Gemini Pro (1M) | Claude Sonnet | Codex        |
| Code implementation     | Claude Sonnet   | Codex         | Gemini Flash |
| Test generation         | Codex           | Claude Haiku  | Gemini Flash |
| Bulk operations         | Gemini Flash    | Codex Mini    | Claude Haiku |

### CLI Adapter Interface

```typescript
interface ICliAdapter {
  readonly name: 'claude' | 'gemini' | 'codex';
  readonly transport: 'mcp' | 'subprocess';
  readonly capabilities: CapabilityProfile;

  execute(task: Task): Promise<Result<CliResponse, CliError>>;
  healthCheck(): Promise<boolean>;
}

interface CapabilityProfile {
  reasoning: number; // 0-10: Complex reasoning ability
  contextWindow: number; // Max tokens
  codeGeneration: number; // 0-10: Code quality
  speed: number; // 0-10: Response latency
  cost: number; // 0-10: Cost efficiency (10 = cheapest)
}
```

### Mode Selection

```bash
nexus-agents                     # Auto-detect mode
nexus-agents --mode=server       # MCP server for Claude CLI
nexus-agents --mode=orchestrator # CLI orchestrator mode
nexus-agents --mode=mesh         # Full hybrid mesh
```

### Implementation Phases

See `cli-project_plan.md` for full details:

1. **Phase 1 (v2.2.0)**: MCP Server Mode - nexus-agents as MCP tool for Claude CLI
2. **Phase 2 (v2.3.0)**: CLI Adapters - Subprocess integration for Gemini/Codex
3. **Phase 3 (v3.0.0)**: Hybrid Mesh - Full bidirectional orchestration

---

## GitHub Integration

### Issue Management

**Create issues for:**

- New features (label: `enhancement`)
- Bugs discovered (label: `bug`)
- Technical debt (label: `tech-debt`)
- Security concerns (label: `security`)
- Research tasks (label: `research`)

```bash
# Create feature issue
gh issue create \
  --title "feat: Add workflow persistence" \
  --body "## Description\n\n## Acceptance Criteria\n\n## Tasks" \
  --label "enhancement"

# Create bug issue
gh issue create \
  --title "fix: Memory leak in CollaborationSpace" \
  --body "## Bug Description\n\n## Steps to Reproduce\n\n## Expected Behavior" \
  --label "bug"
```

### PR Workflow

**Branch naming:**

- `feat/<issue-number>-short-description`
- `fix/<issue-number>-short-description`
- `refactor/<description>`
- `docs/<description>`

**PR creation:**

```bash
# Create branch
git checkout -b feat/123-add-workflow-engine

# Make changes, commit with conventional commits
git add .
git commit -m "feat(workflows): add workflow parser

- Implement YAML template parsing
- Add step executor with retry logic
- Support parallel execution

Closes #123"

# Push and create PR
git push -u origin HEAD
gh pr create \
  --title "feat(workflows): add workflow parser" \
  --body "## Summary\n- Implements #123\n\n## Changes\n\n## Testing" \
  --base master
```

**PR merge (after approval):**

```bash
# Squash merge to keep history clean
gh pr merge --squash --delete-branch
```

### Automated Tracking

When starting work on a task:

1. Check for existing issue or create one
2. Reference issue number in commits
3. Update issue with progress comments
4. Close issue via PR or manual close

---

## Coding Standards Enforcement

### Pre-Implementation Checklist

Before writing code:

- [ ] Current datetime verified (ET)
- [ ] Dependencies are current stable versions
- [ ] No deprecated APIs being used
- [ ] Interface defined before implementation
- [ ] Test plan documented
- [ ] GitHub issue created/linked

### Code Quality Gates

All code must pass:

```bash
pnpm lint          # Zero errors, zero warnings
pnpm typecheck     # Zero type errors
pnpm test          # All tests pass
```

**Hard limits (enforced by ESLint):**

- Files ≤ 400 lines
- Functions ≤ 50 lines
- Cyclomatic complexity ≤ 10
- Max parameters ≤ 5

### Boundary Checklist

For changes touching multiple modules:

1. **Modules** - List each module and its single responsibility
2. **Interfaces** - Define contracts before implementations
3. **Dependencies** - Document direction (A depends on B's interface)
4. **Tests** - Unit tests mock interfaces, integration tests verify boundaries
5. **Migration** - Document breaking changes and migration path

---

## Security Protocol

### Mandatory Checks

Before any code change:

- [ ] No secrets in code, logs, or outputs
- [ ] Input validation at all boundaries
- [ ] Path traversal prevention on file ops
- [ ] No user-provided RegExp (use static patterns only)
- [ ] Rate limiting on public interfaces
- [ ] Memory bounds on collections

### Secrets Handling

```typescript
// NEVER do this
const apiKey = process.env.API_KEY;
console.log(`Using key: ${apiKey}`); // Leaks secret!

// ALWAYS do this
const vault = new SecretsVault();
const apiKey = vault.get('API_KEY');
logger.info('API key loaded', { keyPresent: !!apiKey }); // Safe
```

### Security Issue Response

If security vulnerability found:

1. **Do not commit** the vulnerable code
2. Create issue with `security` label (no details in public issue)
3. Implement fix with security review
4. Add regression test

---

## MCP Server Development

### Tool Design Pattern

```typescript
server.tool(
  'tool_name',
  {
    // Zod schema with descriptions (Claude uses these)
    param: z.string().describe('What this parameter does'),
  },
  async (args) => {
    // 1. Validate input
    const validated = Schema.safeParse(args);
    if (!validated.success) {
      return { isError: true, content: [{ type: 'text', text: validated.error.message }] };
    }

    // 2. Execute with proper error handling
    try {
      const result = await doWork(validated.data);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
  }
);
```

### Testing MCP Tools

```typescript
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Create linked transport pair
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);

// Test tool execution
const result = await client.callTool({ name: 'orchestrate', arguments: { task: 'test' } });
```

---

## Agent Development

### Agent Interface Pattern

```typescript
interface IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly state: AgentState;

  execute(task: Task): Promise<Result<TaskResult, AgentError>>;
  handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>>;
}

// Implement with clear state machine
class Expert implements IAgent {
  state: AgentState = 'idle';

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    this.state = 'thinking';
    try {
      // ... implementation
      this.state = 'idle';
      return { ok: true, value: result };
    } catch (error) {
      this.state = 'error';
      return { ok: false, error };
    }
  }
}
```

### Prompt Engineering Standards

```typescript
// Structured prompt template
const systemPrompt = `
[ROLE]
You are a ${role} specialized in ${domain}.

[CAPABILITIES]
${capabilities.join('\n')}

[CONSTRAINTS]
- ${constraints.join('\n- ')}

[OUTPUT FORMAT]
Respond with JSON matching this schema:
${JSON.stringify(outputSchema, null, 2)}
`;

// Dynamic temperature by task type
const TEMPERATURE_MAP = {
  code_generation: 0.2,
  code_review: 0.3,
  creative_planning: 0.7,
  refinement: 0.2,
};
```

---

## Project Structure

```
nexus-agents/
├── packages/
│   └── nexus-agents/       # Main package (single consolidated package)
│       ├── src/
│       │   ├── core/       # Types, Result<T,E>, errors, logger
│       │   ├── config/     # Configuration, validation
│       │   ├── adapters/   # Model adapters (Claude, OpenAI, etc.)
│       │   ├── agents/     # Agent framework, TechLead, Experts
│       │   ├── workflows/  # Workflow engine, templates
│       │   ├── mcp/        # MCP server, tools
│       │   ├── index.ts    # Main exports
│       │   └── cli.ts      # CLI entry point
│       └── package.json
├── .claude/
│   ├── rules/              # Modular Claude rules
│   └── skills/             # Project-specific skills
├── CLAUDE.md               # This file
├── CODING_STANDARDS.md     # Detailed standards
└── pnpm-workspace.yaml
```

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
- [ ] PROJECT_PLAN.md phase status is current

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

## File References

- @CODING_STANDARDS.md - Detailed coding standards
- @ARCHITECTURE.md - System architecture and design decisions
- @docs/ALIGNMENT_ROADMAP.md - Current implementation status and gap analysis
- @docs/research/RESEARCH_INDEX.md - Research tracking overview
- @docs/research/CONTRIBUTING.md - Research contribution guidelines
- @docs/research/registry/techniques.yaml - Technique implementation status
- @packages/nexus-agents/src/core/types/index.ts - Core type definitions
- @packages/nexus-agents/src/mcp/ - MCP server and tool implementations
- @packages/nexus-agents/src/agents/ - Agent framework

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

---

_Last updated: 2026-01-11 (ET)_
_MCP Protocol: 2025-11-25_
_Node.js: 22.x LTS_
_TypeScript: 5.8+_
