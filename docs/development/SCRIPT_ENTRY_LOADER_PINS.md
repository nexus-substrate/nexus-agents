---
title: Script Entry Loader-Pin Maintenance
description: Maintenance procedure for tsx loader pins, startup boundary qualification, and artifact cleanup in script-entry fixture tests
diataxis: reference
audience: project
tier: 2
keywords: [testing, loader-pins, tsx, script-entry, sandbox, fixtures]
related_files:
  - scripts/fixtures/script-entry-fixture.ts
  - scripts/fixtures/script-entry-assertions.ts
  - scripts/readiness-script-entry.test.ts
---

# Script Entry Loader-Pin Maintenance

**Status:** Canonical | **Applies to:** `scripts/fixtures/script-entry-fixture.ts`, `scripts/readiness-script-entry.test.ts` (#7680, #7685)

This reference defines the maintenance and qualification protocol for the `tsx` loader pins in `scripts/fixtures/script-entry-fixture.ts`. These pins support actual-module entry execution tests under fail-closed security boundary conditions without production helper hooks.

---

## 1. Architecture & Pinned Loader Mechanics

The test harness simulates actual script entry points (`claims-check.ts`, `check-strategy-manifest-drift.ts`, etc.) inside a restricted execution harness. Because `tsx` spawns or uses an internal IPC channel via `net.createConnection` to coordinate module resolution during initialization, the boundary intercepts this call.

To distinguish genuine startup operations from subject code attempting forbidden operations, `script-entry-fixture.ts` declares `loaderPolicy`:

```typescript
const loaderPolicy = [
  [
    'client-XItNFmsq.cjs',
    'cc72bed2d57324f12318efdc804772a2de18a3deb836ab1d63bdc493ad542113',
    1,
    431,
  ],
  [
    'require-CBjy4Foe.mjs',
    'b1156f2ecff29ef55801df8f4e1d9b34a5eae32e04dfcf3b8c2557fe191264c2',
    8,
    291,
  ],
] as const;
```

Each tuple pins:

1. **Chunk basename**: The exact bundled filename emitted by `tsx` (under `node_modules/tsx/dist/`).
2. **SHA-256 digest**: The full 64-character hex digest of the file bytes.
3. **Callsite line number**: The exact line where `net.createConnection` is invoked.
4. **Callsite column number**: The exact column where `net.createConnection` is invoked.

---

## 2. Diagnosing Failures: Pin Failure vs. Entry Regression

When tests fail, diagnose whether the failure stems from a dependency pin mismatch or a true entry-guard defect:

### Loader-Pin / Setup Failure

- **Symptom:** The failure occurs during fixture construction or the startup phase (`phase: startup`).
- **Evidence:** Inspect the diagnostic line logged in `.diagnostic.jsonl` within the fixture directory:
  ```json
  {
    "name": "net.createConnection",
    "classification": "loader:tsx-ipc-BLOCKED",
    "caller": { "file": ".../client-XXXX.cjs", "line": 1, "column": 431 },
    "phase": "startup",
    "actualSourceHash": "...",
    "expectedSources": [...],
    "expectedPipe": "...",
    "tmpVerified": true
  }
  ```
- **Identification:**
  - `actualSourceHash !== expectedHash`: The chunk contents changed (e.g. `tsx` or `esbuild` was updated).
  - `caller.line` or `caller.column` mismatch: The callsite location shifted due to code changes in `tsx`.
  - Missing file / cannot resolve: The chunk basename changed in a new `tsx` bundle.
- **Action:** Retain the execution output, Node version (`node -v`), OS/arch (`uname -a`), and dependency versions (`pnpm list tsx esbuild`). Follow the re-pinning procedure below.

### Entry-Guard Regression

- **Symptom:** Startup qualification passes, but subject execution fails during `phase: sealed`.
- **Evidence:** `assertValidEntry` or `assertEntryEnvelope` fails with unexpected `result.blocked` entries, abnormal exit status, or unsealed calls.
- **Action:** Treat as a production code regression in the readiness entry points or security boundaries. Do **not** alter `loaderPolicy`.

---

## 3. Re-Pinning & Verification Procedure

When upgrading `tsx` or resolving an environmental chunk update, follow these steps:

### Step 1: Examine Installed Loader Chunks & Callsites

1. Inspect the installed loader entrypoint:
   ```bash
   node -e 'console.log(require.resolve("tsx/loader"))'
   ```
2. Locate the client and require bundle files in `node_modules/tsx/dist/`.
3. Compute the SHA-256 hash of each chunk:
   ```bash
   sha256sum node_modules/tsx/dist/<chunk-name>
   ```
4. Verify the exact callsite for `net.createConnection`:
   - Inspect the source or bundle at the invocation of `createConnection`.
   - Confirm the caller originates directly from `tsx`'s IPC client initialization, not third-party or untrusted modules.
   - Confirm all external network connections remain denied.

### Step 2: Update `loaderPolicy`

Update the tuples in `scripts/fixtures/script-entry-fixture.ts` with the new chunk basenames, SHA-256 hashes, and callsite line/column offsets.

### Step 3: Required Qualification Controls

After any pin modification, verify all five criteria pass:

1. **Exact Two Startup Denials:** `result.loaderIpcBlocked` must have length exactly 2 (`client` and `require`).
2. **Permanent Seal Before Subjects:** `result.timeline` must record exactly one `bootstrap:sealed` event, occurring after startup denials and before `subject:resolved`.
3. **Caught-Attempt / VM-Counterfeit Control:** A synthetic attempt inside a `node:vm` context spoofing the canonical client filename must fail classification as a loader attempt and be recorded as an ordinary blocked subject attempt (`net.createConnection`).
4. **Subprocess / Spoof Controls:** Verify child process invocations cannot reopen the startup phase or spoof caller line numbers.
5. **Full Matrix Verification:** Run all 81 tests in `scripts/readiness-script-entry.test.ts`:
   - 5 path encoding variations (`plain`, `with space`, `with#hash`, `with%percent`, `with-雪`).
   - 5 scenario entry scripts (`claims-check.ts`, `check-strategy-manifest-drift.ts`, `check-authority-tier-drift.ts`, `check-model-string-drift.ts`, `generate-strategy-reference.ts`).
   - Missing evidence must fail closed, never report as a passing skip.

---

## 4. Managing Interrupted Run Artifacts (`.script-entry-*`)

`ScriptEntryFixture` creates isolated temporary directories in the repository root prefixed with `.script-entry-`:

```
.script-entry-XXXXXX/
├── boundary.mjs
├── attempts.jsonl
├── timeline.jsonl
├── diagnostic.jsonl
└── tmp/
```

### Automatic Cleanup

Under normal test completion, `afterEach(() => fixture?.close())` synchronously removes these directories via `rmSync(..., { recursive: true, force: true })`.

### Interrupted Run Inspection & Cleanup

If a test run is killed abnormally (e.g. `SIGINT`, `SIGKILL`, or runner abort), temporary directories may remain on disk:

1. **Inspect owned fixture directories:**
   ```bash
   ls -d .script-entry-* 2>/dev/null
   ```
2. **Verify contents:** Confirm the directory contains only test fixture files (`boundary.mjs`, `tmp/`, `*.jsonl`) before deletion.
3. **Bounded cleanup:**
   ```bash
   rm -rf .script-entry-*
   ```
4. **Ignore-rule discipline:** Do not modify `.gitignore` without a separate reviewed decision; keep temporary cleanup explicit and bounded.
