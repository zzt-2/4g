/**
 * 通用数据存储处理函数
 * 用于处理从固定路径加载和保存数据的通用逻辑
 */
import path from 'path';
import { mkdir } from 'fs/promises';
import { loadJsonData, saveJsonData } from '../../../src/utils/common/fileUtils';
import { logError } from '../../../src/utils/common/errorUtils';
import { exportToFile, importFromFile } from '../../../src/utils/common/dialogUtils';
import { createHandlerRegistry } from '../../../src/utils/common/ipcUtils';
import { DATA_PATH_MAP } from '../../../src/config/configDefaults';
import { pathAPI } from '../../preload/api/path';

// 数据验证器类型
type DataValidator = (data: unknown) => { valid: boolean; reason?: string };

// 数据存储管理器类
class DataStorageManager<T> {
  private filePath: string; // 数据文件路径
  private data: T[] = []; // 内存中的数据
  private validator: DataValidator | undefined; // 数据验证函数

  /**
   * 创建数据存储管理器
   * @param filePath 数据文件路径
   * @param validator 可选的数据验证函数
   */
  constructor(filePath: string, validator?: DataValidator) {
    this.filePath = filePath;
    this.validator = validator;
    this.ensureDirectory();
  }

  /**
   * 确保存储目录存在
   */
  private async ensureDirectory() {
    const dirPath = path.dirname(this.filePath);
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (err) {
      console.error('创建目录失败:', err);
    }
  }

  /**
   * 加载数据
   * @returns 加载的数据数组
   */
  async loadData(): Promise<T[]> {
    try {
      const data = await loadJsonData<T>(this.filePath);
      // 确保返回的数据是数组类型
      this.data = Array.isArray(data) ? data : [];
      return this.data;
    } catch (error) {
      logError(`加载数据失败: ${this.filePath}`, error);
      this.data = [];
      return this.data;
    }
  }

  /**
   * 保存数据
   * @returns 保存结果
   */
  async saveData(): Promise<{ success: boolean; message?: string }> {
    return await saveJsonData(this.filePath, this.data);
  }

  /**
   * 获取当前内存中的数据
   * @returns 当前数据
   */
  getData(): T[] {
    return this.data;
  }

  /**
   * 设置数据
   * @param data 要设置的数据
   */
  setData(data: T[]): void {
    this.data = data;
  }

  /**
   * 添加或更新单个数据项
   * @param item 数据项
   * @param idField ID字段名称，默认为'id'
   * @returns 添加/更新后的数据项索引
   */
  async addOrUpdateItem(item: T, idField: keyof T = 'id' as keyof T): Promise<number> {
    // 确保数据已加载
    if (this.data.length === 0) {
      await this.loadData();
    }

    const index = this.data.findIndex((f) => f[idField] === item[idField]);
    if (index >= 0) {
      // 更新现有项
      this.data[index] = item;
    } else {
      // 添加新项
      this.data.push(item);
      return this.data.length - 1;
    }
    return index;
  }

  /**
   * 删除数据项
   * @param id ID值
   * @param idField ID字段名称，默认为'id'
   * @returns 删除是否成功
   */
  async deleteItem(id: unknown, idField: keyof T = 'id' as keyof T): Promise<boolean> {
    // 确保数据已加载
    if (this.data.length === 0) {
      await this.loadData();
    }

    const index = this.data.findIndex((f) => f[idField] === id);
    if (index >= 0) {
      this.data.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 验证数据
   * @param data 要验证的数据
   * @returns 验证结果
   */
  validateData(data: unknown): { valid: boolean; reason?: string } {
    if (this.validator) {
      return this.validator(data);
    }

    // 默认验证：确保是数组
    if (!Array.isArray(data)) {
      return { valid: false, reason: '导入的数据格式不正确，应为数组' };
    }

    return { valid: true };
  }
}

// 为每个配置路径创建处理器
function registerStorageHandlers() {
  // 遍历配置中的路径配置
  Object.entries(DATA_PATH_MAP).forEach(([key, dirPath]) => {
    const basename = path.basename(key);
    const defaultFile = pathAPI.getDataPath() + dirPath + '.json';
    const storageManager = new DataStorageManager(defaultFile);

    // 创建处理器注册表，使用简短名称（不包含路径）
    const registry = createHandlerRegistry(basename);

    // 注册基本操作
    registry.register('list', async () => {
      return await storageManager.loadData();
    });

    registry.register('save', async (_, item) => {
      await storageManager.addOrUpdateItem(item);
      return await storageManager.saveData();
    });

    registry.register('delete', async (_, id) => {
      const deleted = await storageManager.deleteItem(id);
      if (deleted) {
        return await storageManager.saveData();
      }
      return { success: false, message: `找不到要删除的${basename}` };
    });

    registry.register('saveAll', async (_, items) => {
      storageManager.setData(items);
      return await storageManager.saveData();
    });

    registry.register('export', async (_, items, filePath) => {
      return await exportToFile(items, filePath, `导出${basename}配置`, `${basename}-export.json`);
    });

    registry.register('import', async (_, filePath) => {
      return await importFromFile(
        filePath,
        storageManager.validateData.bind(storageManager),
        `导入${basename}配置`,
      );
    });

    // 注册所有处理器
    registry.registerAll();
  });
}

// 导出注册函数
export { registerStorageHandlers };
