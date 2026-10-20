/** An installed-package consumer can configure the runner's durable decision seam. */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const consumerPath = fileURLToPath(
  new URL('../../pipeline-authority-consumer.ts', import.meta.url)
);
const publicEntry = fileURLToPath(new URL('../index.ts', import.meta.url));
const consumerSource = `
import {
  AuthoritativeDecisionStore,
  PipelineRunner,
  type AuthoritativeDecisionStoreConfig,
  type PipelineExecuteOptions,
} from 'nexus-agents';

const config: AuthoritativeDecisionStoreConfig = { storageDir: '/approved/pipeline-state' };
const store = new AuthoritativeDecisionStore(config);
const options: PipelineExecuteOptions = { decisionStore: store, decisionAttemptId: 'attempt-one' };
const configuredStore: NonNullable<PipelineExecuteOptions['decisionStore']> = store;
const runner = new PipelineRunner();
void [options, configuredStore.getTaskSnapshot('task-one'), runner];
`;

function consumerDiagnostics(): readonly ts.Diagnostic[] {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    // The build emits src/index.ts as the package root. Check candidate source,
    // rather than a stale dist declaration, while using the installed specifier.
    paths: { 'nexus-agents': [publicEntry] },
  };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, onError, createNewSourceFile) =>
    file === consumerPath
      ? ts.createSourceFile(file, consumerSource, ts.ScriptTarget.ES2022, true)
      : originalGetSourceFile(file, languageVersion, onError, createNewSourceFile);
  const program = ts.createProgram({ rootNames: [consumerPath], options, host });
  const consumer = program.getSourceFile(consumerPath);
  if (consumer === undefined) throw new Error('Public consumer was not checked');
  return program.getSemanticDiagnostics(consumer);
}

describe('public pipeline authority consumer (#7522)', () => {
  it('constructs the public store and supplies it to the public runner options', () => {
    const diagnostics = consumerDiagnostics().map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    );
    expect(diagnostics).toEqual([]);
  });
});
