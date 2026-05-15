import type { StorageMaterialBucket } from '../core';
import type {
  LocalMaterialAdapter,
  LocalMaterialReadResult,
  LocalMaterialWriteResult,
  LocalMaterialDeleteResult,
  LocalMaterialListResult,
  LocalMaterialAdapterError,
} from './ports';
import type { FileFacade } from '@/platform';

export interface RealLocalMaterialAdapterOptions {
  readonly fileFacade: FileFacade;
  readonly baseDir: string;
}

function filePath(baseDir: string, bucket: StorageMaterialBucket, id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${baseDir}/${bucket}/${safeId}.json`;
}

function dirPath(baseDir: string, bucket: StorageMaterialBucket): string {
  return `${baseDir}/${bucket}`;
}

function adapterError(kind: LocalMaterialAdapterError['kind'], message: string): LocalMaterialAdapterError {
  return { kind, message };
}

export function createRealLocalMaterialAdapter(
  options: RealLocalMaterialAdapterOptions,
): LocalMaterialAdapter {
  const { fileFacade, baseDir } = options;

  return {
    async readMaterial(bucket, id): Promise<LocalMaterialReadResult> {
      try {
        const text = await fileFacade.readTextFile(filePath(baseDir, bucket, id));
        const value: unknown = JSON.parse(text);
        return { ok: true, value };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('ENOENT')) {
          return { ok: false, error: adapterError('missing', `Material not found: ${bucket}/${id}`) };
        }
        if (message.includes('JSON') || message.includes('Unexpected')) {
          console.error(`[storage] Corrupted material ${bucket}/${id}:`, message);
          return { ok: false, error: adapterError('corrupted', `Corrupted material: ${bucket}/${id}`) };
        }
        return { ok: false, error: adapterError('unavailable', message) };
      }
    },

    async writeMaterial(bucket, id, value): Promise<LocalMaterialWriteResult> {
      try {
        const text = JSON.stringify(value, null, 2);
        await fileFacade.writeTextFile(filePath(baseDir, bucket, id), text);
        return { ok: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: adapterError('write-failed', message) };
      }
    },

    async deleteMaterial(bucket, id): Promise<LocalMaterialDeleteResult> {
      try {
        const text = await fileFacade.readTextFile(filePath(baseDir, bucket, id));
        const parsed: unknown = JSON.parse(text);
        await fileFacade.writeTextFile(
          filePath(baseDir, bucket, `${id}.deleted`),
          JSON.stringify({ deletedAt: new Date().toISOString(), original: parsed }),
        );
        return { ok: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('ENOENT')) {
          return { ok: true };
        }
        return { ok: false, error: adapterError('unavailable', message) };
      }
    },

    async listMaterials(bucket): Promise<LocalMaterialListResult> {
      try {
        const dir = dirPath(baseDir, bucket);
        const indexText = await fileFacade.readTextFile(`${dir}/_index.json`);
        const ids: unknown = JSON.parse(indexText);
        if (!Array.isArray(ids)) {
          return { ok: true, ids: [] };
        }
        return { ok: true, ids: ids.filter((v): v is string => typeof v === 'string') };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('ENOENT')) {
          return { ok: true, ids: [] };
        }
        return { ok: false, error: adapterError('unavailable', message) };
      }
    },
  };
}
