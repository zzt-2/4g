import type { QTableColumn } from 'quasar';

export const fieldValueColumns: QTableColumn[] = [
  {
    name: 'frameName',
    label: '帧',
    field: 'frameName',
    align: 'left',
    sortable: true,
    style: 'min-width: 100px',
  },
  {
    name: 'fieldName',
    label: '字段',
    field: 'fieldName',
    align: 'left',
    sortable: true,
    style: 'min-width: 80px',
  },
  {
    name: 'displayValue',
    label: '值',
    field: 'displayValue',
    align: 'left',
    style: 'min-width: 80px',
  },
  {
    name: 'rawHex',
    label: '原始Hex',
    field: 'rawHex',
    align: 'left',
    style: 'min-width: 60px',
  },
  {
    name: 'updatedAt',
    label: '更新时间',
    field: 'updatedAt',
    align: 'left',
    style: 'min-width: 120px',
  },
];

export const recentInputColumns: QTableColumn[] = [
  {
    name: 'sourceLabel',
    label: '数据源',
    field: 'sourceLabel',
    align: 'left',
    style: 'min-width: 80px',
  },
  {
    name: 'kind',
    label: '类型',
    field: 'kind',
    align: 'left',
    style: 'min-width: 60px',
  },
  {
    name: 'byteLength',
    label: '字节',
    field: 'byteLength',
    align: 'right',
    style: 'min-width: 50px',
  },
  {
    name: 'hex',
    label: 'Hex',
    field: 'hex',
    align: 'left',
    style: 'min-width: 120px',
  },
  {
    name: 'occurredAt',
    label: '时间',
    field: 'occurredAt',
    align: 'left',
    style: 'min-width: 120px',
  },
];

export const panelTableColumns: QTableColumn[] = [
  {
    name: 'fieldName',
    label: '字段',
    field: 'fieldName',
    align: 'left',
    style: 'min-width: 80px',
  },
  {
    name: 'displayValue',
    label: '值',
    field: 'displayValue',
    align: 'left',
    style: 'min-width: 80px',
  },
  {
    name: 'rawHex',
    label: '原始Hex',
    field: 'rawHex',
    align: 'left',
    style: 'min-width: 80px',
  },
  {
    name: '_reorder',
    label: '',
    align: 'center',
    style: 'width: 72px',
  },
];

export const frameStatsColumns: QTableColumn[] = [
  {
    name: 'frameName',
    label: '帧名',
    field: 'frameName',
    align: 'left',
    sortable: true,
    style: 'min-width: 100px',
  },
  {
    name: 'hitCount',
    label: '匹配次数',
    field: 'hitCount',
    align: 'right',
    sortable: true,
    style: 'min-width: 80px',
  },
  {
    name: 'byteCount',
    label: '字节数',
    field: 'byteCount',
    align: 'right',
    style: 'min-width: 80px',
  },
  {
    name: 'lastMatchedAt',
    label: '最后匹配',
    field: 'lastMatchedAt',
    align: 'left',
    style: 'min-width: 120px',
  },
];
