import { describe, it, expect } from 'vitest';
import { createTaskService } from '../services/task-service';
import { createFakeSendService, createFakeReceiveEventSource } from '../adapters/test-exports';
import { timedTaskDef } from '../fixtures/task-fixtures';

function createService() {
  return createTaskService({
    sendService: createFakeSendService(),
    receiveEventSource: createFakeReceiveEventSource(),
    now: () => '2026-06-11T00:00:00.000Z',
  });
}

describe('TaskService - template CRUD', () => {
  it('createTemplate 生成 templateId + createdAt/updatedAt', () => {
    const service = createService();
    const tpl = service.createTemplate('模板 A', timedTaskDef(), ['smoke']);

    expect(tpl.templateId).toBeTruthy();
    expect(typeof tpl.templateId).toBe('string');
    expect(tpl.name).toBe('模板 A');
    expect(tpl.tags).toEqual(['smoke']);
    expect(tpl.createdAt).toBe('2026-06-11T00:00:00.000Z');
    expect(tpl.updatedAt).toBe(tpl.createdAt);
  });

  it('createTemplate 默认 tags 为空数组', () => {
    const service = createService();
    const tpl = service.createTemplate('裸模板', timedTaskDef());
    expect(tpl.tags).toEqual([]);
  });

  it('listTemplates 返回全部，getTemplate 按 id 查找', () => {
    const service = createService();
    const a = service.createTemplate('A', timedTaskDef());
    const b = service.createTemplate('B', timedTaskDef());

    const list = service.listTemplates();
    expect(list.length).toBe(2);
    expect(list.map((t) => t.templateId).sort()).toEqual([a.templateId, b.templateId].sort());

    expect(service.getTemplate(a.templateId)?.name).toBe('A');
    expect(service.getTemplate('not-exist')).toBeUndefined();
  });

  it('updateTemplate 更新字段并刷新 updatedAt', () => {
    const service = createService();
    const tpl = service.createTemplate('orig', timedTaskDef());

    let callCount = 0;
    const service2 = createTaskService({
      sendService: createFakeSendService(),
      receiveEventSource: createFakeReceiveEventSource(),
      now: () => {
        callCount += 1;
        return callCount === 1 ? '2026-06-11T00:00:00.000Z' : '2026-06-11T01:00:00.000Z';
      },
    });
    const tpl2 = service2.createTemplate('orig', timedTaskDef());
    const updated = service2.updateTemplate(tpl2.templateId, { name: 'renamed', tags: ['new'] });

    expect(updated?.name).toBe('renamed');
    expect(updated?.tags).toEqual(['new']);
    expect(updated?.updatedAt).toBe('2026-06-11T01:00:00.000Z');
    expect(updated?.createdAt).toBe('2026-06-11T00:00:00.000Z');

    // 不传字段保持原值
    const untouched = service.updateTemplate(tpl.templateId, {});
    expect(untouched?.name).toBe('orig');
  });

  it('updateTemplate 不存在返回 undefined', () => {
    const service = createService();
    expect(service.updateTemplate('ghost', { name: 'x' })).toBeUndefined();
  });

  it('deleteTemplate 删除并返回 true，重复删除返回 false', () => {
    const service = createService();
    const tpl = service.createTemplate('A', timedTaskDef());

    expect(service.deleteTemplate(tpl.templateId)).toBe(true);
    expect(service.getTemplate(tpl.templateId)).toBeUndefined();
    expect(service.deleteTemplate(tpl.templateId)).toBe(false);
  });

  it('template 引用不可变：修改 listTemplates 返回值不影响内部 state', () => {
    const service = createService();
    service.createTemplate('A', timedTaskDef());

    const list1 = service.listTemplates();
    // @ts-expect-error 故意测试不可变性
    list1[0].name = 'hacked';

    const list2 = service.listTemplates();
    expect(list2[0]?.name).toBe('A');
  });
});

describe('TaskService - instanciateTemplate', () => {
  it('创建实例并追溯 templateId', () => {
    const service = createService();
    const tpl = service.createTemplate('A', timedTaskDef());

    const inst = service.instanciateTemplate(tpl.templateId);

    expect(inst.templateId).toBe(tpl.templateId);
    expect(inst.lifecycle).toBe('created');
    expect(inst.definitionRef).toEqual(tpl.definition);
  });

  it('模板修改不影响已创建实例（解耦）', () => {
    const service = createService();
    const tpl = service.createTemplate('A', timedTaskDef());

    const inst1 = service.instanciateTemplate(tpl.templateId);
    service.updateTemplate(tpl.templateId, { name: 'A-modified' });

    const instAfter = service.getInstance(inst1.instanceId);
    expect(instAfter?.definitionRef).toEqual(inst1.definitionRef);
  });

  it('实例运行不修改模板', () => {
    const service = createService();
    const tpl = service.createTemplate('A', timedTaskDef());

    service.instanciateTemplate(tpl.templateId);
    const tplAfter = service.getTemplate(tpl.templateId);

    expect(tplAfter?.updatedAt).toBe(tpl.updatedAt);
    expect(tplAfter?.name).toBe('A');
  });

  it('templateId 不存在时抛错', () => {
    const service = createService();
    expect(() => service.instanciateTemplate('ghost')).toThrow(/not found/);
  });

  it('createTask 创建的实例没有 templateId（向后兼容）', () => {
    const service = createService();
    const inst = service.createTask(timedTaskDef());
    expect(inst.templateId).toBeUndefined();
  });
});
