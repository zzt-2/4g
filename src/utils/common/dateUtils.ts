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
