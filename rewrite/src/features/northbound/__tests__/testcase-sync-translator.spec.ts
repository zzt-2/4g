import { describe, it, expect } from 'vitest';
import {
  encodeSourceToTestCase,
  decodeTestCaseToTaskDefinition,
  makeOutCaseId,
} from '../core/testcase-sync-translator';
import type { EncodeSource } from '../core/testcase-sync-translator';
import type { CatalogMapping } from '@/features/command-ingress/core';
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
  runSubSys: 'LAS_001',
};

/** 构造 encode 源(模板定义 + 标识字段,不耦合 TaskTemplate) */
function makeSource(): EncodeSource {
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
  return {
    definition: def,
    templateId: 'tpl-1',
    templateName: '激光初始化',
    templateTags: ['laser'],
  };
}

/** 构造映射(可覆盖字段白名单) */
function makeMapping(overridable: string[], enabled = true): CatalogMapping {
  return { templateId: 'tpl-1', enabled, overridablePaths: overridable };
}

describe('encodeSourceToTestCase', () => {
  it('generates inputPars only for whitelisted paths', () => {
    const source = makeSource();
    const mapping = makeMapping([
      'step-send.send.userFieldValues.power',
      'step-delay.delay.durationMs',
    ]);
    const { testCase } = encodeSourceToTestCase(source, mapping, config);
    const parIds = testCase.inputPars.map(p => p.parId).sort();
    expect(parIds).toEqual(['step-delay.delay.durationMs', 'step-send.send.userFieldValues.power']);
  });

  it('inputPars use CaseInfoInputPar shape with fallback metadata (cnName=last seg, defaultValue=current)', () => {
    const source = makeSource();
    const mapping = makeMapping(['step-send.send.userFieldValues.power']);
    const { testCase } = encodeSourceToTestCase(source, mapping, config);
    expect(testCase.inputPars).toHaveLength(1);
    const par = testCase.inputPars[0];
    expect(par.parId).toBe('step-send.send.userFieldValues.power');
    expect(par.cnName).toBe('power'); // path 最后一段兜底
    expect(par.defaultValue).toBe('50'); // 当前值
    expect(par.type).toBe('');
    expect(par.unit).toBe('');
    expect(par.remark).toBe('');
  });

  it('skips paths not found in definition', () => {
    const source = makeSource();
    const mapping = makeMapping(['step-nonexistent.send.userFieldValues.x']);
    const { testCase } = encodeSourceToTestCase(source, mapping, config);
    expect(testCase.inputPars).toHaveLength(0);
  });

  it('fills CaseInfoNode fields from config', () => {
    const source = makeSource();
    const mapping = makeMapping([]);
    const { testCase } = encodeSourceToTestCase(source, mapping, config);
    expect(testCase.name).toBe('激光初始化');
    expect(testCase.id).toContain('tpl-1'); // id = outCaseId(快照反查键)
    expect(testCase.type).toBe('orbit');
    expect(testCase.runSubSys).toBe('LAS_001');
    expect(testCase.isParent).toBe(false);
    expect(testCase.children).toEqual([]); // 用例节点 children 为空
  });

  it('returns snapshot with deep-copied definition', () => {
    const source = makeSource();
    const mapping = makeMapping([]);
    const { snapshot } = encodeSourceToTestCase(source, mapping, config);
    expect(snapshot.templateId).toBe('tpl-1');
    expect(snapshot.definition).not.toBe(source.definition); // 不同引用(深拷贝)
    expect(snapshot.definition.steps).toEqual(source.definition.steps); // 但内容相等
  });

  it('snapshot overridablePaths come from mapping, not template', () => {
    const source = makeSource();
    const mapping = makeMapping([
      'step-send.send.userFieldValues.power',
      'step-delay.delay.durationMs',
    ]);
    const { snapshot } = encodeSourceToTestCase(source, mapping, config);
    // 关键不变量:overridablePaths 来源是 mapping(command-ingress),不是模板字段
    expect(snapshot.overridablePaths).toEqual(mapping.overridablePaths);
  });

  it('generates execSteps summary', () => {
    const source = makeSource();
    const mapping = makeMapping([]);
    const { testCase } = encodeSourceToTestCase(source, mapping, config);
    expect(testCase.execSteps).toBe('send rc-laser-on; wait-condition tm-temp; delay');
  });
});

describe('decodeTestCaseToTaskDefinition', () => {
  it('overrides whitelisted values', () => {
    const source = makeSource();
    const mapping = makeMapping(['step-send.send.userFieldValues.power']);
    const { snapshot } = encodeSourceToTestCase(source, mapping, config);
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
    const source = makeSource();
    const mapping = makeMapping([]); // 白名单空
    const { snapshot } = encodeSourceToTestCase(source, mapping, config);
    const tc: TestCaseInfo = {
      testCaseId: snapshot.outCaseId,
      inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: '99' }],
    };
    const { warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toBe('not-in-whitelist');
  });

  it('preserves non-overridable fields from snapshot', () => {
    const source = makeSource();
    const mapping = makeMapping(['step-send.send.userFieldValues.power']);
    const { snapshot } = encodeSourceToTestCase(source, mapping, config);
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
    const source = makeSource();
    const mapping = makeMapping([
      'step-send.send.userFieldValues.power',
      'step-send.send.userFieldValues.mode',
      'step-wait.wait-condition.conditions[0].threshold',
      'step-delay.delay.durationMs',
    ]);
    const { testCase, snapshot } = encodeSourceToTestCase(source, mapping, config);
    // setTestTask 下发的 inputPars 是简单 {parId,value}(与文件里的 CaseInfoInputPar 不同构)。
    // 这里模拟"甲方把当前值原样回传",value 取 encode 出的 defaultValue。
    const inputPars = testCase.inputPars.map(p => ({ parId: p.parId, value: p.defaultValue }));
    const tc: TestCaseInfo = { testCaseId: snapshot.outCaseId, inputPars };
    const { definition, warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
    expect(warnings).toHaveLength(0);
    expect(definition.steps).toEqual(source.definition.steps);
  });
});

describe('makeOutCaseId', () => {
  it('encodes templateId + timestamp', () => {
    const id = makeOutCaseId('tpl-1', 1700000000000);
    expect(id).toContain('tpl-1');
    expect(id).toContain('1700000000000');
  });
});
