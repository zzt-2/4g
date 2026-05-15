import type { InjectionKey } from 'vue';
import type {
  FrameFieldDefinition,
  FrameFieldReference,
  FrameReferenceOption,
} from '@/features/frame';

export interface FrameEditorContext {
  readonly frameId: string;
  readonly allFields: readonly FrameFieldDefinition[];
  listFrameReferences(): FrameReferenceOption[];
  listFieldReferences(frameId: string): FrameFieldReference[];
}

export const FRAME_EDITOR_KEY: InjectionKey<FrameEditorContext> =
  Symbol('FrameEditorContext');
