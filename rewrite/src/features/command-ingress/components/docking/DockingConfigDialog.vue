<script setup lang="ts">
// 中心对接「对接配置」弹窗。v-model 控制开关，config 字段变更走 emit（page 合并回 reactive）。
// 保存并连接走 emit（page 调 composable.saveConfigAndConnect）。
// 用 patchField 模式（同 DeviceEditDialog），避免直接 mutate prop（vue/no-mutating-props）。

import { SUB_SYS_TYPE_OPTIONS } from '@/features/command-ingress/components/docking-labels';
import type { DockingConfigForm } from '@/features/command-ingress/composables/use-central-docking';

interface Props {
  modelValue: boolean;
  config: DockingConfigForm;
  isConnecting: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  'update:config': [config: DockingConfigForm];
  'save-connect': [];
}>();

// 单字段更新（D003 子组件单次 emit 原则，合并后一次 emit）
function patchField<K extends keyof DockingConfigForm>(field: K, value: DockingConfigForm[K]): void {
  emit('update:config', { ...props.config, [field]: value });
}
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <q-card class="rw-dialog-lg">
      <q-card-section>
        <div class="text-h6">对接配置</div>
      </q-card-section>
      <q-card-section class="rw-dialog-scroll-body">
        <q-form @submit.prevent="emit('save-connect')">
          <!-- 服务器配置 -->
          <div class="rw-text-label text-sm mb-2">服务器配置</div>
          <div class="flex gap-3 mb-2">
            <q-input
              :model-value="config.serverHost"
              dense outlined label="监听地址" class="flex-1"
              :rules="[val => !!val || '请输入监听地址']"
              @update:model-value="(v: string | number | null) => patchField('serverHost', String(v ?? ''))"
            />
            <q-input
              :model-value="config.serverPort"
              dense outlined label="监听端口" type="number" class="w-32"
              :rules="[val => !!val || '请输入端口']"
              @update:model-value="(v: string | number | null) => patchField('serverPort', Number(v) || 0)"
            />
          </div>
          <q-input
            :model-value="config.customerBaseUrl"
            dense outlined label="甲方地址" placeholder="http://ip/partner-api/" class="mb-2"
            :rules="[val => !!val || '请输入甲方地址']"
            @update:model-value="(v: string | number | null) => patchField('customerBaseUrl', String(v ?? ''))"
          />
          <div class="flex gap-3 mb-2">
            <q-select
              :model-value="config.subSysType"
              :options="SUB_SYS_TYPE_OPTIONS"
              dense outlined label="子系统类型" emit-value map-options class="flex-1"
              @update:model-value="(v: string) => patchField('subSysType', v ?? '')"
            />
            <q-input
              :model-value="config.subSysId"
              dense outlined label="子系统ID" placeholder="LAS_001" class="flex-1"
              :rules="[val => !!val || '请输入子系统ID']"
              @update:model-value="(v: string | number | null) => patchField('subSysId', String(v ?? ''))"
            />
          </div>

          <q-separator class="my-4" />

          <!-- 认证配置 -->
          <q-expansion-item
            dense switch-toggle-side
            label="认证配置" caption="OAuth/JWT"
            header-class="rw-text-label text-sm"
            class="mb-2"
          >
            <div class="flex flex-col gap-2 pt-2">
              <q-input
                :model-value="config.loginUrl"
                dense outlined label="认证地址"
                :placeholder="`${config.customerBaseUrl}auth/partner/login`"
                @update:model-value="(v: string | number | null) => patchField('loginUrl', String(v ?? ''))"
              />
              <q-input
                :model-value="config.clientId"
                dense outlined label="Client ID"
                @update:model-value="(v: string | number | null) => patchField('clientId', String(v ?? ''))"
              />
              <q-input
                :model-value="config.username"
                dense outlined label="用户名"
                @update:model-value="(v: string | number | null) => patchField('username', String(v ?? ''))"
              />
              <q-input
                :model-value="config.password"
                dense outlined label="密码" type="password"
                @update:model-value="(v: string | number | null) => patchField('password', String(v ?? ''))"
              />
              <div class="flex gap-3">
                <q-input
                  :model-value="config.grantType"
                  dense outlined label="Grant Type" readonly class="flex-1"
                  @update:model-value="(v: string | number | null) => patchField('grantType', String(v ?? ''))"
                />
                <q-input
                  :model-value="config.tenantId"
                  dense outlined label="Tenant ID" readonly class="flex-1"
                  @update:model-value="(v: string | number | null) => patchField('tenantId', String(v ?? ''))"
                />
              </div>
            </div>
          </q-expansion-item>
        </q-form>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="取消" @click="emit('update:modelValue', false)" />
        <q-btn
          unelevated color="primary" label="保存并连接"
          :loading="isConnecting"
          @click="emit('save-connect')"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
