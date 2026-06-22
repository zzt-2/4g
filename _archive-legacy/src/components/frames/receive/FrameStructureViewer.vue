<script setup lang="ts">
import { computed } from 'vue';
import { useReceiveFramesStore } from '../../../stores/frames/receiveFramesStore';
import type { Frame } from '../../../types/frames/frames';
import type { ReceiveFrameStats } from '../../../types/frames/receive';
import { formatHexWithSpaces } from '../../../utils/frames/hexCovertUtils';

// Store
const receiveFramesStore = useReceiveFramesStore();

// 计算属性：选中帧信息（使用过滤后的直接数据帧）
const selectedFrame = computed((): Frame | undefined => {
  if (!receiveFramesStore.selectedFrameId) return undefined;
  return receiveFramesStore.directDataFrames.find(
    (frame: Frame) => frame.id === receiveFramesStore.selectedFrameId,
  );
});

// 计算属性：选中帧的统计信息
const selectedFrameStats = computed((): ReceiveFrameStats | null => {
  if (!receiveFramesStore.selectedFrameId) return null;
  return receiveFramesStore.frameStats.get(receiveFramesStore.selectedFrameId) || null;
});

// 计算属性：最后接收帧的十六进制数据
const lastReceivedHex = computed((): string => {
  if (!selectedFrameStats.value?.lastReceivedFrame) return '';

  // 将Uint8Array转换为十六进制字符串
  const hexString = Array.from(selectedFrameStats.value.lastReceivedFrame)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join('');

  return formatHexWithSpaces(hexString);
});

// 计算属性：当前选择的数据项对应的字段ID集合
const selectedFieldIds = computed((): Set<string> => {
  const fieldIds = new Set<string>();

  receiveFramesStore.selectedFrameDataItems.forEach((item) => {
    if (item.mapping) {
      fieldIds.add(item.mapping.fieldId);
    }
  });

  return fieldIds;
});

// 计算属性：带有偏移信息的字段列表（直接使用store中过滤好的字段）
const fieldsWithOffset = computed(() => {
  if (!selectedFrame.value?.fields) return [];

  let currentOffset = 0;
  return selectedFrame.value.fields.map((field) => {
    const fieldWithOffset = {
      ...field,
      offset: currentOffset,
      endOffset: currentOffset + (field.length || 1) - 1,
      isHighlighted: selectedFieldIds.value.has(field.id),
    };

    currentOffset += field.length || 1;
    return fieldWithOffset;
  });
});

// 计算属性：十六进制数据的字节数组（用于高亮）
const hexBytes = computed((): { byte: string; offset: number; highlightColor: string }[] => {
  if (!lastReceivedHex.value) return [];

  // 移除空格，获取纯十六进制字符串
  const pureHex = lastReceivedHex.value.replace(/\s/g, '');
  const bytes: { byte: string; offset: number; highlightColor: string }[] = [];

  // 定义6种不同的高亮颜色，便于区分更多相邻字段
  const highlightColors = ['yellow', 'green', 'blue', 'purple', 'orange', 'cyan'];

  for (let i = 0; i < pureHex.length; i += 2) {
    const byte = pureHex.substring(i, i + 2);
    const offset = i / 2;

    // 检查当前字节属于哪个高亮字段
    let highlightColor = '';

    for (let fieldIndex = 0; fieldIndex < fieldsWithOffset.value.length; fieldIndex++) {
      const field = fieldsWithOffset.value[fieldIndex];
      if (field && field.isHighlighted && offset >= field.offset && offset <= field.endOffset) {
        // 找到这个字段对应的dataItem在selectedFrameDataItems中的索引
        const mappingIndex = receiveFramesStore.selectedFrameDataItems.findIndex(
          (item) => item.mapping?.fieldId === field.id,
        );
        if (mappingIndex >= 0) {
          highlightColor = highlightColors[mappingIndex % highlightColors.length] || '';
          break;
        }
      }
    }

    bytes.push({ byte, offset, highlightColor });
  }

  return bytes;
});
</script>

<template>
  <div class="bg-industrial-panel rounded-lg border border-industrial">
    <!-- 标题 -->
    <div class="p-3 border-b border-industrial">
      <div class="text-industrial-primary text-sm font-medium">上次接收帧</div>
    </div>

    <!-- 内容 -->
    <div class="p-3">
      <!-- 无数据时的提示 -->
      <div v-if="!lastReceivedHex" class="text-xs text-industrial-secondary text-center py-4">
        暂无接收数据
      </div>

      <!-- 十六进制数据 -->
      <div v-else class="bg-industrial-panel rounded-md border border-industrial-secondary p-3">
        <div class="font-mono text-xs leading-relaxed">
          <template v-for="(byteInfo, index) in hexBytes" :key="index">
            <span
              :class="{
                'text-industrial-accent': !byteInfo.highlightColor,
                'text-yellow-400 bg-yellow-500/20 px-1 rounded':
                  byteInfo.highlightColor === 'yellow',
                'text-green-400 bg-green-500/20 px-1 rounded': byteInfo.highlightColor === 'green',
                'text-blue-400 bg-blue-500/20 px-1 rounded': byteInfo.highlightColor === 'blue',
                'text-purple-400 bg-purple-500/20 px-1 rounded':
                  byteInfo.highlightColor === 'purple',
                'text-orange-400 bg-orange-500/20 px-1 rounded':
                  byteInfo.highlightColor === 'orange',
                'text-cyan-400 bg-cyan-500/20 px-1 rounded': byteInfo.highlightColor === 'cyan',
              }"
              class="select-all break-all"
              >{{ byteInfo.byte }}</span
            >
            <span v-if="(index + 1) % 8 === 0" class="text-industrial-secondary"> </span>
            <span v-else-if="(index + 1) % 4 === 0" class="text-industrial-secondary"> </span>
            <span v-else class="text-industrial-secondary"> </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
