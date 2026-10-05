/** Detect replacement of the install backing a long-lived MCP server (#6959). */
import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ILogger } from '../../core/index.js';
import { VERSION } from '../../version.js';
import { toolStructuredError, type ToolResult } from '../tools/tool-result.js';

// Captured at module load, before registration or any lazy tool imports. tsup
// emits flat dist chunks; source runs cannot identify an installed artifact.
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const packagePath =
  basename(moduleDirectory) === 'dist' ? resolve(moduleDirectory, '../package.json') : undefined;
let cachedMtime: number | undefined;
let installedVersion = VERSION;
let refusal: ToolResult | undefined;
let warned = false;

function warnOnce(logger: ILogger, message: string): void {
  if (warned) return;
  warned = true;
  logger.warn(message);
}

function refuseInstall(version: string, logger: ILogger): ToolResult {
  const message = `nexus-agents was upgraded from ${VERSION} to ${version} while this MCP server was running; restart the MCP server (or your client) to load the new version.`;
  warnOnce(logger, message);
  refusal = toolStructuredError({ errorCategory: 'business', message });
  return refusal;
}

/** Stat on every dispatch, reading package metadata only when mtime changes. */
export function checkRunningInstall(logger: ILogger): ToolResult | undefined {
  if (packagePath === undefined) {
    warnOnce(
      logger,
      'Running install check unmeasured: starting package.json cannot be determined; skipping check.'
    );
    return undefined;
  }
  if (refusal !== undefined) return refusal;
  try {
    const mtime = statSync(packagePath).mtimeMs;
    if (mtime !== cachedMtime) {
      installedVersion = readInstalledVersion(packagePath);
      cachedMtime = mtime;
    }
    return installedVersion === VERSION ? undefined : refuseInstall(installedVersion, logger);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return refuseInstall('removed', logger);
    }
    const message =
      'Running install check could not read package.json; restart the MCP server (or your client).';
    warnOnce(logger, message);
    return toolStructuredError({ errorCategory: 'internal', message });
  }
}

/** Map only the missing target, never its importer or an unrelated dependency. */
export function mapInstallModuleError(error: unknown, logger: ILogger): ToolResult | undefined {
  if (packagePath === undefined) return undefined;
  const target = missingModuleTarget(error);
  if (target === undefined) return undefined;
  const path = moduleTargetPath(target);
  if (path === undefined) return undefined;
  if (!isAbsolute(path)) return undefined;
  const within = relative(moduleDirectory, path);
  if (within === '' || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within))
    return undefined;
  return checkRunningInstall(logger) ?? refuseInstall('unknown (installation changed)', logger);
}

/** Invalid file URLs are unrelated module errors, not evidence of replacement. */
function moduleTargetPath(target: string): string | undefined {
  try {
    return target.startsWith('file:') ? fileURLToPath(target) : target;
  } catch {
    return undefined;
  }
}

/** Validate only the installed version field consumed by the guard. */
function readInstalledVersion(path: string): string {
  const pkg: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (
    typeof pkg !== 'object' ||
    pkg === null ||
    !('version' in pkg) ||
    typeof pkg.version !== 'string'
  ) {
    throw new Error('Installed package.json has no version');
  }
  return pkg.version;
}

/** Node's ESM and CommonJS module-miss messages identify the missing target. */
function missingModuleTarget(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  if (error.code !== 'ERR_MODULE_NOT_FOUND' && error.code !== 'MODULE_NOT_FOUND') return undefined;
  return /Cannot find module ['"]([^'"]+)['"]/.exec(error.message)?.[1];
}
