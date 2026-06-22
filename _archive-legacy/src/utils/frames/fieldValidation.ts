/**
 * 字段表达式验证工具函数
 */

import {
  type ExpressionConfig,
  type VariableMapping,
  type ConditionalExpression,
  DataSourceType,
} from '../../types/frames/fields';

/**
 * 验证变量标识符的有效性
 * @param identifier 变量标识符
 * @returns 验证结果
 */
export function validateVariableIdentifier(identifier: string): {
  isValid: boolean;
  error?: string;
} {
  // 检查是否为空
  if (!identifier || identifier.trim() === '') {
    return { isValid: false, error: '变量标识符不能为空' };
  }

  // 检查长度限制（1-10个字符）
  if (identifier.length > 10) {
    return { isValid: false, error: '变量标识符长度不能超过10个字符' };
  }

  return { isValid: true };
}

/**
 * 验证表达式语法的基本有效性
 * @param expression 表达式字符串
 * @returns 验证结果
 */
export function validateExpressionSyntax(expression: string): {
  isValid: boolean;
  error?: string;
} {
  if (!expression || expression.trim() === '') {
    return { isValid: false, error: '表达式不能为空' };
  }

  try {
    // 简单的语法检查 - 检查括号匹配
    const openBrackets = (expression.match(/\(/g) || []).length;
    const closeBrackets = (expression.match(/\)/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return { isValid: false, error: '括号不匹配' };
    }

    // 检查是否包含危险的JavaScript代码
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /setTimeout\s*\(/,
      /setInterval\s*\(/,
      /window\./,
      /document\./,
      /process\./,
      /require\s*\(/,
      /import\s+/,
      /export\s+/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        return { isValid: false, error: '表达式包含不安全的代码' };
      }
    }

    return { isValid: true };
  } catch {
    return { isValid: false, error: '表达式语法无效' };
  }
}

/**
 * 验证变量映射的完整性
 * @param mapping 变量映射
 * @returns 验证结果
 */
export function validateVariableMapping(mapping: VariableMapping): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 验证标识符
  const identifierValidation = validateVariableIdentifier(mapping.identifier);
  if (!identifierValidation.isValid) {
    errors.push(identifierValidation.error!);
  }

  // 验证数据源ID
  if (!mapping.sourceId || mapping.sourceId.trim() === '') {
    errors.push('数据源ID不能为空');
  }

  // 根据数据源类型验证特定字段
  switch (mapping.sourceType) {
    case DataSourceType.FRAME_FIELD:
      if (!mapping.frameId) {
        errors.push('帧字段类型必须指定帧ID');
      }
      if (!mapping.fieldId) {
        errors.push('帧字段类型必须指定字段ID');
      }
      break;
    case DataSourceType.CURRENT_FIELD:
      // 当前字段类型可以引用自身，但需要确保不会产生循环依赖
      break;
    case DataSourceType.GLOBAL_STAT:
      // 全局统计类型只需要sourceId
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 验证条件表达式的完整性
 * @param condExpr 条件表达式
 * @param variables 可用的变量列表
 * @returns 验证结果
 */
export function validateConditionalExpression(
  condExpr: ConditionalExpression,
  variables: VariableMapping[],
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 验证条件
  const conditionValidation = validateExpressionSyntax(condExpr.condition);
  if (!conditionValidation.isValid) {
    errors.push(`条件无效: ${conditionValidation.error}`);
  }

  // 验证表达式
  const expressionValidation = validateExpressionSyntax(condExpr.expression);
  if (!expressionValidation.isValid) {
    errors.push(`表达式无效: ${expressionValidation.error}`);
  }

  // 检查表达式中使用的变量是否都已定义
  const variableIds = variables.map((v) => v.identifier);
  const usedVariables = extractVariablesFromExpression(condExpr.expression);

  for (const usedVar of usedVariables) {
    if (!variableIds.includes(usedVar)) {
      errors.push(`未定义的变量: ${usedVar}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 从表达式字符串中提取变量标识符
 * @param expression 表达式字符串
 * @returns 变量标识符数组
 */
export function extractVariablesFromExpression(expression: string): string[] {
  // 简单的变量提取逻辑 - 匹配字母组合
  const matches = expression.match(/\b[a-zA-Z]+\b/g) || [];

  // 过滤掉JavaScript关键字和数学函数
  const keywords = [
    'true',
    'false',
    'null',
    'undefined',
    'Math',
    'sin',
    'cos',
    'tan',
    'log',
    'exp',
    'sqrt',
    'abs',
    'floor',
    'ceil',
    'round',
    'max',
    'min',
  ];

  return [...new Set(matches.filter((match) => !keywords.includes(match)))];
}

/**
 * 验证表达式配置中的循环依赖
 * @param config 表达式配置
 * @param fieldId 当前字段ID
 * @param allFieldConfigs 所有字段的表达式配置
 * @returns 验证结果
 */
export function validateCircularDependency(
  config: ExpressionConfig,
  fieldId: string,
  allFieldConfigs: Map<string, ExpressionConfig>,
): {
  isValid: boolean;
  error?: string;
} {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCircularDep(currentFieldId: string): boolean {
    if (recursionStack.has(currentFieldId)) {
      return true; // 发现循环
    }

    if (visited.has(currentFieldId)) {
      return false; // 已访问过，无循环
    }

    visited.add(currentFieldId);
    recursionStack.add(currentFieldId);

    const currentConfig = allFieldConfigs.get(currentFieldId);
    if (currentConfig) {
      // 检查当前配置中引用的其他字段
      for (const variable of currentConfig.variables) {
        if (variable.sourceType === DataSourceType.CURRENT_FIELD && variable.fieldId === fieldId) {
          // 直接引用自身 - 允许
          continue;
        }
        if (variable.sourceType === DataSourceType.FRAME_FIELD && variable.fieldId) {
          if (hasCircularDep(variable.fieldId)) {
            return true;
          }
        }
      }
    }

    recursionStack.delete(currentFieldId);
    return false;
  }

  const hasCircular = hasCircularDep(fieldId);

  if (hasCircular) {
    return {
      isValid: false,
      error: '检测到循环依赖',
    };
  }

  return {
    isValid: true,
  };
}

/**
 * 完整的表达式配置验证
 * @param config 表达式配置
 * @param fieldId 当前字段ID（用于循环依赖检查）
 * @param allFieldConfigs 所有字段的表达式配置（用于循环依赖检查）
 * @returns 验证结果
 */
export function validateCompleteExpressionConfig(
  config: ExpressionConfig,
  fieldId?: string,
  allFieldConfigs?: Map<string, ExpressionConfig>,
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 基本结构验证
  if (!config.expressions || config.expressions.length === 0) {
    errors.push('至少需要一个表达式');
  }

  if (!config.variables) {
    config.variables = []; // 允许空变量列表
  }

  // 验证变量映射
  for (const variable of config.variables) {
    const mappingValidation = validateVariableMapping(variable);
    if (!mappingValidation.isValid) {
      errors.push(
        ...mappingValidation.errors.map((error) => `变量 ${variable.identifier}: ${error}`),
      );
    }
  }

  // 验证变量标识符唯一性
  const identifiers = config.variables.map((v) => v.identifier);
  const uniqueIdentifiers = new Set(identifiers);
  if (identifiers.length !== uniqueIdentifiers.size) {
    errors.push('变量标识符不能重复');
  }

  // 验证条件表达式
  for (let i = 0; i < config.expressions.length; i++) {
    const expr = config.expressions[i];
    if (expr) {
      const exprValidation = validateConditionalExpression(expr, config.variables);
      if (!exprValidation.isValid) {
        errors.push(...exprValidation.errors.map((error) => `表达式 ${i + 1}: ${error}`));
      }
    }
  }

  // 循环依赖验证（如果提供了相关参数）
  if (fieldId && allFieldConfigs) {
    const circularValidation = validateCircularDependency(config, fieldId, allFieldConfigs);
    if (!circularValidation.isValid) {
      errors.push(circularValidation.error!);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
