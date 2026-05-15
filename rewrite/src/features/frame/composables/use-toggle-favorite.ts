import { cloneFrameAsset, type FrameAssetSummary, type FrameAssetService } from '../';

export function useToggleFavorite(
  frameService: FrameAssetService,
  onError: (message: string) => void,
  onSuccess?: () => void,
) {
  function toggleFavorite(frame: FrameAssetSummary): void {
    const full = frameService.getFrame(frame.id);
    if (!full) return;
    const cloned = cloneFrameAsset(full);
    cloned.isFavorite = !cloned.isFavorite;
    const result = frameService.upsertFrame(cloned);
    if (result.ok) {
      onSuccess?.();
    } else {
      onError('操作失败');
    }
  }

  return { toggleFavorite };
}
