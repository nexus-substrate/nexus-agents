/**
 * WeatherPanel — Rendering tests.
 *
 * Mocks nexus-agents to avoid transitive dependency issues.
 *
 * @module tui/components/weather-panel.test
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('nexus-agents', () => ({
  generateWeatherReport: vi.fn().mockReturnValue({
    cliWeather: [
      { cli: 'claude', successRate: 0.85, totalTasks: 20 },
      { cli: 'codex', successRate: 0.7, totalTasks: 10 },
    ],
  }),
}));

import React from 'react';
import { render } from 'ink-testing-library';
import { WeatherPanel } from './weather-panel.js';

describe('WeatherPanel', () => {
  it('renders panel title', () => {
    const { lastFrame } = render(<WeatherPanel focused={false} />);
    expect(lastFrame()).toContain('Weather');
  });

  it('renders weather data after loading', async () => {
    const { lastFrame } = render(<WeatherPanel focused={false} />);
    // Give async loadWeather time to resolve
    await new Promise((r) => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('claude');
  });
});
