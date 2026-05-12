import { describe, expect, it, vi } from 'vitest';
import { createRealNetworkAdapter } from '../adapters/real-network-adapter';
import type { CreateRealNetworkAdapterOptions } from '../adapters/real-network-adapter';
import type { TransportFacade } from '@/platform';
import type {
  TransportBridgeEvent,
  TransportCommandResult,
} from '@/shared/platform-bridge';
import {
  tcpClientTransportConfigFixture,
  tcpServerTransportConfigFixture,
  udpTransportConfigFixture,
  serialTransportConfigFixture,
  fakeByteBatchFixture,
} from '../fixtures/connection-fixtures';
import type { TcpClientTransportConfig, TcpServerTransportConfig, UdpTransportConfig, TransportConfig } from '../core';

const tcpClientConfig = tcpClientTransportConfigFixture as TcpClientTransportConfig;
const tcpServerConfig = tcpServerTransportConfigFixture as TcpServerTransportConfig;
const udpConfig = udpTransportConfigFixture as UdpTransportConfig;

// --- Mock helpers ---

function createTestClock(): () => string {
  return () => '2026-05-04T00:00:01.000Z';
}

function okResult(events: readonly TransportBridgeEvent[] = []): TransportCommandResult {
  return { ok: true, events };
}

function failResult(
  error: { kind: string; message: string; recoverable?: boolean },
  events: readonly TransportBridgeEvent[] = [],
): TransportCommandResult {
  return { ok: false, events, error };
}

function makeBridgeEvent(overrides: Partial<TransportBridgeEvent>): TransportBridgeEvent {
  return {
    kind: 'connected',
    connectionId: 'test-conn',
    occurredAt: '2026-05-04T00:00:01.000Z',
    ...overrides,
  };
}

function createMockTransport(overrides: Partial<TransportFacade> = {}): TransportFacade {
  return {
    enumerateSerialPorts: vi.fn(async () => []),
    connect: vi.fn(async () => okResult()),
    disconnect: vi.fn(async () => okResult()),
    write: vi.fn(async () => okResult()),
    cleanup: vi.fn(async () => okResult()),
    drainEvents: vi.fn(() => []),
    onEvent: vi.fn(() => () => {}),
    ...overrides,
  };
}

function createAdapter(transport: TransportFacade) {
  const options: CreateRealNetworkAdapterOptions = {
    transport,
    now: createTestClock(),
  };
  return createRealNetworkAdapter(options);
}

// --- TCP Client Tests ---

describe('RealNetworkAdapter tcp-client', () => {
  it('connects and returns mapped events', async () => {
    const connectedEvent = makeBridgeEvent({
      kind: 'connected',
      connectionId: tcpClientTransportConfigFixture.id,
      target: {
        targetId: 'transport:tcp-client-main',
        kind: 'tcp-client',
        role: 'tcp-client-peer',
        label: 'TCP client',
        routeLabel: '127.0.0.1:5001',
      },
    });
    const transport = createMockTransport({
      connect: vi.fn(async () => okResult([connectedEvent])),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(tcpClientTransportConfigFixture);

    expect(outcome).toEqual({
      ok: true,
      events: [
        {
          kind: 'connected',
          connectionId: tcpClientTransportConfigFixture.id,
          occurredAt: connectedEvent.occurredAt,
          target: {
            targetId: 'transport:tcp-client-main',
            connectionId: tcpClientTransportConfigFixture.id,
            kind: 'tcp-client',
            role: 'tcp-client-peer',
            label: 'TCP client',
            routeLabel: '127.0.0.1:5001',
            available: true,
          },
        },
      ],
    });

    expect(transport.connect).toHaveBeenCalledWith({
      kind: 'tcp-client',
      id: tcpClientTransportConfigFixture.id,
      host: tcpClientConfig.host,
      port: tcpClientConfig.port,
    });
  });

  it('disconnects and returns mapped events', async () => {
    const transport = createMockTransport();
    const adapter = createAdapter(transport);

    await adapter.connect(tcpClientTransportConfigFixture);
    const outcome = await adapter.disconnect(tcpClientTransportConfigFixture.id);

    expect(outcome.ok).toBe(true);
    expect(transport.disconnect).toHaveBeenCalledWith(tcpClientTransportConfigFixture.id);
  });

  it('writes and returns write-accepted event', async () => {
    const transport = createMockTransport();
    const adapter = createAdapter(transport);

    await adapter.connect(tcpClientTransportConfigFixture);
    const outcome = await adapter.write({
      connectionId: tcpClientTransportConfigFixture.id,
      bytes: fakeByteBatchFixture,
    });

    expect(outcome).toEqual({
      ok: true,
      events: [
        {
          kind: 'write-accepted',
          connectionId: tcpClientTransportConfigFixture.id,
          occurredAt: '2026-05-04T00:00:01.000Z',
          byteLength: fakeByteBatchFixture.length,
        },
      ],
    });
  });

  it('drains events from transport', async () => {
    const dataEvent = makeBridgeEvent({
      kind: 'data',
      connectionId: tcpClientTransportConfigFixture.id,
      bytes: [0xaa, 0xbb],
      byteLength: 2,
    });
    const transport = createMockTransport({
      drainEvents: vi.fn(() => [dataEvent]),
    });
    const adapter = createAdapter(transport);

    const events = await adapter.drainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('data');
  });

  it('maps connect-failed on tcp-client connect error', async () => {
    const transport = createMockTransport({
      connect: vi.fn(async () =>
        failResult({
          kind: 'connect-failed',
          message: 'Connection refused',
          recoverable: true,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(tcpClientTransportConfigFixture);
    expect(outcome).toEqual({
      ok: false,
      error: {
        kind: 'connect-failed',
        message: 'Connection refused',
        recoverable: true,
      },
      events: [],
    });
  });

  it('maps timeout error on tcp-client connect', async () => {
    const transport = createMockTransport({
      connect: vi.fn(async () =>
        failResult({
          kind: 'timeout',
          message: 'Connection timed out',
          recoverable: true,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(tcpClientTransportConfigFixture);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('timeout');
      expect(outcome.error.message).toBe('Connection timed out');
    }
  });

  it('falls back to connect-failed on unknown error kind', async () => {
    const transport = createMockTransport({
      connect: vi.fn(async () =>
        failResult({
          kind: 'unknown-error',
          message: 'Something went wrong',
          recoverable: false,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(tcpClientTransportConfigFixture);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('connect-failed');
    }
  });
});

// --- TCP Server Tests ---

describe('RealNetworkAdapter tcp-server', () => {
  it('connects as listener', async () => {
    const listenerEvent = makeBridgeEvent({
      kind: 'connected',
      connectionId: tcpServerTransportConfigFixture.id,
      target: {
        targetId: 'transport:tcp-server-main',
        kind: 'tcp-server',
        role: 'tcp-server-listener',
        label: 'TCP server',
        routeLabel: '0.0.0.0:5002',
      },
    });
    const transport = createMockTransport({
      connect: vi.fn(async () => okResult([listenerEvent])),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(tcpServerTransportConfigFixture);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.events[0]!.kind).toBe('connected');
    }

    expect(transport.connect).toHaveBeenCalledWith({
      kind: 'tcp-server',
      id: tcpServerTransportConfigFixture.id,
      host: tcpServerConfig.host,
      port: tcpServerConfig.port,
    });
  });

  it('maps client connected events via drainEvents', async () => {
    const clientEvent = makeBridgeEvent({
      kind: 'connected',
      connectionId: `${tcpServerTransportConfigFixture.id}::client:192.168.1.5:12345`,
      target: {
        targetId: 'transport:tcp-server-main-client-1',
        kind: 'tcp-server',
        role: 'tcp-server-client',
        label: 'Client 192.168.1.5:12345',
        routeLabel: '192.168.1.5:12345',
      },
    });
    const transport = createMockTransport({
      drainEvents: vi.fn(() => [clientEvent]),
    });
    const adapter = createAdapter(transport);

    const events = await adapter.drainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('connected');
    if (events[0]!.kind === 'connected' && events[0]!.target) {
      expect(events[0]!.target.role).toBe('tcp-server-client');
    }
  });

  it('disconnects listener and returns events for clients + listener', async () => {
    const clientDisconnected = makeBridgeEvent({
      kind: 'disconnected',
      connectionId: `${tcpServerTransportConfigFixture.id}::client:192.168.1.5:12345`,
      target: {
        targetId: 'transport:tcp-server-main-client-1',
        kind: 'tcp-server',
        role: 'tcp-server-client',
        label: 'Client 192.168.1.5:12345',
        routeLabel: '192.168.1.5:12345',
      },
    });
    const listenerDisconnected = makeBridgeEvent({
      kind: 'disconnected',
      connectionId: tcpServerTransportConfigFixture.id,
      target: {
        targetId: 'transport:tcp-server-main',
        kind: 'tcp-server',
        role: 'tcp-server-listener',
        label: 'TCP server',
        routeLabel: '0.0.0.0:5002',
      },
    });
    const transport = createMockTransport({
      disconnect: vi.fn(async () =>
        okResult([clientDisconnected, listenerDisconnected]),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.disconnect(tcpServerTransportConfigFixture.id);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.events).toHaveLength(2);
      expect(outcome.events[0]!.kind).toBe('disconnected');
      expect(outcome.events[1]!.kind).toBe('disconnected');
    }
  });

  it('maps listen-failed on tcp-server connect error', async () => {
    const transport = createMockTransport({
      connect: vi.fn(async () =>
        failResult({
          kind: 'listen-failed',
          message: 'Port already in use',
          recoverable: true,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(tcpServerTransportConfigFixture);
    expect(outcome).toEqual({
      ok: false,
      error: {
        kind: 'listen-failed',
        message: 'Port already in use',
        recoverable: true,
      },
      events: [],
    });
  });

  it('falls back to listen-failed on unknown tcp-server error', async () => {
    const transport = createMockTransport({
      connect: vi.fn(async () =>
        failResult({
          kind: 'some-other-error',
          message: 'Unknown',
          recoverable: false,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(tcpServerTransportConfigFixture);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('listen-failed');
    }
  });
});

// --- UDP Tests ---

describe('RealNetworkAdapter udp', () => {
  it('connects and writes with remote target', async () => {
    const transport = createMockTransport();
    const adapter = createAdapter(transport);

    const connectOutcome = await adapter.connect(udpTransportConfigFixture);
    expect(connectOutcome.ok).toBe(true);

    expect(transport.connect).toHaveBeenCalledWith({
      kind: 'udp',
      id: udpTransportConfigFixture.id,
      localHost: udpConfig.localHost,
      localPort: udpConfig.localPort,
      remoteHost: udpConfig.remoteHost,
      remotePort: udpConfig.remotePort,
    });

    const writeOutcome = await adapter.write({
      connectionId: udpTransportConfigFixture.id,
      bytes: fakeByteBatchFixture,
    });
    expect(writeOutcome.ok).toBe(true);
    if (writeOutcome.ok) {
      expect(writeOutcome.events[0]!.kind).toBe('write-accepted');
    }
  });

  it('returns write-failed for UDP without remote target', async () => {
    const transport = createMockTransport();
    const adapter = createAdapter(transport);

    const udpNoRemote: TransportConfig = {
      id: 'udp-no-remote',
      kind: 'udp',
      localHost: '0.0.0.0',
      localPort: 5003,
    };

    await adapter.connect(udpNoRemote);
    const writeOutcome = await adapter.write({
      connectionId: udpNoRemote.id,
      bytes: fakeByteBatchFixture,
    });

    expect(writeOutcome).toEqual({
      ok: false,
      error: {
        kind: 'write-failed',
        message: 'UDP write requires remoteHost and remotePort',
        recoverable: true,
      },
      events: [
        {
          kind: 'write-failed',
          connectionId: udpNoRemote.id,
          occurredAt: '2026-05-04T00:00:01.000Z',
          byteLength: fakeByteBatchFixture.length,
          error: {
            kind: 'write-failed',
            message: 'UDP write requires remoteHost and remotePort',
            recoverable: true,
          },
        },
      ],
    });

    expect(transport.write).not.toHaveBeenCalled();
  });

  it('maps bind-failed on udp connect error', async () => {
    const transport = createMockTransport({
      connect: vi.fn(async () =>
        failResult({
          kind: 'bind-failed',
          message: 'Address already in use',
          recoverable: true,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(udpTransportConfigFixture);
    expect(outcome).toEqual({
      ok: false,
      error: {
        kind: 'bind-failed',
        message: 'Address already in use',
        recoverable: true,
      },
      events: [],
    });
  });

  it('falls back to bind-failed on unknown udp error', async () => {
    const transport = createMockTransport({
      connect: vi.fn(async () =>
        failResult({
          kind: 'mystery',
          message: '???',
          recoverable: false,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(udpTransportConfigFixture);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('bind-failed');
    }
  });
});

// --- Serial Rejection ---

describe('RealNetworkAdapter serial rejection', () => {
  it('rejects serial config with invalid-config error', async () => {
    const transport = createMockTransport();
    const adapter = createAdapter(transport);

    const outcome = await adapter.connect(serialTransportConfigFixture);
    expect(outcome).toEqual({
      ok: false,
      error: {
        kind: 'invalid-config',
        message:
          'RealNetworkAdapter only accepts tcp-client, tcp-server, udp configs, got serial',
        recoverable: false,
      },
      events: [
        {
          kind: 'error',
          connectionId: serialTransportConfigFixture.id,
          occurredAt: '2026-05-04T00:00:01.000Z',
          error: {
            kind: 'invalid-config',
            message:
              'RealNetworkAdapter only accepts tcp-client, tcp-server, udp configs, got serial',
            recoverable: false,
          },
        },
      ],
    });

    expect(transport.connect).not.toHaveBeenCalled();
  });
});

// --- Cleanup ---

describe('RealNetworkAdapter cleanup', () => {
  it('clears internal config store', async () => {
    const transport = createMockTransport();
    const adapter = createAdapter(transport);

    await adapter.connect(tcpClientTransportConfigFixture);
    await adapter.connect(udpTransportConfigFixture);

    const cleanupOutcome = await adapter.cleanup();
    expect(cleanupOutcome.ok).toBe(true);

    // After cleanup, configStore is cleared, so UDP remote check is skipped.
    await adapter.write({
      connectionId: udpTransportConfigFixture.id,
      bytes: fakeByteBatchFixture,
    });
    // Since configStore was cleared, the storedConfig is undefined,
    // so the UDP remote check is skipped and it goes through transport.write
    expect(transport.write).toHaveBeenCalled();
  });
});

// --- Disconnect error mapping ---

describe('RealNetworkAdapter disconnect errors', () => {
  it('maps close-failed fallback on disconnect error', async () => {
    const transport = createMockTransport({
      disconnect: vi.fn(async () =>
        failResult({
          kind: 'unknown',
          message: 'Disconnect failed',
          recoverable: true,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    const outcome = await adapter.disconnect('some-connection');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('close-failed');
      expect(outcome.error.message).toBe('Disconnect failed');
    }
  });
});

// --- Write error mapping ---

describe('RealNetworkAdapter write errors', () => {
  it('maps write-failed on transport write error', async () => {
    const transport = createMockTransport({
      write: vi.fn(async () =>
        failResult({
          kind: 'write-failed',
          message: 'Broken pipe',
          recoverable: true,
        }),
      ),
    });
    const adapter = createAdapter(transport);

    await adapter.connect(tcpClientTransportConfigFixture);
    const outcome = await adapter.write({
      connectionId: tcpClientTransportConfigFixture.id,
      bytes: fakeByteBatchFixture,
    });

    expect(outcome).toEqual({
      ok: false,
      error: {
        kind: 'write-failed',
        message: 'Broken pipe',
        recoverable: true,
      },
      events: [
        {
          kind: 'write-failed',
          connectionId: tcpClientTransportConfigFixture.id,
          occurredAt: '2026-05-04T00:00:01.000Z',
          byteLength: fakeByteBatchFixture.length,
          error: {
            kind: 'write-failed',
            message: 'Broken pipe',
            recoverable: true,
          },
        },
      ],
    });
  });
});
