/**
 * 串口IPC处理程序
 * 实现与SerialPort库的交互
 */
import { BrowserWindow, app } from 'electron';
// 导入SerialPort相关模块
import serialport from 'serialport';
const SerialPort = serialport.SerialPort || serialport;
import { ReadlineParser } from '@serialport/parser-readline';
import type {
  SerialPortOptions,
  SerialStatus,
  MultiPortOperationResult,
} from '../../../src/types/serial/serial';
// 导入子进程和工具模块，用于执行系统命令
import { exec } from 'child_process';
import { promisify } from 'util';
// 导入IPC和错误处理工具
import { createHandlerRegistry } from '../../../src/utils/common/ipcUtils';
import { logError, withErrorResponse } from '../../../src/utils/common/errorUtils';

// 将exec函数转换为Promise版本
const execAsync = promisify(exec);

// TypeScript类型定义可能不完整，这里使用接口增强
interface ISerialPort {
  isOpen: boolean;
  open(callback: (err?: Error | null) => void): void;
  close(callback: (err?: Error | null) => void): void;
  write(data: Buffer, callback: (err?: Error | null) => void): void;
  drain(callback: (err?: Error | null) => void): void;
  pipe<T>(destination: T): T;
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
}

// 连接状态类型
type InternalPortState = {
  port: ISerialPort;
  parser: unknown;
  status: InternalSerialStatus;
};

// 修改SerialStatus类型以允许error为undefined
interface InternalSerialStatus extends Omit<SerialStatus, 'error'> {
  error?: string;
}

// 使用Map存储所有串口连接
const portConnections = new Map<string, InternalPortState>();

/**
 * 列出可用串口
 */
async function listPorts() {
  try {
    // 尝试从注册表获取COM端口列表
    const comPorts = await listPortsFromRegistry();

    // 如果从注册表获取成功且有端口，则直接返回
    if (comPorts.length > 0) {
      return comPorts;
    }

    // 如果注册表方法失败，回退到使用mode命令
    const { stdout } = await execAsync('mode');

    // 直接匹配所有含有COM的行
    const comMatches = stdout.match(/COM\d+:/g) || [];
    const comPortsFromMode = [];

    // 提取COM端口号并创建端口对象
    for (const match of comMatches) {
      // 从匹配结果中提取COM端口号
      const comPortMatch = match.match(/COM\d+/);
      if (comPortMatch && comPortMatch[0]) {
        const comPort = comPortMatch[0];
        console.log('发现COM端口:', comPort);

        // 检查串口是否已连接
        const isOpen = portConnections.has(comPort) && portConnections.get(comPort)?.port.isOpen;

        comPortsFromMode.push({
          path: comPort,
          manufacturer: '系统命令检测到的串口',
          pnpId: undefined,
          locationId: undefined,
          productId: undefined,
          vendorId: undefined,
          isOpen: isOpen || false,
        });
      }
    }

    console.log(`系统命令共发现 ${comPortsFromMode.length} 个串口`);
    return comPortsFromMode;
  } catch (err) {
    logError('执行系统命令失败:', err);
    return [];
  }
}

/**
 * 从Windows注册表获取可用串口列表
 * 路径: HKEY_LOCAL_MACHINE\HARDWARE\DEVICEMAP\SERIALCOMM
 */
async function listPortsFromRegistry() {
  // 仅在Windows平台执行
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    // 使用PowerShell命令读取注册表
    const command =
      'powershell -command "Get-ItemProperty -Path \'HKLM:\\HARDWARE\\DEVICEMAP\\SERIALCOMM\' | Select-Object -Property * -ExcludeProperty PSPath,PSParentPath,PSChildName,PSProvider | ConvertTo-Json"';

    const { stdout } = await execAsync(command);

    // 解析返回的JSON
    let registryData;
    try {
      registryData = JSON.parse(stdout.trim());
    } catch (parseError) {
      console.error('解析注册表数据失败:', parseError);
      return [];
    }

    // 从注册表数据提取COM端口
    const comPorts = [];

    // 注册表返回的是一个对象，其属性名是设备路径，值是COM端口号
    for (const [key, value] of Object.entries(registryData)) {
      if (typeof value === 'string' && value.startsWith('COM')) {
        const comPort = value;
        console.log('从注册表发现COM端口:', comPort, '设备路径:', key);

        // 检查串口是否已连接
        const isOpen = portConnections.has(comPort) && portConnections.get(comPort)?.port.isOpen;

        comPorts.push({
          path: comPort,
          manufacturer: '系统注册表检测到的串口',
          pnpId: key, // 使用注册表键作为PnP ID
          locationId: undefined,
          productId: undefined,
          vendorId: undefined,
          isOpen: isOpen || false,
        });
      }
    }

    console.log(`注册表共发现 ${comPorts.length} 个串口`);
    return comPorts;
  } catch (err) {
    console.log('从注册表获取串口列表失败:', err);
    return []; // 发生错误时返回空数组
  }
}

/**
 * 打开串口
 * @param portPath 串口路径
 * @param options 串口配置
 */
async function openPort(portPath: string, options?: SerialPortOptions) {
  // 检查当前端口是否已经打开
  const existingConnection = portConnections.get(portPath);
  if (existingConnection?.port.isOpen) {
    return {
      success: true,
      port: portPath,
      message: `串口 ${portPath} 已经打开`,
    };
  }

  try {
    // 默认配置
    const defaultOptions: SerialPortOptions = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
    };

    // 合并配置
    const portOptions = { ...defaultOptions, ...options };

    // 创建新的串口实例，使用类型断言处理接口兼容性
    const port = new SerialPort({
      path: portPath,
      baudRate: portOptions.baudRate || 9600,
      dataBits: portOptions.dataBits || 8,
      stopBits: portOptions.stopBits || 1,
      parity: portOptions.parity || 'none',
      autoOpen: false,
    }) as unknown as ISerialPort;

    // 创建解析器
    const parser = new ReadlineParser({ delimiter: '\r\n' });
    if (port) {
      // 使用类型断言解决pipe方法参数类型不匹配问题
      (port as unknown as { pipe(dest: unknown): unknown }).pipe(parser);
    }

    // 返回Promise等待串口打开
    return new Promise((resolve, reject) => {
      if (!port) {
        const error = new Error('串口实例创建失败');
        return reject(error);
      }

      // 初始化状态
      const initialStatus: InternalSerialStatus = {
        isOpen: false,
        port: portPath,
        options: portOptions,
        bytesReceived: 0,
        bytesSent: 0,
      };

      // 设置事件监听
      setupPortEvents(port, portPath);

      port.open((err) => {
        if (err) {
          // 记录错误状态
          initialStatus.isOpen = false;
          initialStatus.error = err.message;

          // 删除可能存在的连接
          portConnections.delete(portPath);

          reject(err);
        } else {
          // 记录连接状态
          initialStatus.isOpen = true;
          delete initialStatus.error;

          // 存储串口连接
          portConnections.set(portPath, { port, parser, status: initialStatus });

          // 广播状态变化
          broadcastStatus(portPath);

          resolve({ success: true, port: portPath, message: `串口 ${portPath} 已打开` });
        }
      });
    });
  } catch (error) {
    logError('打开串口失败:', error);
    throw error;
  }
}

/**
 * 关闭串口
 * @param portPath 串口路径
 */
async function closePort(portPath: string) {
  return new Promise<{ success: boolean; message: string }>((resolve, reject) => {
    const connection = portConnections.get(portPath);
    if (!connection || !connection.port.isOpen) {
      // 如果没有这个连接或已经关闭，直接返回成功
      if (connection) {
        connection.status.isOpen = false;
        delete connection.status.error;
      }
      resolve({ success: true, message: `串口 ${portPath} 已关闭` });
      return;
    }

    connection.port.close((err) => {
      if (err) {
        const error = new Error(`关闭串口失败: ${err.message}`);
        reject(error);
      } else {
        // 更新状态
        connection.status.isOpen = false;
        delete connection.status.error;

        // 广播状态变化
        broadcastStatus(portPath);

        resolve({ success: true, message: `串口 ${portPath} 已关闭` });
      }
    });
  });
}

/**
 * 关闭所有串口
 */
async function closeAllPorts() {
  const results = [];
  for (const portPath of portConnections.keys()) {
    try {
      const result = await closePort(portPath);
      results.push({
        portPath,
        success: true,
        message: result.message,
      });
    } catch (error) {
      results.push({
        portPath,
        success: false,
        message: error instanceof Error ? error.message : '未知错误',
      });
    }
  }
  return results;
}

/**
 * 写入数据到串口
 * @param portPath 串口路径
 * @param data 要发送的数据
 * @param isHex 是否为十六进制字符串
 */
async function writeToPort(
  portPath: string,
  data: Buffer | Uint8Array | string,
  isHex: boolean = false,
) {
  const connection = portConnections.get(portPath);
  if (!connection || !connection.port.isOpen) {
    throw new Error(`串口 ${portPath} 未打开`);
  }

  try {
    let buffer: Buffer;

    // 处理不同类型的输入数据
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else if (typeof data === 'string') {
      if (isHex) {
        // 处理十六进制字符串，如"0x01 0x02"或"01 02"
        const hexStr = data.replace(/0x/g, '').replace(/\s+/g, '');
        // 确保是偶数长度
        const paddedHex = hexStr.length % 2 ? '0' + hexStr : hexStr;
        buffer = Buffer.from(paddedHex, 'hex');
      } else {
        // 普通字符串
        buffer = Buffer.from(data, 'utf8');
      }
    } else {
      throw new Error('不支持的数据类型');
    }

    return new Promise((resolve, reject) => {
      connection.port.write(buffer, (err) => {
        if (err) {
          const error = new Error(`发送数据失败: ${err.message}`);
          reject(error);
        } else {
          // 更新发送字节数
          if (connection.status.bytesSent !== undefined) {
            connection.status.bytesSent += buffer.length;
            // 广播状态更新，以便渲染进程获取最新字节数
            broadcastStatus(portPath);
          }

          // 发送排空事件，确保数据已发送
          connection.port.drain((drainErr) => {
            if (drainErr) {
              const error = new Error(`数据排空失败: ${drainErr.message}`);
              reject(error);
            } else {
              // 广播数据发送消息
              const windows = BrowserWindow.getAllWindows();
              for (const win of windows) {
                if (!win.isDestroyed()) {
                  win.webContents.send('serial:data:sent', {
                    portPath,
                    data: buffer,
                    size: buffer.length,
                  });
                }
              }

              resolve({
                success: true,
                portPath,
                bytesSent: buffer.length,
                message: `已发送 ${buffer.length} 字节到串口 ${portPath}`,
              });
            }
          });
        }
      });
    });
  } catch (error) {
    logError('写入数据失败:', error);
    throw error;
  }
}

/**
 * 发送帧数据
 * @param portPath 串口路径
 * @param data 二进制数据
 */
async function sendFrameData(portPath: string, data: Uint8Array) {
  return writeToPort(portPath, data);
}

/**
 * 读取串口数据(一次性读取当前缓冲区)
 * @param portPath 串口路径
 */
function readFromPort(portPath: string) {
  const connection = portConnections.get(portPath);
  if (!connection || !connection.port.isOpen) {
    throw new Error(`串口 ${portPath} 未打开`);
  }

  return new Promise((resolve) => {
    // 使用内部可读流API读取所有可用数据
    const chunks: Buffer[] = [];
    let dataAvailable = false;

    // 只监听一次数据事件
    const onData = (chunk: Buffer) => {
      dataAvailable = true;
      chunks.push(chunk);
    };

    // 监听数据事件
    (
      connection.port as unknown as { on(event: string, listener: (data: Buffer) => void): void }
    ).on('data', onData);

    // 设置一个短暂的超时，收集一段时间内的数据
    setTimeout(() => {
      // 移除数据监听
      (
        connection.port as unknown as { off(event: string, listener: (data: Buffer) => void): void }
      ).off('data', onData);

      if (dataAvailable) {
        const data = Buffer.concat(chunks);
        // 更新接收字节数
        if (connection.status.bytesReceived !== undefined) {
          connection.status.bytesReceived += data.length;
        }
        resolve({ portPath, data, size: data.length });
      } else {
        resolve({ portPath, data: Buffer.alloc(0), size: 0 });
      }
    }, 50); // 50ms超时，通常足够收集一次数据
  });
}

/**
 * 获取单个串口状态
 * @param portPath 串口路径
 */
function getPortStatus(portPath: string): SerialStatus {
  const connection = portConnections.get(portPath);
  if (!connection) {
    // 返回默认断开状态
    return {
      isOpen: false,
      port: portPath,
      error: '',
    };
  }

  // 确保返回符合SerialStatus接口的对象
  return {
    ...connection.status,
    error: connection.status.error || '',
  };
}

/**
 * 获取所有串口状态
 */
function getAllPortStatus() {
  const result: Record<string, SerialStatus> = {};

  // 将所有连接状态加入结果
  for (const [portPath, connection] of portConnections.entries()) {
    result[portPath] = {
      ...connection.status,
      error: connection.status.error || '',
    };
  }

  return result;
}

/**
 * 设置串口参数
 * @param portPath 串口路径
 * @param options 串口配置选项
 */
async function setPortOptions(portPath: string, options: SerialPortOptions) {
  const connection = portConnections.get(portPath);
  if (!connection) {
    throw new Error(`串口 ${portPath} 未初始化`);
  }

  // 需要先关闭再重新打开串口应用新参数
  const wasOpen = connection.port.isOpen;

  if (wasOpen) {
    await closePort(portPath);
    const result = await openPort(portPath, options);
    return { ...(result as object), restarted: true };
  } else {
    // 更新状态但不应用
    connection.status.options = options;
    return {
      success: true,
      portPath,
      message: `参数已更新，将在下次打开串口 ${portPath} 时应用`,
      restarted: false,
    };
  }
}

/**
 * 清除接收缓冲区
 * @param portPath 串口路径
 */
function clearBuffer(portPath: string) {
  const connection = portConnections.get(portPath);
  if (!connection) {
    throw new Error(`串口 ${portPath} 未初始化`);
  }

  // SerialPort库没有直接的方法清除接收缓冲区，
  // 最简单的方法是忽略当前缓冲区数据
  connection.status.bytesReceived = 0;
  return { success: true, portPath, message: `串口 ${portPath} 接收缓冲区已清除` };
}

/**
 * 设置串口事件监听
 * @param port 串口实例
 * @param portPath 串口路径
 */
function setupPortEvents(port: ISerialPort, portPath: string) {
  // 使用更明确的类型断言，避免any
  const typedPort = port as unknown as {
    on(event: 'data', listener: (data: Buffer) => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: 'close', listener: () => void): void;
  };

  // 数据接收事件
  typedPort.on('data', (data: Buffer) => {
    // 更新接收字节数
    const connection = portConnections.get(portPath);
    if (connection && connection.status.bytesReceived !== undefined) {
      connection.status.bytesReceived += data.length;
      // 广播状态更新，以便渲染进程获取最新字节数
      broadcastStatus(portPath);
    }

    // 广播数据到所有窗口
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('serial:data', {
          portPath,
          data,
          size: data.length,
        });
      }
    }
  });

  // 串口关闭事件
  typedPort.on('close', () => {
    const connection = portConnections.get(portPath);
    if (connection) {
      connection.status.isOpen = false;
      broadcastStatus(portPath);
    }
  });

  // 串口错误事件
  typedPort.on('error', (error: Error) => {
    const connection = portConnections.get(portPath);
    if (connection) {
      connection.status.error = error.message;
      broadcastStatus(portPath);
    }
  });
}

/**
 * 广播串口状态到所有窗口
 * @param portPath 串口路径
 */
function broadcastStatus(portPath: string) {
  const status = getPortStatus(portPath);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('serial:status', {
        portPath,
        status,
      });
    }
  }
}

/**
 * 广播所有串口状态到所有窗口
 */
function broadcastAllStatus() {
  const allStatus = getAllPortStatus();
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('serial:all-status', allStatus);
    }
  }
}

// 创建串口处理器注册表
const serialRegistry = createHandlerRegistry('serial');

// 注册处理器
serialRegistry.register('list', async () => {
  return await listPorts();
});

serialRegistry.register('open', async (_, portPath: string, options?: SerialPortOptions) => {
  return await openPort(portPath, options);
});

serialRegistry.register('close', async (_, portPath: string) => {
  return await closePort(portPath);
});

serialRegistry.register('close-all', async () => {
  return await closeAllPorts();
});

serialRegistry.register(
  'write',
  async (_, portPath: string, data: Buffer | Uint8Array | string, isHex: boolean = false) => {
    return await writeToPort(portPath, data, isHex);
  },
);

serialRegistry.register('send', async (_, portPath: string, data: Uint8Array) => {
  return await sendFrameData(portPath, data);
});

serialRegistry.register('read', async (_, portPath: string) => {
  return await readFromPort(portPath);
});

serialRegistry.register('status', (_, portPath: string) => {
  return getPortStatus(portPath);
});

serialRegistry.register('all-status', () => {
  return getAllPortStatus();
});

serialRegistry.register('setOptions', async (_, portPath: string, options: SerialPortOptions) => {
  return await setPortOptions(portPath, options);
});

serialRegistry.register('clearBuffer', (_, portPath: string) => {
  return clearBuffer(portPath);
});

/**
 * 注册串口相关的IPC处理程序
 */
export function setupSerialIPC() {
  // 注册所有串口处理器
  const cleanup = serialRegistry.registerAll();

  // 应用退出时关闭串口
  app.on('will-quit', async () => {
    // 清理IPC处理器
    cleanup();

    // 关闭所有串口
    try {
      await closeAllPorts();
      console.log('所有串口已在应用退出时关闭');
    } catch (error) {
      console.error('关闭串口时出错:', error);
    }
  });
}
