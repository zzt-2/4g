/**
 * 接收配置缓存管理器
 * 在主进程维护配置缓存，减少IPC传输开销
 */

import type { Frame } from '../../../src/types/frames/frames';
import type { FrameFieldMapping, DataGroup } from '../../../src/types/frames/receive';

/**
 * 配置缓存管理器
 */
class ReceiveConfigCache {
  private frames: Frame[] = [];
  private mappings: FrameFieldMapping[] = [];
  private groups: DataGroup[] = [];
  private directDataFrames: Frame[] = [];
  private lastUpdateTimestamp = 0;

  /**
   * 更新完整配置
   */
  updateConfig(frames: Frame[], mappings: FrameFieldMapping[], groups: DataGroup[]): void {
    this.frames = frames;
    this.mappings = mappings;
    this.groups = groups;
    this.lastUpdateTimestamp = Date.now();

    // 计算并缓存直接数据帧
    this.updateDirectDataFrames();

    console.log('📦 接收配置缓存已更新:', {
      frames: this.frames.length,
      mappings: this.mappings.length,
      groups: this.groups.length,
      directDataFrames: this.directDataFrames.length,
      timestamp: new Date(this.lastUpdateTimestamp).toISOString(),
    });
  }

  /**
   * 只更新帧模板
   */
  updateFrames(frames: Frame[]): void {
    this.frames = frames;
    this.lastUpdateTimestamp = Date.now();
    this.updateDirectDataFrames();

    console.log('📦 帧模板缓存已更新:', {
      frames: this.frames.length,
      directDataFrames: this.directDataFrames.length,
    });
  }

  /**
   * 只更新映射关系
   */
  updateMappings(mappings: FrameFieldMapping[]): void {
    this.mappings = mappings;
    this.lastUpdateTimestamp = Date.now();

    console.log('📦 映射关系缓存已更新:', {
      mappings: this.mappings.length,
    });
  }

  /**
   * 只更新数据分组
   */
  updateGroups(groups: DataGroup[]): void {
    this.groups = groups;
    this.lastUpdateTimestamp = Date.now();

    console.log('📦 数据分组缓存已更新:', {
      groups: this.groups.length,
    });
  }

  /**
   * 计算并缓存直接数据帧
   * 过滤出包含直接数据字段的接收帧
   */
  private updateDirectDataFrames(): void {
    this.directDataFrames = this.frames
      .filter((frame) => frame.direction === 'receive')
      .map((frame) => {
        // 过滤出直接数据字段
        const directFields = frame.fields?.filter(
          (field) => (field.dataParticipationType || 'direct') === 'direct',
        );

        // 如果没有直接数据字段，排除此帧
        if (!directFields || directFields.length === 0) {
          return null;
        }

        // 返回只包含直接数据字段的帧副本
        return {
          ...frame,
          fields: directFields,
        };
      })
      .filter((frame): frame is Frame => frame !== null);
  }

  /**
   * 获取直接数据帧（用于帧匹配）
   */
  getDirectDataFrames(): Frame[] {
    return this.directDataFrames;
  }

  /**
   * 获取映射关系
   */
  getMappings(): FrameFieldMapping[] {
    return this.mappings;
  }

  /**
   * 获取数据分组
   */
  getGroups(): DataGroup[] {
    return this.groups;
  }

  /**
   * 获取所有帧模板
   */
  getFrames(): Frame[] {
    return this.frames;
  }

  /**
   * 获取最后更新时间戳
   */
  getLastUpdateTimestamp(): number {
    return this.lastUpdateTimestamp;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.frames = [];
    this.mappings = [];
    this.groups = [];
    this.directDataFrames = [];
    this.lastUpdateTimestamp = 0;

    console.log('🗑️ 接收配置缓存已清空');
  }

  /**
   * 获取缓存状态信息
   */
  getStatus(): {
    hasData: boolean;
    framesCount: number;
    mappingsCount: number;
    groupsCount: number;
    directDataFramesCount: number;
    lastUpdateTime: string;
  } {
    return {
      hasData: this.frames.length > 0,
      framesCount: this.frames.length,
      mappingsCount: this.mappings.length,
      groupsCount: this.groups.length,
      directDataFramesCount: this.directDataFrames.length,
      lastUpdateTime: this.lastUpdateTimestamp
        ? new Date(this.lastUpdateTimestamp).toISOString()
        : 'Never',
    };
  }
}

// 导出单例实例
export const receiveConfigCache = new ReceiveConfigCache();
