# CLI Delegation Guide

**Tier 3** | Practical guide for delegating tasks to external CLIs
**Hub:** [README.md](./README.md) | **Routing Architecture:** [ROUTING_SYSTEM.md](../architecture/ROUTING_SYSTEM.md)

---

## Overview

This guide covers when and how to delegate tasks to Claude, Gemini, or Codex CLIs. Based on real testing with measured performance metrics.

---

## Decision Flowchart

```
Task arrives
    │
    ├─ Large codebase analysis (>500 files)?
    │       └─ YES → Gemini (1M context)
    │
    ├─ Code generation / boilerplate?
    │       └─ YES → Codex (3-6s latency)
    │
    ├─ Complex reasoning / architecture?
    │       └─ YES → Claude (highest quality)
    │
    └─ Simple query / quick task?
            └─ Gemini (cost-effective)
```

---

## CLI Profiles

### Gemini CLI

**Strengths:** Massive context window, fast codebase analysis, cost-effective.

| Metric      | Measured Value | Notes                      |
| ----------- | -------------- | -------------------------- |
| Latency     | 10-73s         | Varies with context size   |
| Max Context | 1M tokens      | ~978 files in single query |
| Best For    | Analysis       | Code review, exploration   |
| Cost        | Low            | Free tier available        |

**Invocation:**

```bash
# Non-interactive prompt mode
gemini -p "Analyze this codebase for security issues"

# With file context
gemini -p "Review these files: $(cat file_list.txt)"
```

**JSON Output Parsing:**

Gemini output may include markdown fencing. Extract JSON:

````typescript
function parseGeminiOutput(output: string): unknown {
  // Strip markdown code fences if present
  const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();
  return JSON.parse(jsonStr);
}
````

### Codex CLI

**Strengths:** Fast code generation, optimized for implementation tasks.

| Metric      | Measured Value | Notes                        |
| ----------- | -------------- | ---------------------------- |
| Latency     | 3-6s           | Consistently fast            |
| Max Context | 128K tokens    | Sufficient for most tasks    |
| Best For    | Generation     | Boilerplate, implementations |
| Cost        | Medium         | Per-token pricing            |

**Invocation:**

```bash
# Non-interactive execution mode (required for automation)
codex exec "Implement a rate limiter class in TypeScript"

# With specific output format
codex exec "Generate Jest tests for auth.ts" --format code
```

**Important:** Always use `codex exec` for non-interactive mode. The default `codex` command expects interactive input.

### Claude CLI

**Strengths:** Highest reasoning quality, best for complex decisions.

| Metric      | Measured Value | Notes                       |
| ----------- | -------------- | --------------------------- |
| Latency     | 5-30s          | Depends on task complexity  |
| Max Context | 200K tokens    | Sufficient for most tasks   |
| Best For    | Reasoning      | Architecture, complex logic |
| Cost        | Higher         | Premium for quality         |

**Invocation:**

```bash
# Standard prompt
claude "Design the authentication flow for this system"

# With file context
claude "Review this PR" --files "src/**/*.ts"
```

---

## Task-CLI Matching Matrix

| Task Type               | Primary CLI | Fallback | Rationale                      |
| ----------------------- | ----------- | -------- | ------------------------------ |
| Codebase exploration    | Gemini      | Claude   | 1M context handles large repos |
| Security audit          | Claude      | Gemini   | Reasoning quality matters      |
| Boilerplate generation  | Codex       | Claude   | Speed + code focus             |
| Architecture decisions  | Claude      | -        | No substitute for reasoning    |
| Test generation         | Codex       | Claude   | Pattern matching sufficient    |
| Documentation writing   | Claude      | Gemini   | Quality prose needed           |
| Quick questions         | Gemini      | Codex    | Cost-effective                 |
| Refactoring suggestions | Claude      | Gemini   | Context understanding needed   |

---

## Integration with nexus-agents

### Using the CompositeRouter

The routing system automatically selects the optimal CLI:

```typescript
import { createCompositeRouter } from 'nexus-agents';

const router = createCompositeRouter({
  enableBudgetFilter: true,
  enableTopsisRanking: true,
  enableLinUCBSelection: true,
});

const decision = await router.route({
  description: 'Analyze codebase for performance issues',
  contextTokens: 50000,
  constraints: { maxLatencyMs: 30000 },
});

// decision.cliName: 'gemini' | 'claude' | 'codex'
// decision.confidence: 0.0-1.0
// decision.reason: "Selected gemini: large context (50k tokens) favors 1M window"
```

### Manual Delegation via Subprocess

For direct CLI invocation:

```typescript
import { execSync } from 'child_process';

function delegateToGemini(prompt: string): string {
  const result = execSync(`gemini -p "${prompt.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
    timeout: 120000, // 2 minute timeout
  });
  return result;
}

function delegateToCodex(prompt: string): string {
  const result = execSync(`codex exec "${prompt.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
    timeout: 30000, // 30 second timeout
  });
  return result;
}
```

### Routing Audit

Debug routing decisions before execution:

```bash
nexus-agents routing-audit "Implement sorting algorithm" --format=json
```

Output shows:

- Task profile (complexity, context requirements)
- Budget filter results
- TOPSIS scores per CLI
- Final selection with reasoning

---

## Troubleshooting

### Gemini Issues

**Problem:** Output contains markdown instead of raw JSON.

**Solution:** Parse with fence stripping (see JSON Output Parsing above).

**Problem:** Timeout on large context.

**Solution:** Increase timeout to 120s. For very large contexts (>500K tokens), consider chunking.

### Codex Issues

**Problem:** Command hangs waiting for input.

**Solution:** Use `codex exec` instead of `codex`. The exec subcommand runs non-interactively.

**Problem:** Truncated output.

**Solution:** Check `--max-tokens` flag. Default may be low for large generations.

### Claude Issues

**Problem:** Rate limited.

**Solution:** Check `ANTHROPIC_API_KEY` tier. Implement exponential backoff:

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Unreachable');
}
```

### General Issues

**Problem:** CLI not found.

**Solution:** Verify installation:

```bash
which gemini && gemini --version
which codex && codex --version
which claude && claude --version
```

**Problem:** Wrong CLI selected.

**Solution:** Use `routing-audit` to understand selection. Override with explicit budget constraints:

```typescript
router.route({
  description: 'task',
  constraints: { maxLatencyMs: 5000 }, // Forces fast CLI
});
```

---

## Best Practices

1. **Prefer automatic routing** - Let CompositeRouter decide unless you have specific requirements.

2. **Set appropriate timeouts** - Gemini: 120s, Codex: 30s, Claude: 60s.

3. **Handle JSON parsing** - Always strip potential markdown fencing from Gemini output.

4. **Use exec mode** - Codex requires `exec` subcommand for non-interactive use.

5. **Monitor costs** - Enable budget filtering to prevent runaway spending.

6. **Log routing decisions** - Record `decision.reason` for debugging.

---

## Related Documents

- **Routing System:** [ROUTING_SYSTEM.md](../architecture/ROUTING_SYSTEM.md)
- **Agent Development:** [AGENT_DEVELOPMENT.md](./AGENT_DEVELOPMENT.md)
- **Tool Development:** [TOOL_DEVELOPMENT.md](./TOOL_DEVELOPMENT.md)
