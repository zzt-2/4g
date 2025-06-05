<script setup lang="ts">
import { ref } from 'vue';
import DataTable from './DataTable.vue';
import LineChart from './LineChart.vue';
import TableControls from './TableControls.vue';
import DisplayModeToggle from './DisplayModeToggle.vue';
import RecordingControls from './RecordingControls.vue';
import ChartSettingsDialog from './ChartSettingsDialog.vue';
import { useDataDisplayStore } from '../../../../stores/frames/dataDisplayStore';

// Store
const dataDisplayStore = useDataDisplayStore();

// 对话框状态
const table1SettingsDialog = ref(false);
const table2SettingsDialog = ref(false);

// 处理表格1设置对话框
const handleTable1Settings = () => {
  table1SettingsDialog.value = true;
};

// 处理表格2设置对话框
const handleTable2Settings = () => {
  table2SettingsDialog.value = true;
};
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-primary">
    <!-- 主内容区域：双表格布局 -->
    <div class="flex-1 flex min-h-0">
      <!-- 表格1 -->
      <div
        class="flex-1 flex flex-col bg-industrial-panel rounded-lg border border-industrial overflow-hidden"
      >
        <div class="flex-shrink-0 bg-industrial-table-header border-b border-industrial p-3">
          <div class="flex items-center justify-between">
            <DisplayModeToggle
              :display-mode="dataDisplayStore.table1Config.displayMode"
              @update:display-mode="dataDisplayStore.updateTable1Config({ displayMode: $event })"
              @open-settings="handleTable1Settings"
            />
            <q-btn
              v-if="dataDisplayStore.table1Config.displayMode === 'chart'"
              flat
              dense
              round
              icon="clear_all"
              size="sm"
              class="btn-industrial-secondary ml-2"
              @click="dataDisplayStore.clearTable1History()"
              :disable="!dataDisplayStore.table1Config.selectedGroupId"
            >
              <q-tooltip class="bg-industrial-secondary text-industrial-primary text-xs">
                清空图表1历史数据
              </q-tooltip>
            </q-btn>
            <q-space />
            <TableControls
              :selected-group-id="dataDisplayStore.table1Config.selectedGroupId"
              :available-groups="dataDisplayStore.availableGroups"
              @update:selected-group-id="
                dataDisplayStore.updateTable1Config({ selectedGroupId: $event })
              "
            />
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          <DataTable
            v-if="dataDisplayStore.table1Config.displayMode === 'table'"
            :group-id="dataDisplayStore.table1Config.selectedGroupId"
            table-id="table1"
          />
          <LineChart
            v-else
            :group-id="dataDisplayStore.table1Config.selectedGroupId"
            :chart-selected-items="dataDisplayStore.table1Config.chartSelectedItems"
          />
        </div>
      </div>

      <div class="w-4"></div>

      <!-- 表格2 -->
      <div
        class="flex-1 flex flex-col bg-industrial-panel rounded-lg border border-industrial overflow-hidden"
      >
        <div class="flex-shrink-0 bg-industrial-table-header border-b border-industrial p-3">
          <div class="flex items-center justify-between">
            <DisplayModeToggle
              :display-mode="dataDisplayStore.table2Config.displayMode"
              @update:display-mode="dataDisplayStore.updateTable2Config({ displayMode: $event })"
              @open-settings="handleTable2Settings"
            />
            <q-btn
              v-if="dataDisplayStore.table2Config.displayMode === 'chart'"
              flat
              dense
              round
              icon="clear_all"
              size="sm"
              class="btn-industrial-secondary ml-2"
              @click="dataDisplayStore.clearTable2History()"
              :disable="!dataDisplayStore.table2Config.selectedGroupId"
            >
              <q-tooltip class="bg-industrial-secondary text-industrial-primary text-xs">
                清空图表2历史数据
              </q-tooltip>
            </q-btn>
            <q-space />
            <TableControls
              :selected-group-id="dataDisplayStore.table2Config.selectedGroupId"
              :available-groups="dataDisplayStore.availableGroups"
              @update:selected-group-id="
                dataDisplayStore.updateTable2Config({ selectedGroupId: $event })
              "
            />
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          <DataTable
            v-if="dataDisplayStore.table2Config.displayMode === 'table'"
            :group-id="dataDisplayStore.table2Config.selectedGroupId"
            table-id="table2"
          />
          <LineChart
            v-else
            :group-id="dataDisplayStore.table2Config.selectedGroupId"
            :chart-selected-items="dataDisplayStore.table2Config.chartSelectedItems"
          />
        </div>
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="flex-shrink-0 p-3 border-t border-industrial bg-industrial-secondary">
      <div class="flex items-center justify-between">
        <!-- 左侧：面板状态信息 -->
        <div class="flex items-center space-x-6 text-xs text-industrial-secondary">
          <span>
            面板1:
            {{ dataDisplayStore.table1Config.displayMode === 'table' ? '表格' : '图表' }}
            -
            {{
              dataDisplayStore.table1Config.selectedGroupId
                ? dataDisplayStore.availableGroups.find(
                    (g) => g.id === dataDisplayStore.table1Config.selectedGroupId,
                  )?.label || '未知分组'
                : '未选择分组'
            }}
          </span>
          <span>
            面板2:
            {{ dataDisplayStore.table2Config.displayMode === 'table' ? '表格' : '图表' }}
            -
            {{
              dataDisplayStore.table2Config.selectedGroupId
                ? dataDisplayStore.availableGroups.find(
                    (g) => g.id === dataDisplayStore.table2Config.selectedGroupId,
                  )?.label || '未知分组'
                : '未选择分组'
            }}
          </span>
          <span>更新间隔: {{ dataDisplayStore.displaySettings.updateInterval / 1000 }}s</span>
        </div>

        <!-- 右侧：记录控制 -->
        <RecordingControls />
      </div>
    </div>

    <!-- 图表设置对话框 -->
    <ChartSettingsDialog
      v-model="table1SettingsDialog"
      :group-id="dataDisplayStore.table1Config.selectedGroupId"
      :selected-items="dataDisplayStore.table1Config.chartSelectedItems"
      @update:selected-items="dataDisplayStore.updateTable1Config({ chartSelectedItems: $event })"
    />

    <ChartSettingsDialog
      v-model="table2SettingsDialog"
      :group-id="dataDisplayStore.table2Config.selectedGroupId"
      :selected-items="dataDisplayStore.table2Config.chartSelectedItems"
      @update:selected-items="dataDisplayStore.updateTable2Config({ chartSelectedItems: $event })"
    />
  </div>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
