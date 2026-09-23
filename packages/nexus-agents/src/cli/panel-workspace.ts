/**
 * The working directory a consensus panel's seats are pointed at (#6258).
 *
 * One cwd per panel: the caller's explicit directory (the CLI's ratification
 * scratch checkout) or, absent one, `process.cwd()`. `collectRealVotes` hands
 * it to every seat and `executeVoting` stamps the same value on the live
 * result, so an `unverifiable` seat can be diagnosed without reading stderr.
 * Its own module so both call it without either importing the other's mocks.
 *
 * @module cli/panel-workspace
 */

/** The directory a panel's seats are given: the caller's, else the process cwd. */
export function resolvePanelWorkspace(workspace: string | undefined): string {
  return workspace ?? process.cwd();
}
