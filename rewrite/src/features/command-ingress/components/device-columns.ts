import type { QTableColumn } from 'quasar';

/** 中心对接「设备列表」表格列定义。原 CommandIngressPage 内联 DEVICE_COLUMNS，按 T2 提取。 */
export const deviceColumns: QTableColumn[] = [
  { name: 'name', label: '设备名称', field: 'name', align: 'left', sortable: true },
  { name: 'deviceId', label: '设备ID', field: 'deviceId', align: 'left', sortable: true },
  { name: 'type', label: '类型', field: 'type', align: 'center', sortable: true, style: 'width: 80px', headerStyle: 'width: 80px' },
  { name: 'ip', label: 'IP', field: 'ip', align: 'left', sortable: true },
  { name: 'status', label: '状态', field: 'status', align: 'center', sortable: true, style: 'width: 100px', headerStyle: 'width: 100px' },
  { name: 'actions', label: '操作', field: 'actions', align: 'center', sortable: false, style: 'width: 80px', headerStyle: 'width: 80px' },
];
