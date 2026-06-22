/**
 * 位置信息组合式函数
 * 通过IP地址获取当前位置的经纬度信息
 */

import { readonly, ref, shallowRef } from 'vue';

interface LocationInfo {
  latitude: number; // 纬度（精确到分）
  longitude: number; // 经度（精确到分）
  city?: string;
  country?: string;
}

export const useLocation = () => {
  const locationInfo = shallowRef<LocationInfo>({
    latitude: 0,
    longitude: 0,
  });

  const isLoading = ref(false);
  const error = ref<string | null>(null);

  /**
   * 将经纬度转换为整数（精确到分）
   * 例：116.4074 -> 116°24'（转换为整数：11624）
   */
  const convertToMinutes = (decimal: number): number => {
    const degrees = Math.floor(Math.abs(decimal));
    const minutes = Math.floor((Math.abs(decimal) - degrees) * 60);
    const sign = decimal >= 0 ? 1 : -1;
    return sign * (degrees * 100 + minutes);
  };

  /**
   * 通过 IP 获取位置信息
   */
  const fetchLocation = async (): Promise<LocationInfo | null> => {
    if (isLoading.value) return null;

    isLoading.value = true;
    error.value = null;

    try {
      // 使用免费的 IP 地理位置服务
      const response = await fetch('https://ipapi.co/json/');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.latitude && data.longitude) {
        const location: LocationInfo = {
          latitude: convertToMinutes(data.latitude),
          longitude: convertToMinutes(data.longitude),
          city: data.city,
          country: data.country_name,
        };

        locationInfo.value = location;
        return location;
      } else {
        throw new Error('无法获取有效的位置信息');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取位置失败';
      error.value = errorMessage;
      console.warn('位置获取失败:', errorMessage);
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 格式化经纬度显示（转换回度分格式）
   */
  const formatCoordinate = (coordinate: number): string => {
    const absValue = Math.abs(coordinate);
    const degrees = Math.floor(absValue / 100);
    const minutes = absValue % 100;
    const direction = coordinate >= 0 ? '' : '-';
    return `${direction}${degrees}°${minutes}'`;
  };

  return {
    locationInfo: readonly(locationInfo),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchLocation,
    formatCoordinate,
  };
};
