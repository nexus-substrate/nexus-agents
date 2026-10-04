/** CLI diagnostic metadata derived from the adapter's executable (#4389). */
import type { ICliAdapter, CliName } from './types.js';

/** Packages for CLI arms installed through npm; other binaries use generic hints. */
const CLI_PACKAGES: Partial<Record<CliName, string>> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  opencode: 'opencode-ai',
};

/**
 * Internal diagnostic metadata shared by doctor and status. Reads the existing
 * binaryName getter; routing arms without that getter retain their own name.
 */
export function getCliAdapterDiagnostics(adapter: ICliAdapter): {
  readonly binaryName: string;
  readonly installationHints: Readonly<Record<'install' | 'upgrade' | 'auth', string>>;
} {
  const binaryName =
    'binaryName' in adapter && typeof adapter.binaryName === 'string'
      ? adapter.binaryName
      : adapter.name;
  const packageName = CLI_PACKAGES[adapter.name];
  return {
    binaryName,
    installationHints: {
      install:
        packageName === undefined
          ? `Install ${binaryName} and ensure it is on PATH`
          : `npm install -g ${packageName}`,
      upgrade:
        packageName === undefined
          ? `Update ${binaryName} to the latest version`
          : `npm update -g ${packageName}`,
      auth:
        packageName === undefined
          ? `Authenticate ${binaryName} using its CLI`
          : `${binaryName} auth login`,
    },
  };
}
