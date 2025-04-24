/**
 * ProtoDef 组合式函数
 * 提供帧格式定义、转换和序列化/反序列化相关的响应式状态和方法
 */
import { ref, computed, watch, type Ref } from 'vue';
import { useStorage } from '@vueuse/core';
import type { Frame, FrameField } from '../../types/frames';
import type {
  ProtocolDefinition,
  ProtoSchema,
  ProtoConvertOptions,
  ProtoParseResult,
  ProtoField,
  JSONValue,
} from '../../types/frames/protodef';
import {
  createProtoSchema,
  createFrameProtocol,
  parseBuffer,
  serializeObject,
  hexStringToUint8Array,
  uint8ArrayToHexString,
  mapFieldTypeToProtoType,
  validateProtocol,
} from '../../utils/frames/protodefUtils';

/**
 * ProtoDef协议管理和转换工具
 * @param initialFrame 可选的初始帧定义
 * @returns ProtoDef相关的状态和方法
 */
export function useProtoDef(initialFrame?: Ref<Frame | null> | Frame | null) {
  // 状态
  const frame = ref<Frame | null>(null);

  // 初始化frame的值
  if (initialFrame) {
    if ('value' in initialFrame && initialFrame.value && typeof initialFrame.value === 'object') {
      frame.value = initialFrame.value;
    } else if (initialFrame && typeof initialFrame === 'object') {
      frame.value = initialFrame as Frame;
    }
  }

  const protocol = ref<ProtocolDefinition | null>(null);
  const schema = ref<ProtoSchema | null>(null);
  const isReady = ref(false);
  const error = ref<string | null>(null);

  // 存储用户自定义协议
  const savedProtocols = useStorage<Record<string, ProtocolDefinition>>('proto-definitions', {});

  // 自动根据帧更新协议定义
  watch(
    () => frame.value,
    (newFrame) => {
      if (newFrame && newFrame.fields?.length > 0) {
        try {
          error.value = null;
          generateProtocolFromFrame(newFrame);
          isReady.value = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          error.value = `生成协议定义失败: ${message}`;
          isReady.value = false;
        }
      } else {
        protocol.value = null;
        schema.value = null;
        isReady.value = false;
      }
    },
    { immediate: true },
  );

  /**
   * 将当前帧字段转换为ProtoDef字段
   */
  const protoFields = computed(() => {
    if (!frame.value?.fields) return [] as ProtoField[];

    return frame.value.fields.map((field: FrameField): ProtoField => {
      // 将字段值转换为符合JSONValue类型
      let defaultValue: JSONValue | undefined = undefined;
      if (field.hasDefaultValue && field.defaultValue !== undefined) {
        if (
          typeof field.defaultValue === 'string' ||
          typeof field.defaultValue === 'number' ||
          typeof field.defaultValue === 'boolean' ||
          field.defaultValue === null
        ) {
          defaultValue = field.defaultValue;
        } else {
          // 尝试将其他类型转换为字符串
          defaultValue = String(field.defaultValue);
        }
      }

      return {
        name: field.name,
        type: mapFieldTypeToProtoType(field.dataType),
        description: field.description || '',
        default: defaultValue,
        isOptional: false,
      };
    });
  });

  /**
   * 基于当前帧生成协议定义
   * @param targetFrame 目标帧对象
   */
  function generateProtocolFromFrame(targetFrame: Frame) {
    if (!targetFrame || !targetFrame.fields || targetFrame.fields.length === 0) {
      error.value = '帧定义为空或不包含字段';
      return;
    }

    try {
      // 检查是否已有保存的协议
      const savedProtocol = targetFrame.id ? savedProtocols.value[targetFrame.id] : undefined;

      if (savedProtocol) {
        protocol.value = savedProtocol;
      } else {
        // 创建新协议
        const fields: ProtoField[] = targetFrame.fields.map((field) => {
          // 将字段值转换为符合JSONValue类型
          let defaultValue: JSONValue | undefined = undefined;
          if (field.hasDefaultValue && field.defaultValue !== undefined) {
            if (
              typeof field.defaultValue === 'string' ||
              typeof field.defaultValue === 'number' ||
              typeof field.defaultValue === 'boolean' ||
              field.defaultValue === null
            ) {
              defaultValue = field.defaultValue;
            } else {
              // 尝试将其他类型转换为字符串
              defaultValue = String(field.defaultValue);
            }
          }

          return {
            name: field.name,
            dataType: mapFieldTypeToProtoType(field.dataType),
            description: field.description || '',
            default: defaultValue,
            isOptional: false,
          };
        });

        protocol.value = createFrameProtocol(targetFrame.id, targetFrame.name, fields);
      }

      // 编译协议
      if (protocol.value) {
        schema.value = createProtoSchema(protocol.value);
        isReady.value = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = `生成协议定义失败: ${message}`;
      isReady.value = false;
      throw err;
    }
  }

  /**
   * 解析十六进制字符串为结构化对象
   * @param hexData 十六进制字符串
   * @param options 转换选项
   * @returns 解析结果
   */
  function parseHexString<T>(
    hexData: string,
    options?: Partial<ProtoConvertOptions>,
  ): ProtoParseResult<T> {
    if (!isReady.value || !schema.value) {
      const result: ProtoParseResult<T> = {
        data: {} as T,
        buffer: new Uint8Array(0),
        error: new Error('协议定义未就绪'),
      };
      return result;
    }

    try {
      const buffer = hexStringToUint8Array(hexData);
      return parseBuffer<T>(schema.value, buffer, options);
    } catch (err) {
      const result: ProtoParseResult<T> = {
        data: {} as T,
        buffer: new Uint8Array(0),
        error: err instanceof Error ? err : new Error(String(err)),
      };
      return result;
    }
  }

  /**
   * 将结构化对象序列化为十六进制字符串
   * @param data 待序列化对象
   * @param pretty 是否格式化输出
   * @param options 转换选项
   * @returns 十六进制字符串或错误信息
   */
  function serializeToHexString(
    data: unknown,
    pretty = false,
    options?: Partial<ProtoConvertOptions>,
  ): { hex: string; error?: string } {
    if (!isReady.value || !schema.value) {
      return { hex: '', error: '协议定义未就绪' };
    }

    try {
      const result = serializeObject(schema.value, data, options);

      if (result.error) {
        return { hex: '', error: result.error.message };
      }

      return { hex: uint8ArrayToHexString(result.buffer, pretty) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { hex: '', error: message };
    }
  }

  /**
   * 保存当前协议定义
   * @param id 可选的协议ID，默认使用帧ID
   * @returns 保存是否成功
   */
  function saveProtocol(id?: string): boolean {
    if (!protocol.value) {
      error.value = '没有可保存的协议定义';
      return false;
    }

    try {
      const protocolId = id || protocol.value.id;
      savedProtocols.value[protocolId] = protocol.value;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = `保存协议失败: ${message}`;
      return false;
    }
  }

  /**
   * 加载保存的协议
   * @param id 协议ID
   * @returns 加载是否成功
   */
  function loadProtocol(id: string): boolean {
    if (!savedProtocols.value[id]) {
      error.value = `未找到ID为 ${id} 的协议定义`;
      return false;
    }

    try {
      protocol.value = savedProtocols.value[id];

      if (protocol.value && validateProtocol(protocol.value)) {
        schema.value = createProtoSchema(protocol.value);
        isReady.value = true;
        return true;
      } else {
        error.value = '加载的协议定义无效';
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = `加载协议失败: ${message}`;
      return false;
    }
  }

  /**
   * 删除保存的协议
   * @param id 协议ID
   */
  function deleteProtocol(id: string): boolean {
    if (!savedProtocols.value[id]) {
      return false;
    }

    try {
      delete savedProtocols.value[id];
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = `删除协议失败: ${message}`;
      return false;
    }
  }

  /**
   * 根据给定帧解析十六进制数据
   * @param targetFrame 目标帧定义
   * @param hexData 十六进制数据字符串
   * @returns 解析结果
   */
  async function parseWithFrame<T>(
    targetFrame: Frame,
    hexData: string,
  ): Promise<ProtoParseResult<T>> {
    try {
      // 临时设置帧并生成协议
      const originalFrame = frame.value;
      frame.value = targetFrame;

      // 等待协议生成
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (!isReady.value || !schema.value) {
        throw new Error('协议生成失败');
      }

      // 解析数据
      const result = parseHexString<T>(hexData);

      // 恢复原始帧
      frame.value = originalFrame;

      return result;
    } catch (err) {
      const result: ProtoParseResult<T> = {
        data: {} as T,
        buffer: new Uint8Array(0),
        error: err instanceof Error ? err : new Error(String(err)),
      };
      return result;
    }
  }

  return {
    // 状态
    frame,
    protocol,
    schema,
    isReady,
    error,
    protoFields,
    savedProtocols,

    // 方法
    generateProtocolFromFrame,
    parseHexString,
    serializeToHexString,
    saveProtocol,
    loadProtocol,
    deleteProtocol,
    parseWithFrame,
  };
}
