/**
 * Warnings the dev pipeline attaches to its result (#6792).
 *
 * @module pipeline/dev-pipeline-warnings
 */

import { createLogger } from '../core/index.js';
import type { DevPipelineResult, DevPipelineStages, QualityGateMode } from './dev-pipeline.js';

const logger = createLogger({ component: 'dev-pipeline' });

/**
 * The result's `warnings` field for {@link qualityGateWorkspaceWarning}, and
 * the same warning logged at warn level, or `{}` when there is none.
 */
export function gateWorkspaceWarningFields(
  stages: Pick<DevPipelineStages, 'implementWorkspace' | 'qualityGate'>,
  mode: QualityGateMode,
  implementRan: boolean
): Pick<DevPipelineResult, 'warnings'> {
  const warning = qualityGateWorkspaceWarning(stages, mode, implementRan);
  if (warning === undefined) return {};
  logger.warn(warning);
  return { warnings: [warning] };
}

/**
 * The warning for a quality gate that runs scripts in the directory the
 * implement expert edited, or `undefined` when that did not happen.
 *
 * Workspace-edit mode stops the implement expert from running commands, but
 * the gate then runs the package manager's typecheck, lint and test scripts
 * in the same directory. A `package.json` script or test file the expert
 * edited is therefore executed by the pipeline. A scratch worktree protects
 * the source checkout, but does not isolate those scripts from the host.
 */
function qualityGateWorkspaceWarning(
  stages: Pick<DevPipelineStages, 'implementWorkspace' | 'qualityGate'>,
  mode: QualityGateMode,
  implementRan: boolean
): string | undefined {
  const workspace = stages.implementWorkspace;
  if (mode === 'off' || stages.qualityGate === undefined || !implementRan) return undefined;
  if (workspace?.accessMode !== 'workspace-edit') return undefined;
  return (
    `The quality gate (${mode}) ran typecheck, lint and test scripts in ${workspace.directory}, ` +
    'the workspace where the implement expert edited files in ' +
    'workspace-edit mode. Workspace-edit stops the expert from running commands, but files ' +
    'it edited, including package.json scripts and tests, were executed by the gate. ' +
    'Review the returned diff. A scratch worktree (#6794) protects the source checkout, but ' +
    'the gate still executes edited scripts on the host.'
  );
}
