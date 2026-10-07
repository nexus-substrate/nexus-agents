import { describe, expect, it } from 'vitest';
import { regionLabels } from './scroll-regions.ts';

describe('regionLabels', () => {
  it('returns no labels for no tables', () => {
    expect(regionLabels([])).toEqual([]);
  });

  it('prefers the caption, then the nearest preceding heading, then "Table N"', () => {
    expect(
      regionLabels([
        { caption: 'Voter roles', heading: 'Panel' },
        { heading: 'Environment variables' },
        {},
      ])
    ).toEqual(['Voter roles', 'Environment variables', 'Table 3']);
  });

  it('ignores blank captions and headings', () => {
    expect(regionLabels([{ caption: '  ', heading: '\n' }])).toEqual(['Table 1']);
  });

  it('keeps every label unique when tables share a heading', () => {
    expect(
      regionLabels([
        { heading: 'Status' },
        { heading: 'Status' },
        { heading: 'Other' },
        { heading: 'Status' },
      ])
    ).toEqual(['Status', 'Status (table 2)', 'Other', 'Status (table 4)']);
  });

  it('does not collide with a later caption that equals a derived label', () => {
    const labels = regionLabels([{ heading: 'A' }, { heading: 'A' }, { caption: 'A (table 2)' }]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
