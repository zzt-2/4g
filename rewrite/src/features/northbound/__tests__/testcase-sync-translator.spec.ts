import { describe, it, expect } from 'vitest';
import {
  encodeTaskTemplateToTestCase,
  decodeTestCaseToTaskDefinition,
  makeOutCaseId,
} from '../core/testcase-sync-translator';
import type { TaskTemplate, CustomerSyncMeta } from '@/features/task/core';
import {
  createTaskDefinition,
  createSendStep,
  createWaitConditionStep,
  createDelayStep,
} from '@/features/task/core';
import type { NorthboundTestCaseConfig, TestCaseInfo } from '../core/types';

const config: NorthboundTestCaseConfig = {
  subSysId: 'LAS_001',
  subSysName: '激光载荷',
  menuId: 'menu-1',
  menuName: '功能验证',
  caseType: 'orbit',
};

function makeTemplate(overridable: string[]): TaskTemplate {
  const def = createTaskDefinition({
    id: 'def-1',
    name: 'laser-init',
    steps: [
      createSendStep({ frameId: 'rc-laser-on', userFieldValues: { power: 50, mode: 1 } }, { id: 'step-send' }),
      createWaitConditionStep(
        { conditions: [{ frameId: 'tm-temp', fieldId: 'temp', operator: 'gt', threshold: 80 }], timeoutMs: 5000, onTimeout: 'fail' },
        { id: 'step-wait' },
      ),
      createDelayStep(3000, { id: 'step-delay' }),
    ],
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
  });
  const customerSync: CustomerSyncMeta = { enabled: true, overridablePaths: overridable };
  return {
    templateId: 'tpl-1',
    name: '激光初始化',
    tags: ['laser'],
    definition: def,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    customerSync,
  };
}

describe('encodeTaskTemplateToTestCase', () => {
  it('generates inputPars only for whitelisted paths', () => {
    const tpl = makeTemplate([
      'step-send.send.userFieldValues.power',
      'step-delay.delay.durationMs',
    ]);
    const { testCase } = encodeTaskTemplateToTestCase(tpl, config);
    const parIds = testCase.inputPars.map(p => p.parId).sort();
    expect(parIds).toEqual(['step-delay.delay.durationMs', 'step-send.send.userFieldValues.power']);
  });

  it('skips paths not found in definition', () => {
    const tpl = makeTemplate(['step-nonexistent.send.userFieldValues.x']);
    const { testCase } = encodeTaskTemplateToTestCase(tpl, config);
    expect(testCase.inputPars).toHaveLength(0);
  });

  it('fills caseTemplate fields from config', () => {
    const tpl = makeTemplate([]);
    const { testCase } = encodeTaskTemplateToTestCase(tpl, config);
    expect(testCase.caseName).toBe('激光初始化');
    expect(testCase.subSysName).toBe('激光载荷');
    expect(testCase.isParent).toBe(false);
    expect(testCase.outCaseId).toContain('tpl-1');
  });

  it('returns snapshot with deep-copied definition', () => {
    const tpl = makeTemplate([]);
    const { snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    expect(snapshot.templateId).toBe('tpl-1');
    expect(snapshot.definition).not.toBe(tpl.definition); // 不同引用(深拷贝)
    expect(snapshot.definition.steps).toEqual(tpl.definition.steps); // 但内容相等
  });

  it('generates execSteps summary', () => {
    const tpl = makeTemplate([]);
    const { testCase } = encodeTaskTemplateToTestCase(tpl, config);
    expect(testCase.execSteps).toBe('send rc-laser-on; wait-condition tm-temp; delay');
  });
});

describe('decodeTestCaseToTaskDefinition', () => {
  it('overrides whitelisted values', () => {
    const tpl = makeTemplate(['step-send.send.userFieldValues.power']);
    const { snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    const tc: TestCaseInfo = {
      testCaseId: snapshot.outCaseId,
      inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: '99' }],
    };
    const { definition, warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
    const sendStep = definition.steps[0];
    expect(sendStep.kind).toBe('send');
    if (sendStep.kind === 'send') {
      expect(sendStep.config.userFieldValues?.power).toBe(99);
    }
    expect(warnings).toHaveLength(0);
  });

  it('ignores inputPars not in whitelist + warns', () => {
    const tpl = makeTemplate([]); // 白名单空
    const { snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    const tc: TestCaseInfo = {
      testCaseId: snapshot.outCaseId,
      inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: '99' }],
    };
    const { warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toBe('not-in-whitelist');
  });

  it('preserves non-overridable fields from snapshot', () => {
    const tpl = makeTemplate(['step-send.send.userFieldValues.power']);
    const { snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    const tc: TestCaseInfo = {
      testCaseId: snapshot.outCaseId,
      inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: '99' }],
    };
    const { definition } = decodeTestCaseToTaskDefinition(tc, snapshot);
    const sendStep = definition.steps[0];
    if (sendStep.kind === 'send') {
      expect(sendStep.config.frameId).toBe('rc-laser-on'); // frameId 不可覆盖
      expect(sendStep.config.userFieldValues?.mode).toBe(1); // mode 不在白名单
    }
  });

  it('round-trip: encode then decode with no overrides = original', () => {
    const tpl = makeTemplate([
      'step-send.send.userFieldValues.power',
      'step-send.send.userFieldValues.mode',
      'step-wait.wait-condition.conditions[0].threshold',
      'step-delay.delay.durationMs',
    ]);
    const { testCase, snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    const tc: TestCaseInfo = { testCaseId: snapshot.outCaseId, inputPars: testCase.inputPars };
    const { definition, warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
    expect(warnings).toHaveLength(0);
    expect(definition.steps).toEqual(tpl.definition.steps);
  });
});

describe('makeOutCaseId', () => {
  it('encodes templateId + timestamp', () => {
    const id = makeOutCaseId('tpl-1', 1700000000000);
    expect(id).toContain('tpl-1');
    expect(id).toContain('1700000000000');
  });
});
