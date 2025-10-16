/**
 * 表达式计算器组合式函数
 * 处理动态表达式的计算逻辑
 */

import { ref, computed } from 'vue';
import type {
  ExpressionConfig,
  VariableMapping,
  ConditionalExpression,
} from '../../types/frames/fields';
import { DataSourceType } from '../../types/frames/fields';
import { useGlobalStatsStore } from '../../stores/globalStatsStore';
import { useScoeStore } from '../../stores/scoeStore';

// 计算上下文
export interface CalculationContext {
  frameId?: string; // 当前帧ID
  fieldId?: string; // 当前字段ID
  frameData?: Map<string, unknown>; // 当前帧的字段数据
  allFrameData?: Map<string, Map<string, unknown>>; // 所有帧的数据
}

// 计算结果
export interface CalculationResult {
  success: boolean;
  value: unknown;
  error?: string;
  usedVariables?: Record<string, unknown>; // 使用的变量值
}

// 循环依赖错误类型
export interface CircularDependencyError {
  type: 'circular_dependency';
  cycle: string[];
  message: string;
}

// 依赖分析错误类型
export interface DependencyAnalysisError {
  type: 'dependency_analysis';
  fieldId: string;
  error: string;
}

export function useExpressionCalculator() {
  const lastError = ref<string>('');
  const calculationHistory = ref<CalculationResult[]>([]);

  // 获取全局统计store
  const globalStatsStore = useGlobalStatsStore();
  // 获取SCOE store
  const scoeStore = useScoeStore();

  // 解析单个变量的值
  const resolveVariableValue = (mapping: VariableMapping, context: CalculationContext): unknown => {
    switch (mapping.sourceType) {
      case DataSourceType.CURRENT_FIELD:
        // 当前帧的其他字段数据，通过sourceId指定字段ID
        if (context.frameData && mapping.sourceId) {
          return context.frameData.get(mapping.sourceId);
        }
        break;

      case DataSourceType.FRAME_FIELD:
        // 其他帧字段数据
        if (mapping.frameId && mapping.fieldId) {
          if (mapping.frameId === context.frameId) {
            // 同一帧的其他字段
            return context.frameData?.get(mapping.fieldId);
          } else {
            // 其他帧的字段
            return context.allFrameData?.get(mapping.frameId)?.get(mapping.fieldId);
          }
        }
        break;

      case DataSourceType.GLOBAL_STAT:
        // 全局统计数据
        try {
          return globalStatsStore.getStatValue(mapping.sourceId);
        } catch (error) {
          console.error('获取全局统计数据失败:', error);
          return 0;
        }

      case DataSourceType.SCOE_DATA:
        // SCOE数据（配置和状态）
        try {
          return resolveScoeData(mapping.sourceId);
        } catch (error) {
          console.error('获取SCOE数据失败:', error);
          return 0;
        }

      default:
        return undefined;
    }

    return undefined;
  };

  // 解析SCOE数据路径
  const resolveScoeData = (path: string): unknown => {
    if (!path) return undefined;

    const parts = path.split('.');
    if (parts.length === 0) return undefined;

    // 获取根对象
    let current: Record<string, unknown> | undefined;
    if (parts[0] === 'status') {
      current = scoeStore.status as unknown as Record<string, unknown>;
    } else if (parts[0] === 'config') {
      current = scoeStore.loadedConfig as unknown as Record<string, unknown>;
      if (!current) return undefined;
    } else {
      return undefined;
    }

    // 遍历路径
    for (let i = 1; i < parts.length; i++) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      const key = parts[i];
      if (!key) return undefined;
      current = current[key] as Record<string, unknown> | undefined;
    }

    return current;
  };

  // 解析所有变量
  const resolveAllVariables = (
    variables: VariableMapping[],
    context: CalculationContext,
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const variable of variables) {
      const value = resolveVariableValue(variable, context);
      const finalValue = value !== undefined ? value : 0; // 默认值为0
      result[variable.identifier] = finalValue;
    }

    return result;
  };

  // 安全的表达式计算
  const safeEvaluate = (expression: string, variables: Record<string, unknown>): unknown => {
    try {
      // 创建受限的计算环境
      const context = {
        ...variables,
        // 数学函数
        Math,
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        max: Math.max,
        min: Math.min,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        sqrt: Math.sqrt,
        log: Math.log,
        exp: Math.exp,
        pow: Math.pow,
      };

      // 使用Function构造函数进行高性能计算
      const keys = Object.keys(context);
      const values = Object.values(context);

      // 创建函数并执行计算
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const func = new Function(...keys, `return (${expression})`);
      const result = func(...values);

      return result;
    } catch (error) {
      throw new Error(`表达式计算错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 计算条件表达式
  const calculateConditionalExpression = (
    condExpr: ConditionalExpression,
    variables: Record<string, unknown>,
  ): CalculationResult => {
    try {
      // 先计算条件
      const conditionResult = safeEvaluate(condExpr.condition, variables);

      // 如果条件为真，则计算表达式
      if (conditionResult) {
        const value = safeEvaluate(condExpr.expression, variables);
        return {
          success: true,
          value,
          usedVariables: variables,
        };
      } else {
        // 条件为假，返回特殊值表示跳过
        return {
          success: true,
          value: null, // null表示条件不满足
          usedVariables: variables,
        };
      }
    } catch (error) {
      return {
        success: false,
        value: undefined,
        error: error instanceof Error ? error.message : String(error),
        usedVariables: variables,
      };
    }
  };

  // 计算表达式配置
  const calculateExpression = (
    config: ExpressionConfig,
    context: CalculationContext,
  ): CalculationResult => {
    try {
      // 解析变量
      const variables = resolveAllVariables(config.variables, context);

      // 按顺序计算每个条件表达式，直到找到满足条件的
      for (const condExpr of config.expressions) {
        const result = calculateConditionalExpression(condExpr, variables);

        if (!result.success) {
          // 计算出错，直接返回错误
          return result;
        }

        if (result.value !== null) {
          // 找到满足条件的表达式
          return result;
        }
        // 否则继续下一个表达式
      }

      // 所有条件都不满足，返回默认值
      return {
        success: true,
        value: 0,
        usedVariables: variables,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      lastError.value = errorMessage;

      return {
        success: false,
        value: undefined,
        error: errorMessage,
      };
    }
  };

  // 批量计算表达式
  const calculateBatchExpressions = (
    configs: Array<{ fieldId: string; config: ExpressionConfig }>,
    context: CalculationContext,
  ): Record<string, CalculationResult> => {
    const results: Record<string, CalculationResult> = {};

    for (const { fieldId, config } of configs) {
      const result = calculateExpression(config, {
        ...context,
        fieldId,
      });

      results[fieldId] = result;

      // 记录计算历史
      calculationHistory.value.push(result);

      // 限制历史记录数量
      if (calculationHistory.value.length > 100) {
        calculationHistory.value.shift();
      }
    }

    return results;
  };

  // 验证表达式语法
  const validateExpressionSyntax = (expression: string): { isValid: boolean; error?: string } => {
    try {
      // 尝试用空变量计算表达式
      safeEvaluate(expression, {});
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // 测试表达式
  const testExpression = (
    config: ExpressionConfig,
    testVariables: Record<string, unknown> = {},
  ): CalculationResult => {
    const mockContext: CalculationContext = {
      frameId: 'test',
      fieldId: 'test',
      frameData: new Map(Object.entries(testVariables)),
    };

    return calculateExpression(config, mockContext);
  };

  // 获取表达式中使用的变量列表
  const extractVariablesFromExpression = (expression: string): string[] => {
    const matches = expression.match(/\b[a-zA-Z]+\b/g) || [];
    const keywords = [
      'true',
      'false',
      'null',
      'undefined',
      'Math',
      'abs',
      'ceil',
      'floor',
      'round',
      'max',
      'min',
      'sin',
      'cos',
      'tan',
      'sqrt',
      'log',
      'exp',
      'pow',
    ];
    return [...new Set(matches.filter((match) => !keywords.includes(match)))];
  };

  // 从表达式配置中提取当前帧字段引用
  const extractFieldReferences = (
    expression: string,
    variables: VariableMapping[],
  ): Set<string> => {
    const fieldReferences = new Set<string>();

    // 获取表达式中使用的变量标识符
    const usedVariables = extractVariablesFromExpression(expression);

    // 查找对应的变量映射，筛选出当前帧字段引用
    for (const varName of usedVariables) {
      const mapping = variables.find((v) => v.identifier === varName);
      if (mapping && mapping.sourceType === DataSourceType.CURRENT_FIELD && mapping.sourceId) {
        fieldReferences.add(mapping.sourceId);
      }
    }

    return fieldReferences;
  };

  // 分析表达式字段间的依赖关系
  const analyzeDependencies = (
    expressionFields: Array<{ fieldId: string; config: ExpressionConfig }>,
  ): Map<string, Set<string>> => {
    const dependencies = new Map<string, Set<string>>();

    for (const { fieldId, config } of expressionFields) {
      const fieldDependencies = new Set<string>();

      // 分析每个条件表达式的依赖
      for (const condExpr of config.expressions) {
        // 分析条件表达式的依赖
        const conditionRefs = extractFieldReferences(condExpr.condition, config.variables);
        conditionRefs.forEach((ref) => fieldDependencies.add(ref));

        // 分析执行表达式的依赖
        const expressionRefs = extractFieldReferences(condExpr.expression, config.variables);
        expressionRefs.forEach((ref) => fieldDependencies.add(ref));
      }

      // 移除自引用（字段依赖自己是允许的，但不影响计算顺序）
      fieldDependencies.delete(fieldId);

      dependencies.set(fieldId, fieldDependencies);
    }

    return dependencies;
  };

  // 拓扑排序实现（Kahn算法）
  const topologicalSort = (
    dependencies: Map<string, Set<string>>,
  ): { success: true; order: string[] } | { success: false; error: string; cycle: string[] } => {
    const allFields = Array.from(dependencies.keys());
    const inDegree = new Map<string, number>();
    const graph = new Map<string, Set<string>>();

    // 初始化入度和邻接表
    for (const fieldId of allFields) {
      inDegree.set(fieldId, 0);
      graph.set(fieldId, new Set());
    }

    // 构建反向图（从被依赖者指向依赖者）和计算入度
    for (const [fieldId, deps] of dependencies) {
      for (const depFieldId of deps) {
        // 只处理表达式字段之间的依赖
        if (dependencies.has(depFieldId)) {
          if (!graph.get(depFieldId)) {
            graph.set(depFieldId, new Set());
          }
          graph.get(depFieldId)!.add(fieldId);
          inDegree.set(fieldId, (inDegree.get(fieldId) || 0) + 1);
        }
      }
    }

    // Kahn算法
    const queue: string[] = [];
    const result: string[] = [];

    // 找到入度为0的节点
    for (const [fieldId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(fieldId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // 处理当前节点的邻居
      const neighbors = graph.get(current) || new Set();
      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 检查是否存在循环依赖
    if (result.length !== allFields.length) {
      // 找到循环中的节点
      const cycleNodes = allFields.filter((fieldId) => (inDegree.get(fieldId) || 0) > 0);
      return {
        success: false,
        error: `检测到循环依赖`,
        cycle: cycleNodes,
      };
    }

    return {
      success: true,
      order: result,
    };
  };

  // 清空计算历史
  const clearHistory = () => {
    calculationHistory.value = [];
  };

  // 计算统计信息
  const calculationStats = computed(() => {
    const total = calculationHistory.value.length;
    const successful = calculationHistory.value.filter((r) => r.success).length;
    const failed = total - successful;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) + '%' : '0%',
    };
  });

  return {
    // 状态
    lastError,
    calculationHistory,
    calculationStats,

    // 主要功能
    calculateExpression,
    calculateBatchExpressions,
    testExpression,

    // 工具函数
    resolveVariableValue,
    resolveAllVariables,
    validateExpressionSyntax,
    extractVariablesFromExpression,
    clearHistory,

    // 依赖分析功能
    extractFieldReferences,
    analyzeDependencies,
    topologicalSort,
  };
}
