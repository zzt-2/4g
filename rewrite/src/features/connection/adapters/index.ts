export type {
  ConnectionAdapterAccepted,
  ConnectionAdapterCommandOutcome,
  ConnectionAdapterErrorInput,
  ConnectionAdapterEvent,
  ConnectionAdapterEventKind,
  ConnectionAdapterOperation,
  ConnectionAdapterRejected,
  ConnectionResourceCandidate,
  ConnectionTransportAdapter,
  TransportWriteRequest,
} from './ports';
export { createRealSerialAdapter } from './real-serial-adapter';
export type { CreateRealSerialAdapterOptions, RealSerialAdapter } from './real-serial-adapter';
