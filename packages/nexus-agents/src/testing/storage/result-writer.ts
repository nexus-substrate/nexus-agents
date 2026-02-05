/**
 * Result Writer for CLI Testing Framework
 *
 * Writes test results to JSON files with history management.
 * Uses America/New_York timezone for all timestamps per project standards.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type Result, ok, err } from '../../core/result.js';
import { getTimeProvider, createLogger } from '../../core/index.js';
import { type TestRunResult, type ResultWriterConfig, TestRunResultSchema } from '../schemas.js';

/**
 * Error types for result writer operations
 */
export class ResultWriterError extends Error {
  public readonly code: ResultWriterErrorCode;
  public override readonly cause?: unknown;

  constructor(message: string, code: ResultWriterErrorCode, cause?: unknown) {
    super(message, { cause });
    this.name = 'ResultWriterError';
    this.code = code;
    this.cause = cause;
  }
}

export const ResultWriterErrorCode = {
  DIRECTORY_CREATE_FAILED: 'DIRECTORY_CREATE_FAILED',
  WRITE_FAILED: 'WRITE_FAILED',
  READ_FAILED: 'READ_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  PRUNE_FAILED: 'PRUNE_FAILED',
} as const;

export type ResultWriterErrorCode =
  (typeof ResultWriterErrorCode)[keyof typeof ResultWriterErrorCode];

/**
 * File names used by the result writer
 */
const LATEST_FILENAME = 'latest.json';
const HISTORY_DIRNAME = 'history';

/**
 * Writes test results to JSON files with history management.
 *
 * Creates:
 * - {outputDir}/latest.json - Most recent test run
 * - {outputDir}/history/{timestamp}.json - Historical runs
 */
export class ResultWriter {
  private readonly outputDir: string;
  private readonly historyDir: string;
  private readonly keepHistory: number;
  private directoriesEnsured = false;

  constructor(config: ResultWriterConfig) {
    this.outputDir = path.resolve(config.outputDir);
    this.historyDir = path.join(this.outputDir, HISTORY_DIRNAME);
    this.keepHistory = config.keepHistory;
  }

  /**
   * Write test results to JSON file.
   * Creates both latest.json and a timestamped history file.
   *
   * @param result - The test run result to write
   * @returns Path to the latest.json file on success
   */
  async write(result: TestRunResult): Promise<Result<string, ResultWriterError>> {
    const ensureResult = await this.ensureDirectories();
    if (!ensureResult.ok) {
      return ensureResult;
    }

    const latestPath = path.join(this.outputDir, LATEST_FILENAME);
    const historyFilename = this.timestampToFilename(result.timestamp);
    const historyPath = path.join(this.historyDir, historyFilename);

    const jsonContent = JSON.stringify(result, null, 2);

    // Write latest.json
    const latestWriteResult = await this.writeFile(latestPath, jsonContent);
    if (!latestWriteResult.ok) {
      return latestWriteResult;
    }

    // Write history file
    const historyWriteResult = await this.writeFile(historyPath, jsonContent);
    if (!historyWriteResult.ok) {
      return historyWriteResult;
    }

    // Prune old history files (best effort, don't fail the write)
    await this.pruneHistory();

    return ok(latestPath);
  }

  /**
   * Read the latest test result.
   *
   * @returns The latest test result or null if not found
   */
  async readLatest(): Promise<Result<TestRunResult | null, ResultWriterError>> {
    const latestPath = path.join(this.outputDir, LATEST_FILENAME);
    return this.readResultFile(latestPath);
  }

  /**
   * Read a specific historical result by timestamp.
   *
   * @param timestamp - ISO 8601 timestamp string
   * @returns The test result or null if not found
   */
  async readHistory(timestamp: string): Promise<Result<TestRunResult | null, ResultWriterError>> {
    const filename = this.timestampToFilename(timestamp);
    const historyPath = path.join(this.historyDir, filename);
    return this.readResultFile(historyPath);
  }

  /**
   * List all historical run timestamps.
   *
   * @returns Array of timestamp strings, sorted newest first
   */
  async listHistory(): Promise<Result<string[], ResultWriterError>> {
    try {
      const files = await fs.readdir(this.historyDir);
      const timestamps = files
        .filter((f) => f.endsWith('.json'))
        .map((f) => this.filenameToTimestamp(f))
        .filter((t): t is string => t !== null)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

      return ok(timestamps);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return ok([]);
      }
      return err(
        new ResultWriterError(
          `Failed to list history: ${getErrorMessage(error)}`,
          ResultWriterErrorCode.READ_FAILED,
          error
        )
      );
    }
  }

  /**
   * Clean up old history files, keeping only the most recent keepHistory files.
   *
   * @returns Number of files deleted
   */
  async pruneHistory(): Promise<Result<number, ResultWriterError>> {
    const listResult = await this.listHistory();
    if (!listResult.ok) {
      return err(
        new ResultWriterError(
          'Failed to prune history: could not list files',
          ResultWriterErrorCode.PRUNE_FAILED,
          listResult.error
        )
      );
    }

    const timestamps = listResult.value;
    if (timestamps.length <= this.keepHistory) {
      return ok(0);
    }

    const toDelete = timestamps.slice(this.keepHistory);
    let deletedCount = 0;

    for (const timestamp of toDelete) {
      const filename = this.timestampToFilename(timestamp);
      const filepath = path.join(this.historyDir, filename);

      try {
        await fs.unlink(filepath);
        deletedCount++;
      } catch (error) {
        // Log but continue - best effort deletion
        if (!(isNodeError(error) && error.code === 'ENOENT')) {
          // File already deleted, that's fine
          createLogger({ component: 'ResultWriter' }).warn('Failed to delete history file', {
            filepath,
            error: getErrorMessage(error),
          });
        }
      }
    }

    return ok(deletedCount);
  }

  /**
   * Ensure output directories exist.
   */
  private async ensureDirectories(): Promise<Result<void, ResultWriterError>> {
    if (this.directoriesEnsured) {
      return ok(undefined);
    }

    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      await fs.mkdir(this.historyDir, { recursive: true });
      this.directoriesEnsured = true;
      return ok(undefined);
    } catch (error) {
      return err(
        new ResultWriterError(
          `Failed to create output directories: ${getErrorMessage(error)}`,
          ResultWriterErrorCode.DIRECTORY_CREATE_FAILED,
          error
        )
      );
    }
  }

  /**
   * Write content to a file.
   */
  private async writeFile(
    filepath: string,
    content: string
  ): Promise<Result<string, ResultWriterError>> {
    try {
      await fs.writeFile(filepath, content, 'utf-8');
      return ok(filepath);
    } catch (error) {
      return err(
        new ResultWriterError(
          `Failed to write file ${filepath}: ${getErrorMessage(error)}`,
          ResultWriterErrorCode.WRITE_FAILED,
          error
        )
      );
    }
  }

  /**
   * Read and parse a result file.
   */
  private async readResultFile(
    filepath: string
  ): Promise<Result<TestRunResult | null, ResultWriterError>> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      const validated = TestRunResultSchema.safeParse(parsed);

      if (!validated.success) {
        return err(
          new ResultWriterError(
            `Invalid result file format: ${validated.error.message}`,
            ResultWriterErrorCode.PARSE_FAILED,
            validated.error
          )
        );
      }

      return ok(validated.data);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return ok(null);
      }
      return err(
        new ResultWriterError(
          `Failed to read file ${filepath}: ${getErrorMessage(error)}`,
          ResultWriterErrorCode.READ_FAILED,
          error
        )
      );
    }
  }

  /**
   * Convert ISO 8601 timestamp to safe filename.
   * Example: 2026-01-05T10:30:00.000Z -> 2026-01-05T10-30-00-000Z.json
   */
  private timestampToFilename(timestamp: string): string {
    // Replace colons and periods with hyphens for filesystem safety
    const safeTimestamp = timestamp.replace(/:/g, '-').replace(/\./g, '-');
    return `${safeTimestamp}.json`;
  }

  /**
   * Convert filename back to ISO 8601 timestamp.
   * Example: 2026-01-05T10-30-00-000Z.json -> 2026-01-05T10:30:00.000Z
   */
  private filenameToTimestamp(filename: string): string | null {
    if (!filename.endsWith('.json')) {
      return null;
    }

    // Remove .json extension
    const withoutExt = filename.slice(0, -5);

    // Convert back: find the T, then restore colons and period
    const tIndex = withoutExt.indexOf('T');
    if (tIndex === -1) {
      return null;
    }

    const datePart = withoutExt.slice(0, tIndex);
    const timePart = withoutExt.slice(tIndex + 1);

    // Time format after T: HH-MM-SS-mmmZ -> HH:MM:SS.mmmZ
    // Pattern: XX-XX-XX-XXXZ
    const timeMatch = /^(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(timePart);
    if (!timeMatch) {
      return null;
    }

    const hours = timeMatch[1];
    const minutes = timeMatch[2];
    const seconds = timeMatch[3];
    const millis = timeMatch[4];

    if (
      hours === undefined ||
      minutes === undefined ||
      seconds === undefined ||
      millis === undefined
    ) {
      return null;
    }

    return `${datePart}T${hours}:${minutes}:${seconds}.${millis}Z`;
  }
}

/**
 * Create a new ResultWriter instance.
 */
export function createResultWriter(config: ResultWriterConfig): ResultWriter {
  return new ResultWriter(config);
}

/**
 * Generate current timestamp in America/New_York timezone formatted as ISO 8601.
 */
export function generateTimestamp(): string {
  const now = new Date(getTimeProvider().now());
  // Note: For storage, we use UTC (ISO 8601 with Z suffix) for consistency
  // The timezone field in TestRunResult records America/New_York for reference
  return now.toISOString();
}

/**
 * Get America/New_York formatted date string for display purposes.
 */
export function getETDisplayTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Type guard for Node.js errors with code property.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Extract error message safely.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
