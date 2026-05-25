import {
  TRANSPORT_KINDS,
  type ConnectionConfigNormalization,
  type ConnectionValidationIssue,
  type ConnectionValidationOutcome,
  type TransportConfig,
  type TransportKind,
} from './types';

type UnknownRecord = Record<string, unknown>;

const COMMON_CONFIG_KEYS = new Set(['id', 'kind', 'label']);
const CONFIG_KEYS = new Set([
  ...COMMON_CONFIG_KEYS,
  'portPath',
  'baudRate',
  'dataBits',
  'stopBits',
  'parity',
  'flowControl',
  'host',
  'port',
  'localHost',
  'localPort',
  'remoteHost',
  'remotePort',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(
  code: string,
  path: string,
  message: string,
  severity: ConnectionValidationIssue['severity'] = 'error',
): ConnectionValidationIssue {
  return { code, path, message, severity };
}

function isTransportKind(value: unknown): value is TransportKind {
  return typeof value === 'string' && TRANSPORT_KINDS.includes(value as TransportKind);
}

function toOutcome(issues: readonly ConnectionValidationIssue[]): ConnectionValidationOutcome {
  return {
    valid: issues.every((item) => item.severity !== 'error'),
    issues,
  };
}

function nonEmptyString(
  value: unknown,
  fallback: string,
  path: string,
  issues: ConnectionValidationIssue[],
): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  issues.push(issue('connection.config.stringInvalid', path, `Invalid text field: ${path}.`));
  return fallback;
}

function optionalString(
  value: unknown,
  path: string,
  issues: ConnectionValidationIssue[],
): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  issues.push(issue('connection.config.stringInvalid', path, `Invalid text field: ${path}.`));
  return undefined;
}

function numberInRange(
  value: unknown,
  fallback: number,
  path: string,
  min: number,
  max: number,
  issues: ConnectionValidationIssue[],
): number {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  ) {
    return value;
  }

  issues.push(issue('connection.config.numberInvalid', path, `Invalid number field: ${path}.`));
  return fallback;
}

function warnUnknownFields(value: UnknownRecord, issues: ConnectionValidationIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) {
      issues.push(
        issue(
          'connection.config.unknownFieldIgnored',
          key,
          `Unknown connection config field ignored: ${key}.`,
          'warning',
        ),
      );
    }
  }
}

function optionalNumberEnum<T extends number>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  path: string,
  issues: ConnectionValidationIssue[],
): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value) && allowed.includes(value as T)) {
    return value as T;
  }
  issues.push(issue('connection.config.valueInvalid', path, `Invalid value for ${path}.`));
  return fallback;
}

function optionalStringEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  path: string,
  issues: ConnectionValidationIssue[],
): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T;
  }
  issues.push(issue('connection.config.valueInvalid', path, `Invalid value for ${path}.`));
  return fallback;
}

const DATA_BITS_VALUES = [5, 6, 7, 8] as const;
const STOP_BITS_VALUES = [1, 1.5, 2] as const;
const PARITY_VALUES = ['none', 'even', 'odd', 'mark', 'space'] as const;
const FLOW_CONTROL_VALUES = ['none', 'hardware', 'software'] as const;

export function createConnectionIssue(
  code: string,
  path: string,
  message: string,
  severity: ConnectionValidationIssue['severity'] = 'warning',
): ConnectionValidationIssue {
  return issue(code, path, message, severity);
}

export function createConnectionValidationOutcome(
  issues: readonly ConnectionValidationIssue[],
): ConnectionValidationOutcome {
  return toOutcome(issues);
}

export function validateTransportConfig(config: TransportConfig): ConnectionValidationOutcome {
  const issues: ConnectionValidationIssue[] = [];

  if (!config.id.trim()) {
    issues.push(issue('connection.config.idMissing', 'id', 'Connection id is required.'));
  }

  if (config.label !== undefined && !config.label.trim()) {
    issues.push(
      issue('connection.config.labelInvalid', 'label', 'Connection label cannot be blank.'),
    );
  }

  switch (config.kind) {
    case 'serial':
      if (!config.portPath.trim()) {
        issues.push(
          issue('connection.config.portPathMissing', 'portPath', 'Serial resource is required.'),
        );
      }
      if (!Number.isFinite(config.baudRate) || config.baudRate <= 0) {
        issues.push(
          issue('connection.config.baudRateInvalid', 'baudRate', 'Serial baud rate is invalid.'),
        );
      }
      break;
    case 'tcp-client':
    case 'tcp-server':
      if (!config.host.trim()) {
        issues.push(issue('connection.config.hostMissing', 'host', 'Host is required.'));
      }
      if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
        issues.push(issue('connection.config.portInvalid', 'port', 'Port is invalid.'));
      }
      break;
    case 'udp':
      if (!config.localHost.trim()) {
        issues.push(
          issue('connection.config.localHostMissing', 'localHost', 'Local host is required.'),
        );
      }
      if (!Number.isInteger(config.localPort) || config.localPort < 1 || config.localPort > 65535) {
        issues.push(issue('connection.config.localPortInvalid', 'localPort', 'Local port is invalid.'));
      }
      if (config.remoteHost !== undefined && !config.remoteHost.trim()) {
        issues.push(
          issue('connection.config.remoteHostInvalid', 'remoteHost', 'Remote host is invalid.'),
        );
      }
      if (
        config.remotePort !== undefined &&
        (!Number.isInteger(config.remotePort) || config.remotePort < 1 || config.remotePort > 65535)
      ) {
        issues.push(
          issue('connection.config.remotePortInvalid', 'remotePort', 'Remote port is invalid.'),
        );
      }
      break;
  }

  return toOutcome(issues);
}

export function normalizeTransportConfig(value: unknown): ConnectionConfigNormalization {
  const issues: ConnectionValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [issue('connection.config.inputInvalid', 'config', 'Connection config is invalid.')],
    };
  }

  warnUnknownFields(value, issues);

  if (!isTransportKind(value.kind)) {
    return {
      valid: false,
      issues: [
        ...issues,
        issue('connection.config.kindInvalid', 'kind', 'Transport kind is invalid.'),
      ],
    };
  }

  const label = optionalString(value.label, 'label', issues);
  const common = {
    id: nonEmptyString(value.id, `${value.kind}-connection`, 'id', issues),
    ...(label ? { label } : {}),
  };

  let config: TransportConfig;
  switch (value.kind) {
    case 'serial':
      config = {
        ...common,
        kind: 'serial',
        portPath: nonEmptyString(value.portPath, 'unknown', 'portPath', issues),
        baudRate: numberInRange(value.baudRate, 115200, 'baudRate', 1, Number.MAX_SAFE_INTEGER, issues),
        dataBits: optionalNumberEnum(value.dataBits, DATA_BITS_VALUES, 8, 'dataBits', issues),
        stopBits: optionalNumberEnum(value.stopBits, STOP_BITS_VALUES, 1, 'stopBits', issues),
        parity: optionalStringEnum(value.parity, PARITY_VALUES, 'none', 'parity', issues),
        flowControl: optionalStringEnum(value.flowControl, FLOW_CONTROL_VALUES, 'none', 'flowControl', issues),
      };
      break;
    case 'tcp-client':
      config = {
        ...common,
        kind: 'tcp-client',
        host: nonEmptyString(value.host, '127.0.0.1', 'host', issues),
        port: numberInRange(value.port, 1, 'port', 1, 65535, issues),
      };
      break;
    case 'tcp-server':
      config = {
        ...common,
        kind: 'tcp-server',
        host: nonEmptyString(value.host, '0.0.0.0', 'host', issues),
        port: numberInRange(value.port, 1, 'port', 1, 65535, issues),
      };
      break;
    case 'udp':
      {
        const remoteHost = optionalString(value.remoteHost, 'remoteHost', issues);
        config = {
          ...common,
          kind: 'udp',
          localHost: nonEmptyString(value.localHost, '0.0.0.0', 'localHost', issues),
          localPort: numberInRange(value.localPort, 1, 'localPort', 1, 65535, issues),
          ...(remoteHost ? { remoteHost } : {}),
          ...(value.remotePort !== undefined
            ? { remotePort: numberInRange(value.remotePort, 1, 'remotePort', 1, 65535, issues) }
            : {}),
        };
      }
      break;
  }

  const validation = validateTransportConfig(config);
  return {
    ...toOutcome([...issues, ...validation.issues]),
    config,
  };
}
