import type { ProtocolAdapter, ParsedCommand } from '../core';
import type {
  ScoeGlobalConfig,
  ScoeCommandConfig,
  ChecksumConfig,
  ScoeCommandParam,
} from '../core';
import type { CommandIngressStateReader } from '../core';
import type { TransportEventSnapshot } from '@/features/connection';
import type { ConsumerResult } from '@/runtime/consumer-chain';

export interface ScoeProtocolAdapterOptions {
  readonly globalConfig: ScoeGlobalConfig;
  readonly commandConfigs: readonly ScoeCommandConfig[];
  readonly stateReader: CommandIngressStateReader;
  readonly onCommand?: (parsed: ParsedCommand) => Promise<void>;
  readonly onConsume?: (bytes: readonly number[]) => void;
  readonly onParseError?: (error: Error, rawBytes: readonly number[]) => void;
}

export function createScoeProtocolAdapter(
  options: ScoeProtocolAdapterOptions,
): ProtocolAdapter {
  const { globalConfig, stateReader, onCommand, onConsume } = options;
  const onParseError = options.onParseError;
  // Base configs used before LOAD; after LOAD, state.activeCommandConfigs takes over
  const baseCommandConfigs = [...options.commandConfigs];

  function getCommandConfigs(): readonly ScoeCommandConfig[] {
    const active = stateReader.getSnapshot().activeCommandConfigs;
    if (active.length === 0) return baseCommandConfigs;
    // Merge: satellite-specific configs + base built-in commands (LOAD/UNLOAD/HEALTH/LINK)
    const builtInFunctions = new Set(['load_satellite_id', 'unload_satellite_id', 'health_check', 'link_check']);
    const satelliteFunctions = new Set(active.map((c) => c.function));
    const baseBuiltIns = baseCommandConfigs.filter((c) => builtInFunctions.has(c.function) && !satelliteFunctions.has(c.function));
    return [...active, ...baseBuiltIns];
  }

  function canHandle(event: TransportEventSnapshot): boolean {
    if (event.kind !== 'data' || event.bytes === undefined) return false;

    const bytes = event.bytes;
    const fcOffset = globalConfig.functionCodeOffset;

    if (bytes.length < fcOffset + 4) return false;

    const identifierByte = bytes[fcOffset];
    const expectedIdentifier = hexToByte(globalConfig.scoeIdentifier);
    if (expectedIdentifier === null || identifierByte !== expectedIdentifier) return false;

    // Fixed 0xAA 0xAA at offset +2 and +3
    if (bytes[fcOffset + 2] !== 0xaa || bytes[fcOffset + 3] !== 0xaa) return false;

    // Two-phase state machine
    if (!stateReader.scoeFramesLoaded) {
      // Phase 1: only match LOAD_SATELLITE_ID (command code 01)
      const commandCode = byteToHex(bytes[fcOffset + 1]!);
      if (commandCode !== '01') return false;
    }

    return true;
  }

  function parse(event: TransportEventSnapshot): ParsedCommand {
    if (event.bytes === undefined) throw new Error('Event has no bytes');

    const bytes = event.bytes;
    const fcOffset = globalConfig.functionCodeOffset;

    const codeByte = bytes[fcOffset + 1];
    if (codeByte === undefined) throw new Error('Command code byte missing');

    const commandCode = byteToHex(codeByte);
    const commandConfig = getCommandConfigs().find((c) => c.code === commandCode);
    if (!commandConfig) {
      throw new Error(`Unknown SCOE command code: ${commandCode}`);
    }

    validateChecksums(bytes, commandConfig.checksums);

    const resolvedParams = extractAndResolveParams(bytes, commandConfig.params ?? []);

    return {
      commandId: `scoe-cmd-${event.id}`,
      commandCode,
      commandFunction: commandConfig.function,
      rawBytes: [...bytes],
      resolvedParams,
      commandConfig,
      connectionId: event.connectionId,
      occurredAt: event.occurredAt,
    };
  }

  return {
    id: 'scoe-protocol',
    protocolId: 'scoe-tcp',

    async consume(events: readonly TransportEventSnapshot[]): Promise<ConsumerResult> {
      const consumed: TransportEventSnapshot[] = [];
      const remaining: TransportEventSnapshot[] = [];

      for (const event of events) {
        if (canHandle(event)) {
          try {
            const parsed = parse(event);
            if (onCommand) {
              await onCommand(parsed);
            }
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.warn(`SCOE parse error: ${error.message}`);
            onParseError?.(error, event.bytes ?? []);
          }
          consumed.push(event);
          if (onConsume && event.bytes) onConsume(event.bytes);
        } else {
          remaining.push(event);
        }
      }

      return { consumed, remaining };
    },
  };
}

// --- Byte-level helpers (exported for testing) ---

export function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase();
}

export function hexToByte(hex: string): number | null {
  const cleaned = hex.replace(/^0x/i, '');
  const value = parseInt(cleaned, 16);
  return Number.isNaN(value) ? null : value;
}

export function validateChecksums(
  bytes: readonly number[],
  checksums: readonly ChecksumConfig[],
): void {
  for (const cs of checksums) {
    if (!cs.enabled) continue;

    let sum = 0;
    for (let i = cs.offset; i < cs.offset + cs.length; i++) {
      sum += bytes[i] ?? 0;
    }
    const expected = sum % 256;
    const actual = bytes[cs.checksumOffset] ?? 0;

    if (expected !== actual) {
      throw new Error(
        `Checksum failed at offset ${cs.checksumOffset}: expected ${expected}, got ${actual}`,
      );
    }
  }
}

export function extractAndResolveParams(
  bytes: readonly number[],
  params: readonly ScoeCommandParam[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const param of params) {
    const slice = bytes.slice(param.offset, param.offset + param.length);
    const hex = bytesToUpperCaseHex(slice);
    const normalized = normalizeHex(hex, param.length * 2);

    const matched = param.options.find(
      (opt) => normalizeHex(opt.receiveCode, param.length * 2) === normalized,
    );

    result[param.id] = matched?.value ?? hex;
  }

  return result;
}

function bytesToUpperCaseHex(bytes: readonly number[]): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

function normalizeHex(hex: string, targetLength: number): string {
  const cleaned = hex.replace(/^0x/i, '').toUpperCase();
  return cleaned.padStart(targetLength, '0');
}
