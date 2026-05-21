/**
 * T001: End-to-end TCP receive data path.
 * T001c: TCP server event queue overflow.
 *
 * T001 verifies that TCP bytes flow through the entire stack:
 *   TCP server → NodeNetTransportFacade → RealNetworkAdapter → CompositeAdapter
 *   → ConnectionService → drainAdapterEvents → routingTick → ReceiveService
 *   → frame matching → field parsing → display ingest.
 *
 * T001c verifies that the connection service's bounded event buffer (EVENT_LIMIT=50)
 * correctly truncates when flooded with events via the fake adapter.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type * as net from 'net';
import type { TransportFacade } from '@/platform';
import { createNodeNetTransportFacade, startTestServer } from './helpers/node-net-transport-facade';
import { createRealNetworkAdapter } from '@/features/connection/adapters/real-network-adapter';
import { createCompositeAdapter } from '@/features/connection/adapters/composite-adapter';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import { wireFeatures } from '@/runtime/feature-wiring';
import { routingTick } from '@/runtime/routing-tick';
import { selectReceiveFieldValues, selectReceiveCounters } from '@/features/receive';
import type { FrameAsset } from '@/features/frame';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';

// ---------------------------------------------------------------------------
// Test frame definition
// ---------------------------------------------------------------------------

const TEST_FRAME: FrameAsset = {
  id: 'test-frame',
  name: 'Test Frame',
  direction: 'receive',
  fields: [
    {
      id: 'f-id',
      name: 'Identifier',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
    {
      id: 'f-value',
      name: 'Value',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
    },
  ],
  identifierRules: [
    { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xAA', logicOperator: 'and' },
  ],
};

// Test bytes: identifier=0xAA, value=42 as uint16 big-endian = [0x00, 0x2A]
// (default bigEndian in field-parser is true when frame.options is absent)
const TEST_BYTES = [0xAA, 0x00, 0x2A];
const EXPECTED_IDENTIFIER = 0xAA;
const EXPECTED_VALUE = 42;

// ---------------------------------------------------------------------------
// Skip guard: Vitest runs in Node so `net` is always available.
// The guard is kept as a pattern so this file can be reused in
// environments where network access may be restricted.
// ---------------------------------------------------------------------------
const netAvailable = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TcpTestContext {
  server: net.Server;
  port: number;
  host: string;
  facade: TransportFacade;
  features: RewriteWiredFeatures;
}

async function setupFullStack(): Promise<TcpTestContext> {
  // 1. Start a TCP test server on a random port
  const { server, port, host } = await startTestServer(() => {
    // Server does not auto-respond; test code writes manually via server socket
  });

  // 2. Create NodeNetTransportFacade
  const facade = createNodeNetTransportFacade();

  // 3. Create real-network-adapter wrapping the facade
  const networkAdapter = createRealNetworkAdapter({ transport: facade });

  // 4. Create composite adapter (no serial, only network)
  const compositeAdapter = createCompositeAdapter({ networkAdapter });

  // 5. Wire all features
  const features = wireFeatures({ connectionAdapter: compositeAdapter });

  // 6. Add the test frame definition and refresh receive references
  features.frameService.upsertFrame(TEST_FRAME);
  features.receiveService.refreshFrameReferences();

  return { server, port, host, facade, features };
}

// ---------------------------------------------------------------------------
// T001: TCP receive data path
// ---------------------------------------------------------------------------

describe.skipIf(!netAvailable)('T001: end-to-end TCP receive data path', () => {
  let ctx: TcpTestContext;
  // Track the server-side socket so we can write to it
  let serverSocket: net.Socket | null = null;

  beforeAll(async () => {
    ctx = await setupFullStack();

    // Capture the server-side socket when a client connects
    ctx.server.removeAllListeners('connection');
    ctx.server.on('connection', (socket) => {
      serverSocket = socket;
    });
  });

  afterAll(async () => {
    await ctx.features.connectionService.cleanup();
    await ctx.facade.cleanup();
    serverSocket?.destroy();
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  });

  it('connects to the TCP server via composite adapter', async () => {
    const tcpConfig = {
      kind: 'tcp-client' as const,
      id: 'tcp-client-1',
      host: ctx.host,
      port: ctx.port,
    };

    const result = await ctx.features.connectionService.connect(tcpConfig);
    expect(result.ok).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);

    // Should have a connected event
    const connectedEvent = result.events.find((e) => e.kind === 'connected');
    expect(connectedEvent).toBeDefined();
  });

  it('TCP bytes arrive at receive service after routingTick', async () => {
    // Wait for the server-side socket to be available
    // The client connected in the previous test, so serverSocket should be set
    expect(serverSocket).not.toBeNull();

    // Write test bytes from the server side to the client
    serverSocket!.write(Buffer.from(TEST_BYTES));

    // Give the TCP stack a moment to deliver the data
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Run routingTick to drain adapter events and process through receive
    const tickResult = await routingTick(ctx.features);
    expect(tickResult.ok).toBe(true);
    expect(tickResult.eventsRouted).toBeGreaterThanOrEqual(1);
  });

  it('frame matches successfully with correct field values', () => {
    const fieldValues = selectReceiveFieldValues(
      ctx.features.receiveService.getSnapshot(),
    );

    // Should have parsed fields for our test frame
    expect(fieldValues.length).toBeGreaterThanOrEqual(2);

    const idField = fieldValues.find((f) => f.fieldId === 'f-id');
    const valueField = fieldValues.find((f) => f.fieldId === 'f-value');

    expect(idField).toBeDefined();
    expect(valueField).toBeDefined();

    // Verify parsed values
    expect(idField!.value).toBe(EXPECTED_IDENTIFIER);
    expect(valueField!.value).toBe(EXPECTED_VALUE);
  });

  it('display service reflects latest parsed values', () => {
    const displaySnap = ctx.features.displayService.getSnapshot();
    expect(displaySnap.projection).toBeDefined();

    // Check that display has ingested the field values
    const table1Rows = ctx.features.displayService.getTable1Rows();
    // Table1 should have rows reflecting the ingested fields
    expect(table1Rows.length).toBeGreaterThanOrEqual(1);
  });

  it('receive counters reflect the processed batch', () => {
    const counters = selectReceiveCounters(
      ctx.features.receiveService.getSnapshot(),
    );

    expect(counters.matchedCount).toBeGreaterThanOrEqual(1);
    expect(counters.byteCount).toBeGreaterThanOrEqual(TEST_BYTES.length);
  });
});

// ---------------------------------------------------------------------------
// T001 variant: self-contained single-test version (no inter-test state)
// ---------------------------------------------------------------------------

describe.skipIf(!netAvailable)('T001 (isolated): single TCP receive cycle', () => {
  let ctx: TcpTestContext;
  let serverSocket: net.Socket | null = null;

  beforeEach(async () => {
    ctx = await setupFullStack();
    serverSocket = null;

    // Capture server-side socket
    ctx.server.removeAllListeners('connection');
    ctx.server.on('connection', (socket) => {
      serverSocket = socket;
    });
  });

  afterEach(async () => {
    await ctx.features.connectionService.cleanup();
    await ctx.facade.cleanup();
    serverSocket?.destroy();
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  });

  it('full pipeline: connect → send bytes → routingTick → verify parsed fields', async () => {
    // Connect
    const connectResult = await ctx.features.connectionService.connect({
      kind: 'tcp-client',
      id: 'tcp-client-iso',
      host: ctx.host,
      port: ctx.port,
    });
    expect(connectResult.ok).toBe(true);

    // Drain the connect events so they don't interfere with data events
    await routingTick(ctx.features);

    // Wait for server-side socket
    await new Promise<void>((resolve) => {
      const check = () => {
        if (serverSocket) resolve();
        else setTimeout(check, 10);
      };
      check();
    });

    // Send test bytes from server to client
    serverSocket!.write(Buffer.from(TEST_BYTES));

    // Wait for TCP delivery
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Process
    const tickResult = await routingTick(ctx.features);
    expect(tickResult.ok).toBe(true);
    expect(tickResult.eventsRouted).toBeGreaterThanOrEqual(1);

    // Verify receive parsed correctly
    const fieldValues = selectReceiveFieldValues(
      ctx.features.receiveService.getSnapshot(),
    );
    const idField = fieldValues.find((f) => f.fieldId === 'f-id');
    const valueField = fieldValues.find((f) => f.fieldId === 'f-value');

    expect(idField).toBeDefined();
    expect(valueField).toBeDefined();
    expect(idField!.value).toBe(EXPECTED_IDENTIFIER);
    expect(valueField!.value).toBe(EXPECTED_VALUE);

    // Verify counters
    const counters = selectReceiveCounters(
      ctx.features.receiveService.getSnapshot(),
    );
    expect(counters.matchedCount).toBeGreaterThanOrEqual(1);

    // Verify display ingested
    const tableRows = ctx.features.displayService.getTable1Rows();
    expect(tableRows.length).toBeGreaterThanOrEqual(1);
  });

  it('multiple data packets produce cumulative results', async () => {
    // Connect
    const connectResult = await ctx.features.connectionService.connect({
      kind: 'tcp-client',
      id: 'tcp-client-multi',
      host: ctx.host,
      port: ctx.port,
    });
    expect(connectResult.ok).toBe(true);

    // Drain connect events
    await routingTick(ctx.features);

    // Wait for server-side socket
    await new Promise<void>((resolve) => {
      const check = () => {
        if (serverSocket) resolve();
        else setTimeout(check, 10);
      };
      check();
    });

    // Send first packet
    serverSocket!.write(Buffer.from(TEST_BYTES));
    await new Promise((resolve) => setTimeout(resolve, 30));
    await routingTick(ctx.features);

    // Send second packet with different value (uint16 big-endian 100 = [0x00, 0x64])
    const secondPacket = [0xAA, 0x00, 0x64];
    serverSocket!.write(Buffer.from(secondPacket));
    await new Promise((resolve) => setTimeout(resolve, 30));
    await routingTick(ctx.features);

    // Verify counters show 2 matched frames
    const counters = selectReceiveCounters(
      ctx.features.receiveService.getSnapshot(),
    );
    expect(counters.matchedCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// T001c: Event queue overflow (bounded event buffer)
// ---------------------------------------------------------------------------

describe('T001c: connection service event queue overflow', () => {
  it('event list stays bounded after flooding with many data events', () => {
    // Use a fake adapter so we have full control over event injection
    const fakeAdapter = createFakeConnectionTransportAdapter();

    // Connect first to register the connection
    const features = wireFeatures({ connectionAdapter: fakeAdapter });

    features.frameService.upsertFrame(TEST_FRAME);
    features.receiveService.refreshFrameReferences();

    const connectResult = features.connectionService.connect({
      kind: 'tcp-client',
      id: 'conn-overflow',
      host: '127.0.0.1',
      port: 9999,
    });

    // Drain connect events synchronously
    // Note: connect returns a Promise but fake adapter is synchronous
    // We need to handle it properly
    return connectResult.then(() => {
      // Inject 200 data events into the fake adapter's event queue
      const EVENT_COUNT = 200;
      for (let i = 0; i < EVENT_COUNT; i++) {
        fakeAdapter.pushData('conn-overflow', [0xAA, 0x00, 0x2A]);
      }

      // Drain through the connection service
      return features.connectionService.drainAdapterEvents().then((result) => {
        expect(result.ok).toBe(true);

        // The connection state should have a bounded event list
        // EVENT_LIMIT is 50 (from lifecycle.ts)
        const snapshot = features.connectionService.getSnapshot();
        expect(snapshot.events.length).toBeLessThanOrEqual(50);
      });
    });
  });

  it('system stays stable under rapid connect/disconnect cycles', async () => {
    const fakeAdapter = createFakeConnectionTransportAdapter();
    const features = wireFeatures({ connectionAdapter: fakeAdapter });

    // Rapidly connect 100+ different connections
    const CONNECTION_COUNT = 120;
    const connectPromises = [];
    for (let i = 0; i < CONNECTION_COUNT; i++) {
      connectPromises.push(
        features.connectionService.connect({
          kind: 'tcp-client',
          id: `conn-rapid-${i}`,
          host: '127.0.0.1',
          port: 10000 + (i % 100),
        }),
      );
    }

    await Promise.all(connectPromises);

    // Verify: event list is bounded
    const snapshot = features.connectionService.getSnapshot();
    expect(snapshot.events.length).toBeLessThanOrEqual(50);

    // Verify: system hasn't crashed and runtime facts exist
    expect(snapshot.runtimeFacts.length).toBe(CONNECTION_COUNT);

    // Verify: counters reflect all connect attempts
    const totalConnects = snapshot.runtimeFacts.reduce(
      (sum, fact) => sum + fact.counters.successfulConnects,
      0,
    );
    expect(totalConnects).toBe(CONNECTION_COUNT);
  });

  it('statistics remain accurate after event truncation', async () => {
    const fakeAdapter = createFakeConnectionTransportAdapter();
    const features = wireFeatures({ connectionAdapter: fakeAdapter });

    // Connect a single connection
    await features.connectionService.connect({
      kind: 'tcp-client',
      id: 'conn-stats',
      host: '127.0.0.1',
      port: 9999,
    });

    // Push 200 data events
    const DATA_COUNT = 200;
    for (let i = 0; i < DATA_COUNT; i++) {
      fakeAdapter.pushData('conn-stats', [0x01, 0x02, 0x03]);
    }

    // Drain through connection service
    const drainResult = await features.connectionService.drainAdapterEvents();
    expect(drainResult.ok).toBe(true);

    // Event list is bounded
    const snapshot = features.connectionService.getSnapshot();
    expect(snapshot.events.length).toBeLessThanOrEqual(50);

    // But the connection's counter should still reflect all events
    const fact = snapshot.runtimeFacts.find((f) => f.connectionId === 'conn-stats');
    expect(fact).toBeDefined();

    // rxBytes should reflect all data events (3 bytes each * 200 events = 600 bytes)
    expect(fact!.counters.rxBytes).toBe(DATA_COUNT * 3);

    // The fact should exist and have accurate counters regardless of event truncation
    expect(fact!.counters.errorCount).toBe(0);
  });
});
