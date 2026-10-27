/** Resolve the adaptive pipeline's task/spec composition once (#7664). */
import { err, type Result } from '../../core/result.js';
import {
  combineSpecAcceptance,
  type AcceptanceContext,
} from '../../pipeline/acceptance-context.js';
import {
  captureResolvedAcceptance,
  readAcceptanceFile,
  type AcceptanceResolveContext,
} from './dev-pipeline-input.js';
import { toolStructuredError, type ToolResult } from './tool-result.js';

/** Argument observations cover handler arguments, never unseen file contents. */
export async function resolvePipelineInput(
  input: { readonly task: string; readonly specFile?: string },
  context: AcceptanceResolveContext
): Promise<Result<AcceptanceContext, ToolResult>> {
  const task = captureResolvedAcceptance(
    { kind: 'task', source: input.task },
    context,
    'run_pipeline.task'
  );
  if (!task.ok || input.specFile === undefined) return task;
  const source = await readAcceptanceFile(input.specFile, 'Spec');
  if (!source.ok)
    return err(toolStructuredError({ errorCategory: 'validation', message: source.error.message }));
  const file = captureResolvedAcceptance(
    { kind: 'specFile', source: source.value },
    context,
    'run_pipeline.specFile'
  );
  if (!file.ok) return file;
  const combined = combineSpecAcceptance(source.value, file.value, task.value);
  return combined.ok
    ? combined
    : err(
        toolStructuredError({
          errorCategory: 'validation',
          message: combined.error.message,
        })
      );
}
