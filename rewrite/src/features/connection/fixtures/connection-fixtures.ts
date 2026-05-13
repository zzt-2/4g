import type { ConnectionAdapterEvent, ConnectionAdapterErrorInput } from '../adapters';
import type { TransportConfig } from '../core';

export const serialTransportConfigFixture: TransportConfig = {
  id: 'serial-main',
  kind: 'serial',
  label: 'Main serial',
  portPath: 'COM3',
  baudRate: 115200,
};

export const tcpClientTransportConfigFixture: TransportConfig = {
  id: 'tcp-client-main',
  kind: 'tcp-client',
  label: 'TCP client',
  host: '127.0.0.1',
  port: 5001,
};

export const tcpServerTransportConfigFixture: TransportConfig = {
  id: 'tcp-server-main',
  kind: 'tcp-server',
  label: 'TCP server',
  host: '0.0.0.0',
  port: 5002,
};

export const udpTransportConfigFixture: TransportConfig = {
  id: 'udp-main',
  kind: 'udp',
  label: 'UDP',
  localHost: '0.0.0.0',
  localPort: 5003,
  remoteHost: '127.0.0.1',
  remotePort: 5004,
};

export const transportConfigFixtures = [
  serialTransportConfigFixture,
  tcpClientTransportConfigFixture,
  tcpServerTransportConfigFixture,
  udpTransportConfigFixture,
] as const;

export const invalidTransportConfigSample = {
  id: '',
  kind: 'udp',
  localHost: '',
  localPort: 70000,
  remoteHost: '',
  extraBusinessField: true,
};

export const fakeByteBatchFixture = [0x01, 0x02, 0x03, 0x04] as const;

export const fakeTimeoutErrorFixture: ConnectionAdapterErrorInput = {
  kind: 'timeout',
  message: 'Transport timeout.',
  recoverable: true,
};

export const fakeWriteFailureFixture: ConnectionAdapterErrorInput = {
  kind: 'write-failed',
  message: 'Transport write failed.',
  recoverable: true,
};

export const fakeConnectFailedErrorFixture: ConnectionAdapterErrorInput = {
  kind: 'connect-failed',
  message: 'Connect attempt failed.',
  recoverable: true,
};

export const fakeAdapterEventFixtures: readonly ConnectionAdapterEvent[] = [
  {
    kind: 'data',
    connectionId: serialTransportConfigFixture.id,
    occurredAt: '2026-05-04T00:00:01.000Z',
    bytes: fakeByteBatchFixture,
  },
  {
    kind: 'error',
    connectionId: serialTransportConfigFixture.id,
    occurredAt: '2026-05-04T00:00:02.000Z',
    error: fakeTimeoutErrorFixture,
  },
];
