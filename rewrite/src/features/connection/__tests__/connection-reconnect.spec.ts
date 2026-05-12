import { describe, expect, it } from 'vitest';
import {
  getReconnectPolicy,
  nextReconnectDelay,
  shouldReconnect,
  type ReconnectPolicy,
} from '../core/reconnect';
import type { TransportKind } from '../core/types';

describe('reconnect policy', () => {
  describe('getReconnectPolicy', () => {
    it('returns disabled policy for serial', () => {
      const policy = getReconnectPolicy('serial');
      expect(policy.enabled).toBe(false);
    });

    it('returns enabled policy for tcp-client', () => {
      const policy = getReconnectPolicy('tcp-client');
      expect(policy).toEqual({
        enabled: true,
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2.0,
      });
    });

    it('returns enabled policy for tcp-server', () => {
      const policy = getReconnectPolicy('tcp-server');
      expect(policy).toEqual({
        enabled: true,
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2.0,
      });
    });

    it('returns enabled policy for udp', () => {
      const policy = getReconnectPolicy('udp');
      expect(policy).toEqual({
        enabled: true,
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2.0,
      });
    });

    const allKinds: TransportKind[] = ['serial', 'tcp-client', 'tcp-server', 'udp'];
    it('covers all transport kinds without missing entries', () => {
      for (const kind of allKinds) {
        const policy = getReconnectPolicy(kind);
        expect(policy).toBeDefined();
        expect(typeof policy.enabled).toBe('boolean');
        if (policy.enabled) {
          expect(policy.maxAttempts).toBeGreaterThan(0);
          expect(policy.initialDelayMs).toBeGreaterThan(0);
          expect(policy.maxDelayMs).toBeGreaterThan(0);
          expect(policy.backoffMultiplier).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('nextReconnectDelay', () => {
    const policy: ReconnectPolicy = {
      enabled: true,
      maxAttempts: 10,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2.0,
    };

    it('returns initialDelayMs for attempt 0', () => {
      expect(nextReconnectDelay(policy, 0)).toBe(1000);
    });

    it('returns initialDelayMs * multiplier for attempt 1', () => {
      expect(nextReconnectDelay(policy, 1)).toBe(2000);
    });

    it('returns initialDelayMs * multiplier^2 for attempt 2', () => {
      expect(nextReconnectDelay(policy, 2)).toBe(4000);
    });

    it('exponentially increases delay', () => {
      expect(nextReconnectDelay(policy, 3)).toBe(8000);
      expect(nextReconnectDelay(policy, 4)).toBe(16000);
    });

    it('caps at maxDelayMs', () => {
      expect(nextReconnectDelay(policy, 5)).toBe(30000);
      expect(nextReconnectDelay(policy, 10)).toBe(30000);
      expect(nextReconnectDelay(policy, 100)).toBe(30000);
    });

    it('respects maxDelayMs from udp policy', () => {
      const udpPolicy = getReconnectPolicy('udp');
      // 1000 * 2^4 = 16000 > 10000
      expect(nextReconnectDelay(udpPolicy, 4)).toBe(10000);
    });
  });

  describe('shouldReconnect', () => {
    it('returns false when policy is disabled', () => {
      const policy: ReconnectPolicy = {
        enabled: false,
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2.0,
      };
      expect(shouldReconnect(policy, 0)).toBe(false);
      expect(shouldReconnect(policy, 5)).toBe(false);
    });

    it('returns true when attempt < maxAttempts', () => {
      const policy: ReconnectPolicy = {
        enabled: true,
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2.0,
      };
      for (let i = 0; i < 10; i++) {
        expect(shouldReconnect(policy, i)).toBe(true);
      }
    });

    it('returns false when attempt >= maxAttempts', () => {
      const policy: ReconnectPolicy = {
        enabled: true,
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2.0,
      };
      expect(shouldReconnect(policy, 10)).toBe(false);
      expect(shouldReconnect(policy, 11)).toBe(false);
      expect(shouldReconnect(policy, 100)).toBe(false);
    });

    it('returns true always when maxAttempts is 0', () => {
      const policy: ReconnectPolicy = {
        enabled: true,
        maxAttempts: 0,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2.0,
      };
      expect(shouldReconnect(policy, 0)).toBe(true);
      expect(shouldReconnect(policy, 100)).toBe(true);
      expect(shouldReconnect(policy, 99999)).toBe(true);
    });

    it('returns false for serial policy at any attempt', () => {
      const serialPolicy = getReconnectPolicy('serial');
      expect(shouldReconnect(serialPolicy, 0)).toBe(false);
      expect(shouldReconnect(serialPolicy, 100)).toBe(false);
    });

    it('returns true for tcp-client policy within max attempts', () => {
      const tcpPolicy = getReconnectPolicy('tcp-client');
      expect(shouldReconnect(tcpPolicy, 9)).toBe(true);
      expect(shouldReconnect(tcpPolicy, 10)).toBe(false);
    });

    it('returns true for udp policy within max attempts', () => {
      const udpPolicy = getReconnectPolicy('udp');
      expect(shouldReconnect(udpPolicy, 4)).toBe(true);
      expect(shouldReconnect(udpPolicy, 5)).toBe(false);
    });

    it('handles boundary at attempt 0', () => {
      const policy: ReconnectPolicy = {
        enabled: true,
        maxAttempts: 1,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2.0,
      };
      expect(shouldReconnect(policy, 0)).toBe(true);
      expect(shouldReconnect(policy, 1)).toBe(false);
    });
  });
});
