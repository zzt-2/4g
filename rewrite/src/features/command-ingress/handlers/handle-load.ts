import type { CommandHandler } from '../core/handler';
import type { SatelliteConfig } from '../core/types';

/**
 * G6: satelliteConfigs loaded from config file (in-memory) at assembly time.
 * Passed in via closure when the handler map is created.
 */
export function createHandleLoadSatelliteId(
  satelliteConfigs: readonly SatelliteConfig[],
): CommandHandler {
  return async (command, ctx) => {
    if (ctx.stateReader.loadedSatelliteId !== '') {
      return { success: false, error: 'Satellite already loaded' };
    }

    const satOffset = ctx.stateReader.globalConfig().satelliteIdOffset;
    const rawBytes = command.rawBytes;

    // Extract satellite ID bytes from the command payload
    const satIdBytes = rawBytes.slice(satOffset, satOffset + 4);
    const satelliteId = satIdBytes
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');

    const satConfig = satelliteConfigs.find((s) => s.satelliteId === satelliteId);
    if (!satConfig) {
      return { success: false, error: `Unknown satellite ID: ${satelliteId}` };
    }

    ctx.stateWriter.setLoaded(satelliteId, satConfig.commandConfigs);

    return { success: true };
  };
}
