/**
 * 接收帧匹配工具函数
 */

import type { Frame, IdentifierRule } from '../../types/frames/frames';
import type { FrameMatchRule } from '../../types/frames/receive';
import { convertToHex } from '../frames/hexCovertUtils';

/**
 * 从接收帧中提取匹配规则
 * @param frames 帧列表
 * @returns 匹配规则数组
 */
export function createMatchRules(frames: Frame[]): FrameMatchRule[] {
  return frames.map((frame) => ({
    frameId: frame.id,
    rules: frame.identifierRules || [],
  }));
}

/**
 * 根据规则匹配接收数据
 * @param data 接收到的数据
 * @param rules 匹配规则列表
 * @returns 匹配的帧ID，如果没有匹配则返回null
 */
export function matchFrame(data: Uint8Array, rules: FrameMatchRule[]): string | null {
  for (const rule of rules) {
    if (isFrameMatch(data, rule)) {
      return rule.frameId;
    }
  }
  return null;
}

/**
 * 检查数据是否匹配特定帧规则
 * @param data 数据
 * @param rule 帧规则
 * @returns 是否匹配
 */
function isFrameMatch(data: Uint8Array, rule: FrameMatchRule): boolean {
  if (!rule.rules || rule.rules.length === 0) {
    return false;
  }

  // 检查所有规则
  for (const identifierRule of rule.rules) {
    if (!checkIdentifierRule(data, identifierRule)) {
      return false;
    }
  }

  return true;
}

/**
 * 检查单个识别规则
 * @param data 数据
 * @param rule 识别规则
 * @returns 是否匹配
 */
function checkIdentifierRule(data: Uint8Array, rule: IdentifierRule): boolean {
  const { startIndex, endIndex, operator, value } = rule;

  // 检查索引范围
  if (startIndex < 0 || endIndex >= data.length || startIndex > endIndex) {
    return false;
  }

  // 提取数据段 - 修复：endIndex是包含的，所以要+1
  const segment = data.slice(Number(startIndex), Number(endIndex) + 1);

  // 根据格式解析值
  const actualValue: string = Array.from(segment)
    .map((byte) => convertToHex(byte, 'uint8'))
    .join('');

  // 处理期望值，移除0x前缀
  const expectedValue: string = convertToHex(value, 'bytes', endIndex - startIndex + 1);

  // 根据操作符比较 - 统一使用eq、neq等操作符
  switch (operator) {
    case 'eq':
    case '==':
    case '=':
      return actualValue === expectedValue;
    case 'neq':
    case '!=':
      return actualValue !== expectedValue;
    case 'gt':
    case '>':
      return Number(actualValue) > Number(expectedValue);
    case 'gte':
    case '>=':
      return Number(actualValue) >= Number(expectedValue);
    case 'lt':
    case '<':
      return Number(actualValue) < Number(expectedValue);
    case 'lte':
    case '<=':
      return Number(actualValue) <= Number(expectedValue);
    case 'contains':
      return String(actualValue).includes(String(expectedValue));
    case 'not_contains':
      return !String(actualValue).includes(String(expectedValue));
    default:
      return false;
  }
}

/**
 * 验证帧匹配规则的有效性
 * @param rules 规则列表
 * @returns 验证结果
 */
export function validateMatchRules(rules: FrameMatchRule[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  rules.forEach((rule) => {
    if (!rule.frameId) {
      errors.push('帧ID不能为空');
      return;
    }

    if (!rule.rules || rule.rules.length === 0) {
      errors.push(`帧 ${rule.frameId} 没有定义识别规则`);
      return;
    }

    rule.rules.forEach((identifierRule, index) => {
      const { startIndex, endIndex, operator, value } = identifierRule;

      if (typeof startIndex !== 'number' || startIndex < 0) {
        errors.push(`帧 ${rule.frameId} 规则 ${index + 1}: 起始索引无效`);
      }

      if (typeof endIndex !== 'number' || endIndex < startIndex) {
        errors.push(`帧 ${rule.frameId} 规则 ${index + 1}: 结束索引无效`);
      }

      const validOperators = [
        'eq',
        '==',
        '=',
        'neq',
        '!=',
        'gt',
        '>',
        'gte',
        '>=',
        'lt',
        '<',
        'lte',
        '<=',
        'contains',
        'not_contains',
      ];
      if (!operator || !validOperators.includes(operator)) {
        errors.push(`帧 ${rule.frameId} 规则 ${index + 1}: 操作符无效`);
      }

      if (value === undefined || value === null) {
        errors.push(`帧 ${rule.frameId} 规则 ${index + 1}: 比较值不能为空`);
      }
    });
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
