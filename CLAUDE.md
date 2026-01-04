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
```

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
node --version  # Should be 24.x LTS

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
- [ ] No user-provided RegExp (use minimatch)
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
│   ├── core/           # Types, Result<T,E>, errors, logger
│   ├── config/         # Configuration, validation
│   ├── adapters/       # Model adapters (Claude, OpenAI, etc.)
│   ├── agents/         # Agent framework, TechLead, Experts
│   ├── workflows/      # Workflow engine, templates
│   ├── mcp/            # MCP server, tools
│   └── cli/            # CLI interface
├── apps/
│   └── nexus-agents/   # Main entry point
├── .claude/
│   ├── rules/          # Modular Claude rules
│   └── skills/         # Project-specific skills
├── CLAUDE.md           # This file
├── CODING_STANDARDS.md # Detailed standards
└── update_plan.md      # Project plan
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
- @update_plan.md - Project roadmap and phases
- @packages/core/src/types/index.ts - Core type definitions
- @packages/mcp/src/tools/ - MCP tool implementations

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

_Last updated: 2026-01-04 (ET)_
_MCP Protocol: 2025-11-25_
_Node.js: 24.x LTS_
_TypeScript: 5.8+_
