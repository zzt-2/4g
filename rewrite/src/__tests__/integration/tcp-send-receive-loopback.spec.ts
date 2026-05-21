/**
 * T001b: Send -> Receive TCP loopback (frame-level round-trip).
 *
 * This is the MOST CRITICAL integration test. It verifies the complete
 * round-trip: send constructs frame bytes -> TCP carries them -> echo
 * bounces back -> receive parses them back -> values match.
 *
 * Verification points:
 * 1. Checksum round-trip (send writes, receive reads, consistent)
 * 2. Factor round-trip (send applies inverse, receive applies forward, value restored)
 * 3. Byte order round-trip (big-endian both ways)
 * 4. Length field round-trip (send auto-fills, receive uses to frame)
 * 5. Multi-field mixed frame complete round-trip
 * 6. Multiple sequential sends on same connection
 * 7. Send result kind and statistics
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { Server } from 'net';
import { wireFeatures } from '@/runtime/feature-wiring';
import { routingTick } from '@/runtime/routing-tick';
import { createRealNetworkAdapter } from '@/features/connection/adapters/real-network-adapter';
import { createCompositeAdapter } from '@/features/connection/adapters/composite-adapter';
import {
  createNodeNetTransportFacade,
  startEchoServer,
} from './helpers/node-net-transport-facade';
import type { FrameAsset } from '@/features/frame';
import type { SendOptions } from '@/features/send';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';

// ---------------------------------------------------------------------------
// Frame definitions
// ---------------------------------------------------------------------------

/**
 * Simple 3-field send frame: header(uint8) + value(uint16) + checksum(uint8).
 * Total = 4 bytes. autoChecksum with sum8 over fields [0..1].
 */
const sendFrame: FrameAsset = {
  id: 'send-frame-1',
  name: 'Send Test Frame',
  direction: 'send',
  fields: [
    {
      id: 'sf-header',
      name: 'Header',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xAA',
    },
    {
      id: 'sf-value',
      name: 'Value',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
    },
    {
      id: 'sf-checksum',
      name: 'Checksum',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      validOption: {
        isChecksum: true,
        startFieldIndex: 0,
        endFieldIndex: 1,
        checksumMethod: 'sum8',
      },
      defaultValue: '0',
    },
  ],
  identifierRules: [],
  options: { autoChecksum: true, bigEndian: true, includeLengthField: false },
};

/**
 * Matching receive frame. Identifier rule: byte[0] == 0xAA.
 */
const receiveFrame: FrameAsset = {
  id: 'recv-frame-1',
  name: 'Receive Test Frame',
  direction: 'receive',
  fields: [
    {
      id: 'rf-header',
      name: 'Header',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
    {
      id: 'rf-value',
      name: 'Value',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
    {
      id: 'rf-checksum',
      name: 'Checksum',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
  ],
  identifierRules: [
    {
      startIndex: 0,
      endIndex: 0,
      operator: 'eq',
      value: '0xAA',
      logicOperator: 'and',
    },
  ],
  options: { autoChecksum: true, bigEndian: true, includeLengthField: false },
};

// ---------------------------------------------------------------------------
// Frame with factor
// ---------------------------------------------------------------------------

const sendFrameWithFactor: FrameAsset = {
  id: 'send-factor-frame',
  name: 'Send Factor Frame',
  direction: 'send',
  fields: [
    {
      id: 'sf-temp',
      name: 'Temperature',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
      factor: 0.1,
      bigEndian: true,
    },
    {
      id: 'sf-fcsum',
      name: 'Checksum',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      validOption: {
        isChecksum: true,
        startFieldIndex: 0,
        endFieldIndex: 0,
        checksumMethod: 'sum8',
      },
      defaultValue: '0',
    },
  ],
  identifierRules: [],
  options: { autoChecksum: true, bigEndian: true, includeLengthField: false },
};

const receiveFrameWithFactor: FrameAsset = {
  id: 'recv-factor-frame',
  name: 'Receive Factor Frame',
  direction: 'receive',
  fields: [
    {
      id: 'rf-temp',
      name: 'Temperature',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      factor: 0.1,
      bigEndian: true,
    },
    {
      id: 'rf-fcsum',
      name: 'Checksum',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
  ],
  identifierRules: [
    {
      startIndex: 0,
      endIndex: 1,
      operator: 'any',
      value: '0',
      logicOperator: 'and',
    },
  ],
  options: { autoChecksum: true, bigEndian: true, includeLengthField: false },
};

// ---------------------------------------------------------------------------
// Frame with length field
// ---------------------------------------------------------------------------

const sendFrameWithLength: FrameAsset = {
  id: 'send-len-frame',
  name: 'Send Length Frame',
  direction: 'send',
  fields: [
    {
      id: 'sf-len',
      name: 'Length',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
    },
    {
      id: 'sf-payload',
      name: 'Payload',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
      bigEndian: true,
    },
    {
      id: 'sf-lcsum',
      name: 'Checksum',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      validOption: {
        isChecksum: true,
        startFieldIndex: 0,
        endFieldIndex: 1,
        checksumMethod: 'sum8',
      },
      defaultValue: '0',
    },
  ],
  identifierRules: [],
  options: {
    autoChecksum: true,
    bigEndian: true,
    includeLengthField: true,
    lengthFieldId: 'sf-len',
  },
};

const receiveFrameWithLength: FrameAsset = {
  id: 'recv-len-frame',
  name: 'Receive Length Frame',
  direction: 'receive',
  fields: [
    {
      id: 'rf-len',
      name: 'Length',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
    {
      id: 'rf-payload',
      name: 'Payload',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      bigEndian: true,
    },
    {
      id: 'rf-lcsum',
      name: 'Checksum',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
  ],
  identifierRules: [
    {
      startIndex: 0,
      endIndex: 0,
      operator: 'any',
      value: '0',
      logicOperator: 'and',
    },
  ],
  options: { autoChecksum: true, bigEndian: true, includeLengthField: false },
};

// ---------------------------------------------------------------------------
// Multi-field mixed frame
// ---------------------------------------------------------------------------

const sendFrameMixed: FrameAsset = {
  id: 'send-mixed-frame',
  name: 'Send Mixed Frame',
  direction: 'send',
  fields: [
    {
      id: 'sf-m-header',
      name: 'Header',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x55',
    },
    {
      id: 'sf-m-counter',
      name: 'Counter',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
      bigEndian: true,
    },
    {
      id: 'sf-m-status',
      name: 'Status',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
    },
    {
      id: 'sf-m-mcsum',
      name: 'Checksum',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      validOption: {
        isChecksum: true,
        startFieldIndex: 0,
        endFieldIndex: 2,
        checksumMethod: 'sum8',
      },
      defaultValue: '0',
    },
  ],
  identifierRules: [],
  options: { autoChecksum: true, bigEndian: true, includeLengthField: false },
};

const receiveFrameMixed: FrameAsset = {
  id: 'recv-mixed-frame',
  name: 'Receive Mixed Frame',
  direction: 'receive',
  fields: [
    {
      id: 'rf-m-header',
      name: 'Header',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
    {
      id: 'rf-m-counter',
      name: 'Counter',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      bigEndian: true,
    },
    {
      id: 'rf-m-status',
      name: 'Status',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
    {
      id: 'rf-m-mcsum',
      name: 'Checksum',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
  ],
  identifierRules: [
    {
      startIndex: 0,
      endIndex: 0,
      operator: 'eq',
      value: '0x55',
      logicOperator: 'and',
    },
  ],
  options: { autoChecksum: true, bigEndian: true, includeLengthField: false },
};

// ---------------------------------------------------------------------------
// Test infrastructure helpers
// ---------------------------------------------------------------------------

interface LoopbackContext {
  features: RewriteWiredFeatures;
  connectionId: string;
  targetId: string;
}

/**
 * Sets up a full loopback test context:
 * - Creates transport + adapters + wired features
 * - Connects TCP client to echo server
 * - Drains initial connection events
 * - Returns context with connectionId and targetId
 */
async function setupLoopback(
  frames: FrameAsset[],
  connectionId: string,
  echoPort: number,
): Promise<LoopbackContext> {
  const transport = createNodeNetTransportFacade();
  const networkAdapter = createRealNetworkAdapter({ transport });
  const compositeAdapter = createCompositeAdapter({ networkAdapter });
  const features = wireFeatures({ connectionAdapter: compositeAdapter });

  // Register frames
  for (const frame of frames) {
    const result = features.frameService.upsertFrame(frame);
    expect(result.ok).toBe(true);
  }

  // Refresh receive references so receive service knows about receive frames
  features.receiveService.refreshFrameReferences();

  // Connect TCP client to echo server
  const connResult = await features.connectionService.connect({
    kind: 'tcp-client',
    id: connectionId,
    host: '127.0.0.1',
    port: echoPort,
  });
  expect(connResult.ok).toBe(true);

  // Drain initial events from connection (connect-requested, connected, etc.)
  // These are internal lifecycle events, not data we want to process.
  await features.connectionService.drainAdapterEvents();

  // Find the target for send
  const targets = features.connectionService.listTransportTargets();
  expect(targets.length).toBeGreaterThanOrEqual(1);
  const targetId = targets[0]!.targetId;

  return { features, connectionId, targetId };
}

/**
 * Sends a frame, waits for echo, runs routingTick, and returns the tick result.
 */
async function sendAndWaitForEcho(
  ctx: LoopbackContext,
  frameId: string,
  fieldValues: Record<string, number | string>,
  sendOptions?: SendOptions,
): Promise<{ sendResult: Awaited<ReturnType<typeof ctx.features.sendService.execute>>; tickResult: Awaited<ReturnType<typeof routingTick>> }> {
  const sendResult = await ctx.features.sendService.execute({
    frameId,
    targetId: ctx.targetId,
    fieldValues,
    context: { source: 'user' },
    ...(sendOptions ? { options: sendOptions } : {}),
  });

  // Wait briefly for TCP echo to propagate through the socket
  await new Promise((r) => setTimeout(r, 50));

  // routingTick drains adapter events and processes them through receive pipeline
  const tickResult = await routingTick(ctx.features);

  return { sendResult, tickResult };
}

/**
 * Cleans up a loopback context.
 */
async function teardownLoopback(ctx: LoopbackContext): Promise<void> {
  await ctx.features.connectionService.disconnect(ctx.connectionId);
  await ctx.features.connectionService.cleanup();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('T001b: Send -> Receive TCP loopback', () => {
  let echoServer: Server;
  let echoPort: number;

  beforeAll(async () => {
    const echo = await startEchoServer();
    echoServer = echo.server;
    echoPort = echo.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      echoServer.close(() => resolve());
    });
  });

  // -------------------------------------------------------------------------
  // VP1: Checksum round-trip
  // -------------------------------------------------------------------------

  it('checksum round-trip: send writes checksum, receive reads consistent checksum bytes', async () => {
    const ctx = await setupLoopback(
      [sendFrame, receiveFrame],
      'loopback-checksum',
      echoPort,
    );

    const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-frame-1', {
      'sf-value': 42,
    });

    // Send succeeded
    expect(sendResult.kind).toBe('sent');
    expect(sendResult.bytesBuilt).toBe(4);
    expect(sendResult.bytesSent).toBe(4);

    // Receive matched
    expect(tickResult.ok).toBe(true);
    expect(tickResult.eventsRouted).toBeGreaterThanOrEqual(1);
    expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

    // Verify checksum round-trip:
    // Sent: header=0xAA, value=42=0x002A, checksum=sum8([0xAA,0x00,0x2A])=0xD4
    // Received: same bytes parsed back
    const fieldValues = ctx.features.receiveService.listFieldValues();
    const headerField = fieldValues.find((f) => f.fieldId === 'rf-header');
    const valueField = fieldValues.find((f) => f.fieldId === 'rf-value');
    const checksumField = fieldValues.find((f) => f.fieldId === 'rf-checksum');

    expect(headerField).toBeDefined();
    expect(headerField!.value).toBe(0xAA);

    expect(valueField).toBeDefined();
    expect(valueField!.value).toBe(42);

    expect(checksumField).toBeDefined();
    // sum8([0xAA, 0x00, 0x2A]) = 170 + 0 + 42 = 212 = 0xD4
    expect(checksumField!.value).toBe(0xD4);

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // VP2: Factor round-trip
  // -------------------------------------------------------------------------

  it('factor round-trip: send applies inverse factor, receive applies factor, original value restored', async () => {
    const ctx = await setupLoopback(
      [sendFrameWithFactor, receiveFrameWithFactor],
      'loopback-factor',
      echoPort,
    );

    // Temperature = 25.5 with factor 0.1
    // Send: 25.5 / 0.1 = 255 -> uint16 big-endian [0x00, 0xFF]
    // Receive: parse uint16 = 255, then * 0.1 = 25.5
    const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-factor-frame', {
      'sf-temp': 25.5,
    });

    expect(sendResult.kind).toBe('sent');
    expect(sendResult.bytesBuilt).toBe(3); // uint16(2) + uint8(1)
    expect(sendResult.bytesSent).toBe(3);

    expect(tickResult.ok).toBe(true);
    expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

    const fieldValues = ctx.features.receiveService.listFieldValues();
    const tempField = fieldValues.find((f) => f.fieldId === 'rf-temp');

    expect(tempField).toBeDefined();
    // 25.5 / 0.1 = 255 encoded as uint16, receive applies 255 * 0.1 = 25.5
    expect(tempField!.value).toBe(25.5);

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // VP3: Byte order round-trip (big-endian)
  // -------------------------------------------------------------------------

  it('byte order round-trip: big-endian uint16 written and read consistently', async () => {
    const ctx = await setupLoopback(
      [sendFrame, receiveFrame],
      'loopback-endian',
      echoPort,
    );

    // Send 0x1234 = 4660 decimal, big-endian -> bytes [0x12, 0x34]
    const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-frame-1', {
      'sf-value': 0x1234,
    });

    expect(sendResult.kind).toBe('sent');
    expect(tickResult.ok).toBe(true);
    expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

    const fieldValues = ctx.features.receiveService.listFieldValues();
    const valueField = fieldValues.find((f) => f.fieldId === 'rf-value');

    expect(valueField).toBeDefined();
    // Big-endian round-trip: 0x1234 -> [0x12, 0x34] -> parse big-endian -> 0x1234
    expect(valueField!.value).toBe(0x1234);

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // VP5: Length field round-trip
  // -------------------------------------------------------------------------

  it('length field round-trip: send auto-fills length, receive parses full frame', async () => {
    const ctx = await setupLoopback(
      [sendFrameWithLength, receiveFrameWithLength],
      'loopback-length',
      echoPort,
    );

    const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-len-frame', {
      'sf-payload': 100,
    }, {
      autoChecksum: true,
      includeLengthField: true,
      lengthFieldId: 'sf-len',
      bigEndian: true,
    });

    expect(sendResult.kind).toBe('sent');
    expect(sendResult.bytesBuilt).toBe(4); // len(1) + payload(2) + checksum(1)
    expect(sendResult.bytesSent).toBe(4);

    expect(tickResult.ok).toBe(true);
    expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

    // Verify length field was auto-filled by send and round-tripped through receive
    const fieldValues = ctx.features.receiveService.listFieldValues();
    const lenField = fieldValues.find((f) => f.fieldId === 'rf-len');
    const payloadField = fieldValues.find((f) => f.fieldId === 'rf-payload');

    expect(lenField).toBeDefined();
    // Total frame = 4 bytes, so length field should be 4
    expect(lenField!.value).toBe(4);

    expect(payloadField).toBeDefined();
    expect(payloadField!.value).toBe(100);

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // VP6: Multi-field mixed frame complete round-trip
  // -------------------------------------------------------------------------

  it('multi-field mixed frame round-trip: header + counter + status + checksum all match', async () => {
    const ctx = await setupLoopback(
      [sendFrameMixed, receiveFrameMixed],
      'loopback-mixed',
      echoPort,
    );

    const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-mixed-frame', {
      'sf-m-counter': 999,
      'sf-m-status': 7,
    });

    expect(sendResult.kind).toBe('sent');
    expect(sendResult.bytesBuilt).toBe(5); // header(1) + counter(2) + status(1) + checksum(1)
    expect(sendResult.bytesSent).toBe(5);
    expect(sendResult.buildIssues.filter((i) => i.severity === 'error')).toHaveLength(0);

    expect(tickResult.ok).toBe(true);
    expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

    // Verify all fields round-tripped
    const fieldValues = ctx.features.receiveService.listFieldValues();

    const headerField = fieldValues.find((f) => f.fieldId === 'rf-m-header');
    expect(headerField).toBeDefined();
    expect(headerField!.value).toBe(0x55);

    const counterField = fieldValues.find((f) => f.fieldId === 'rf-m-counter');
    expect(counterField).toBeDefined();
    expect(counterField!.value).toBe(999);

    const statusField = fieldValues.find((f) => f.fieldId === 'rf-m-status');
    expect(statusField).toBeDefined();
    expect(statusField!.value).toBe(7);

    const checksumField = fieldValues.find((f) => f.fieldId === 'rf-m-mcsum');
    expect(checksumField).toBeDefined();
    // sum8([0x55, 0x03, 0xE7, 0x07]) = 85 + 3 + 231 + 7 = 326 = 0x146 & 0xFF = 0x46 = 70
    expect(checksumField!.value).toBe(0x46);

    // Verify statistics
    const counters = ctx.features.receiveService.getCounters();
    expect(counters.matchedCount).toBeGreaterThanOrEqual(1);

    const sendStats = ctx.features.sendService.getStatistics();
    expect(sendStats.totalSent).toBeGreaterThanOrEqual(1);
    expect(sendStats.totalBytesSent).toBeGreaterThanOrEqual(5);

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // Multiple sequential sends in one connection
  // -------------------------------------------------------------------------

  it('multiple sequential sends all round-trip correctly on same connection', async () => {
    const ctx = await setupLoopback(
      [sendFrame, receiveFrame],
      'loopback-multi',
      echoPort,
    );

    const testValues = [0, 1, 100, 65535, 12345];

    for (const val of testValues) {
      const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-frame-1', {
        'sf-value': val,
      });

      expect(sendResult.kind).toBe('sent');
      expect(tickResult.ok).toBe(true);
      expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

      // Verify value round-tripped
      const fieldValues = ctx.features.receiveService.listFieldValues({
        frameId: 'recv-frame-1',
        fieldId: 'rf-value',
      });
      const valueField = fieldValues.find((f) => f.fieldId === 'rf-value');
      expect(valueField).toBeDefined();
      expect(valueField!.value).toBe(val);
    }

    // Verify total counts
    const sendStats = ctx.features.sendService.getStatistics();
    expect(sendStats.totalSent).toBe(testValues.length);

    const recvCounters = ctx.features.receiveService.getCounters();
    expect(recvCounters.matchedCount).toBeGreaterThanOrEqual(testValues.length);

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // Send result kind and statistics
  // -------------------------------------------------------------------------

  it('send returns correct result with byte counts and no build errors', async () => {
    const ctx = await setupLoopback(
      [sendFrame],
      'loopback-result',
      echoPort,
    );

    const result = await ctx.features.sendService.execute({
      frameId: 'send-frame-1',
      targetId: ctx.targetId,
      fieldValues: { 'sf-value': 42 },
      context: { source: 'user' },
    });

    expect(result.kind).toBe('sent');
    expect(result.bytesBuilt).toBe(4);
    expect(result.bytesSent).toBe(4);
    expect(result.requestRef.frameId).toBe('send-frame-1');
    expect(result.requestRef.targetId).toBe(ctx.targetId);
    expect(result.requestRef.context.source).toBe('user');
    expect(result.timestamp).toBeTruthy();
    expect(result.error).toBeUndefined();
    expect(result.buildIssues.filter((i) => i.severity === 'error')).toHaveLength(0);

    // Result is recorded in send state
    const results = ctx.features.sendService.listResults();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[results.length - 1]!.kind).toBe('sent');

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // Send with missing target
  // -------------------------------------------------------------------------

  it('send with non-existent targetId returns target-unavailable', async () => {
    const transport = createNodeNetTransportFacade();
    const networkAdapter = createRealNetworkAdapter({ transport });
    const compositeAdapter = createCompositeAdapter({ networkAdapter });
    const features = wireFeatures({ connectionAdapter: compositeAdapter });

    features.frameService.upsertFrame(sendFrame);

    const result = await features.sendService.execute({
      frameId: 'send-frame-1',
      targetId: 'non-existent-target',
      fieldValues: { 'sf-value': 42 },
      context: { source: 'user' },
    });

    expect(result.kind).toBe('target-unavailable');
    expect(result.error).toBeDefined();
    expect(result.error!.kind).toBe('target-not-found');
    expect(result.bytesBuilt).toBe(4);
    expect(result.bytesSent).toBe(0);

    await features.connectionService.cleanup();
  });

  // -------------------------------------------------------------------------
  // Edge: value = 0
  // -------------------------------------------------------------------------

  it('zero value round-trips correctly through checksum frame', async () => {
    const ctx = await setupLoopback(
      [sendFrame, receiveFrame],
      'loopback-zero',
      echoPort,
    );

    const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-frame-1', {
      'sf-value': 0,
    });

    expect(sendResult.kind).toBe('sent');
    expect(tickResult.ok).toBe(true);
    expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

    const fieldValues = ctx.features.receiveService.listFieldValues();
    const valueField = fieldValues.find((f) => f.fieldId === 'rf-value');

    expect(valueField).toBeDefined();
    expect(valueField!.value).toBe(0);

    // Checksum: sum8([0xAA, 0x00, 0x00]) = 0xAA = 170
    const checksumField = fieldValues.find((f) => f.fieldId === 'rf-checksum');
    expect(checksumField).toBeDefined();
    expect(checksumField!.value).toBe(0xAA);

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // Edge: max uint16 value
  // -------------------------------------------------------------------------

  it('max uint16 value (65535) round-trips correctly', async () => {
    const ctx = await setupLoopback(
      [sendFrame, receiveFrame],
      'loopback-max',
      echoPort,
    );

    const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-frame-1', {
      'sf-value': 65535,
    });

    expect(sendResult.kind).toBe('sent');
    expect(tickResult.ok).toBe(true);
    expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

    const fieldValues = ctx.features.receiveService.listFieldValues();
    const valueField = fieldValues.find((f) => f.fieldId === 'rf-value');

    expect(valueField).toBeDefined();
    expect(valueField!.value).toBe(65535);

    await teardownLoopback(ctx);
  });

  // -------------------------------------------------------------------------
  // Factor with integer result (no precision loss)
  // -------------------------------------------------------------------------

  it('factor round-trip with integer result has no precision loss', async () => {
    const ctx = await setupLoopback(
      [sendFrameWithFactor, receiveFrameWithFactor],
      'loopback-factor-int',
      echoPort,
    );

    // Temperature = 10.0 -> encoded as 10.0/0.1=100 -> receive: 100*0.1=10.0
    const { sendResult, tickResult } = await sendAndWaitForEcho(ctx, 'send-factor-frame', {
      'sf-temp': 10,
    });

    expect(sendResult.kind).toBe('sent');
    expect(tickResult.ok).toBe(true);
    expect(tickResult.matchesEmitted).toBeGreaterThanOrEqual(1);

    const fieldValues = ctx.features.receiveService.listFieldValues();
    const tempField = fieldValues.find((f) => f.fieldId === 'rf-temp');

    expect(tempField).toBeDefined();
    expect(tempField!.value).toBe(10);

    await teardownLoopback(ctx);
  });
});
