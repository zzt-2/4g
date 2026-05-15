<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { deserializeFrames, type FrameAsset, type FrameDeserializeResult } from '../services';
import { useStableKeys } from '@/shared/composables';

interface ImportFrameDialogProps {
  modelValue: boolean;
}

const props = defineProps<ImportFrameDialogProps>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [frames: FrameAsset[]];
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const fileContent = ref('');
const fileName = ref('');
const parseResult = ref<FrameDeserializeResult | null>(null);
const isImporting = ref(false);

const { keys: issueKeys, syncKeys: syncIssueKeys } = useStableKeys('issue');
watch(() => parseResult.value?.issues ?? [], (issues) => syncIssueKeys(issues));

const errorIssues = computed(() =>
  (parseResult.value?.issues ?? []).filter((i) => i.severity === 'error' || i.severity === 'o_error'),
);
const warningIssues = computed(() =>
  (parseResult.value?.issues ?? []).filter((i) => i.severity === 'warning' || i.severity === 'o_warning'),
);
const hasBlockingErrors = computed(() => !parseResult.value?.ok || errorIssues.value.length > 0);

function onFileSelected(file: File | File[] | null): void {
  const f = Array.isArray(file) ? file[0] : file;
  if (!f) return;

  fileName.value = f.name;
  isImporting.value = true;

  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    fileContent.value = text;
    parseResult.value = deserializeFrames(text);
    isImporting.value = false;
  };
  reader.onerror = () => {
    parseResult.value = { ok: false, frames: [], issues: [{ severity: 'error', code: 'file.readError', path: '', message: '文件读取失败' }] };
    isImporting.value = false;
  };
  reader.readAsText(f);
}

function onConfirm(): void {
  if (parseResult.value?.ok && parseResult.value.frames.length > 0 && !hasBlockingErrors.value) {
    emit('confirm', parseResult.value.frames);
    onClose();
  }
}

function onClose(): void {
  fileContent.value = '';
  fileName.value = '';
  parseResult.value = null;
  isImporting.value = false;
  emit('update:modelValue', false);
}
</script>

<template>
  <q-dialog v-model="show" @hide="onClose">
    <q-card class="rw-dialog-md">
      <q-card-section>
        <div class="text-h6 rw-text-value">导入帧定义</div>
      </q-card-section>

      <q-card-section class="pt-0">
        <q-file
          outlined
          dense
          accept=".json"
          label="选择 JSON 文件"
          :loading="isImporting"
          @update:model-value="onFileSelected"
        >
          <template #prepend>
            <q-icon name="o_upload_file" />
          </template>
        </q-file>

        <template v-if="parseResult">
          <div v-if="parseResult.ok && parseResult.frames.length > 0" class="mt-4">
            <div class="text-sm rw-text-desc">
              成功解析 {{ parseResult.frames.length }} 个帧定义
            </div>
            <template v-if="parseResult.issues.length > 0">
              <div v-if="errorIssues.length > 0" class="mt-2">
                <div v-for="(issue, idx) in errorIssues" :key="'e-' + issueKeys[idx]" class="text-xs rw-text-error">
                  {{ issue.message }}
                </div>
              </div>
              <div v-if="warningIssues.length > 0" class="mt-2">
                <div v-for="(issue, idx) in warningIssues" :key="'w-' + issueKeys[idx]" class="text-xs rw-text-warn">
                  {{ issue.message }}
                </div>
              </div>
            </template>
          </div>
          <div v-else-if="!parseResult.ok" class="mt-4">
            <div class="text-sm rw-text-error">解析失败</div>
            <div v-for="(issue, idx) in parseResult.issues" :key="issueKeys[idx]" class="text-xs mt-1 rw-text-error">
              {{ issue.message }}
            </div>
          </div>
        </template>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="取消" @click="onClose" />
        <q-btn
          unelevated
          color="primary"
          label="导入"
          :disable="!parseResult?.ok || parseResult.frames.length === 0 || hasBlockingErrors"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
