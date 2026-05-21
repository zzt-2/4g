/**
 * T016d: Runtime bootstrap L0-L4 layered assembly integrity.
 *
 * Verifies that `wireFeatures()` from the runtime layer correctly
 * creates all services in dependency order and wires them together.
 */
import { describe, it, expect } from 'vitest';
import { wireFeatures } from '@/runtime/feature-wiring';
import { createFakeConnectionTransportAdapter } from '@/features/connection';

// ---------------------------------------------------------------------------
// Shared no-op adapter for all tests
// ---------------------------------------------------------------------------

function makeFakeAdapter(): ConnectionTransportAdapter {
  return createFakeConnectionTransportAdapter();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wireFeatures: L0-L4 layered bootstrap integrity', () => {
  it('creates all L0 services (frame, settings, storage)', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });

    // L0: no cross-dependencies
    expect(features.frameService).toBeDefined();
    expect(features.frameReader).toBeDefined();
    expect(features.settingsService).toBeDefined();
    expect(features.storageService).toBeDefined();
    expect(features.storageReader).toBeDefined();
  });

  it('creates L1 service (connection)', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });

    expect(features.connectionService).toBeDefined();
  });

  it('creates L2 services (receive, display, send)', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });

    expect(features.receiveService).toBeDefined();
    expect(features.displayService).toBeDefined();
    expect(features.sendService).toBeDefined();
  });

  it('creates L3 services (task, receiveEventSourceBridge)', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });

    expect(features.taskService).toBeDefined();
    expect(features.receiveEventSourceBridge).toBeDefined();
  });

  it('creates L4 service (commandIngress)', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });

    expect(features.commandIngressService).toBeDefined();
  });

  // --- Identity checks ---

  it('frameReader is frameService (identity)', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });

    expect(features.frameReader).toBe(features.frameService);
  });

  it('storageReader is storageService (identity)', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });

    expect(features.storageReader).toBe(features.storageService);
  });

  // --- Method spot-checks per service ---

  it('frameService has expected reader methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.frameService;

    expect(typeof svc.getSnapshot).toBe('function');
    expect(typeof svc.listFrames).toBe('function');
    expect(typeof svc.findFrames).toBe('function');
    expect(typeof svc.getFrame).toBe('function');
    expect(typeof svc.replaceFrames).toBe('function');
    expect(typeof svc.upsertFrame).toBe('function');
    expect(typeof svc.removeFrame).toBe('function');
  });

  it('settingsService has expected methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.settingsService;

    expect(typeof svc.getSnapshot).toBe('function');
    expect(typeof svc.getRecordingSettings).toBe('function');
    expect(typeof svc.getStorageSettings).toBe('function');
    expect(typeof svc.getGeneralSettings).toBe('function');
    expect(typeof svc.update).toBe('function');
    expect(typeof svc.reset).toBe('function');
  });

  it('storageService has expected methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.storageService;

    expect(typeof svc.getSnapshot).toBe('function');
    expect(typeof svc.listLocalRecords).toBe('function');
    expect(typeof svc.appendLocalRecords).toBe('function');
  });

  it('connectionService has expected methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.connectionService;

    expect(typeof svc.getSnapshot).toBe('function');
    expect(typeof svc.connect).toBe('function');
    expect(typeof svc.disconnect).toBe('function');
    expect(typeof svc.write).toBe('function');
    expect(typeof svc.listConnectionFacts).toBe('function');
    expect(typeof svc.listTransportTargets).toBe('function');
  });

  it('receiveService has expected methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.receiveService;

    expect(typeof svc.getSnapshot).toBe('function');
    expect(typeof svc.getCounters).toBe('function');
    expect(typeof svc.listFrameStats).toBe('function');
    expect(typeof svc.ingestBatch).toBe('function');
    expect(typeof svc.refreshFrameReferences).toBe('function');
  });

  it('displayService has expected methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.displayService;

    expect(typeof svc.getSnapshot).toBe('function');
    expect(typeof svc.getTable1Rows).toBe('function');
    expect(typeof svc.getTable2Rows).toBe('function');
    expect(typeof svc.getAvailability).toBe('function');
    expect(typeof svc.updatePreferences).toBe('function');
    expect(typeof svc.ingestSourceMaterial).toBe('function');
  });

  it('sendService has expected methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.sendService;

    expect(typeof svc.getSnapshot).toBe('function');
    expect(typeof svc.getStatistics).toBe('function');
    expect(typeof svc.execute).toBe('function');
    expect(typeof svc.listResults).toBe('function');
  });

  it('taskService has expected methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.taskService;

    expect(typeof svc.getSnapshot).toBe('function');
    expect(typeof svc.getStatistics).toBe('function');
    expect(typeof svc.createTask).toBe('function');
    expect(typeof svc.startTask).toBe('function');
    expect(typeof svc.stopTask).toBe('function');
    expect(typeof svc.stopAll).toBe('function');
    expect(typeof svc.removeTask).toBe('function');
  });

  it('commandIngressService has expected methods', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const svc = features.commandIngressService;

    // CommandIngressService interface methods
    expect(typeof svc.getScoeStatistics).toBe('function');
    expect(typeof svc.getScoeRuntimeStatus).toBe('function');
    expect(typeof svc.getLoadedSatelliteId).toBe('function');
    expect(typeof svc.isScoeFramesLoaded).toBe('function');
    expect(typeof svc.loadSatellite).toBe('function');
    expect(typeof svc.unloadSatellite).toBe('function');
    expect(typeof svc.dispose).toBe('function');
    expect(typeof svc.getCommandLog).toBe('function');
    expect(typeof svc.sendTestData).toBe('function');
  });

  it('receiveEventSourceBridge has subscribe and emit', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });
    const bridge = features.receiveEventSourceBridge;

    expect(typeof bridge.subscribe).toBe('function');
    expect(typeof bridge.emit).toBe('function');
  });

  // --- Cross-wiring verification ---

  it('services return valid default snapshots', () => {
    const features = wireFeatures({ connectionAdapter: makeFakeAdapter() });

    // Frame snapshot
    const frameSnap = features.frameService.getSnapshot();
    expect(Array.isArray(frameSnap.frames)).toBe(true);

    // Settings snapshot
    const settingsSnap = features.settingsService.getSnapshot();
    expect(settingsSnap.recording).toBeDefined();
    expect(settingsSnap.storage).toBeDefined();
    expect(settingsSnap.general).toBeDefined();

    // Connection snapshot
    const connSnap = features.connectionService.getSnapshot();
    expect(Array.isArray(connSnap.runtimeFacts)).toBe(true);

    // Receive snapshot
    const recvSnap = features.receiveService.getSnapshot();
    expect(recvSnap.counters).toBeDefined();

    // Send snapshot
    const sendSnap = features.sendService.getSnapshot();
    expect(sendSnap.status).toBeDefined();

    // Display snapshot
    const dispSnap = features.displayService.getSnapshot();
    expect(dispSnap.projection).toBeDefined();

    // Task snapshot
    const taskSnap = features.taskService.getSnapshot();
    expect(Array.isArray(taskSnap.instances)).toBe(true);
  });
});
