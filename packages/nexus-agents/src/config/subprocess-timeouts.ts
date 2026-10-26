/** Canonical subprocess timeout values, also re-exported by timeouts.ts. No runtime imports. */
export const CLI_SUBPROCESS_TIMEOUTS = {
  /** CLI adapter spawn timeout (detect/startup). */
  spawnMs: 10_000,
  /** Docker version check timeout. */
  dockerCheckMs: 5_000,
  /** gh CLI command timeout. */
  ghCommandMs: 30_000,
  /** CLI status probe timeout. */
  statusProbeMs: 5_000,
  /** Environment setup timeout. */
  envSetupMs: 3_000,
  /** Release validation (long-running). */
  releaseValidateMs: 120_000,
  /** Release build (longest-running). */
  releaseBuildMs: 180_000,
  /** Graph workflow execution timeout. */
  graphWorkflowMs: 60_000,
  /** Self-development plan phase duration. */
  selfDevPlanMs: 300_000,
  /** Self-development refine phase duration. */
  selfDevRefineMs: 180_000,
  /** Self-development vote phase duration. */
  selfDevVoteMs: 120_000,
  /** Collaboration protocol session timeout. */
  collaborationMs: 60_000,
  /** Maximum wait time for CI checks (auto-merge). */
  ciWaitMaxMs: 300_000,
  /** CI check polling interval (auto-merge). */
  ciPollIntervalMs: 15_000,
} as const;
