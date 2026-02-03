/**
 * Performance Testing Knowledge Module
 *
 * Best practices for performance testing including load profiles,
 * key metrics, SLO validation, k6 patterns, and profiling strategies.
 *
 * @module agents/experts/knowledge/testing/performance-patterns
 * (Source: Issue #646 - Phase 1b: Testing Expert Knowledge)
 */

import type { KnowledgeModule } from '../types.js';

export const PERFORMANCE_TESTING_PATTERNS: KnowledgeModule = {
  id: 'testing-performance-patterns',
  domain: 'testing',
  title: 'Performance Testing Patterns & Standards',
  tags: ['performance-testing', 'load-testing', 'k6', 'profiling', 'slo'],
  sections: [
    {
      title: 'Load Testing Profiles',
      priority: 95,
      content: `## Profile Definitions
| Profile    | Purpose                         | Pattern                              |
| ---------- | ------------------------------- | ------------------------------------ |
| Load       | Validate expected traffic       | Ramp to target VUs, hold, ramp down  |
| Stress     | Find breaking point             | Incrementally increase beyond target |
| Spike      | Test sudden traffic bursts      | Instant jump to peak, then drop      |
| Soak       | Detect memory leaks / drift     | Moderate load sustained for hours    |
| Breakpoint | Find absolute capacity ceiling  | Increase until system fails          |

## Decision: Which Profile to Run
- Pre-release → Load test (validates expected capacity)
- Capacity planning → Stress test (finds limits)
- Event preparation (flash sale, launch) → Spike test
- Stability concern → Soak test (4-12 hours)
- Architecture change → Breakpoint test (find new ceiling)

## Execution Order for New Systems
1. Load test → establish baseline
2. Stress test → find ceiling
3. Spike test → validate autoscaling
4. Soak test → confirm long-term stability`,
    },
    {
      title: 'Key Performance Metrics',
      priority: 90,
      content: `## Core Metrics
| Metric         | What It Measures              | Why It Matters                   |
| -------------- | ----------------------------- | -------------------------------- |
| p50 latency    | Median response time          | Typical user experience          |
| p95 latency    | 95th percentile response time | Majority of users experience     |
| p99 latency    | 99th percentile response time | Worst-case user experience       |
| RPS            | Requests per second           | Throughput capacity              |
| Error rate     | % of failed requests          | Reliability under load           |
| Apdex          | Application Performance Index | User satisfaction score (0-1)    |
| TTFB           | Time to first byte            | Server processing time           |
| Concurrent VUs | Virtual users at same time    | Concurrency capacity             |

## Aggregation Rules
- Always report percentiles, not averages (averages hide tail latency)
- Report p50, p95, p99 as standard set
- Report error rate as percentage with total request count
- Track metrics per endpoint, not just globally
- Compare against baseline from previous release`,
    },
    {
      title: 'Performance Budgets',
      priority: 85,
      content: `## Latency Thresholds
| Metric      | Good       | Warning     | Critical    |
| ----------- | ---------- | ----------- | ----------- |
| p50 latency | < 100ms    | 100-300ms   | > 300ms     |
| p95 latency | < 300ms    | 300-800ms   | > 800ms     |
| p99 latency | < 1000ms   | 1000-2000ms | > 2000ms    |
| TTFB        | < 200ms    | 200-500ms   | > 500ms     |
| Error rate  | < 0.1%     | 0.1-1%      | > 1%        |

## Budget Enforcement
- CI pipeline fails if any metric enters Critical zone
- Warning zone triggers alert but does not block deployment
- Budgets apply to every endpoint, not just aggregate
- Adjust budgets per endpoint type (read vs write, simple vs complex)

## Frontend Performance Budgets
| Metric                 | Budget     |
| ---------------------- | ---------- |
| First Contentful Paint | < 1.5s     |
| Largest Contentful Paint | < 2.5s   |
| Cumulative Layout Shift | < 0.1     |
| Total bundle size      | < 250 KB   |
| JavaScript bundle      | < 150 KB   |`,
    },
    {
      title: 'SLO Validation',
      priority: 80,
      content: `## SLO Testing Approach
1. Define SLOs from business requirements (e.g., p99 < 500ms at 1000 RPS)
2. Encode SLOs as test thresholds in load test configuration
3. Run load test simulating expected production traffic
4. Fail the test if any SLO threshold is breached
5. Track SLO compliance trend over releases

## Common SLO Definitions
| SLO Category   | Example Objective                      |
| -------------- | -------------------------------------- |
| Availability   | 99.9% success rate over 30 days        |
| Latency        | p99 < 500ms for all API endpoints      |
| Throughput     | Handle 5000 RPS sustained              |
| Error budget   | < 0.1% error rate per deployment       |

## SLO in CI Pipeline
- Run abbreviated load test (5-10 min) on every PR merge
- Run full load test (30-60 min) on release candidates
- Compare results against SLO thresholds automatically
- Store results for trend analysis across releases`,
    },
    {
      title: 'k6 Test Patterns',
      priority: 75,
      content: `## Standard Load Test Structure
\`\`\`
stages: [
  { duration: '2m', target: 50 },   // ramp up
  { duration: '5m', target: 50 },   // hold at target
  { duration: '2m', target: 0 },    // ramp down
]
thresholds: {
  http_req_duration: ['p(95)<300', 'p(99)<1000'],
  http_req_failed: ['rate<0.01'],
}
\`\`\`

## Key Patterns
- Use scenarios for different user behaviors (browse, purchase, search)
- Use groups to organize related requests into transactions
- Use checks for inline assertions (status codes, response body)
- Use custom metrics for business-specific measurements
- Use environment variables for target URLs and VU counts

## Data-Driven Testing
- Use SharedArray for large datasets (loaded once, shared across VUs)
- Use CSV or JSON files for test data (user credentials, product IDs)
- Randomize data selection to simulate realistic access patterns

## CI Integration
- Run k6 in Docker for consistent environments
- Export results to time-series database (InfluxDB, Prometheus)
- Visualize with Grafana dashboards
- Set exit code based on threshold violations`,
    },
    {
      title: 'Profiling Strategies',
      priority: 65,
      content: `## Profiling Types
| Type     | What It Reveals                   | Tools                           |
| -------- | --------------------------------- | ------------------------------- |
| CPU      | Hot functions, algorithmic issues | Node --prof, py-spy, perf       |
| Memory   | Leaks, excessive allocation       | heapdump, tracemalloc, valgrind |
| I/O      | Slow queries, file operations     | strace, slow query log, APM     |
| Network  | Latency, connection pool issues   | tcpdump, Wireshark, APM traces  |
| Async    | Event loop blocking, queue depth  | clinic.js, async_hooks          |

## When to Profile
- After load test identifies a slow endpoint
- When p99 is significantly higher than p50 (tail latency)
- When memory usage grows continuously under soak test
- When CPU utilization exceeds 70% at target load

## Profiling Workflow
1. Reproduce the performance issue in a controlled environment
2. Capture a profile under representative load
3. Identify the top hotspots (functions consuming most time/memory)
4. Optimize the top 1-3 hotspots (Pareto: 20% of code causes 80% of cost)
5. Re-profile to verify improvement
6. Run load test to confirm end-to-end improvement

## Anti-patterns
- Profiling in production without sampling (adds overhead)
- Optimizing without profiling data (premature optimization)
- Profiling under unrealistic load (results don't transfer)
- Ignoring GC pauses in managed languages`,
    },
  ],
} as const;
