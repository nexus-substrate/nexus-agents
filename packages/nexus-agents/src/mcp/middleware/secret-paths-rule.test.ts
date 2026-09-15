/**
 * `secret-paths` PolicyFirewall rule (#5108, panel option B + contrarian
 * amendment).
 *
 * The secret-path denylist used to live in the access-constraint deriver,
 * whose `checkAccess` had zero production callers, so `~/.ssh/**` and friends
 * never gated a real tool call. Moving the globs into a firewall rule puts
 * them on the one path every registered tool crosses (`createSecureHandler` →
 * `getGlobalPolicyFirewall`).
 *
 * The amendment is canonicalization BEFORE matching: tilde expansion,
 * `path.resolve`, and `realpath` where the file exists. Each adversarial
 * spelling below is chosen so that its RAW string misses every glob and only
 * the canonical path hits one — deleting the canonicalization step must turn
 * that test red, or the test proves nothing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { secretPathsRule, safePathsRule } from './policy-rules.js';
import { createDefaultPolicyFirewall } from './policy.js';
import { setGlobalPolicyFirewall, resetGlobalPolicyFirewall } from './policy-registry.js';
import type { PolicyContext } from './policy-types.js';
import { registerExtractSymbolsTool } from '../tools/extract-symbols-tool.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function ctx(args: unknown, overrides: Partial<PolicyContext> = {}) {
  return { toolName: 'read_file', args, mode: 'read-only' as const, ...overrides };
}

const HOME = homedir();

// =============================================================================
// Identity and the empty case
// =============================================================================

describe('secretPathsRule', () => {
  it('is named secret-paths', () => {
    expect(secretPathsRule.name).toBe('secret-paths');
    expect(secretPathsRule.description).toContain('secret');
  });

  it('abstains when the call carries no path argument — the empty case is an allow, not a verdict', () => {
    // Named explicitly: absence of a path is "not a file operation", so the
    // rule has nothing to judge. It must NOT read absence as "no secret".
    const decision = secretPathsRule.check(ctx({ task: 'summarize' }));
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('No path argument found');
  });

  it('abstains when args are not an object', () => {
    expect(secretPathsRule.check(ctx(null)).allowed).toBe(true);
    expect(secretPathsRule.check(ctx('~/.ssh/id_rsa')).allowed).toBe(true);
  });

  // ===========================================================================
  // Per-glob positive / negative
  // ===========================================================================

  describe('per-glob', () => {
    // One row per glob the deriver's UNBYPASSABLE_PATH_PATTERNS carried, so the
    // list is proven to have moved whole by behaviour rather than by re-export.
    const denied: ReadonlyArray<[string, string]> = [
      ['.env', '.env'],
      ['.env.*', '.env.production'],
      ['**/.env', 'packages/app/.env'],
      ['**/.env.*', 'packages/app/.env.local'],
      ['~/.ssh/**', '~/.ssh/known_hosts'],
      ['**/ssh/id_*', 'vendor/ssh/id_dsa'],
      ['**/*_rsa', 'keys/my_rsa'],
      ['**/*_ed25519', 'keys/deploy_ed25519'],
      ['**/*.pem', 'certs/server.pem'],
      ['~/.aws/**', '~/.aws/credentials'],
      ['~/.azure/**', '~/.azure/accessTokens.json'],
      ['~/.gcp/**', '~/.gcp/key.json'],
      ['~/.config/gcloud/**', '~/.config/gcloud/application_default_credentials.json'],
      ['~/.kube/config', '~/.kube/config'],
      ['/etc/shadow', '/etc/shadow'],
      ['/etc/sudoers', '/etc/sudoers'],
      ['/etc/sudoers.d/**', '/etc/sudoers.d/admin'],
      ['**/secrets.*', 'config/secrets.yaml'],
      ['**/credentials.*', 'config/credentials.json'],
      ['**/private_key.*', 'keys/private_key.txt'],
      ['**/id_rsa*', 'backup/id_rsa.pub'],
    ];

    it.each(denied)('%s denies %s', (_glob, spelling) => {
      const decision = secretPathsRule.check(ctx({ path: spelling }));
      expect(decision.allowed).toBe(false);
      // Globs overlap (`.env` and `**/.env` both name `app/.env`); the reason
      // names the first hit, so assert the shape, not which twin fired.
      expect(decision.reason).toMatch(/matches secret-path pattern '[^']+'/);
    });

    const allowed: readonly string[] = [
      'src/index.ts',
      'README.md',
      'packages/core/src/router.ts',
      '.envrc', // `*` does not cross the `.env` boundary into a longer name
      'foo/bar/.envtest',
      'docs/environment.md',
      'src/ssh-client.ts', // not an `ssh/id_*` file
      'lib/rsa.ts', // `*_rsa` needs the underscore
      'certs/server.pem.md', // `*.pem` is anchored at the end
      'config/credentials-doc.md', // `credentials.*` needs the dot
    ];

    it.each(allowed)('allows ordinary path %s', (spelling) => {
      const decision = secretPathsRule.check(ctx({ path: spelling }));
      expect(decision.allowed).toBe(true);
    });

    it('is case-insensitive, as the deriver denylist was', () => {
      expect(secretPathsRule.check(ctx({ path: '~/.SSH/id_rsa' })).allowed).toBe(false);
      expect(secretPathsRule.check(ctx({ path: 'app/.ENV' })).allowed).toBe(false);
    });

    it('reads the same argument fields the safe-paths extractor reads', () => {
      for (const field of ['path', 'filePath', 'file_path', 'directory', 'dir', 'target']) {
        const decision = secretPathsRule.check(ctx({ [field]: '/etc/shadow' }));
        expect(decision.allowed, field).toBe(false);
      }
    });
  });

  // ===========================================================================
  // Canonicalization — the contrarian amendment
  // ===========================================================================

  describe('canonicalization before matching', () => {
    it('expands ~ and reports the canonical path, not the spelling', () => {
      const decision = secretPathsRule.check(ctx({ path: '~/.ssh/id_rsa' }));
      expect(decision.allowed).toBe(false);
      // The raw spelling would match `~/.ssh/**` too; what pins the expansion
      // is the reason naming the expanded absolute path.
      expect(decision.reason).toContain(`Path '${join(HOME, '.ssh', 'id_rsa')}'`);
      expect(decision.reason).not.toContain("Path '~/");
    });

    it('denies `../` traversal that lands on a denied file', () => {
      // Raw `/etc/passwd/../shadow` matches no glob (`/etc/shadow` is anchored
      // `^…$`); only the resolved path does. Dropping `path.resolve` fails this.
      const decision = secretPathsRule.check(ctx({ path: '/etc/passwd/../shadow' }));
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('/etc/shadow');
    });

    it('denies `../` traversal from a sibling dir into ~/.ssh', () => {
      // The raw string here does contain `/.ssh/`, so the verdict alone would
      // survive a dropped `path.resolve`; the reason must carry the resolved
      // path with no `..` left in it, and that is what the mutation trips.
      const decision = secretPathsRule.check(
        ctx({ path: `${HOME}/.ssh-backup/../.ssh/authorized_keys` })
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain(join(HOME, '.ssh', 'authorized_keys'));
      expect(decision.reason).not.toContain('..');
    });

    it('judges a traversal by where it lands, not by the segments it passes through', () => {
      // `~/.ssh/../.bashrc` resolves to `~/.bashrc`, which no glob names. The
      // `..` itself is safe-paths' business (it denies any `..`), and the two
      // rules compose AND-deny, so the firewall still refuses the call — but
      // THIS rule must report what it measured, not echo the other rule.
      const decision = secretPathsRule.check(ctx({ path: `${HOME}/.ssh/../.bashrc` }));
      expect(decision.allowed).toBe(true);
    });

    describe('symlinks', () => {
      let dir: string;
      beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'secret-paths-'));
        mkdirSync(join(dir, '.ssh'));
        writeFileSync(join(dir, '.ssh', 'id_ed25519'), 'not a real key');
        symlinkSync(join(dir, '.ssh', 'id_ed25519'), join(dir, 'notes.txt'));
        mkdirSync(join(dir, 'docs'));
        writeFileSync(join(dir, 'docs', 'guide.md'), '# guide');
        symlinkSync(join(dir, 'docs', 'guide.md'), join(dir, 'guide-link.md'));
      });
      afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
      });

      it('denies a benign-looking symlink whose target is inside a denied dir', () => {
        // Raw `<tmp>/notes.txt` matches nothing; `realpath` lands on
        // `<tmp>/.ssh/id_ed25519`, which `~/.ssh/**` (any `.ssh/` dir) and
        // `**/*_ed25519` both name. Dropping realpath fails this.
        const decision = secretPathsRule.check(ctx({ path: join(dir, 'notes.txt') }));
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain(realpathSync(join(dir, '.ssh', 'id_ed25519')));
      });

      it('allows a symlink whose target is benign (the control)', () => {
        const decision = secretPathsRule.check(ctx({ path: join(dir, 'guide-link.md') }));
        expect(decision.allowed).toBe(true);
      });

      it('falls back to the resolved path when the file does not exist', () => {
        // `realpath` throws on a missing file. The rule must not read that as
        // "cannot canonicalize, therefore allow": the resolved spelling is
        // still matched. `/etc/shadow` may or may not be readable here, so use
        // a path that certainly does not exist.
        const missing = `${dir}/nothing-here/../.aws/credentials`;
        const decision = secretPathsRule.check(ctx({ path: missing }));
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain(resolve(dir, '.aws', 'credentials'));
      });
    });
  });

  // ===========================================================================
  // What distinguishes it from safe-paths
  // ===========================================================================

  describe('composition with safe-paths', () => {
    it('denies a secret INSIDE allowedPaths, where safe-paths allows it', () => {
      // A caller widening `allowedPaths` to $HOME re-exposes ~/.ssh under
      // containment alone. This is the case the panel named as the reason
      // option A (rely on safe-paths) would misreport.
      const c = ctx({ path: join(HOME, '.ssh', 'id_rsa') }, { allowedPaths: [HOME] });
      expect(safePathsRule.check(c).allowed).toBe(true);
      expect(secretPathsRule.check(c).allowed).toBe(false);
    });

    it('denies .env inside the repo root, where safe-paths allows it', () => {
      const c = ctx({ path: './.env' });
      expect(safePathsRule.check(c).allowed).toBe(true);
      expect(secretPathsRule.check(c).allowed).toBe(false);
    });

    it('is registered in the default rule set ahead of safe-paths', () => {
      const names = createDefaultPolicyFirewall()
        .getRules()
        .map((r) => r.name);
      expect(names).toContain('secret-paths');
      expect(names.indexOf('secret-paths')).toBeLessThan(names.indexOf('safe-paths'));
    });

    it('AND-deny: the default firewall refuses a secret that every other rule would pass', () => {
      const firewall = createDefaultPolicyFirewall({ mode: 'enforce' });
      const decision = firewall.evaluate(
        ctx({ path: join(HOME, '.aws', 'credentials') }, { allowedPaths: [HOME] })
      );
      expect(decision.allowed).toBe(false);
      expect(decision.ruleName).toBe('secret-paths');
    });
  });
});

// =============================================================================
// The seam: a real registered tool call through the real firewall
// =============================================================================

type RegisteredCallback = (
  args: unknown
) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

function captureRegisteredHandler(): {
  server: { registerTool: ReturnType<typeof vi.fn> };
  getHandler: () => RegisteredCallback;
} {
  let captured: RegisteredCallback | undefined;
  const registerTool = vi.fn((_name: string, _config: unknown, cb: RegisteredCallback): void => {
    captured = cb;
  });
  return {
    server: { registerTool },
    getHandler: () => {
      if (captured === undefined) throw new Error('handler was never registered');
      return captured;
    },
  };
}

function makeLogger(): Record<string, ReturnType<typeof vi.fn>> {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

describe('secret-paths gates a real registered tool call (seam)', () => {
  afterEach(() => {
    resetGlobalPolicyFirewall();
  });

  function registerExtractSymbols(): RegisteredCallback {
    const { server, getHandler } = captureRegisteredHandler();
    registerExtractSymbolsTool(
      server as never,
      { logger: makeLogger(), rateLimiter: { tryAcquire: vi.fn().mockReturnValue(true) } } as never
    );
    return getHandler();
  }

  it('enforce: extract_symbols on ~/.ssh/id_rsa is refused before the handler runs', async () => {
    const firewallLogger = makeLogger();
    setGlobalPolicyFirewall(
      createDefaultPolicyFirewall({ mode: 'enforce', logger: firewallLogger as never })
    );
    const handler = registerExtractSymbols();

    const result = await handler({ filePath: '~/.ssh/id_rsa' });

    expect(result.isError).toBe(true);
    const text = result.content.map((c) => c.text).join('\n');
    expect(text).toContain('Policy denied');
    expect(text).toContain('~/.ssh/**');
    expect(firewallLogger.warn).toHaveBeenCalledWith(
      'Policy decision: DENIED',
      expect.objectContaining({ toolName: 'extract_symbols', ruleName: 'secret-paths' })
    );
  });

  it('warn: the same call is reported as a would-deny and proceeds', async () => {
    const firewallLogger = makeLogger();
    setGlobalPolicyFirewall(
      createDefaultPolicyFirewall({ mode: 'warn', logger: firewallLogger as never })
    );
    const handler = registerExtractSymbols();

    const result = await handler({ filePath: '~/.ssh/id_rsa' });

    // Not a policy refusal. The handler runs and fails on its own terms (no
    // such file), which is the warn-mode contract: report, do not block.
    const text = result.content.map((c) => c.text).join('\n');
    expect(text).not.toContain('Policy denied');
    expect(firewallLogger.warn).toHaveBeenCalledWith(
      'Policy denial overridden by warn mode',
      expect.objectContaining({ toolName: 'extract_symbols', ruleName: 'secret-paths' })
    );
  });

  it('control: a benign path is neither refused nor reported', async () => {
    const firewallLogger = makeLogger();
    setGlobalPolicyFirewall(
      createDefaultPolicyFirewall({ mode: 'enforce', logger: firewallLogger as never })
    );
    const handler = registerExtractSymbols();

    const result = await handler({ filePath: 'src/mcp/middleware/policy-rules.ts' });

    const text = result.content.map((c) => c.text).join('\n');
    expect(text).not.toContain('Policy denied');
    expect(firewallLogger.warn).not.toHaveBeenCalledWith(
      'Policy decision: DENIED',
      expect.anything()
    );
  });
});
