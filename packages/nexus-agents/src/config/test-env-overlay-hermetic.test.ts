import { expect, it } from 'vitest';

import { getDefaultRegistry } from './model-registry.js';

it('starts with shell model overlays unset and no priced codex entry (#6879)', () => {
  // Do not stub env here: this checks the environment supplied by Vitest itself.
  expect.soft(process.env['NEXUS_MODELS_OVERLAY_PATH'] ?? '').toBe('');
  expect.soft(process.env['NEXUS_MODEL_REGISTRY_OVERLAY'] ?? '').toBe('');
  expect(getDefaultRegistry().getEntry('codex').pricing).toBeUndefined();
});
