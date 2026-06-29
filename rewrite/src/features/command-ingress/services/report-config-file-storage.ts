/**
 * 报告配置文件存储(D008:state/report-configs.json)。
 *
 * 照 task-template-file-storage / docking-file-storage 同款范式:
 * - 带版本号(SCHEMA_VERSION)+ atomic write + .bak 备份(走 json-storage 工具)。
 * - 同步读(内存缓存)+ 异步写(fire-and-forget):composable setup 时同步要数据,
 *   bootstrap 必须先 hydrate 灌缓存,composable 再 loadAll 拿。
 * - 文件缺失/损坏/schema 不匹配 → 重置为空 + onDataLoss 让用户感知(不静默吞错)。
 *
 * 与 docking-file-storage 的区别:ReportConfig 是第 5 份独立数据(不塞进 docking.json
 * 复合体),单独文件——读写频率独立于对接配置,可独立直接编辑。见 spec 存储位置抉择。
 */
import type { ReportConfig } from '../core/report-config';
import { isReportConfig } from '../core/report-config';
import {
  readJsonWithBackup,
  writeJsonWithBackup,
  type JsonFileAccess,
  type JsonReadResult,
} from '@/shared/utils/json-storage';

const SCHEMA_VERSION = 1;

interface PersistedPayload {
  readonly version: number;
  readonly configs: readonly ReportConfig[];
}

export interface ReportConfigFileStorageOptions {
  /** 损坏/schema 不匹配时回调,bootstrap 接 Quasar Notify 让用户感知。 */
  readonly onDataLoss?: (message: string) => void;
}

export interface ReportConfigFileStorage {
  /** 同步读全量(内存缓存,bootstrap hydrate 后即可用)。 */
  loadAll(): ReportConfig[];
  /** 按 templateId 查。 */
  getByTemplateId(templateId: string): ReportConfig | undefined;
  /** 同步更新缓存 + fire-and-forget 异步写文件。 */
  saveAll(configs: readonly ReportConfig[]): void;
  /** 异步加载文件灌入内存缓存。bootstrap 在 composable 之前调。传 seed 时跳过文件读。 */
  hydrate(seed?: readonly ReportConfig[]): Promise<void>;
}

function parsePayload(
  value: unknown,
): { ok: true; configs: readonly ReportConfig[] } | { ok: false; reason: 'version-high' | 'malformed' } {
  if (value === null || typeof value !== 'object') return { ok: false, reason: 'malformed' };
  const payload = value as Partial<PersistedPayload>;
  if (typeof payload.version !== 'number' || !Array.isArray(payload.configs)) {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.version > SCHEMA_VERSION) return { ok: false, reason: 'version-high' };
  // 过滤掉形状不合法的项,保留合法的(单条坏不连累整份)。
  return { ok: true, configs: payload.configs.filter(isReportConfig) };
}

export function createReportConfigFileStorage(
  files: JsonFileAccess,
  dataDir: string,
  options: ReportConfigFileStorageOptions = {},
): ReportConfigFileStorage {
  const filePath = `${dataDir}/state/report-configs.json`;
  const onDataLoss = options.onDataLoss;
  let cache: ReportConfig[] = [];

  function reportDataLoss(message: string): void {
    console.error(`[report-config] data loss: ${message}`);
    onDataLoss?.(message);
  }

  async function writeToFile(configs: readonly ReportConfig[]): Promise<void> {
    try {
      await writeJsonWithBackup(files, filePath, { version: SCHEMA_VERSION, configs });
    } catch (err) {
      console.error('[report-config] file write failed:', err instanceof Error ? err.message : err);
    }
  }

  return {
    loadAll() {
      return [...cache];
    },
    getByTemplateId(templateId) {
      return cache.find(c => c.templateId === templateId);
    },
    saveAll(configs) {
      cache = [...configs];
      void writeToFile(configs);
    },
    async hydrate(seed) {
      if (seed !== undefined) {
        cache = [...seed];
        return;
      }
      const result: JsonReadResult = await readJsonWithBackup(files, filePath);
      if (result.status === 'ok' || result.status === 'recovered') {
        if (result.status === 'recovered') {
          onDataLoss?.('report-configs.json 主文件损坏,已从备份恢复');
        }
        const parsed = parsePayload(result.value);
        if (parsed.ok) {
          cache = [...parsed.configs];
          return;
        }
        if (parsed.reason === 'version-high') {
          reportDataLoss(`report-configs.json schema version 高于预期(${SCHEMA_VERSION}),已重置为空`);
        } else {
          reportDataLoss('report-configs.json 数据格式异常,已重置为空');
        }
        cache = [];
        return;
      }
      if (result.status === 'corrupted') {
        reportDataLoss('report-configs.json 主+备均损坏,报告配置数据丢失');
      }
      // missing / corrupted(已报) → 空缓存(诚实空着,不造假)。
      cache = [];
    },
  };
}

/**
 * 延迟注入 holder(照 LazyDockingStorage / rewriteRuntime LazyPersistence 同款)。
 *
 * wireFeatures 同步初始化时无 fileFacade,先建空 delegate(loadAll 返空、saveAll 丢弃、
 * getByTemplateId 返 undefined、hydrate no-op);bootstrap 异步拿到 fileFacade + dataDir
 * 后,创建真 storage + hydrate,再 setDelegate 注入。
 *
 * 关键:northbound 的 reportConfigProvider 闭包调 getByTemplateId。delegate 是空壳时
 * (hydrate 前)返回 undefined → 报告三类为空(诚实非造假,不 fallback 假数据)。
 *
 * 这正是防 S014/S017 静默失败温床:不能假设 provider 一定有数据——同步建 service 时
 * 文件还没读到。显式测 "setDelegate 前 provider 返 undefined" 这条分支(见 spec 测试),
 * 是为了将来谁改坏了立刻红。
 */
export class LazyReportConfigStorage implements ReportConfigFileStorage {
  private delegate: ReportConfigFileStorage = createEmptyStorage();

  setDelegate(storage: ReportConfigFileStorage): void {
    this.delegate = storage;
  }
  loadAll() {
    return this.delegate.loadAll();
  }
  getByTemplateId(templateId: string) {
    return this.delegate.getByTemplateId(templateId);
  }
  saveAll(configs: readonly ReportConfig[]) {
    this.delegate.saveAll(configs);
  }
  hydrate(seed?: readonly ReportConfig[]) {
    return this.delegate.hydrate(seed);
  }
}

/** 空 storage(wireFeatures 初始 delegate):loadAll 返空、getByTemplateId 返 undefined、saveAll 丢弃、hydrate no-op。 */
function createEmptyStorage(): ReportConfigFileStorage {
  return {
    loadAll: () => [],
    getByTemplateId: () => undefined,
    saveAll: () => {
      /* discarded before bootstrap */
    },
    async hydrate() {
      /* no-op */
    },
  };
}
