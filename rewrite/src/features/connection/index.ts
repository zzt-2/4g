export type {
  BaseTransportConfig,
  ConnectionCounterSnapshot,
  ConnectionLifecycleStatus,
  ConnectionRuntimeFact,
  ConnectionStateSnapshot,
  ConnectionValidationIssue,
  ConnectionValidationOutcome,
  SerialTransportConfig,
  TcpClientTransportConfig,
  TcpServerTransportConfig,
  TransportConfig,
  TransportErrorKind,
  TransportErrorSnapshot,
  TransportEventKind,
  TransportEventSnapshot,
  TransportKind,
  TransportTargetRole,
  TransportTargetSnapshot,
  UdpTransportConfig,
} from './core';
export {
  selectConnectionFact,
  selectConnectionFacts,
  selectConnectionSnapshot,
  selectConnectionSummaries,
  selectLastTransportError,
  selectTransportConfigs,
  selectTransportEvents,
  selectTransportTargets,
} from './selectors';
export type { ConnectionSummary, ConnectionTargetQuery } from './selectors';
export { createConnectionReader, createConnectionService } from './services';
export type {
  ConnectionOperationOutcome,
  ConnectionReader,
  ConnectionService,
  CreateConnectionServiceOptions,
} from './services';

// Adapter ports
export type { ConnectionTransportAdapter } from './adapters';
export { createRealSerialAdapter } from './adapters';
export type { CreateRealSerialAdapterOptions, RealSerialAdapter } from './adapters';

// Test utilities
export { createFakeConnectionTransportAdapter } from './adapters/test-exports';
export type {
  CreateFakeConnectionTransportAdapterOptions,
  FakeConnectionAdapterFailure,
  FakeConnectionTransportAdapter,
} from './adapters/test-exports';
