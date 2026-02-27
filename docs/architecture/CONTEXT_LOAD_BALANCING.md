---
title: 'Context Load Balancing Strategy'
description: 'Strategy for distributing work across Claude, Codex, and Gemini CLIs'
tier: 2
keywords:
  - routing
  - context-management
  - multi-cli
  - load-balancing
related_files:
  - src/cli-adapters/composite-router.ts
  - src/core/task-analysis/shared-task-analyzer.ts
---

# Context Load Balancing Strategy

**Tier 3** | Deep technical documentation for multi-CLI context distribution
**Hub:** [README.md](./README.md) | **Routing System:** [ROUTING_SYSTEM.md](./ROUTING_SYSTEM.md)

---

## Overview

This document defines the strategy for distributing work across Claude Code, Codex CLI, and Gemini CLI to optimize context usage, cost, and response quality. The goal is to preserve Claude's context for high-value reasoning tasks while delegating routine work to specialized tools.

```
Task → TaskAnalyzer → ContextBudget → ModalityRouter → CLI Selection → Execution
       (profile)      (threshold)     (media type)     (capability)    (fallback)
```

---

## 1. Task Type Routing Matrix

### Primary Routing Decision Tree

| Task Characteristic                      | Primary CLI | Secondary CLI | Rationale                             |
| ---------------------------------------- | ----------- | ------------- | ------------------------------------- |
| Complex reasoning (design, architecture) | **Claude**  | Codex         | Claude excels at multi-step reasoning |
| Code implementation (new features)       | **Codex**   | Claude        | Codex optimized for code generation   |
| Code completion/refactoring              | **Codex**   | Claude        | Fast, specialized for code            |
| Large codebase analysis (>100K tokens)   | **Gemini**  | Claude        | 1M token context window               |
| Image analysis                           | **Gemini**  | Claude        | Native multimodal support             |
| Image generation                         | **Gemini**  | -             | Gemini-native capability              |
| Audio processing                         | **Gemini**  | -             | Gemini-native capability              |
| Speed-critical tasks                     | **Gemini**  | Codex         | Gemini Flash optimized for speed      |
| Budget-sensitive tasks                   | **Gemini**  | Codex         | Lowest cost per token                 |
| Security/compliance review               | **Claude**  | -             | Requires careful reasoning            |
| Test generation                          | **Codex**   | Claude        | Code-focused task                     |
| Documentation                            | **Claude**  | Gemini        | Quality writing required              |

### Detailed Routing Rules

#### Claude (Primary: Complex Reasoning)

Route to Claude when:

- Task requires multi-step logical reasoning
- Architecture or design decisions needed
- Security-sensitive analysis required
- Documentation requiring high-quality prose
- Tasks with keywords: "analyze", "design", "architect", "compare", "evaluate", "explain why", "trade-off"
- Reasoning complexity score > 7 (0-10 scale)

```typescript
const CLAUDE_TRIGGERS = {
  keywords: [
    'analyze',
    'design',
    'architect',
    'compare',
    'evaluate',
    'complex',
    'think',
    'reason',
    'explain why',
    'trade-off',
    'security',
    'audit',
    'review implications',
  ],
  taskTypes: ['architecture', 'code_review', 'documentation'],
  minReasoningComplexity: 7,
  maxContextPreferred: 50_000, // Prefer smaller contexts for Claude
};
```

#### Codex CLI (Primary: Code Generation)

Route to Codex when:

- Task is primarily code implementation
- Refactoring existing code
- Writing tests
- Completing code snippets
- Tasks with keywords: "implement", "write", "function", "test", "refactor", "fix", "debug", "generate"

```typescript
const CODEX_TRIGGERS = {
  keywords: [
    'implement',
    'code',
    'write',
    'function',
    'test',
    'refactor',
    'fix',
    'debug',
    'generate',
    'complete',
  ],
  taskTypes: ['code_implementation', 'test_generation'],
  contextWindow: 400_000,
  codeGenerationScore: 10, // Highest among all CLIs
};
```

#### Gemini CLI (Primary: Large Context, Multimodal, Speed)

Route to Gemini when:

- Context exceeds 100K tokens
- Task involves images, audio, or video
- Speed is the primary requirement
- Cost minimization is critical
- Tasks with keywords: "quick", "fast", "simple", "image", "screenshot", "diagram"

```typescript
const GEMINI_TRIGGERS = {
  keywords: [
    'quick',
    'fast',
    'simple',
    'brief',
    'short',
    'image',
    'screenshot',
    'diagram',
    'analyze image',
    'codebase',
    'repository',
    'all files',
    'entire project',
  ],
  taskTypes: ['large_codebase', 'bulk_operations'],
  contextWindow: 1_000_000, // 1M tokens
  multimodalSupport: true,
  minContextForPreference: 100_000, // Prefer when context > 100K
};
```

---

## 2. Context Budget Management

### Budget Tracking Architecture

```typescript
interface ContextBudget {
  // Per-session limits
  sessionTokenBudget: number; // Default: 1M tokens
  sessionCostBudgetUSD: number; // Default: $10

  // Per-CLI tracking
  cliUsage: {
    claude: { tokensUsed: number; costUSD: number; requestCount: number };
    gemini: { tokensUsed: number; costUSD: number; requestCount: number };
    codex: { tokensUsed: number; costUSD: number; requestCount: number };
  };

  // Alerts
  warningThreshold: 0.75; // 75% usage
  criticalThreshold: 0.9; // 90% usage
}
```

### Delegation Triggers for Context Preservation

Delegate to external CLI when:

| Condition                  | Action                       | Rationale                      |
| -------------------------- | ---------------------------- | ------------------------------ |
| Claude context > 60%       | Delegate exploratory tasks   | Preserve context for synthesis |
| Task is parallelizable     | Spawn Gemini/Codex subagents | Keep main context clean        |
| Estimated tokens > 50K     | Route to Gemini              | Claude context is precious     |
| Task is routine/mechanical | Route to Codex               | Don't waste reasoning capacity |

### Context Allocation Strategy

```yaml
contextAllocation:
  systemInstructions: 15% # CLAUDE.md, project context
  taskDescription: 20% # Current task requirements
  activeWorkingContent: 50% # Code, research, file contents
  responseGeneration: 15% # Reserved for output

preservationTechniques:
  - Use subagents for exploratory work
  - Summarize large outputs before adding to context
  - Reference files by path rather than inlining
  - Clear context (/clear) when switching unrelated tasks
```

### Cost Model for Budget Decisions

| CLI    | Input ($/1K tokens) | Output ($/1K tokens) | Avg Latency |
| ------ | ------------------- | -------------------- | ----------- |
| Claude | $0.015              | $0.075               | 2000ms      |
| Gemini | $0.00125            | $0.005               | 1500ms      |
| Codex  | $0.003              | $0.015               | 1000ms      |

**Decision Rule:** If remaining budget < 25% and task is not critical, route to Gemini (cheapest).

---

## 3. Rate Limit Management

### Per-CLI Rate Limits

```typescript
interface RateLimitConfig {
  claude: {
    requestsPerMinute: 50;
    tokensPerMinute: 100_000;
    dailyTokenLimit: 10_000_000;
  };
  gemini: {
    requestsPerMinute: 60;
    tokensPerMinute: 1_000_000;
    dailyTokenLimit: 50_000_000;
  };
  codex: {
    requestsPerMinute: 100;
    tokensPerMinute: 500_000;
    dailyTokenLimit: 20_000_000;
  };
}
```

### Rate Limit Monitoring

Monitor rate limit headers from each provider:

| Provider  | Token Header                   | Request Header                   |
| --------- | ------------------------------ | -------------------------------- |
| Anthropic | `anthropic-ratelimit-tokens-*` | `anthropic-ratelimit-requests-*` |
| OpenAI    | `x-ratelimit-*-tokens`         | `x-ratelimit-*-requests`         |
| Google    | `x-goog-api-*`                 | `x-goog-api-*`                   |

### Proactive Rate Limit Avoidance

```typescript
interface CapacityStatus {
  remainingTokens: number;
  remainingRequests: number;
  resetTime: Date | null;
  utilizationPercent: number;
  safeToRequest: boolean; // False if > 80% utilized
}

// Before routing, check capacity
function checkCapacityBeforeRouting(cli: CliName): boolean {
  const capacity = getCapacity(cli);
  if (capacity.utilizationPercent > 80) {
    logger.warn(`${cli} at ${capacity.utilizationPercent}% capacity`);
    return false; // Route elsewhere
  }
  return true;
}
```

---

## 4. Multimodal Routing

### Media Type Routing Matrix

| Media Type              | Primary CLI   | Capability                | Notes                                  |
| ----------------------- | ------------- | ------------------------- | -------------------------------------- |
| Images (PNG, JPG, WebP) | Gemini        | Native vision             | Claude also supports but Gemini faster |
| Screenshots             | Gemini        | Vision + UI understanding | Better for UI analysis                 |
| Diagrams/Charts         | Gemini        | Vision                    | Good for architecture diagrams         |
| PDFs                    | Claude/Gemini | Document processing       | Both support, Claude for complex PDFs  |
| Audio (MP3, WAV)        | Gemini        | Native audio              | Gemini-only capability                 |
| Video                   | Gemini        | Native video              | Gemini-only capability                 |
| Code files              | Codex         | Code analysis             | Specialized for code                   |

### Multimodal Detection

```typescript
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

function detectMultimodal(task: Task): ModalityType {
  // Check file attachments
  if (task.context.files) {
    for (const file of task.context.files) {
      if (IMAGE_EXTENSIONS.some((ext) => file.endsWith(ext))) return 'image';
      if (AUDIO_EXTENSIONS.some((ext) => file.endsWith(ext))) return 'audio';
      if (VIDEO_EXTENSIONS.some((ext) => file.endsWith(ext))) return 'video';
    }
  }

  // Check keywords
  if (MULTIMODAL_KEYWORDS.some((kw) => task.description.includes(kw))) {
    return 'image'; // Default multimodal type
  }

  return 'text';
}
```

### Image Analysis Routing

For image analysis specifically:

| Analysis Type                | Preferred CLI | Rationale                            |
| ---------------------------- | ------------- | ------------------------------------ |
| UI/UX review                 | Gemini        | Fast, good at UI patterns            |
| Code screenshot analysis     | Claude        | Better at understanding code context |
| Architecture diagram         | Gemini        | Good at visual structure             |
| Security audit of screenshot | Claude        | Better security reasoning            |
| Bulk image processing        | Gemini        | Cost effective for volume            |

---

## 5. Fallback Strategies

### Circuit Breaker Pattern

```typescript
interface CircuitBreakerConfig {
  failureThreshold: 5; // Failures before open
  successThreshold: 2; // Successes to close from half-open
  timeout: 30000; // ms before half-open
  rollingWindow: 60000; // ms for failure counting
}

// State machine: Closed -> Open -> HalfOpen -> Closed
```

### Fallback Chain

When primary CLI fails or is unavailable:

```yaml
fallbackChains:
  claude:
    - codex # Similar reasoning capability
    - gemini # Last resort, good general purpose

  gemini:
    - claude # For large context, may need to chunk
    - codex # For code-heavy tasks

  codex:
    - claude # Best code alternative
    - gemini # If Claude unavailable

degradationStrategies:
  rateLimited:
    action: 'route_to_secondary'
    waitBeforeRetry: 60s

  circuitOpen:
    action: 'use_fallback_chain'
    notifyUser: true

  allUnavailable:
    action: 'queue_with_retry'
    maxQueueTime: 300s
    fallbackMessage: 'All CLIs temporarily unavailable'
```

### Graceful Degradation Scenarios

| Scenario            | Detection                      | Response                                                   |
| ------------------- | ------------------------------ | ---------------------------------------------------------- |
| Claude rate limited | 429 response or capacity < 10% | Route to Codex for code, Gemini for other                  |
| Gemini rate limited | API error or capacity check    | Route to Claude (may chunk large context)                  |
| Codex rate limited  | 429 response                   | Route to Claude for code tasks                             |
| All rate limited    | All circuits open              | Queue task, notify user, retry with backoff                |
| Network failure     | Connection timeout             | Retry with exponential backoff, then queue                 |
| Partial response    | Truncated output               | Retry with smaller chunk, or use Gemini for larger context |

### Quality-Aware Fallback

```typescript
interface FallbackDecision {
  primaryFailed: CliName;
  failureReason: 'rate_limit' | 'error' | 'timeout' | 'quality';
  selectedFallback: CliName;
  qualityTradeoff: string;
  userNotification: boolean;
}

// Example: Claude fails, routing to Codex
{
  primaryFailed: 'claude',
  failureReason: 'rate_limit',
  selectedFallback: 'codex',
  qualityTradeoff: 'Codex may have slightly lower reasoning quality',
  userNotification: true  // Notify user of fallback
}
```

---

## 6. Integration with Existing Routing System

### CompositeRouter Pipeline Integration

The context load balancing integrates with the existing 4-stage CompositeRouter:

```
Task → TaskAnalyzer → [NEW: ContextBudget] → BudgetRouter → TOPSIS → LinUCB → Decision
                           ↓
                    Check Claude context
                    Check rate limits
                    Check multimodality
```

### Configuration

```yaml
contextLoadBalancing:
  enabled: true

  # Context preservation settings
  claudeContextThreshold: 60 # % before delegation
  delegateExploratoryTasks: true
  summarizeLargeOutputs: true

  # Multimodal routing
  preferGeminiForImages: true
  preferGeminiForAudio: true
  imageAnalysisThreshold: 2 # Images before Gemini preferred

  # Budget settings
  sessionTokenBudget: 1000000
  sessionCostBudgetUSD: 10.0
  warningThreshold: 0.75
  criticalThreshold: 0.90

  # Rate limit buffer
  capacityBuffer: 0.20 # Keep 20% headroom

  # Fallback settings
  enableCircuitBreaker: true
  fallbackNotifyUser: true
  maxQueueTime: 300000 # 5 minutes
```

---

## 7. Decision Flow Pseudocode

```typescript
async function routeWithContextBalancing(task: CliTask): Promise<RoutingDecision> {
  // 1. Analyze task
  const profile = analyzeTask(task);

  // 2. Check multimodality first (hard constraint)
  if (profile.multimodal) {
    if (profile.mediaType === 'audio' || profile.mediaType === 'video') {
      return { cli: 'gemini', reason: 'Gemini-only multimodal capability' };
    }
    if (profile.mediaType === 'image' && profile.imageCount > 2) {
      return { cli: 'gemini', reason: 'Bulk image processing' };
    }
  }

  // 3. Check context size (hard constraint)
  if (profile.contextRequired > 200_000) {
    return { cli: 'gemini', reason: 'Context exceeds Claude/Codex limits' };
  }

  // 4. Check rate limits (circuit breaker)
  const available = await getAvailableClis();
  if (available.length === 0) {
    return queueTaskForLater(task);
  }

  // 5. Check Claude context preservation
  if (claudeContextUsage > 0.6 && !profile.requiresClaudeReasoning) {
    // Delegate to preserve Claude context
    if (profile.codeGeneration) return { cli: 'codex', reason: 'Preserve Claude context' };
    return { cli: 'gemini', reason: 'Preserve Claude context' };
  }

  // 6. Apply task-type routing
  if (profile.reasoningComplexity > 7) {
    return { cli: 'claude', reason: 'Complex reasoning required' };
  }
  if (profile.codeGeneration && profile.taskType === 'code_implementation') {
    return { cli: 'codex', reason: 'Code implementation task' };
  }
  if (profile.budgetSensitive) {
    return { cli: 'gemini', reason: 'Cost-optimized selection' };
  }

  // 7. Default to TOPSIS multi-criteria ranking
  return topsisRouter.rank(task, available);
}
```

---

## 8. Monitoring and Metrics

### Key Metrics to Track

| Metric                       | Description                  | Alert Threshold   |
| ---------------------------- | ---------------------------- | ----------------- |
| `context_utilization_claude` | Claude context usage %       | > 80%             |
| `rate_limit_events_total`    | Rate limit hits per CLI      | > 10/hour         |
| `fallback_routing_total`     | Fallback routes triggered    | > 20% of requests |
| `routing_latency_p95`        | 95th percentile routing time | > 100ms           |
| `cost_per_task_avg`          | Average cost per task        | > $0.10           |
| `quality_score_by_cli`       | Task success rate per CLI    | < 90%             |

### Logging

```typescript
logger.info('Context routing decision', {
  taskId: task.id,
  selectedCli: decision.cli,
  reason: decision.reason,
  contextRequired: profile.contextRequired,
  claudeContextUsage: claudeContextUsage,
  fallbackUsed: decision.fallbackUsed,
  estimatedCost: decision.estimatedCost,
});
```

---

## 9. CLAUDE.md Integration Section

Add the following section to CLAUDE.md under "Orchestration Model":

```markdown
### Context Load Balancing

When delegating work across CLI tools, follow these routing guidelines:

#### Quick Reference

| Task Type                     | Route To     | Reason                    |
| ----------------------------- | ------------ | ------------------------- |
| Complex reasoning             | Claude       | Best reasoning capability |
| Code implementation           | Codex        | Specialized for code      |
| Large codebase (>100K tokens) | Gemini       | 1M context window         |
| Images/audio/video            | Gemini       | Native multimodal         |
| Speed-critical                | Gemini Flash | Lowest latency            |
| Budget-sensitive              | Gemini       | Lowest cost               |

#### Context Preservation Rules

1. **Monitor context usage** - Delegate when Claude context > 60%
2. **Use Gemini for exploration** - Codebase searches, bulk analysis
3. **Use Codex for implementation** - Writing code, tests, refactoring
4. **Reserve Claude for synthesis** - Architecture, design, complex reasoning

#### Fallback Order

- Claude unavailable → Codex (code) or Gemini (other)
- Gemini unavailable → Claude (may chunk large context)
- Codex unavailable → Claude

See [CONTEXT_LOAD_BALANCING.md](./docs/architecture/CONTEXT_LOAD_BALANCING.md) for full documentation.
```

---

## Related Documents

- **Routing System:** [ROUTING_SYSTEM.md](./ROUTING_SYSTEM.md)
- **Agent System:** [AGENT_SYSTEM.md](./AGENT_SYSTEM.md)
- **Memory System:** [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md)
- **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## Source Files

| File                                   | Purpose               |
| -------------------------------------- | --------------------- |
| `src/cli-adapters/composite-router.ts` | Main routing pipeline |
| `src/cli-adapters/task-analyzer.ts`    | Task profiling        |
| `src/cli-adapters/budget-router.ts`    | Budget enforcement    |
| `src/cli-adapters/types-capability.ts` | CLI capabilities      |
| `src/mcp/tools/delegate-to-model.ts`   | MCP delegation tool   |

---

## Research Sources

| Technique                | Paper            | Implementation     |
| ------------------------ | ---------------- | ------------------ |
| PILOT Budget Routing     | arXiv:2508.21141 | `budget-router.ts` |
| TOPSIS Multi-Criteria    | arXiv:2509.07571 | `topsis-router.ts` |
| LinUCB Contextual Bandit | Standard ML      | `linucb-bandit.ts` |
| ZeroRouter Difficulty    | arXiv:2509.11079 | `zero-router.ts`   |

---

_Last updated: 2026-01-18 (ET)_
