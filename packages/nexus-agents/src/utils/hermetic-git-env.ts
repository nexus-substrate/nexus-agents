/** Repository-local environment names reported by `git rev-parse --local-env-vars`. */
export const REPOSITORY_LOCAL_GIT_ENV_VARS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  // Internal name omitted by some git versions, still local to the repository.
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
] as const;

const LOCAL_GIT_ENV_NAMES: ReadonlySet<string> = new Set(REPOSITORY_LOCAL_GIT_ENV_VARS);

/** Copy an environment without repository redirects or injected git config. */
export function hermeticGitEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(base).filter(
      ([name]) => !LOCAL_GIT_ENV_NAMES.has(name) && !/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name)
    )
  );
}
