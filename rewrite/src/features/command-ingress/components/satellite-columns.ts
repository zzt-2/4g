import type { QTableColumn } from 'quasar';

export interface SatelliteRow {
  readonly satelliteId: string;
  readonly commandConfigs?: readonly unknown[];
  readonly [key: string]: unknown;
}

export const satelliteColumns: QTableColumn<SatelliteRow>[] = [
  {
    name: 'satelliteId',
    label: '卫星ID',
    field: 'satelliteId',
    align: 'left',
    sortable: true,
  },
  {
    name: 'commandCount',
    label: '命令数',
    field: (row: SatelliteRow) => {
      const configs = row.commandConfigs;
      return configs?.length ?? 0;
    },
    align: 'right',
    sortable: true,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
  {
    name: 'actions',
    label: '操作',
    field: 'actions',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
    headerStyle: 'width: 100px',
  },
];
