import { computed, type Ref } from 'vue';
import type { ReadonlyFrameAsset } from '@/features/frame';
import type { SendFieldValue } from '../core';
import {
  frameToBuildInput,
  resolveFieldValues,
  applyFactor,
  buildFrame,
  applyBuildPostPatch,
  evaluateFieldPreviewForUI,
} from '../core';
import { NOOP_VARIABLE_PROVIDER } from '../adapters';

export interface FramePreviewResult {
  readonly hexPreview: string;
  readonly fieldPreviews: ReadonlyArray<{
    readonly fieldId: string;
    readonly fieldName: string;
    readonly value: SendFieldValue;
    readonly matchedBranchIndex: number;
  }>;
  readonly issues: ReadonlyArray<{ readonly severity: string; readonly message: string }>;
}

export function useFramePreview(
  frame: Ref<ReadonlyFrameAsset | null>,
  userFieldValues: Ref<Readonly<Record<string, SendFieldValue>>>,
) {
  const fullPreview = computed<FramePreviewResult>(() => {
    const f = frame.value;
    if (!f) {
      return { hexPreview: '', fieldPreviews: [], issues: [] };
    }

    try {
      const { fields, totalByteLength } = frameToBuildInput(f);
      const provider = NOOP_VARIABLE_PROVIDER;

      // Resolve all field values
      const resolved = resolveFieldValues(fields, userFieldValues.value, provider);
      const factored = applyFactor(fields, resolved.values);
      const allIssues = [...resolved.issues, ...factored.issues];

      // Build frame bytes
      const buildOutput = buildFrame({
        fields,
        totalByteLength,
        fieldValues: factored.values,
      });
      allIssues.push(...buildOutput.issues);

      // Apply post-patch (checksum, length)
      const patched = applyBuildPostPatch(buildOutput.bytes, fields, {
        autoChecksum: f.options?.autoChecksum,
        bigEndian: f.options?.bigEndian,
        includeLengthField: f.options?.includeLengthField,
      });
      allIssues.push(...patched.issues);

      // Format hex preview: byte-space-separated
      const hexBytes = [...patched.buffer]
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'));
      const hexPreview = hexBytes.join(' ');

      // Per-field previews
      const fieldPreviews = f.fields.map((field) => {
        const preview = evaluateFieldPreviewForUI(
          f,
          field.id,
          userFieldValues.value,
          NOOP_VARIABLE_PROVIDER,
        );
        return {
          fieldId: field.id,
          fieldName: field.name,
          value: preview.value,
          matchedBranchIndex: preview.matchedBranchIndex,
        };
      });

      return {
        hexPreview,
        fieldPreviews,
        issues: allIssues.map((i) => ({ severity: i.severity, message: i.message })),
      };
    } catch (err) {
      console.warn('frame preview failed', err);
      return { hexPreview: '', fieldPreviews: [], issues: [] };
    }
  });

  return { fullPreview };
}
