/**
 * Task Tracker — Multi-backend task management for the dev pipeline (#1684)
 *
 * Supports GitHub, GitLab, and local JSON backends for creating/updating
 * tasks (issues) and posting progress. Uses the gh/glab CLI pattern
 * already established in cli/issue-command.ts.
 *
 * @module pipeline/task-tracker
 */

import { createLogger } from '../core/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const logger = createLogger({ component: 'task-tracker' });

// ============================================================================
// Types
// ============================================================================

/** Supported task tracker backends. */
export type TrackerBackend = 'github' | 'gitlab' | 'json';

/** A tracked task/issue. */
export interface TrackedTask {
  /** Backend-specific ID (issue number or local ID). */
  readonly id: string;
  readonly title: string;
  readonly status: 'open' | 'in_progress' | 'closed';
  readonly url?: string | undefined;
}

/** Configuration for the task tracker. */
export interface TaskTrackerConfig {
  readonly backend: TrackerBackend;
  /** GitHub/GitLab repo (owner/name). Required for github/gitlab backends. */
  readonly repo?: string;
  /** Parent issue number to link tasks to. */
  readonly parentIssue?: number;
  /** Directory for JSON backend output. */
  readonly outputDir?: string;
  /** Labels to apply to created issues. */
  readonly labels?: readonly string[] | undefined;
}

/** Task tracker interface — create, update, comment. */
export interface ITaskTracker {
  createTask(title: string, body: string): Promise<TrackedTask>;
  updateStatus(taskId: string, status: TrackedTask['status']): Promise<void>;
  postComment(taskId: string, comment: string): Promise<void>;
}

// ============================================================================
// Shell Executor (DRY: reuses cli/issue-command.ts pattern)
// ============================================================================

/** Execute a shell command and return stdout. Throws on failure (loud). */
async function exec(cmd: string, args: readonly string[], timeout = 15_000): Promise<string> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const { stdout } = await run(cmd, [...args], { timeout });
  return stdout.trim();
}

// ============================================================================
// GitHub Backend
// ============================================================================

/** GitHub backend — delegates through GitHubProvider (DRY: reuses scm/github-provider.ts). */
class GitHubTaskTracker implements ITaskTracker {
  constructor(private readonly config: TaskTrackerConfig) {}

  private async getProvider(): Promise<{
    createIssue: (
      t: string,
      b: string,
      l?: readonly string[]
    ) => Promise<{ ok: boolean; value: { number: number; url?: string } }>;
    addComment: (n: number, b: string) => Promise<{ ok: boolean }>;
  }> {
    const { createScmProvider } = await import('../scm/factory.js');
    const result = await createScmProvider({ repo: this.config.repo ?? '' });
    if (!result.ok) throw new Error(`SCM provider error: ${result.error.message}`);
    return result.value as never;
  }

  async createTask(title: string, body: string): Promise<TrackedTask> {
    const provider = await this.getProvider();
    const result = await provider.createIssue(title, body, this.config.labels);
    if (!result.ok) throw new Error('Failed to create issue');
    const id = String(result.value.number);
    logger.info('Created GitHub issue via SCM provider', { id });
    return { id, title, status: 'open', url: (result.value as { url?: string }).url };
  }

  async updateStatus(taskId: string, status: TrackedTask['status']): Promise<void> {
    if (status !== 'closed') return;
    const repo = this.config.repo;
    if (repo === undefined) return;
    await exec('gh', ['issue', 'close', taskId, '--repo', repo]);
  }

  async postComment(taskId: string, comment: string): Promise<void> {
    const provider = await this.getProvider();
    await provider.addComment(parseInt(taskId, 10), comment);
  }
}

// ============================================================================
// GitLab Backend
// ============================================================================

class GitLabTaskTracker implements ITaskTracker {
  constructor(private readonly config: TaskTrackerConfig) {}

  async createTask(title: string, body: string): Promise<TrackedTask> {
    const repo = this.config.repo;
    if (repo === undefined) throw new Error('GitLab backend requires repo config');
    const url = await exec(
      'glab',
      ['issue', 'create', '--repo', repo, '--title', title, '--description', body],
      30_000
    );
    const match = /\/(\d+)$/.exec(url);
    const id = match?.[1] ?? url;
    logger.info('Created GitLab issue', { id, url });
    return { id, title, status: 'open', url };
  }

  async updateStatus(taskId: string, status: TrackedTask['status']): Promise<void> {
    const repo = this.config.repo;
    if (repo === undefined) return;
    if (status === 'closed') {
      await exec('glab', ['issue', 'close', taskId, '--repo', repo]);
    }
  }

  async postComment(taskId: string, comment: string): Promise<void> {
    const repo = this.config.repo;
    if (repo === undefined) return;
    await exec('glab', ['issue', 'comment', taskId, '--repo', repo, '--message', comment]);
  }
}

// ============================================================================
// JSON Backend (local file, no external deps)
// ============================================================================

class JsonTaskTracker implements ITaskTracker {
  private nextId = 1;
  private readonly tasks: TrackedTask[] = [];
  private readonly comments: Map<string, string[]> = new Map();
  private readonly outputPath: string;

  constructor(config: TaskTrackerConfig) {
    const dir = config.outputDir ?? '.nexus-pipeline';
    this.outputPath = path.resolve(dir, 'tasks.json');
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
  }

  async createTask(title: string, body: string): Promise<TrackedTask> {
    const id = String(this.nextId++);
    const task: TrackedTask = { id, title, status: 'open' };
    this.tasks.push(task);
    this.comments.set(id, [body]);
    this.persist();
    return Promise.resolve(task);
  }

  async updateStatus(taskId: string, status: TrackedTask['status']): Promise<void> {
    const idx = this.tasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      const existing = this.tasks[idx] as TrackedTask;
      this.tasks[idx] = { ...existing, status };
      this.persist();
    }
    return Promise.resolve();
  }

  async postComment(taskId: string, comment: string): Promise<void> {
    const existing = this.comments.get(taskId) ?? [];
    existing.push(comment);
    this.comments.set(taskId, existing);
    this.persist();
    return Promise.resolve();
  }

  private persist(): void {
    const data = {
      tasks: this.tasks,
      comments: Object.fromEntries(this.comments),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.outputPath, JSON.stringify(data, null, 2));
  }
}

// ============================================================================
// Auto-Detection
// ============================================================================

/** Detect available SCM CLI. Checks gh then glab then falls back to JSON. */
export async function detectBackend(): Promise<TrackerBackend> {
  try {
    await exec('gh', ['--version'], 5000);
    return 'github';
  } catch {
    /* gh not available */
  }
  try {
    await exec('glab', ['--version'], 5000);
    return 'gitlab';
  } catch {
    /* glab not available */
  }
  return 'json';
}

// ============================================================================
// Factory
// ============================================================================

/** Create a task tracker for the specified backend. */
export function createTaskTracker(config: TaskTrackerConfig): ITaskTracker {
  switch (config.backend) {
    case 'github':
      return new GitHubTaskTracker(config);
    case 'gitlab':
      return new GitLabTaskTracker(config);
    case 'json':
      return new JsonTaskTracker(config);
  }
}

/** Auto-detect backend and create tracker. */
export async function createAutoTaskTracker(
  config: Omit<TaskTrackerConfig, 'backend'>
): Promise<ITaskTracker> {
  const backend = await detectBackend();
  logger.info('Auto-detected task tracker backend', { backend });
  return createTaskTracker({ ...config, backend });
}
