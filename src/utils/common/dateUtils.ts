/**
 * 日期格式化工具函数
 */

/**
 * 格式化时间戳为可读字符串
 * @param timestamp 时间戳（毫秒）
 * @returns 格式化后的时间字符串，格式：HH:MM:SS.mmm
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

/**
 * 格式化日期为 YYYY-MM-DD 格式
 * @param date 日期对象或时间戳
 * @returns 格式化后的日期字符串
 */
export const formatDate = (date: Date | number): string => {
  const dateObj = date instanceof Date ? date : new Date(date);

  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/**
 * 格式化为完整的日期时间字符串
 * @param date 日期对象或时间戳
 * @returns 格式化后的日期时间字符串，格式：YYYY-MM-DD HH:MM:SS
 */
export const formatDateTime = (date: Date | number): string => {
  const dateObj = date instanceof Date ? date : new Date(date);

  const dateStr = formatDate(dateObj);
  const hours = dateObj.getHours().toString().padStart(2, '0');
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  const seconds = dateObj.getSeconds().toString().padStart(2, '0');

  return `${dateStr} ${hours}:${minutes}:${seconds}`;
};

/**
 * 获取当前小时键，格式：YYYY-MM-DD-HH
 * @param timestamp 时间戳（毫秒），可选，默认当前时间
 * @returns 小时键字符串
 */
export const getHourKey = (timestamp?: number): string => {
  const date = timestamp ? new Date(timestamp) : new Date();

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');

  return `${year}-${month}-${day}-${hour}`;
};

/**
 * 检测两个时间戳是否跨越了小时边界
 * @param previousTimestamp 之前的时间戳
 * @param currentTimestamp 当前的时间戳
 * @returns 是否跨越了小时边界
 */
export const isNewHour = (previousTimestamp: number, currentTimestamp: number): boolean => {
  const previousHour = getHourKey(previousTimestamp);
  const currentHour = getHourKey(currentTimestamp);
  return previousHour !== currentHour;
};

/**
 * 获取指定时间戳所在小时的开始时间戳
 * @param timestamp 时间戳（毫秒）
 * @returns 该小时开始的时间戳
 */
export const getHourBoundary = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0); // 设置为整点
  return date.getTime();
};

/**
 * 获取下一个整点的时间戳
 * @param timestamp 时间戳（毫秒）
 * @returns 下一个整点的时间戳
 */
export const getNextHourBoundary = (timestamp: number): number => {
  const hourBoundary = getHourBoundary(timestamp);
  return hourBoundary + 60 * 60 * 1000; // 加一小时
};

/**
 * 格式化运行时间为可读字符串
 * @param milliseconds 运行时间（毫秒）
 * @returns 格式化的运行时间字符串
 */
export const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};
