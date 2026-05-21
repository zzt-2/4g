export type {
  BaseTransportConfig,
  ConnectionCounterSnapshot,
  ConnectionLifecycleStatus,
  ConnectionRuntimeFact,
  ConnectionStateSnapshot,
  ConnectionSummary,
  ConnectionTargetQuery,
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
export { createConnectionReader, createConnectionService } from './services';
export type {
  ConnectionOperationOutcome,
  ConnectionReader,
  ConnectionService,
  CreateConnectionServiceOptions,
  ReconnectStatus,
} from './services';

// Adapter ports
export type { ConnectionResourceCandidate, ConnectionTransportAdapter } from './adapters';
export { createRealSerialAdapter } from './adapters';
export type { CreateRealSerialAdapterOptions, RealSerialAdapter } from './adapters';
export { createRealNetworkAdapter } from './adapters';
export type { CreateRealNetworkAdapterOptions } from './adapters';
export { createCompositeAdapter } from './adapters';
export type { CreateCompositeAdapterOptions } from './adapters';

// Test utilities (used by runtime integration tests)
export { createFakeConnectionTransportAdapter } from './adapters/test-exports';
export type {
  CreateFakeConnectionTransportAdapterOptions,
  FakeConnectionAdapterFailure,
  FakeConnectionTransportAdapter,
} from './adapters/test-exports';
