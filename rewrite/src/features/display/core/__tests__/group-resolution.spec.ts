import { describe, it, expect } from 'vitest';
import { buildFrameGroupLookup } from '../group-resolution';
import type { DisplayGroupConfig } from '../types';

describe('buildFrameGroupLookup', () => {
  it('returns empty map for empty groups', () => {
    const lookup = buildFrameGroupLookup([]);
    expect(lookup.size).toBe(0);
  });

  it('returns empty map for groups with no frames', () => {
    const groups: DisplayGroupConfig[] = [
      { id: 'g1', label: 'Group 1', frames: [] },
    ];
    const lookup = buildFrameGroupLookup(groups);
    expect(lookup.size).toBe(0);
  });

  it('maps frame to group with visible fields', () => {
    const groups: DisplayGroupConfig[] = [
      {
        id: 'g1',
        label: 'Power',
        frames: [
          { frameId: 'frame_01', visibleFieldIds: ['voltage', 'current'] },
        ],
      },
    ];
    const lookup = buildFrameGroupLookup(groups);
    expect(lookup.size).toBe(1);
    const mapping = lookup.get('frame_01')!;
    expect(mapping.groupId).toBe('g1');
    expect(mapping.visibleFieldIds.has('voltage')).toBe(true);
    expect(mapping.visibleFieldIds.has('current')).toBe(true);
    expect(mapping.visibleFieldIds.has('temperature')).toBe(false);
  });

  it('maps multiple frames across groups', () => {
    const groups: DisplayGroupConfig[] = [
      {
        id: 'g1',
        label: 'Power',
        frames: [
          { frameId: 'frame_01', visibleFieldIds: ['voltage'] },
        ],
      },
      {
        id: 'g2',
        label: 'Thermal',
        frames: [
          { frameId: 'frame_02', visibleFieldIds: ['temperature'] },
          { frameId: 'frame_03', visibleFieldIds: ['pressure'] },
        ],
      },
    ];
    const lookup = buildFrameGroupLookup(groups);
    expect(lookup.size).toBe(3);
    expect(lookup.get('frame_01')!.groupId).toBe('g1');
    expect(lookup.get('frame_02')!.groupId).toBe('g2');
    expect(lookup.get('frame_03')!.groupId).toBe('g2');
  });

  it('returns undefined for unmapped frame', () => {
    const groups: DisplayGroupConfig[] = [
      { id: 'g1', label: 'Power', frames: [{ frameId: 'frame_01', visibleFieldIds: [] }] },
    ];
    const lookup = buildFrameGroupLookup(groups);
    expect(lookup.get('frame_99')).toBeUndefined();
  });

  it('handles empty visibleFieldIds', () => {
    const groups: DisplayGroupConfig[] = [
      { id: 'g1', label: 'Power', frames: [{ frameId: 'frame_01', visibleFieldIds: [] }] },
    ];
    const lookup = buildFrameGroupLookup(groups);
    const mapping = lookup.get('frame_01')!;
    expect(mapping.visibleFieldIds.size).toBe(0);
  });

  it('last group wins when same frameId in multiple groups', () => {
    const groups: DisplayGroupConfig[] = [
      { id: 'g1', label: 'A', frames: [{ frameId: 'f1', visibleFieldIds: ['a'] }] },
      { id: 'g2', label: 'B', frames: [{ frameId: 'f1', visibleFieldIds: ['b'] }] },
    ];
    const lookup = buildFrameGroupLookup(groups);
    expect(lookup.get('f1')!.groupId).toBe('g2');
  });
});
