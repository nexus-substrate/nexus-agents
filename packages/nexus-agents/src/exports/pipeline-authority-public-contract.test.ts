/** An installed-package consumer can configure the runner's durable decision seam. */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

// Full package-root type checking needs headroom under parallel coverage.
const CONSUMER_COMPILATION_TIMEOUT_MS = 120_000;

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
  type EvidenceAuthorization,
  type EvidenceBinding,
  type EvidenceObservation,
  type EvidenceVerificationRequest,
  type EvidenceVerificationConfig,
  type EvidenceReport,
} from 'nexus-agents';

const authorization: EvidenceAuthorization = {
  obligationId: 'content', artifactRef: 'artifact:source', issuer: 'host-content-reader',
  operation: 'artifact-content-digest', expectedDigest: 'a'.repeat(64), expectedBytes: 12,
};
const verification: EvidenceVerificationConfig = {
  authorizations: [authorization],
  verify(request: EvidenceVerificationRequest) {
    const binding: EvidenceBinding = request.binding;
    const observation: EvidenceObservation = { ...binding,
      obligationId: 'content', artifactRef: 'artifact:source', issuer: 'host-content-reader',
      operation: 'artifact-content-digest', digest: authorization.expectedDigest, bytes: 12,
      coverage: { start: 0, end: 12 },
    };
    return [observation];
  },
};
const evidence: EvidenceReport = { status: 'not_applicable', criteria: 0,
  acceptedReceipts: 0, rejectedReceipts: 0, fulfilledObligations: [], missing: [],
  unmetAdvisory: [], diagnostics: [],
};
const config: AuthoritativeDecisionStoreConfig = { storageDir: '/approved/pipeline-state' };
const store = new AuthoritativeDecisionStore(config);
const options: PipelineExecuteOptions = { decisionStore: store, decisionAttemptId: 'attempt-one',
  evidenceVerification: verification,
};
const configuredStore: NonNullable<PipelineExecuteOptions['decisionStore']> = store;
const runner = new PipelineRunner();
void [options, configuredStore.getTaskSnapshot('task-one'), runner, evidence];
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
  it(
    'constructs the public store and supplies it to the public runner options',
    () => {
      const diagnostics = consumerDiagnostics().map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      );
      expect(diagnostics).toEqual([]);
    },
    CONSUMER_COMPILATION_TIMEOUT_MS
  );
});
