import { describe, expect, it } from 'vitest';
import {
  createRewriteBridgeInfo,
  REWRITE_PLATFORM_BRIDGE_KEY,
} from '../src/shared/platform-bridge';

describe('rewrite infrastructure baseline', () => {
  it('defines a typed non-business platform bridge placeholder', () => {
    expect(REWRITE_PLATFORM_BRIDGE_KEY).toBe('dongfanghongRewritePlatform');
    expect(createRewriteBridgeInfo()).toEqual({
      name: 'dongfanghong-rewrite-platform',
      version: '0.0.0',
      capabilities: ['transport'],
    });
  });
});
