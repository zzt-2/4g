import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  toRaw,
  type Ref,
} from 'vue';
import { useQuasar } from 'quasar';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import {
  cloneFrameAsset,
  type FrameAsset,
  type ValidationIssue,
} from '@/features/frame';
import { validateFrameAsset } from '@/features/frame/core';
import { useAsyncAction, useNotify } from '@/shared/composables';

function createEmptyFrame(): FrameAsset {
  return { id: '', name: '', direction: 'receive', fields: [] };
}

export function useFrameEditor(
  frameId: string | undefined,
  fieldDirty?: Ref<boolean>,
) {
  const $q = useQuasar();
  const router = useRouter();
  const runtime = useRewriteRuntime();
  const service = runtime.features.frameService;
  const notify = useNotify();
  const { execute, isOperating } = useAsyncAction();

  const isNew = !frameId;
  const workingFrame = shallowRef<FrameAsset>(createEmptyFrame());
  const originalSnapshot = ref('');
  const validationIssues = shallowRef<readonly ValidationIssue[]>([]);
  let disposed = false;

  const isDirty = computed(
    () => JSON.stringify(toRaw(workingFrame.value)) !== originalSnapshot.value,
  );
  const isSaving = computed(() => isOperating('save'));

  function init(): void {
    if (disposed) return;

    if (isNew) {
      const frame = createEmptyFrame();
      workingFrame.value = frame;
      originalSnapshot.value = JSON.stringify(frame);
    } else {
      const existing = service.getFrame(frameId!);
      if (!existing) {
        notify.error('帧不存在', frameId);
        router.replace('/frames');
        return;
      }
      const cloned = cloneFrameAsset(existing);
      workingFrame.value = cloned;
      originalSnapshot.value = JSON.stringify(cloned);
    }
    validationIssues.value = [];
  }

  async function save(): Promise<boolean> {
    if (disposed) return false;

    const frame = toRaw(workingFrame.value);
    const validation = validateFrameAsset(frame);
    if (!validation.valid) {
      validationIssues.value = validation.issues;
      notify.error('校验失败');
      return false;
    }
    validationIssues.value = [];

    const result = await execute('save', async () =>
      service.upsertFrame(frame),
    );
    if (!result) return false;

    if (result.ok) {
      notify.success(isNew ? '帧已创建' : '帧已保存');
      originalSnapshot.value = JSON.stringify(frame);
      void runtime.persistence.saveFrames();
      router.push('/frames');
      return true;
    }

    notify.error('保存失败');
    return false;
  }

  function updateFrame(patch: Partial<FrameAsset>): void {
    workingFrame.value = { ...toRaw(workingFrame.value), ...patch };
  }

  init();

  onBeforeRouteLeave(async () => {
    if (disposed) return true;
    const dirty = isDirty.value || (fieldDirty?.value ?? false);
    if (!dirty) return true;

    return new Promise<boolean>((resolve) => {
      $q.dialog({
        title: '未保存的修改',
        message: '当前有未保存的修改，确定要离开吗？',
        cancel: true,
        persistent: true,
      })
        .onOk(() => resolve(true))
        .onCancel(() => resolve(false));
    });
  });

  onBeforeUnmount(() => {
    disposed = true;
  });

  return {
    workingFrame,
    isDirty,
    isNew,
    isSaving,
    validationIssues,
    save,
    updateFrame,
  };
}
