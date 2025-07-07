/**
 * 帧表达式管理器
 * 提供通用的表达式计算功能，支持发送帧和接收帧
 */

import { useExpressionCalculator } from './useExpressionCalculator';
import type { CalculationContext } from './useExpressionCalculator';
import type { SendFrameInstance } from '../../types/frames/sendInstances';
import type { ExpressionConfig } from '../../types/frames/fields';
import { useReceiveFramesStore } from '../../stores/frames/receiveFramesStore';
import { useFrameTemplateStore } from '../../stores/frames/frameTemplateStore';

export interface ExpressionCalculationResult {
  fieldId: string;
  success: boolean;
  value: unknown;
  error?: string;
}

export function useFrameExpressionManager() {
  const expressionCalculator = useExpressionCalculator();
  const receiveFramesStore = useReceiveFramesStore();
  const frameTemplateStore = useFrameTemplateStore();

  // 依赖分析结果缓存
  const dependencyCache = new Map<
    string,
    {
      dependencies: Map<string, Set<string>>;
      sortOrder: string[];
      timestamp: number;
      configHash: string;
    }
  >();

  /**
   * 生成表达式配置的哈希值
   * @param expressionConfigs 表达式配置列表
   * @returns 哈希值
   */
  const generateConfigHash = (
    expressionConfigs: Array<{ fieldId: string; config: ExpressionConfig }>,
  ): string => {
    const configStr = JSON.stringify(
      expressionConfigs.map(({ fieldId, config }) => ({
        fieldId,
        expressions: config.expressions,
        variables: config.variables,
      })),
    );

    // 使用简单的哈希算法替代 btoa，支持 Unicode 字符
    let hash = 0;
    for (let i = 0; i < configStr.length; i++) {
      const char = configStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }

    // 转换为16进制字符串并确保长度一致
    return Math.abs(hash).toString(16).padStart(8, '0');
  };

  /**
   * 获取缓存的依赖分析结果
   * @param cacheKey 缓存键
   * @param expressionConfigs 表达式配置列表
   * @returns 缓存结果或null
   */
  const getCachedDependencyResult = (
    cacheKey: string,
    expressionConfigs: Array<{ fieldId: string; config: ExpressionConfig }>,
  ) => {
    const cached = dependencyCache.get(cacheKey);
    if (!cached) return null;

    const currentHash = generateConfigHash(expressionConfigs);
    const cacheAge = Date.now() - cached.timestamp;

    // 缓存有效期5分钟，且配置未变更
    if (cacheAge < 5 * 60 * 1000 && cached.configHash === currentHash) {
      return cached;
    }

    // 缓存过期或配置变更，删除缓存
    dependencyCache.delete(cacheKey);
    return null;
  };

  /**
   * 设置依赖分析结果缓存
   * @param cacheKey 缓存键
   * @param dependencies 依赖关系
   * @param sortOrder 排序结果
   * @param expressionConfigs 表达式配置列表
   */
  const setCachedDependencyResult = (
    cacheKey: string,
    dependencies: Map<string, Set<string>>,
    sortOrder: string[],
    expressionConfigs: Array<{ fieldId: string; config: ExpressionConfig }>,
  ) => {
    const configHash = generateConfigHash(expressionConfigs);
    dependencyCache.set(cacheKey, {
      dependencies,
      sortOrder,
      timestamp: Date.now(),
      configHash,
    });

    // 限制缓存大小
    if (dependencyCache.size > 50) {
      const firstKey = dependencyCache.keys().next().value;
      if (firstKey) {
        dependencyCache.delete(firstKey);
      }
    }
  };

  /**
   * 根据字段数据类型处理计算结果
   * @param value 计算结果值
   * @param dataType 字段数据类型
   * @returns 处理后的值
   */
  const processValueByDataType = (value: unknown, dataType: string): unknown => {
    // 如果值不是数字，直接返回
    if (typeof value !== 'number' || isNaN(value)) {
      return value;
    }

    // 对于浮点数类型，保持原值
    if (dataType === 'float' || dataType === 'double') {
      return value;
    }

    // 对于其他数字类型，进行向下取整
    if (['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32'].includes(dataType)) {
      return Math.floor(value);
    }

    // 其他类型保持原值
    return value;
  };

  /**
   * 通用的依赖计算函数
   * @param expressionConfigs 表达式配置列表
   * @param context 计算上下文
   * @param fieldDataTypes 字段数据类型映射（可选，用于获取字段数据类型）
   * @returns 计算结果
   */
  const calculateWithDependencies = (
    expressionConfigs: Array<{ fieldId: string; config: ExpressionConfig }>,
    context: CalculationContext,
    fieldDataTypes?: Map<string, string>,
  ): ExpressionCalculationResult[] => {
    const results: ExpressionCalculationResult[] = [];

    if (expressionConfigs.length === 0) {
      return results;
    }

    try {
      // 生成缓存键
      const cacheKey = `${context.frameId || 'unknown'}_${expressionConfigs.length}`;

      // 1. 尝试从缓存获取依赖分析结果
      let dependencies: Map<string, Set<string>>;
      let sortResult:
        | { success: true; order: string[] }
        | { success: false; error: string; cycle: string[] };

      const cached = getCachedDependencyResult(cacheKey, expressionConfigs);
      if (cached) {
        dependencies = cached.dependencies;
        sortResult = { success: true, order: cached.sortOrder };
      } else {
        // 2. 分析依赖关系
        dependencies = expressionCalculator.analyzeDependencies(expressionConfigs);

        // 3. 拓扑排序
        sortResult = expressionCalculator.topologicalSort(dependencies);

        // 缓存成功的分析结果
        if (sortResult.success) {
          setCachedDependencyResult(cacheKey, dependencies, sortResult.order, expressionConfigs);
        }
      }

      if (!sortResult.success) {
        // 处理循环依赖错误
        console.error('表达式循环依赖检测:', sortResult.error, '涉及字段:', sortResult.cycle);

        // 循环依赖时回退到原有的并行计算模式
        for (const { fieldId } of expressionConfigs) {
          results.push({
            fieldId,
            success: false,
            value: undefined,
            error: `循环依赖错误: ${sortResult.error}`,
          });
        }
        return results;
      }

      // 4. 按依赖顺序计算表达式
      const fieldConfigMap = new Map<string, ExpressionConfig>();
      expressionConfigs.forEach(({ fieldId, config }) => {
        fieldConfigMap.set(fieldId, config);
      });

      for (const fieldId of sortResult.order) {
        const config = fieldConfigMap.get(fieldId);
        if (!config) continue;

        // 计算单个表达式
        const result = expressionCalculator.calculateExpression(config, {
          ...context,
          fieldId,
        });

        results.push({
          fieldId,
          success: result.success,
          value: result.value,
          ...(result.error && { error: result.error }),
        });

        // 立即更新上下文数据，供后续表达式使用
        if (result.success && result.value !== undefined && context.frameData) {
          // 关键修改：在更新到上下文前，根据字段数据类型进行处理
          let processedValue: unknown = result.value;

          // 需要获取字段的数据类型信息来决定是否下取整
          let dataType: string | undefined;

          if (fieldDataTypes) {
            // 优先使用传入的字段数据类型映射
            dataType = fieldDataTypes.get(fieldId);
          } else {
            // 回退到从帧模板中获取字段数据类型
            const frame = frameTemplateStore.frames.find(
              (f) =>
                f.id === context.frameId && (f.direction === 'send' || f.direction === 'receive'),
            );
            const field = frame?.fields?.find((f) => f.id === fieldId);
            dataType = field?.dataType;
          }

          if (dataType) {
            processedValue = processValueByDataType(result.value, dataType);
          }

          context.frameData.set(fieldId, processedValue);
        }
      }
    } catch (error) {
      console.error('依赖计算过程中发生错误:', error);

      // 发生错误时回退到原有的并行计算模式
      for (const { fieldId } of expressionConfigs) {
        results.push({
          fieldId,
          success: false,
          value: undefined,
          error: `依赖分析失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return results;
  };

  /**
   * 计算发送帧实例的表达式
   * @param frameInstance 发送帧实例
   * @returns 计算结果映射
   */
  const calculateSendFrameExpressions = (
    frameInstance: SendFrameInstance,
  ): ExpressionCalculationResult[] => {
    // 构建字段数据映射
    const fieldDataMap = new Map<string, unknown>();
    frameInstance.fields.forEach((field) => {
      let fieldValue: unknown = field.value;

      // 尝试转换为数字类型
      if (typeof fieldValue === 'string' && fieldValue.trim() !== '') {
        const numValue = Number(fieldValue);
        if (!isNaN(numValue)) {
          fieldValue = numValue;
        }
      }

      fieldDataMap.set(field.id, fieldValue);
    });

    // 筛选出有表达式配置的字段
    const expressionFields = frameInstance.fields.filter(
      (field) => field.expressionConfig && field.expressionConfig.expressions.length > 0,
    );

    // 构建字段数据类型映射
    const fieldDataTypes = new Map<string, string>();
    frameInstance.fields.forEach((field) => {
      fieldDataTypes.set(field.id, field.dataType);
    });

    // 使用依赖计算方法
    return calculateWithDependencies(
      expressionFields.map((field) => ({
        fieldId: field.id,
        config: field.expressionConfig!,
      })),
      {
        frameId: frameInstance.frameId,
        frameData: fieldDataMap,
        allFrameData: receiveFramesStore.allReceiveFrameData,
      },
      fieldDataTypes,
    );
  };

  /**
   * 计算接收帧的表达式
   * 这是最复杂的部分，需要处理field到dataItem的映射
   * @param frameId 接收帧ID
   * @returns 计算结果映射
   */
  const calculateReceiveFrameExpressions = (frameId: string): ExpressionCalculationResult[] => {
    const results: ExpressionCalculationResult[] = [];

    try {
      // 1. 获取接收帧的模板定义
      const frame = frameTemplateStore.frames.find(
        (f) => f.id === frameId && f.direction === 'receive',
      );
      if (!frame || !frame.fields) {
        console.warn(`找不到接收帧模板: ${frameId}`);
        return results;
      }

      // 2. 筛选出有表达式配置的字段
      const expressionFields = frame.fields.filter(
        (field) => field.expressionConfig && field.expressionConfig.expressions.length > 0,
      );

      if (expressionFields.length === 0) {
        return results; // 没有表达式字段，直接返回
      }

      // 3. 获取该帧的映射关系
      const frameMappings = receiveFramesStore.mappings.filter(
        (mapping) => mapping.frameId === frameId,
      );

      // 4. 构建字段数据映射 - 重要：为所有字段初始化，然后填充有值的字段
      const fieldDataMap = new Map<string, unknown>();

      // 先为所有字段初始化默认值（避免undefined）
      frame.fields.forEach((field) => {
        fieldDataMap.set(field.id, 0); // 默认值为0
      });

      // 然后用实际数据覆盖有映射关系的字段
      frameMappings.forEach((mapping) => {
        const group = receiveFramesStore.groups.find((g) => g.id === mapping.groupId);
        const dataItem = group?.dataItems.find((item) => item.id === mapping.dataItemId);

        if (dataItem && dataItem.value !== null && dataItem.value !== undefined) {
          // 尝试转换为数字类型
          let fieldValue: unknown = dataItem.value;
          if (typeof fieldValue === 'string' && fieldValue.trim() !== '') {
            const numValue = Number(fieldValue);
            if (!isNaN(numValue)) {
              fieldValue = numValue;
            }
          }
          fieldDataMap.set(mapping.fieldId, fieldValue);
        }
      });

      // 5. 使用依赖计算方法
      const expressionResults = calculateWithDependencies(
        expressionFields.map((field) => ({
          fieldId: field.id,
          config: field.expressionConfig!,
        })),
        {
          frameId: frameId,
          frameData: fieldDataMap,
          allFrameData: receiveFramesStore.allReceiveFrameData,
        },
      );

      results.push(...expressionResults);
    } catch (error) {
      console.error('计算接收帧表达式时发生错误:', error);
    }

    return results;
  };

  /**
   * 应用发送帧表达式计算结果
   * @param frameInstance 发送帧实例
   * @param results 计算结果
   * @param updateCallback 更新回调函数
   */
  const applySendFrameResults = (
    frameInstance: SendFrameInstance,
    results: ExpressionCalculationResult[],
    updateCallback: (fieldId: string, value: string) => void,
  ): void => {
    results.forEach((result) => {
      if (result.success && result.value !== undefined) {
        // 获取字段信息
        const field = frameInstance.fields.find((f) => f.id === result.fieldId);
        if (!field) {
          console.warn(`未找到字段 ${result.fieldId}`);
          return;
        }

        // 根据字段数据类型处理结果值
        const processedValue = processValueByDataType(result.value, field.dataType);
        const newValue = String(processedValue);

        updateCallback(result.fieldId, newValue);
      } else if (!result.success) {
        console.error(`字段 ${result.fieldId} 表达式计算失败:`, result.error);
      }
    });
  };

  /**
   * 应用接收帧表达式计算结果
   * 将计算结果更新到对应的dataItems中
   * @param frameId 接收帧ID
   * @param results 计算结果
   */
  const applyReceiveFrameResults = (
    frameId: string,
    results: ExpressionCalculationResult[],
  ): void => {
    results.forEach((result) => {
      if (result.success && result.value !== undefined) {
        // 查找该字段对应的dataItem
        const mapping = receiveFramesStore.mappings.find(
          (m) => m.frameId === frameId && m.fieldId === result.fieldId,
        );

        if (mapping) {
          // 获取字段信息以确定数据类型
          const frame = frameTemplateStore.frames.find(
            (f) => f.id === frameId && f.direction === 'receive',
          );
          const field = frame?.fields?.find((f) => f.id === result.fieldId);

          if (field) {
            // 根据字段数据类型处理结果值
            const processedValue = processValueByDataType(result.value, field.dataType);
            const displayValue = String(processedValue);

            // 更新dataItem的值
            receiveFramesStore.updateDataItem(mapping.groupId, mapping.dataItemId, {
              value: processedValue,
              displayValue: displayValue,
            });
          } else {
            console.warn(`未找到接收帧 ${frameId} 的字段 ${result.fieldId}`);
          }
        } else {
          console.warn(`未找到字段 ${result.fieldId} 的映射关系`);
        }
      } else if (!result.success) {
        console.error(`接收帧 ${frameId} 字段 ${result.fieldId} 表达式计算失败:`, result.error);
      }
    });
  };

  /**
   * 计算并应用发送帧表达式（便捷方法）
   * @param frameInstance 发送帧实例
   * @param updateCallback 更新回调函数
   */
  const calculateAndApplySendFrame = (
    frameInstance: SendFrameInstance,
    updateCallback: (fieldId: string, value: string) => void,
  ): void => {
    const results = calculateSendFrameExpressions(frameInstance);
    if (results.length > 0) {
      applySendFrameResults(frameInstance, results, updateCallback);
    }
  };

  /**
   * 计算并应用接收帧表达式（便捷方法）
   * @param frameId 接收帧ID
   */
  const calculateAndApplyReceiveFrame = (frameId: string): void => {
    const results = calculateReceiveFrameExpressions(frameId);
    if (results.length > 0) {
      applyReceiveFrameResults(frameId, results);
    }
  };

  /**
   * 检查帧是否有表达式字段
   * @param frameId 帧ID
   * @param direction 帧方向
   */
  const hasExpressionFields = (frameId: string, direction: 'send' | 'receive'): boolean => {
    const frame = frameTemplateStore.frames.find(
      (f) => f.id === frameId && f.direction === direction,
    );
    if (!frame || !frame.fields) return false;

    return frame.fields.some(
      (field) => field.expressionConfig && field.expressionConfig.expressions.length > 0,
    );
  };

  return {
    // 基础计算方法
    calculateSendFrameExpressions,
    calculateReceiveFrameExpressions,

    // 应用结果方法
    applySendFrameResults,
    applyReceiveFrameResults,

    // 便捷方法
    calculateAndApplySendFrame,
    calculateAndApplyReceiveFrame,

    // 工具方法
    hasExpressionFields,
  };
}
