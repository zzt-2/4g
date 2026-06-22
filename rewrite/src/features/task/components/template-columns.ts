import type { QTableColumn } from 'quasar';
import type { TaskTemplate } from '../core';

export interface TemplateTableRow {
  readonly templateId: string;
  readonly name: string;
  readonly scheduleKind: string;
  readonly scheduleKindDisplay: { readonly color: string; readonly label: string };
  readonly tags: readonly string[];
  readonly defaultTargetId?: string;
  readonly stepCount: number;
  readonly updatedAt: string;
  readonly _original: TaskTemplate;
}

export const templateColumns: QTableColumn[] = [
  {
    name: 'name',
    label: '模板名称',
    field: 'name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'scheduleKind',
    label: '调度类型',
    field: 'scheduleKind',
    align: 'center',
    sortable: true,
    style: 'width: 120px',
    headerStyle: 'width: 120px',
  },
  {
    name: 'tags',
    label: '标签',
    field: 'tags',
    align: 'left',
    style: 'width: 200px',
    headerStyle: 'width: 200px',
  },
  {
    name: 'defaultTargetId',
    label: '默认发送目标',
    field: 'defaultTargetId',
    align: 'left',
    style: 'width: 160px',
    headerStyle: 'width: 160px',
  },
  {
    name: 'stepCount',
    label: '步骤数',
    field: 'stepCount',
    align: 'center',
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
  {
    name: 'updatedAt',
    label: '更新时间',
    field: 'updatedAt',
    align: 'center',
    sortable: true,
    style: 'width: 160px',
    headerStyle: 'width: 160px',
  },
  {
    name: '_actions',
    label: '操作',
    field: '_actions',
    align: 'center',
    style: 'width: 160px',
    headerStyle: 'width: 160px',
  },
];
