import type {
  ConnectionStatusMaterial,
  ReceiveFieldMaterial,
  ReceiveStatsMaterial,
  StatusSnapshot,
} from '../core';

// --- Connection material fixtures ---

export const connectedConnectionMaterial: ConnectionStatusMaterial = {
  connectionId: 'conn-serial-1',
  lifecycle: 'connected',
  errorCount: 0,
  available: true,
};

export const errorConnectionMaterial: ConnectionStatusMaterial = {
  connectionId: 'conn-tcp-1',
  lifecycle: 'error',
  errorCount: 3,
  lastError: 'Connection refused',
  available: false,
};

export const connectingConnectionMaterial: ConnectionStatusMaterial = {
  connectionId: 'conn-tcp-2',
  lifecycle: 'connecting',
  errorCount: 0,
  available: false,
};

// --- Receive material fixtures ---

export const healthyReceiveStats: ReceiveStatsMaterial = {
  matchedCount: 150,
  unmatchedCount: 2,
  errorCount: 0,
};

export const errorReceiveStats: ReceiveStatsMaterial = {
  matchedCount: 10,
  unmatchedCount: 50,
  errorCount: 5,
};

export const noMatchReceiveStats: ReceiveStatsMaterial = {
  matchedCount: 0,
  unmatchedCount: 30,
  errorCount: 0,
};

export const sampleReceiveFields: ReceiveFieldMaterial[] = [
  { groupId: 'group-1', dataItemId: 'field-voltage', value: 12.5, receivedAt: '2026-05-06T10:00:00.000Z' },
  { groupId: 'group-1', dataItemId: 'field-temperature', value: 25.3, receivedAt: '2026-05-06T10:00:00.000Z' },
  { groupId: 'group-2', dataItemId: 'field-pressure', value: 101.3, receivedAt: '2026-05-06T10:00:01.000Z' },
];

export const noDataReceiveFields: ReceiveFieldMaterial[] = [];

// --- Indicator config fixtures ---

export const validIndicatorConfigs = [
  {
    id: 'indicator-voltage',
    label: 'Voltage',
    groupId: 'group-1',
    dataItemId: 'field-voltage',
    enabled: true,
    warningThreshold: 15,
    errorThreshold: 20,
  },
  {
    id: 'indicator-temperature',
    label: 'Temperature',
    groupId: 'group-1',
    dataItemId: 'field-temperature',
    enabled: true,
    rangeMin: -10,
    rangeMax: 60,
  },
  {
    id: 'indicator-pressure',
    label: 'Pressure',
    groupId: 'group-2',
    dataItemId: 'field-pressure',
    enabled: false,
  },
];

export const partialIndicatorConfigs = [
  { id: 'indicator-no-binding', label: 'No Binding', groupId: '', dataItemId: '', enabled: true },
];

export const invalidIndicatorConfigs = [
  { label: 'Missing ID' },
  null,
  undefined,
  'not-an-object',
];

export const disabledIndicatorConfig = {
  id: 'indicator-disabled',
  label: 'Disabled',
  groupId: 'group-1',
  dataItemId: 'field-voltage',
  enabled: false,
};

// --- Expected snapshot fixtures ---

export const defaultStatusFixture: StatusSnapshot = {
  schemaVersion: 1,
  health: {
    overallLevel: 'unknown',
    sources: [],
  },
  indicators: [],
  indicatorConfigs: [],
};
