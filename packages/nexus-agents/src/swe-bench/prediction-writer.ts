/**
 * nexus-agents/swe-bench - Prediction Writer
 *
 * Write predictions in SWE-bench JSONL format.
 *
 * @module swe-bench/prediction-writer
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import type { SWEBenchPrediction, SWEBenchRunResult } from './types.js';

/**
 * Error types for prediction writing.
 */
export class PredictionWriteError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PredictionWriteError';
    this.cause = cause;
  }
}

/**
 * Options for the prediction writer.
 */
export interface PredictionWriterOptions {
  /** Output file path. */
  readonly outputPath: string;
  /** Model name to use in predictions. */
  readonly modelName: string;
  /** Whether to append to existing file. */
  readonly append: boolean;
}

/**
 * Writes a single prediction to JSONL.
 */
function formatPrediction(prediction: SWEBenchPrediction): string {
  return JSON.stringify({
    instance_id: prediction.instance_id,
    model_name_or_path: prediction.model_name_or_path,
    model_patch: prediction.model_patch,
  });
}

/**
 * Creates a prediction from a run result.
 */
export function createPrediction(
  result: SWEBenchRunResult,
  modelName: string
): SWEBenchPrediction | null {
  if (!result.completed || result.prediction === undefined) {
    return null;
  }

  return {
    instance_id: result.instance_id,
    model_name_or_path: modelName,
    model_patch: result.prediction.model_patch,
  };
}

/**
 * File handle type for prediction writing.
 */
type FileHandle = Awaited<ReturnType<typeof import('node:fs/promises').open>>;

/**
 * Prediction writer for streaming output.
 */
export class PredictionWriter {
  private fileHandle: FileHandle | null = null;
  private predictionCount = 0;
  private readonly options: PredictionWriterOptions;

  constructor(options: PredictionWriterOptions) {
    this.options = options;
  }

  /**
   * Opens the output file for writing.
   */
  async open(): Promise<Result<void, PredictionWriteError>> {
    const fs = await import('node:fs/promises');

    try {
      const flags = this.options.append ? 'a' : 'w';
      this.fileHandle = await fs.open(this.options.outputPath, flags);
      return { ok: true, value: undefined };
    } catch (err) {
      return {
        ok: false,
        error: new PredictionWriteError(
          `Failed to open output file: ${this.options.outputPath}`,
          err
        ),
      };
    }
  }

  /**
   * Writes a prediction to the output file.
   */
  async write(prediction: SWEBenchPrediction): Promise<Result<void, PredictionWriteError>> {
    if (this.fileHandle === null) {
      return {
        ok: false,
        error: new PredictionWriteError('Writer not opened. Call open() first.'),
      };
    }

    try {
      const line = formatPrediction(prediction) + '\n';
      await this.fileHandle.write(line);
      this.predictionCount++;
      return { ok: true, value: undefined };
    } catch (err) {
      return { ok: false, error: new PredictionWriteError('Failed to write prediction', err) };
    }
  }

  /**
   * Writes a run result as a prediction (if completed).
   */
  async writeResult(result: SWEBenchRunResult): Promise<Result<boolean, PredictionWriteError>> {
    const prediction = createPrediction(result, this.options.modelName);

    if (prediction === null) {
      return { ok: true, value: false };
    }

    const writeResult = await this.write(prediction);
    if (!writeResult.ok) {
      return { ok: false, error: writeResult.error };
    }

    return { ok: true, value: true };
  }

  /**
   * Closes the output file.
   */
  async close(): Promise<Result<void, PredictionWriteError>> {
    if (this.fileHandle === null) {
      return { ok: true, value: undefined };
    }

    try {
      await this.fileHandle.close();
      this.fileHandle = null;
      return { ok: true, value: undefined };
    } catch (err) {
      return { ok: false, error: new PredictionWriteError('Failed to close output file', err) };
    }
  }

  /**
   * Gets the number of predictions written.
   */
  getPredictionCount(): number {
    return this.predictionCount;
  }

  /**
   * Gets the output path.
   */
  getOutputPath(): string {
    return this.options.outputPath;
  }
}

/**
 * Writes multiple predictions to a file at once.
 */
export async function writePredictions(
  predictions: readonly SWEBenchPrediction[],
  outputPath: string,
  options: { append?: boolean } = {}
): Promise<Result<number, PredictionWriteError>> {
  const fs = await import('node:fs/promises');

  try {
    const lines = predictions.map(formatPrediction).join('\n') + '\n';
    const flags = options.append === true ? 'a' : 'w';

    await fs.writeFile(outputPath, lines, { flag: flags });

    return { ok: true, value: predictions.length };
  } catch (err) {
    return {
      ok: false,
      error: new PredictionWriteError(`Failed to write predictions to ${outputPath}`, err),
    };
  }
}

/**
 * Parses a single prediction line.
 */
function parsePredictionLine(line: string): SWEBenchPrediction | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (
      typeof parsed.instance_id !== 'string' ||
      typeof parsed.model_name_or_path !== 'string' ||
      typeof parsed.model_patch !== 'string'
    ) {
      return null;
    }
    return {
      instance_id: parsed.instance_id,
      model_name_or_path: parsed.model_name_or_path,
      model_patch: parsed.model_patch,
    };
  } catch {
    return null;
  }
}

/**
 * Reads predictions from a JSONL file.
 */
export async function readPredictions(
  inputPath: string
): Promise<Result<readonly SWEBenchPrediction[], PredictionWriteError>> {
  const fs = await import('node:fs/promises');

  try {
    const content = await fs.readFile(inputPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const predictions: SWEBenchPrediction[] = [];

    for (const line of lines) {
      const parsed = parsePredictionLine(line);
      if (parsed !== null) {
        predictions.push(parsed);
      }
    }

    return { ok: true, value: predictions };
  } catch (err) {
    return {
      ok: false,
      error: new PredictionWriteError(`Failed to read predictions from ${inputPath}`, err),
    };
  }
}

/**
 * Gets instance IDs from a predictions file.
 */
export async function getCompletedInstanceIds(
  inputPath: string
): Promise<Result<Set<string>, PredictionWriteError>> {
  const result = await readPredictions(inputPath);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const ids = new Set(result.value.map((p) => p.instance_id));
  return { ok: true, value: ids };
}

/**
 * Validates a prediction has required fields.
 */
export function validatePrediction(prediction: unknown): prediction is SWEBenchPrediction {
  if (typeof prediction !== 'object' || prediction === null) {
    return false;
  }

  const p = prediction as Record<string, unknown>;

  return (
    typeof p.instance_id === 'string' &&
    p.instance_id.length > 0 &&
    typeof p.model_name_or_path === 'string' &&
    p.model_name_or_path.length > 0 &&
    typeof p.model_patch === 'string'
  );
}
