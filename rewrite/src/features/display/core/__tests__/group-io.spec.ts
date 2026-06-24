import { describe, it, expect } from 'vitest';
import { serializeGroups, parseGroupsFromJson } from '../group-io';
import type { DisplayGroupConfig } from '../types';

const sampleGroups: DisplayGroupConfig[] = [
  {
    id: 'g1',
    label: '电压组',
    frames: [
      { frameId: 'frame1', visibleFieldIds: ['voltage', 'current'] },
      { frameId: 'frame2', visibleFieldIds: [] },
    ],
  },
  { id: 'g2', label: '温度组', frames: [] },
];

describe('serializeGroups / parseGroupsFromJson 往返', () => {
  it('导出再导入应还原相同结构', () => {
    const json = serializeGroups(sampleGroups);
    const parsed = parseGroupsFromJson(json);
    expect(parsed).toEqual(sampleGroups);
  });

  it('导出是带缩进的 JSON 数组', () => {
    const json = serializeGroups(sampleGroups);
    expect(json.startsWith('[\n  {')).toBe(true);
    expect(JSON.parse(json)).toHaveLength(2);
  });
});

describe('parseGroupsFromJson 校验', () => {
  it('合法分组数组通过', () => {
    const json = JSON.stringify([
      { id: 'a', label: 'A', frames: [{ frameId: 'f1', visibleFieldIds: ['x'] }] },
    ]);
    const result = parseGroupsFromJson(json);
    expect(result).toHaveLength(1);
    expect(result[0].frames[0].visibleFieldIds).toEqual(['x']);
  });

  it('非 JSON 文本抛"格式错误"', () => {
    expect(() => parseGroupsFromJson('not json {')).toThrow('JSON 格式错误');
  });

  it('非数组（对象）抛"应为分组数组"', () => {
    expect(() => parseGroupsFromJson('{"id":"x"}')).toThrow('内容应为分组数组');
  });

  it('数组项缺 id 抛错并定位', () => {
    const json = JSON.stringify([{ label: 'A', frames: [] }]);
    expect(() => parseGroupsFromJson(json)).toThrow('第 1 项缺少 id');
  });

  it('id 为空字符串抛错（防无效分组）', () => {
    const json = JSON.stringify([{ id: '', label: 'A', frames: [] }]);
    expect(() => parseGroupsFromJson(json)).toThrow('第 1 项缺少 id');
  });

  it('frames 项缺 frameId 抛错并定位', () => {
    const json = JSON.stringify([{ id: 'a', label: 'A', frames: [{ visibleFieldIds: [] }] }]);
    expect(() => parseGroupsFromJson(json)).toThrow('第 1 项第 1 个帧缺少 frameId');
  });

  it('visibleFieldIds 非数组抛错', () => {
    const json = JSON.stringify([{ id: 'a', label: 'A', frames: [{ frameId: 'f1', visibleFieldIds: 'oops' }] }]);
    expect(() => parseGroupsFromJson(json)).toThrow('visibleFieldIds 不是数组');
  });

  it('visibleFieldIds 里的非字符串项被静默过滤（容错）', () => {
    const json = JSON.stringify([{ id: 'a', label: 'A', frames: [{ frameId: 'f1', visibleFieldIds: ['ok', 123, null, 'good'] }] }]);
    const result = parseGroupsFromJson(json);
    expect(result[0].frames[0].visibleFieldIds).toEqual(['ok', 'good']);
  });

  it('空数组通过（导入空分组=清空）', () => {
    expect(parseGroupsFromJson('[]')).toEqual([]);
  });
});
