/**
 * 加载卫星ID指令执行器
 */

import type { CommandExecutionResult, CommandExecutionContext } from '../useScoeCommandExecutor';
import { ScoeErrorReason } from '../../../types/scoe/receiveCommand';

/**
 * 执行加载卫星ID指令
 * @param context 执行上下文
 * @param satelliteId 要加载的卫星ID（十六进制字符串，8位）
 * @returns 执行结果
 */
export async function executeLoadSatelliteId(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  const { scoeStore, params } = context;
  const satelliteId = params?.satelliteId as string | undefined;

  // 1. 检查是否已有卫星ID加载
  if (scoeStore.status.scoeFramesLoaded && scoeStore.status.loadedSatelliteId) {
    return {
      success: false,
      message: `卫星ID ${scoeStore.status.loadedSatelliteId} 已加载`,
      errorReason: ScoeErrorReason.SATELLITE_ID_LOADING,
    };
  }

  // 2. 如果没有提供卫星ID，返回错误
  if (!satelliteId) {
    return {
      success: false,
      message: '缺少卫星ID参数',
      errorReason: ScoeErrorReason.SATELLITE_CONFIG_INCOMPLETE,
    };
  }

  // 3. 查找对应的卫星配置
  const targetConfig = scoeStore.satelliteConfigs.find((config) => {
    // 标准化ID进行比对（移除0x前缀，转大写）
    const configSatelliteId = config.satelliteId.replace(/^0x/i, '').toUpperCase().padStart(8, '0');
    const normalizedSatelliteId = satelliteId.replace(/^0x/i, '').toUpperCase().padStart(8, '0');
    return configSatelliteId === normalizedSatelliteId;
  });

  // 4. 如果找不到配置
  if (!targetConfig) {
    scoeStore.status.loadedSatelliteId = '-1';
    return {
      success: false,
      message: `未找到卫星ID ${satelliteId} 对应的配置`,
      errorReason: ScoeErrorReason.SATELLITE_ID_NOT_FOUND,
    };
  }

  // 5. 验证配置完整性
  const { receiveConfig } = targetConfig;
  const requiredFields = [
    'messageIdentifier',
    'sourceIdentifier',
    'destinationIdentifier',
    'modelId',
    'satelliteId',
  ];

  const missingFields = requiredFields.filter((field) => {
    const value = receiveConfig[field as keyof typeof receiveConfig];
    return !value || value === '';
  });

  if (missingFields.length > 0) {
    return {
      success: false,
      message: `卫星配置不完整，缺少字段: ${missingFields.join(', ')}`,
      errorReason: ScoeErrorReason.SATELLITE_CONFIG_INCOMPLETE,
    };
  }

  // 6. 加载卫星ID
  scoeStore.status.scoeFramesLoaded = true;
  scoeStore.status.loadedSatelliteId = targetConfig.satelliteId;
  scoeStore.status.satelliteIdRuntimeSeconds = 0; // 重置运行时间

  // 7. 选中该配置
  scoeStore.selectConfig(targetConfig.id);

  return {
    success: true,
    message: `成功加载卫星ID: ${targetConfig.satelliteId}`,
    data: {
      satelliteId: targetConfig.satelliteId,
      configId: targetConfig.id,
    },
  };
}
