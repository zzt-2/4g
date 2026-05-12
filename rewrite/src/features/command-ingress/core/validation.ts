import type { ValidationResult, ValidationIssue } from '@/shared/types/validation';
import type { ScoeGlobalConfig, SatelliteConfig, ScoeCommandConfig } from './types';

function issue(
  severity: ValidationIssue['severity'],
  code: string,
  path: string,
  message: string,
): ValidationIssue {
  return { severity, code, path, message };
}

function ok(): ValidationResult {
  return { valid: true, issues: [] };
}

function result(issues: readonly ValidationIssue[]): ValidationResult {
  return {
    valid: !issues.some((i) => i.severity === 'error'),
    issues,
  };
}

export function validateGlobalConfig(config: ScoeGlobalConfig): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!config.scoeIdentifier) {
    issues.push(issue('error', 'missing_field', 'scoeIdentifier', 'scoeIdentifier is required'));
  }
  if (!config.tcpServerIp) {
    issues.push(issue('error', 'missing_field', 'tcpServerIp', 'tcpServerIp is required'));
  }
  if (config.tcpServerPort == null || config.tcpServerPort <= 0) {
    issues.push(issue('error', 'invalid_value', 'tcpServerPort', 'tcpServerPort must be a positive number'));
  }
  if (!config.udpIpAddress) {
    issues.push(issue('error', 'missing_field', 'udpIpAddress', 'udpIpAddress is required'));
  }
  if (config.udpPort == null || config.udpPort <= 0) {
    issues.push(issue('error', 'invalid_value', 'udpPort', 'udpPort must be a positive number'));
  }
  if (config.messageIdentifierOffset == null || config.messageIdentifierOffset < 0) {
    issues.push(issue('error', 'invalid_value', 'messageIdentifierOffset', 'messageIdentifierOffset must be >= 0'));
  }
  if (config.functionCodeOffset == null || config.functionCodeOffset < 0) {
    issues.push(issue('error', 'invalid_value', 'functionCodeOffset', 'functionCodeOffset must be >= 0'));
  }
  if (config.satelliteIdOffset == null || config.satelliteIdOffset < 0) {
    issues.push(issue('error', 'invalid_value', 'satelliteIdOffset', 'satelliteIdOffset must be >= 0'));
  }

  return issues.length === 0 ? ok() : result(issues);
}

export function validateSatelliteConfig(config: SatelliteConfig): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!config.satelliteId) {
    issues.push(issue('error', 'missing_field', 'satelliteId', 'satelliteId is required'));
  }
  if (!config.messageIdentifier) {
    issues.push(issue('error', 'missing_field', 'messageIdentifier', 'messageIdentifier is required'));
  }
  if (!config.commandConfigs || config.commandConfigs.length === 0) {
    issues.push(issue('warning', 'empty_array', 'commandConfigs', 'commandConfigs is empty'));
  }

  for (let i = 0; i < config.commandConfigs.length; i++) {
    const cmdResult = validateCommandConfig(config.commandConfigs[i], `commandConfigs[${i}]`);
    issues.push(...cmdResult.issues);
  }

  return issues.length === 0 ? ok() : result(issues);
}

export function validateCommandConfig(
  config: ScoeCommandConfig,
  basePath = '',
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const p = basePath ? `${basePath}.` : '';

  if (!config.id) {
    issues.push(issue('error', 'missing_field', `${p}id`, 'id is required'));
  }
  if (!config.code) {
    issues.push(issue('error', 'missing_field', `${p}code`, 'code is required'));
  }
  if (!config.function) {
    issues.push(issue('error', 'missing_field', `${p}function`, 'function is required'));
  }

  return issues.length === 0 ? ok() : result(issues);
}
