import { describe, it, expect } from 'vitest';
import {
  validateGlobalConfig,
  validateSatelliteConfig,
  validateCommandConfig,
} from '../core/validation';
import type { SatelliteConfig, ScoeCommandConfig } from '../core/types';
import { testGlobalConfig, testCommandConfigs } from '../fixtures/command-ingress-fixtures';

describe('validateGlobalConfig', () => {
  it('passes for valid config', () => {
    const result = validateGlobalConfig(testGlobalConfig);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('reports error for missing scoeIdentifier', () => {
    const config = { ...testGlobalConfig, scoeIdentifier: '' };
    const result = validateGlobalConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === 'scoeIdentifier')).toBe(true);
  });

  it('reports error for invalid tcpServerPort', () => {
    const config = { ...testGlobalConfig, tcpServerPort: -1 };
    const result = validateGlobalConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === 'tcpServerPort')).toBe(true);
  });

  it('reports error for missing udpIpAddress', () => {
    const config = { ...testGlobalConfig, udpIpAddress: '' };
    const result = validateGlobalConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === 'udpIpAddress')).toBe(true);
  });

  it('reports error for negative offset fields', () => {
    const config = { ...testGlobalConfig, satelliteIdOffset: -1 };
    const result = validateGlobalConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === 'satelliteIdOffset')).toBe(true);
  });

  it('collects multiple errors at once', () => {
    const config = { ...testGlobalConfig, tcpServerIp: '', udpIpAddress: '' };
    const result = validateGlobalConfig(config);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateSatelliteConfig', () => {
  const validSatellite: SatelliteConfig = {
    satelliteId: 'SAT-01',
    messageIdentifier: '01',
    sourceIdentifier: 'SRC',
    destinationIdentifier: 'DST',
    modelId: 'MOD-01',
    commandConfigs: testCommandConfigs,
  };

  it('passes for valid config', () => {
    const result = validateSatelliteConfig(validSatellite);
    expect(result.valid).toBe(true);
  });

  it('reports error for missing satelliteId', () => {
    const config = { ...validSatellite, satelliteId: '' };
    const result = validateSatelliteConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === 'satelliteId')).toBe(true);
  });

  it('reports warning for empty commandConfigs', () => {
    const config = { ...validSatellite, commandConfigs: [] };
    const result = validateSatelliteConfig(config);
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('validates nested command configs', () => {
    const badCmd: ScoeCommandConfig = {
      ...testCommandConfigs[0],
      id: '',
      code: '',
    };
    const config = { ...validSatellite, commandConfigs: [badCmd] };
    const result = validateSatelliteConfig(config);
    expect(result.valid).toBe(false);
  });
});

describe('validateCommandConfig', () => {
  it('passes for valid config', () => {
    const result = validateCommandConfig(testCommandConfigs[0]);
    expect(result.valid).toBe(true);
  });

  it('reports error for missing id', () => {
    const config = { ...testCommandConfigs[0], id: '' };
    const result = validateCommandConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === 'id')).toBe(true);
  });

  it('reports error for missing code', () => {
    const config = { ...testCommandConfigs[0], code: '' };
    const result = validateCommandConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === 'code')).toBe(true);
  });

  it('uses basePath prefix when provided', () => {
    const config = { ...testCommandConfigs[0], id: '' };
    const result = validateCommandConfig(config, 'items[0]');
    expect(result.issues[0].path).toContain('items[0].');
  });
});
