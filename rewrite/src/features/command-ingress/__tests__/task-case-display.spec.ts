import { describe, it, expect } from 'vitest';
import { resolveCaseStatusDisplay, isCaseFinished, TASK_CASE_STATUS_MAP } from '../components/docking/task-case-display';

describe('task-case-display', () => {
  describe('resolveCaseStatusDisplay', () => {
    it('pending → 等待 / grey / radio_button_unchecked 图标', () => {
      const d = resolveCaseStatusDisplay('pending');
      expect(d.label).toBe('等待');
      expect(d.color).toBe('grey');
      expect(d.icon).toBe('o_radio_button_unchecked');
    });

    it('running → 进行中 / primary / autorenew 图标', () => {
      const d = resolveCaseStatusDisplay('running');
      expect(d.label).toBe('进行中');
      expect(d.color).toBe('primary');
      expect(d.icon).toBe('o_autorenew');
    });

    it('passed → 通过 / positive / check_circle 图标', () => {
      const d = resolveCaseStatusDisplay('passed');
      expect(d.label).toBe('通过');
      expect(d.color).toBe('positive');
      expect(d.icon).toBe('o_check_circle');
    });

    it('failed → 失败 / negative / cancel 图标', () => {
      const d = resolveCaseStatusDisplay('failed');
      expect(d.label).toBe('失败');
      expect(d.color).toBe('negative');
      expect(d.icon).toBe('o_cancel');
    });

    it('四种状态都有映射(无遗漏)', () => {
      const statuses = ['pending', 'running', 'passed', 'failed'] as const;
      for (const s of statuses) {
        expect(TASK_CASE_STATUS_MAP[s]).toBeDefined();
      }
    });

    it('颜色只用 Quasar brand 状态色(grey/primary/positive/negative),无硬编码 hex', () => {
      const validColors = new Set(['grey', 'primary', 'positive', 'negative']);
      for (const key of Object.keys(TASK_CASE_STATUS_MAP) as Array<keyof typeof TASK_CASE_STATUS_MAP>) {
        expect(validColors.has(TASK_CASE_STATUS_MAP[key].color)).toBe(true);
      }
    });
  });

  describe('isCaseFinished', () => {
    it('passed/failed → true(终态,显示详情按钮)', () => {
      expect(isCaseFinished('passed')).toBe(true);
      expect(isCaseFinished('failed')).toBe(true);
    });

    it('pending/running → false(非终态,pending 无操作 / running 显示控制按钮)', () => {
      expect(isCaseFinished('pending')).toBe(false);
      expect(isCaseFinished('running')).toBe(false);
    });
  });
});
