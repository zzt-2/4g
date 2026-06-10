import type { FtpBridge, FtpUploadConfig } from '@/shared/platform-bridge';

export type { FtpBridge, FtpUploadConfig } from '@/shared/platform-bridge';

export interface FtpPlatformFacade {
  uploadFile(config: FtpUploadConfig): Promise<void>;
}

export function createFtpFacade(bridge: FtpBridge): FtpPlatformFacade {
  return {
    uploadFile: (config) => bridge.uploadFile(config),
  };
}
