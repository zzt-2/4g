<script setup lang="ts">
// Tab3 二级 tab「用例目录」。用例映射（D004/S012 原样迁移）。
// 功能逻辑零改动：catalogMappings CRUD + fieldGroups 分组 + 选模板弹窗 + 勾字段交互。
// fieldGroups/isFieldChecked/toggleField/toggleMapping 等逻辑由 page 通过 props/emits 提供
//（page 持有 frameService 做字段名解析，composable API 不动）。

import { ref } from 'vue';
import type { TaskTemplate } from '@/features/task/core';
import type { CatalogMapping } from '@/features/command-ingress/core/catalog-mapping';

/** 一个可覆盖字段的分组（按帧分组） */
export interface FieldGroup {
  readonly frameName: string;
  readonly fields: { readonly path: string; readonly fieldName: string }[];
}

interface Props {
  mappings: readonly CatalogMapping[];
  /** 全部任务模板（添加映射弹窗的多选源 + 列表显示模板名） */
  allTemplates: readonly TaskTemplate[];
  /** 按模板计算可覆盖字段分组（page 注入，内部用 frameService） */
  fieldGroupsOf: (tpl: TaskTemplate | undefined) => FieldGroup[];
  /** 模板名解析（page 注入，处理已删除模板回退） */
  templateNameOf: (templateId: string) => string;
  /** 字段是否已勾选（page 注入，直读映射） */
  isFieldChecked: (templateId: string, path: string) => boolean;
  /** 模板是否已映射 */
  isMapped: (templateId: string) => boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'toggle-enabled': [templateId: string, enabled: boolean];
  'toggle-field': [templateId: string, path: string];
  'add-mapping': [];
  'toggle-mapping': [templateId: string, checked: boolean];
  'delete-mapping': [templateId: string];
}>();

// 添加映射弹窗开关（组件内自管，纯 UI 状态）
const showAddDialog = ref(false);

function openAddDialog(): void {
  emit('add-mapping');
  showAddDialog.value = true;
}

// 按 templateId 查模板（供 fieldGroups 计算）
function getTemplateById(id: string): TaskTemplate | undefined {
  return props.allTemplates.find(t => t.templateId === id);
}
</script>

<template>
  <div class="catalog-mapping-panel h-full min-h-0 px-6 py-3 overflow-y-auto">
    <div class="flex items-center justify-between mb-3 flex-shrink-0">
      <span class="rw-text-label text-sm">用例映射（甲方调 getTestCaseAll 时，从这些映射派生用例数据）</span>
      <q-btn flat dense icon="o_add" color="primary" size="sm" @click="openAddDialog">
        <q-tooltip>添加映射</q-tooltip>
      </q-btn>
    </div>

    <!-- 映射列表（可收缩，每个用例一条） -->
    <div v-if="mappings.length > 0" class="flex flex-col gap-1">
      <q-expansion-item
        v-for="m in mappings"
        :key="m.templateId"
        dense
        switch-toggle-side
      >
        <template #header>
          <div class="row items-center justify-between full-width no-wrap q-pr-sm">
            <div class="row items-center gap-2">
              <q-badge
                :color="m.enabled ? 'positive' : 'grey'"
                :label="m.enabled ? '上报' : '停用'"
                class="q-mr-sm"
              />
              <span class="rw-text-value">{{ templateNameOf(m.templateId) }}</span>
            </div>
            <span class="rw-text-label text-xs">
              {{ m.overridablePaths.length }} 个可覆盖字段
            </span>
          </div>
        </template>

        <!-- 展开后内联编辑 -->
        <div class="q-pa-md flex flex-col gap-3">
          <q-toggle
            :model-value="m.enabled"
            label="上报给甲方"
            color="primary"
            @update:model-value="(v: boolean) => emit('toggle-enabled', m.templateId, v)"
          />

          <div>
            <div class="rw-text-label text-sm mb-2">可覆盖字段（点击勾选）</div>
            <template v-if="fieldGroupsOf(getTemplateById(m.templateId)).length > 0">
              <div
                v-for="(grp, gi) in fieldGroupsOf(getTemplateById(m.templateId))"
                :key="gi"
                class="mb-2"
              >
                <div class="rw-text-label text-xs mb-1">{{ grp.frameName }}</div>
                <div class="flex flex-wrap gap-1">
                  <q-chip
                    v-for="f in grp.fields"
                    :key="f.path"
                    dense
                    size="sm"
                    :color="isFieldChecked(m.templateId, f.path) ? 'primary' : 'grey-3'"
                    :text-color="isFieldChecked(m.templateId, f.path) ? 'white' : 'grey-9'"
                    clickable
                    @click="emit('toggle-field', m.templateId, f.path)"
                  >
                    {{ f.fieldName }}
                  </q-chip>
                </div>
              </div>
            </template>
            <div v-else class="rw-text-label text-xs">该模板没有可覆盖字段（无 send step 带参数）</div>
          </div>

          <div class="flex justify-end">
            <q-btn
              flat dense no-caps
              icon="o_delete" color="negative" size="sm"
              label="删除映射"
              @click="emit('delete-mapping', m.templateId)"
            />
          </div>
        </div>
      </q-expansion-item>
    </div>
    <div v-else class="text-center p-4 rw-text-label">暂无映射，点击右上角添加</div>

    <!-- 添加映射弹窗：任务模板多选列表 -->
    <q-dialog v-model="showAddDialog">
      <q-card class="rw-dialog-lg">
        <q-card-section>
          <div class="text-h6">添加用例映射</div>
          <div class="rw-text-label text-xs mt-1">勾选要上报给甲方的任务模板，取消勾选则移除</div>
        </q-card-section>
        <q-card-section class="rw-dialog-scroll-body">
          <div v-if="allTemplates.length > 0" class="flex flex-col gap-1">
            <q-item
              v-for="tpl in allTemplates"
              :key="tpl.templateId"
              tag="label"
              v-ripple
              dense
              class="rounded-borders"
            >
              <q-item-section avatar>
                <q-checkbox
                  :model-value="isMapped(tpl.templateId)"
                  @update:model-value="(v: boolean) => emit('toggle-mapping', tpl.templateId, v)"
                />
              </q-item-section>
              <q-item-section>
                <q-item-label class="rw-text-value">{{ tpl.name }}</q-item-label>
                <q-item-label caption class="rw-text-label">
                  {{ tpl.tags.length > 0 ? tpl.tags.join(', ') : '无标签' }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </div>
          <div v-else class="text-center p-4 rw-text-label">暂无任务模板，请先在任务页面创建模板</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="完成" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>
