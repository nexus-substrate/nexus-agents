/** Environment shared by staging and release publishing (#6894). */
export function publishEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => !/^npm_config_(node_linker|verify_deps_before_run)$/i.test(key)
    )
  );
  // pnpm 10 injects the legacy npm variable into exec/run children. Keep its
  // pnpm-only equivalent so nested commands retain the same verification policy.
  env['pnpm_config_verify_deps_before_run'] ??=
    source['npm_config_verify_deps_before_run'] ?? source['NPM_CONFIG_VERIFY_DEPS_BEFORE_RUN'];
  // Changesets invokes pnpm again: CLI flags on the outer exec do not survive.
  // pnpm-workspace.yaml reads this variable; npm does not treat it as config.
  env['NEXUS_PUBLISH_NODE_LINKER'] = 'hoisted';
  return env;
}
