import { ref, shallowRef } from 'vue';
import {
  cloneFrameField,
  type FrameFieldDefinition,
  type ReadonlyFrameFieldDefinition,
} from '@/features/frame';

export function createEmptyField(): FrameFieldDefinition {
  return {
    id: '',
    name: '',
    dataType: 'uint8',
    length: 1,
    inputType: 'input',
    configurable: true,
    options: [],
    dataParticipationType: 'direct',
  };
}

export function useFieldEditor() {
  const fieldEditorOpen = ref(false);
  const editingFieldIndex = ref<number | null>(null);
  const editingField = shallowRef<FrameFieldDefinition | null>(null);
  const fieldDirty = ref(false);

  function openAdd(): void {
    editingFieldIndex.value = null;
    editingField.value = createEmptyField();
    fieldEditorOpen.value = true;
    fieldDirty.value = false;
  }

  function openEdit(
    index: number,
    field: ReadonlyFrameFieldDefinition,
  ): void {
    editingFieldIndex.value = index;
    editingField.value = cloneFrameField(field);
    fieldEditorOpen.value = true;
    fieldDirty.value = false;
  }

  function closeEditor(): void {
    fieldEditorOpen.value = false;
    editingField.value = null;
    editingFieldIndex.value = null;
    fieldDirty.value = false;
  }

  return {
    fieldEditorOpen,
    editingFieldIndex,
    editingField,
    fieldDirty,
    openAdd,
    openEdit,
    closeEditor,
  };
}
