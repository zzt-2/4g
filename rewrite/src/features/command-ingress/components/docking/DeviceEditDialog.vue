<script setup lang="ts">
// 中心对接「设备编辑」弹窗。v-model 控制开关，form 通过 v-model 双向绑定（page 持有 ref）。
// 保存走 emit（page 根据 isNew 调 add/update）。
// 设备 ID 在编辑态禁用（主键不可改）。

export interface DeviceEditForm {
  name: string;
  deviceId: string;
  type: string;
  ip: string;
  swVer: string;
  status: string;
}

interface Props {
  modelValue: boolean;
  isNew: boolean;
  form: DeviceEditForm;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  'update:form': [form: DeviceEditForm];
  confirm: [];
}>();

// 单字段更新（D003 子组件单次 emit 原则，合并后一次 emit）
function patchField<K extends keyof DeviceEditForm>(field: K, value: DeviceEditForm[K]): void {
  emit('update:form', { ...props.form, [field]: value });
}

// 设备状态选项（原 page 内联，提到模块级常量 O4）
const DEVICE_STATUS_OPTIONS: readonly string[] = ['online', 'offline', 'alarm', 'error', 'busying', 'available'];
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <q-card class="rw-dialog-md">
      <q-card-section>
        <div class="text-h6">{{ isNew ? '添加设备' : '编辑设备' }}</div>
      </q-card-section>
      <q-card-section>
        <div class="flex flex-col gap-3">
          <q-input
            :model-value="form.name"
            dense outlined label="设备名称" :rules="[val => !!val || '必填']"
            @update:model-value="(v: string | number | null) => patchField('name', String(v ?? ''))"
          />
          <q-input
            :model-value="form.deviceId"
            dense outlined label="设备ID" :disable="!isNew" :rules="[val => !!val || '必填']"
            @update:model-value="(v: string | number | null) => patchField('deviceId', String(v ?? ''))"
          />
          <q-input
            :model-value="form.type"
            dense outlined label="设备类型"
            @update:model-value="(v: string | number | null) => patchField('type', String(v ?? ''))"
          />
          <q-input
            :model-value="form.ip"
            dense outlined label="IP 地址"
            @update:model-value="(v: string | number | null) => patchField('ip', String(v ?? ''))"
          />
          <q-input
            :model-value="form.swVer"
            dense outlined label="软件版本"
            @update:model-value="(v: string | number | null) => patchField('swVer', String(v ?? ''))"
          />
          <q-select
            :model-value="form.status"
            :options="DEVICE_STATUS_OPTIONS"
            dense outlined label="状态"
            @update:model-value="(v: string) => patchField('status', v ?? 'online')"
          />
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="取消" @click="emit('update:modelValue', false)" />
        <q-btn unelevated color="primary" label="保存" @click="emit('confirm')" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
