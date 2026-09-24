import { describe, expect, it } from 'vitest';

import { redactGatewaySecrets } from './gateway-redaction.js';

describe('redactGatewaySecrets', () => {
  it('redacts the key and every header value, keeping the rest of the message', () => {
    const out = redactGatewaySecrets('401: key gw-KEY-1 tenant ten-VAL-2 route r-VAL-3', {
      apiKey: 'gw-KEY-1',
      headers: { 'X-Tenant': 'ten-VAL-2', 'X-Route': 'r-VAL-3' },
    });
    expect(out).toBe('401: key <redacted> tenant <redacted> route <redacted>');
  });

  it('uses the given placeholder', () => {
    expect(redactGatewaySecrets('k=abc-123', { apiKey: 'abc-123' }, '[X]')).toBe('k=[X]');
  });

  it('removes a value that contains another one whole', () => {
    const out = redactGatewaySecrets('saw long-SECRET-tail', {
      apiKey: 'SECRET',
      headers: { 'X-A': 'long-SECRET-tail' },
    });
    expect(out).toBe('saw <redacted>');
  });

  it('skips blank and null values rather than interleaving the marker', () => {
    const message = 'plain gateway failure';
    expect(
      redactGatewaySecrets(message, { apiKey: '', headers: { Authorization: null, 'X-B': ' ' } })
    ).toBe(message);
  });

  it('returns the message unchanged when there is nothing to redact', () => {
    expect(redactGatewaySecrets('boom', {})).toBe('boom');
  });
});
