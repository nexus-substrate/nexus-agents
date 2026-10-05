/**
 * A read-only codex run refuses an account codex would fetch cloud-managed
 * config for, before that config is cached (#6977).
 *
 * Fixtures are real files under a temp CODEX_HOME; the host's ~/.codex is
 * never read. Tokens are obviously fake: a `TESTFAKE` header and signature
 * around a claims payload that carries no secret.
 *
 * @module cli-adapters/codex-cloud-config-auth.test
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cloudConfigAuthRefusal } from './codex-cloud-config-auth.js';

const FAKE_SIGNATURE = 'TESTFAKE-signature-not-real';

let codexHome: string;

beforeEach(() => {
  codexHome = mkdtempSync(join(tmpdir(), 'nexus-6977-'));
});

afterEach(() => {
  rmSync(codexHome, { recursive: true, force: true });
});

/** A JWT-shaped string whose payload carries `claims`. */
function fakeIdToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `TESTFAKE.${payload}.${FAKE_SIGNATURE}`;
}

function planToken(plan: string): string {
  return fakeIdToken({ 'https://api.openai.com/auth': { chatgpt_plan_type: plan } });
}

function writeAuth(auth: Record<string, unknown>): void {
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, 'auth.json'), JSON.stringify(auth));
}

function chatgptAuth(idToken: string): Record<string, unknown> {
  return {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: idToken,
      access_token: 'TESTFAKE-access-token',
      refresh_token: 'TESTFAKE-refresh-token',
      account_id: 'TESTFAKE-account',
    },
  };
}

describe('cloudConfigAuthRefusal: personal accounts proceed (#6977)', () => {
  it.each(['free', 'go', 'plus', 'pro', 'prolite', 'promax'])('plan %s is not refused', (plan) => {
    writeAuth(chatgptAuth(planToken(plan)));
    expect(cloudConfigAuthRefusal(codexHome, undefined)).toEqual({ ok: true, value: undefined });
  });

  it('no auth.json under the default file store: no ChatGPT login, not refused', () => {
    expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(true);
  });

  it('an explicit file store with no auth.json is not refused', () => {
    expect(cloudConfigAuthRefusal(codexHome, 'file').ok).toBe(true);
  });

  it.each(['apikey', 'bedrockApiKey', 'bedrockAccessKeys'])(
    'auth_mode %s never uses the codex backend, not refused',
    (mode) => {
      writeAuth({ auth_mode: mode, OPENAI_API_KEY: 'sk-TESTFAKE_not_a_real_key_0000' });
      expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(true);
    }
  );

  it('a legacy auth.json with only OPENAI_API_KEY resolves to apikey, not refused', () => {
    writeAuth({ OPENAI_API_KEY: 'sk-TESTFAKE_not_a_real_key_0000' });
    expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(true);
  });
});

describe('cloudConfigAuthRefusal: workspace accounts are refused (#6977)', () => {
  it.each([
    'business',
    'enterprise',
    'hc',
    'ent26',
    'enterprise_cbp_automation',
    'enterprise_cbp_usage_based',
    'edu',
    'education',
    'edu_plus',
    'edu_pro',
    'team',
    'self_serve_business_prolite',
    'self_serve_business_usage_based',
  ])('plan %s is refused', (plan) => {
    writeAuth(chatgptAuth(planToken(plan)));
    const refusal = cloudConfigAuthRefusal(codexHome, undefined);
    expect(!refusal.ok && refusal.error).toMatch(/cloud-managed config/);
  });

  it('chatgptAuthTokens mode is classified by plan like chatgpt', () => {
    writeAuth({ ...chatgptAuth(planToken('enterprise')), auth_mode: 'chatgptAuthTokens' });
    expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(false);
  });

  it('a legacy auth.json with tokens and no auth_mode resolves to chatgpt', () => {
    const { auth_mode: _mode, ...legacy } = chatgptAuth(planToken('business'));
    writeAuth(legacy);
    expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(false);
  });
});

describe('cloudConfigAuthRefusal: an unclassifiable account fails closed (#6977)', () => {
  it('a plan this module does not know is refused, not treated as personal', () => {
    writeAuth(chatgptAuth(planToken('future_workspace_plan')));
    const refusal = cloudConfigAuthRefusal(codexHome, undefined);
    expect(!refusal.ok && refusal.error).toMatch(/"future_workspace_plan"/);
  });

  it('a token with no plan claim is refused', () => {
    writeAuth(chatgptAuth(fakeIdToken({ sub: 'TESTFAKE' })));
    expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(false);
  });

  it('chatgpt mode with no tokens is refused', () => {
    writeAuth({ auth_mode: 'chatgpt' });
    expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(false);
  });

  it('an id_token that is not a decodable JWT is refused', () => {
    writeAuth(chatgptAuth('TESTFAKE-not-a-jwt'));
    expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(false);
  });

  it('an unparseable auth.json is refused', () => {
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(join(codexHome, 'auth.json'), '{');
    expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(false);
  });

  it.each(['agentIdentity', 'personalAccessToken', 'headers', 'some_future_mode'])(
    'auth_mode %s carries no offline plan and is refused',
    (mode) => {
      writeAuth({ auth_mode: mode });
      expect(cloudConfigAuthRefusal(codexHome, undefined).ok).toBe(false);
    }
  );

  it.each(['keyring', 'auto', 'ephemeral'])(
    'credential store %s is refused: the credentials are not readable here',
    (store) => {
      writeAuth(chatgptAuth(planToken('plus')));
      const refusal = cloudConfigAuthRefusal(codexHome, store);
      expect(!refusal.ok && refusal.error).toMatch(/cli_auth_credentials_store/);
    }
  );
});

describe('cloudConfigAuthRefusal: no credential reaches the refusal text (#6977)', () => {
  it('the refusal names the plan but no token material', () => {
    writeAuth(chatgptAuth(planToken('enterprise')));
    const refusal = cloudConfigAuthRefusal(codexHome, undefined);
    expect(refusal.ok).toBe(false);
    const text = refusal.ok ? '' : refusal.error;
    expect(text).toMatch(/"enterprise"/);
    expect(text).not.toMatch(/TESTFAKE/);
  });

  it('a plan claim that is not a plain identifier is not echoed', () => {
    writeAuth(chatgptAuth(planToken('TESTFAKE secret-looking value')));
    const refusal = cloudConfigAuthRefusal(codexHome, undefined);
    expect(refusal.ok).toBe(false);
    expect(refusal.ok ? '' : refusal.error).not.toMatch(/TESTFAKE/);
  });
});
